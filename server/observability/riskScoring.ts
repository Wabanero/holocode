import type {
  CodeGraphRiskScore,
  ObservabilityConfidence
} from "../../src/observability/observabilityTypes";
import type { DebugSessionSnapshot, DiffChangedFile, LspDiagnostic } from "../../src/types";
import { fileNodeId, parseDiffTouchedFiles, safeRelativePath } from "./buildObservabilityGraph.ts";

type CodeGraphLike = {
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
};

export type RiskReason = {
  code:
    | "typescript_error"
    | "typescript_warning"
    | "git_modified"
    | "git_added_deleted"
    | "agent_patch_touched"
    | "no_related_tests"
    | "many_reverse_imports"
    | "complexity_above_median"
    | "active_debug_frame";
  weight: number;
  message: string;
};

type RiskMissingInput = "codegraph" | "lsp" | "git" | "agent" | "debug" | "runtime" | "test" | "lint";

function now() {
  return new Date().toISOString();
}

function levelForScore(score: number): CodeGraphRiskScore["level"] {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function fileComplexity(graph: CodeGraphLike, filePath: string) {
  const values = (graph.nodes || [])
    .filter((node) => safeRelativePath(node.path) === filePath)
    .map((node) => Number(node.complexity ?? node.metrics?.complexity))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function complexityMedian(graph: CodeGraphLike) {
  const byFile = new Map<string, number>();
  for (const node of graph.nodes || []) {
    const path = safeRelativePath(node.path);
    if (!path) continue;
    const value = Number(node.complexity ?? node.metrics?.complexity);
    if (!Number.isFinite(value) || value <= 0) continue;
    byFile.set(path, Math.max(byFile.get(path) || 0, value));
  }
  return median([...byFile.values()]);
}

function relatedTestsForFile(graph: CodeGraphLike, filePath: string) {
  const tests = new Set<string>();
  const fileId = fileNodeId(filePath);
  for (const node of graph.nodes || []) {
    if (safeRelativePath(node.path) === filePath) {
      for (const testPath of node.relatedTests || []) {
        const normalized = safeRelativePath(testPath);
        if (normalized) tests.add(normalized);
      }
    }
  }
  const nodesById = new Map((graph.nodes || []).map((node) => [String(node.id), node]));
  for (const edge of graph.edges || []) {
    if (edge.type !== "tests") continue;
    if (edge.source !== fileId && edge.target !== fileId) continue;
    for (const id of [edge.source, edge.target]) {
      const path = safeRelativePath(nodesById.get(String(id))?.path);
      if (path && path !== filePath) tests.add(path);
    }
  }
  return [...tests].sort();
}

function reverseImportCount(graph: CodeGraphLike, filePath: string) {
  const fileId = fileNodeId(filePath);
  return (graph.edges || []).filter((edge) => edge.type === "imports" && edge.target === fileId).length;
}

function pathGitState(
  filePath: string,
  gitStatus?: { files?: Array<{ path: string; status: string }> },
  gitDiff?: { changedFiles?: DiffChangedFile[] }
) {
  return (
    gitStatus?.files?.find((file) => safeRelativePath(file.path) === filePath) ||
    gitDiff?.changedFiles?.find((file) => safeRelativePath(file.path) === filePath) ||
    null
  );
}

function agentPatchTouchedFiles(agentWorkflowRuns: Array<Record<string, any>> = [], agentResults: Array<Record<string, any>> = []) {
  const files = new Set<string>();
  const add = (value: unknown) => {
    const normalized = safeRelativePath(value);
    if (normalized) files.add(normalized);
  };

  for (const run of agentWorkflowRuns) {
    (run.currentPatch?.filesTouched || []).forEach(add);
    (run.patches || []).forEach((patch: any) => (patch.filesTouched || []).forEach(add));
  }
  for (const result of agentResults) {
    parseDiffTouchedFiles(result.diff).forEach(add);
  }

  return [...files].sort();
}

export function scoreFileRisk(input: {
  graph?: CodeGraphLike | null;
  path: string;
  lspDiagnostics?: { diagnostics?: LspDiagnostic[] };
  gitStatus?: { files?: Array<{ path: string; status: string }> };
  gitDiff?: { changedFiles?: DiffChangedFile[] };
  agentWorkflowRuns?: Array<Record<string, any>>;
  agentResults?: Array<Record<string, any>>;
  debugState?: Partial<DebugSessionSnapshot>;
}) {
  const graph = input.graph || {};
  const filePath = safeRelativePath(input.path);
  if (!filePath) {
    throw new Error("Missing or unsafe path.");
  }

  const diagnostics = (input.lspDiagnostics?.diagnostics || []).filter((diagnostic) => safeRelativePath(diagnostic.path) === filePath);
  const gitState = pathGitState(filePath, input.gitStatus, input.gitDiff);
  const touchedByAgent = new Set(agentPatchTouchedFiles(input.agentWorkflowRuns || [], input.agentResults || [])).has(filePath);
  const relatedTests = relatedTestsForFile(graph, filePath);
  const importerCount = reverseImportCount(graph, filePath);
  const complexity = fileComplexity(graph, filePath);
  const localMedian = complexityMedian(graph);
  const activeDebugFrame = safeRelativePath(input.debugState?.activeFrame?.path) === filePath;
  const reasons: RiskReason[] = [];

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    reasons.push({ code: "typescript_error", weight: 25, message: "File has TypeScript errors." });
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    reasons.push({ code: "typescript_warning", weight: 10, message: "File has TypeScript warnings." });
  }
  if (gitState?.status === "modified" || gitState?.status === "renamed") {
    reasons.push({ code: "git_modified", weight: 15, message: `File is ${gitState.status} in git.` });
  }
  if (gitState?.status === "added" || gitState?.status === "deleted") {
    reasons.push({ code: "git_added_deleted", weight: 15, message: `File is ${gitState.status} in git.` });
  }
  if (touchedByAgent) {
    reasons.push({ code: "agent_patch_touched", weight: 20, message: "File is touched by an agent patch." });
  }
  if (!relatedTests.length) {
    reasons.push({ code: "no_related_tests", weight: 15, message: "No related tests are known for this file." });
  }
  if (importerCount > 5) {
    reasons.push({ code: "many_reverse_imports", weight: 10, message: `File has ${importerCount} reverse imports.` });
  }
  if (complexity > localMedian && localMedian > 0) {
    reasons.push({ code: "complexity_above_median", weight: 10, message: `Complexity ${complexity} is above local median ${localMedian}.` });
  }
  if (activeDebugFrame) {
    reasons.push({ code: "active_debug_frame", weight: 15, message: "File is in the active debug frame." });
  }

  const rawScore = reasons.reduce((total, reason) => total + reason.weight, 0);
  const score = Math.max(0, Math.min(100, rawScore));
  const missingInputs: RiskMissingInput[] = [];
  if (!graph.nodes?.length) missingInputs.push("codegraph");
  if (!input.lspDiagnostics) missingInputs.push("lsp");
  if (!input.gitStatus && !input.gitDiff) missingInputs.push("git");
  if (!input.agentWorkflowRuns && !input.agentResults) missingInputs.push("agent");
  if (!input.debugState) missingInputs.push("debug");

  const result: CodeGraphRiskScore & {
    path: string;
    reasons: RiskReason[];
    relatedTests: string[];
    reverseImportCount: number;
    complexity: number;
    localMedianComplexity: number;
    inputs: {
      diagnosticCount: number;
      gitStatus: string | null;
      touchedByAgent: boolean;
      activeDebugFrame: boolean;
    };
  } = {
    nodeId: fileNodeId(filePath),
    path: filePath,
    score,
    level: levelForScore(score),
    confidence: missingInputs.includes("codegraph") ? "inferred" : ("verified" as ObservabilityConfidence),
    calculatedAt: now(),
    reasons,
    factors: reasons.map((reason) => ({
      kind:
        reason.code === "typescript_error" || reason.code === "typescript_warning"
          ? "diagnostics"
          : reason.code === "git_modified" || reason.code === "git_added_deleted"
            ? "diff-size"
            : reason.code === "agent_patch_touched"
              ? "agent-attention"
              : reason.code === "active_debug_frame"
                ? "debug-focus"
                : reason.code === "many_reverse_imports"
                  ? "dependency-centrality"
                  : "test-coverage",
      weight: reason.weight,
      value: 1,
      explanation: reason.message
    })),
    missingInputs,
    relatedTests,
    reverseImportCount: importerCount,
    complexity,
    localMedianComplexity: localMedian,
    inputs: {
      diagnosticCount: diagnostics.length,
      gitStatus: gitState?.status || null,
      touchedByAgent,
      activeDebugFrame
    }
  };

  return result;
}
