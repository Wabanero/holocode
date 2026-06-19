import type { ContextLensResult } from "../../src/observability/observabilityTypes";
import { fileNodeId, parseDiffTouchedFiles, safeRelativePath, safeIdPart } from "./buildObservabilityGraph.ts";

type CodeGraphLike = {
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
};

function now() {
  return new Date().toISOString();
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort();
}

function addPath(set: Set<string>, value: unknown) {
  const normalized = safeRelativePath(value);
  if (normalized) set.add(normalized);
}

function pathsFromText(text: unknown, graphPaths: Set<string>) {
  const matches = new Set<string>();
  const raw = String(text || "");
  for (const path of graphPaths) {
    if (path !== "." && raw.includes(path)) matches.add(path);
  }
  for (const match of raw.matchAll(/(?:^|\s)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|css|html))/g)) {
    addPath(matches, match[1]);
  }
  return matches;
}

export function buildContextLens(input: {
  graph?: CodeGraphLike | null;
  runId?: string;
  agentWorkflowRuns?: Array<Record<string, any>>;
  agentResults?: Array<Record<string, any>>;
}) {
  const graph = input.graph || {};
  const graphPaths = new Set((graph.nodes || []).map((node) => safeRelativePath(node.path)).filter(Boolean) as string[]);
  const runId = String(input.runId || "").trim();
  const runs = input.agentWorkflowRuns || [];
  const results = input.agentResults || [];
  const run =
    runs.find((candidate) => candidate.taskId === runId || candidate.runId === runId || candidate.id === runId) ||
    (runId ? null : runs[0] || null);
  const result =
    results.find((candidate) => candidate.taskId === runId || candidate.runId === runId || candidate.id === runId) ||
    (run?.taskId ? results.find((candidate) => candidate.taskId === run.taskId) : null) ||
    (runId ? null : results[0] || null);

  const readFiles = new Set<string>();
  const changedFiles = new Set<string>();
  const touchedFiles = new Set<string>();
  const producedPatchPaths = new Set<string>();
  const artifactPaths = new Set<string>();
  const selectedNodeIds = new Set<string>();
  const selectedSignalIds = new Set<string>();
  const inferenceNotes: string[] = [];

  if (run) {
    (run.selectedFiles || []).forEach((path: unknown) => addPath(readFiles, path));
    (run.plan?.likelyFiles || []).forEach((path: unknown) => addPath(readFiles, path));
    (run.graphContext?.relevantFiles || []).forEach((path: unknown) => addPath(readFiles, path));
    (run.graphContext?.topRelevantFiles || []).forEach((item: any) => addPath(readFiles, item.path || item));
    (run.graphContext?.relevantSymbols || []).forEach((item: any) => {
      if (item.id) selectedNodeIds.add(String(item.id));
      addPath(readFiles, item.path);
    });
    (run.currentPatch?.filesTouched || []).forEach((path: unknown) => {
      addPath(changedFiles, path);
      addPath(touchedFiles, path);
    });
    (run.patches || []).forEach((patch: any) =>
      (patch.filesTouched || []).forEach((path: unknown) => {
        addPath(changedFiles, path);
        addPath(touchedFiles, path);
      })
    );
    if (run.currentPatch?.id) selectedSignalIds.add(`signal:agent:patch:${safeIdPart(run.currentPatch.id)}`);
  }

  if (result) {
    pathsFromText(result.task, graphPaths).forEach((path) => readFiles.add(path));
    parseDiffTouchedFiles(result.diff).forEach((path) => {
      changedFiles.add(path);
      touchedFiles.add(path);
    });
    if (result.resultDiffFile) producedPatchPaths.add(String(result.resultDiffFile));
    if (result.taskFile) artifactPaths.add(String(result.taskFile));
    if (result.resultDiffFile) artifactPaths.add(String(result.resultDiffFile));
    if (result.logFile) artifactPaths.add(String(result.logFile));
  }

  for (const path of [...readFiles, ...changedFiles, ...touchedFiles]) {
    selectedNodeIds.add(fileNodeId(path));
  }

  if (!run && !result) {
    inferenceNotes.push(runId ? "No matching agent workflow run or persisted agent result was found." : "No agent run was available.");
  }
  if (readFiles.size && !run?.graphContext) {
    inferenceNotes.push("Read files are inferred from task text and known graph paths.");
  }
  if (changedFiles.size && !run?.currentPatch?.filesTouched?.length) {
    inferenceNotes.push("Changed files are inferred from persisted result diff headers.");
  }

  const estimatedTokens = Math.max(
    0,
    Math.round(
      [...readFiles].reduce((total, path) => total + path.length, 0) / 4 +
        String(run?.userGoal || result?.task || "").length / 4
    )
  );
  const generatedAt = now();
  const response: ContextLensResult & {
    runId: string | null;
    taskId: string | null;
    touchedFiles: string[];
    changedFiles: string[];
    readFiles: string[];
    producedPatchPaths: string[];
    artifactPaths: string[];
    agentSteps: Array<{ name: string; status: string; timestamp?: string }>;
    inferenceNotes: string[];
  } = {
    id: `context-lens:${safeIdPart(runId || run?.taskId || result?.taskId || "latest")}:${generatedAt}`,
    generatedAt,
    runId: runId || run?.taskId || result?.taskId || null,
    taskId: run?.taskId || result?.taskId || null,
    mode: "agent",
    estimatedTokens,
    promptBudgetTokens: run?.tokenBudget || undefined,
    includedNodeIds: uniqueSorted(selectedNodeIds),
    includedSignalIds: uniqueSorted(selectedSignalIds),
    omittedNodeIds: [],
    contextSnapshots: [],
    rationale: run || result ? "Context inferred from agent workflow state, persisted task text, diff headers, and graph paths." : "No agent context available.",
    confidence: run?.graphContext ? "verified" : run || result ? "inferred" : "missing",
    touchedFiles: uniqueSorted(touchedFiles),
    changedFiles: uniqueSorted(changedFiles),
    readFiles: uniqueSorted(readFiles),
    producedPatchPaths: uniqueSorted(producedPatchPaths),
    artifactPaths: uniqueSorted(artifactPaths),
    agentSteps: (run?.telemetry?.nodeVisits || []).map((visit: any) => ({
      name: String(visit.node || "Agent step"),
      status: run.status || "unknown",
      timestamp: visit.timestamp
    })),
    inferenceNotes
  };

  return response;
}
