import type { ObservabilityGraphApiResponse } from "./fetchObservability";
import type { ContextLensResult, ObservabilityConfidence, ObservabilitySource } from "./observabilityTypes";
import type { TraceRiverProjection } from "./traceSelectors";
import type { AgentRunSnapshot, CodeEdge, CodeGraph, CodeNode, DebugStackFrame, DiffChangedFile, LspFileSummary } from "../types";

export type EpistemicCategory =
  | "validated"
  | "changed_unvalidated"
  | "diagnostic_error"
  | "diagnostic_warning"
  | "missing_tests"
  | "agent_context_missing"
  | "heuristic_only"
  | "runtime_unobserved"
  | "stale_observability"
  | "unknown";

export type EpistemicFogFilter = "all" | "unknown" | "untested" | "risky";

export type EpistemicReasonCode =
  | "validated_by_signal"
  | "changed_without_validation"
  | "diagnostic_error"
  | "diagnostic_warning"
  | "missing_related_tests"
  | "agent_missing_tests"
  | "agent_missing_callers"
  | "agent_context_snapshot_missing"
  | "heuristic_static_graph"
  | "runtime_missing"
  | "runtime_demo_only"
  | "runtime_span_error"
  | "observability_stale"
  | "observability_incomplete"
  | "unknown_evidence";

export type EpistemicReason = {
  code: EpistemicReasonCode;
  category: EpistemicCategory;
  source: ObservabilitySource | "system";
  severity: number;
  confidence: ObservabilityConfidence;
  message: string;
  evidenceIds?: string[];
};

export type EpistemicScore = {
  nodeId: string;
  path: string;
  label: string;
  category: EpistemicCategory;
  severity: number;
  confidence: ObservabilityConfidence;
  reasons: EpistemicReason[];
  validated: boolean;
  hasRuntimeObservation: boolean;
  relatedTests: string[];
  reverseImportCount: number;
  updatedAt?: string;
};

export type EpistemicScoringInput = {
  files: Array<Pick<CodeNode, "id" | "name" | "path" | "kind" | "relatedTests" | "importedBy" | "complexity">>;
  graph: CodeGraph | null;
  observabilityGraph: ObservabilityGraphApiResponse | null;
  diagnostics: LspFileSummary[];
  diffSummary: DiffChangedFile[];
  agentRuns: AgentRunSnapshot[];
  activeContextLens: ContextLensResult | null;
  activeTraceRiver: TraceRiverProjection | null;
  debugActiveFrame: DebugStackFrame | null;
  lastRefreshAt: string | null;
};

export const EPISTEMIC_CATEGORY_META: Record<
  EpistemicCategory,
  { label: string; color: string; shortLabel: string; rank: number }
> = {
  diagnostic_error: { label: "Diagnostic error", color: "#f06f6f", shortLabel: "error", rank: 95 },
  diagnostic_warning: { label: "Diagnostic warning", color: "#f2be5c", shortLabel: "warn", rank: 78 },
  agent_context_missing: { label: "Agent context missing", color: "#d46fff", shortLabel: "context", rank: 72 },
  changed_unvalidated: { label: "Changed unvalidated", color: "#f2be5c", shortLabel: "changed", rank: 66 },
  missing_tests: { label: "Missing tests", color: "#ff8f70", shortLabel: "tests", rank: 60 },
  runtime_unobserved: { label: "Runtime unobserved", color: "#8a9692", shortLabel: "runtime", rank: 46 },
  stale_observability: { label: "Stale data", color: "#9aa6a2", shortLabel: "stale", rank: 38 },
  heuristic_only: { label: "Heuristic only", color: "#6db7ff", shortLabel: "heuristic", rank: 30 },
  unknown: { label: "Unknown", color: "#b6c2be", shortLabel: "unknown", rank: 22 },
  validated: { label: "Validated", color: "#48e5c2", shortLabel: "ok", rank: 0 }
};

const STALE_OBSERVABILITY_MS = 5 * 60 * 1000;

function fileId(path: string) {
  return `file:${path}`;
}

function isTestPath(path: string) {
  return path.startsWith("tests/") || path.includes(".test.") || path.includes(".spec.");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function validDateTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function signalIdsForPath(
  observabilityGraph: ObservabilityGraphApiResponse | null,
  path: string,
  source?: ObservabilitySource
) {
  return (
    observabilityGraph?.signals
      .filter((signal) => signal.path === path && (!source || signal.source === source))
      .map((signal) => signal.id) || []
  );
}

function relatedTestsFor(file: Pick<CodeNode, "path" | "relatedTests">, graphNode: CodeNode | undefined) {
  return unique([...(file.relatedTests || []), ...(graphNode?.relatedTests || [])].filter(Boolean));
}

function reverseImportPaths(path: string, graph: CodeGraph | null, graphNodesById: Map<string, CodeNode>, graphNode: CodeNode | undefined) {
  const importers = new Set((graphNode?.importedBy || []).filter(Boolean));
  const targetId = fileId(path);
  for (const edge of graph?.edges || []) {
    if (edge.type !== "imports" || edge.target !== targetId) continue;
    const source = graphNodesById.get(edge.source);
    if (source?.path) importers.add(source.path);
  }
  return [...importers];
}

function pathsFromEdges(edges: CodeEdge[], graphNodesById: Map<string, CodeNode>, sourcePath: string) {
  const sourceId = fileId(sourcePath);
  return edges
    .filter((edge) => edge.source === sourceId || edge.target === sourceId)
    .map((edge) => (edge.source === sourceId ? graphNodesById.get(edge.target)?.path : graphNodesById.get(edge.source)?.path))
    .filter((path): path is string => Boolean(path));
}

function primaryCategory(reasons: EpistemicReason[], fallback: EpistemicCategory) {
  if (!reasons.length) return fallback;
  return [...reasons].sort((a, b) => b.severity - a.severity)[0].category;
}

function strongestConfidence(reasons: EpistemicReason[], category: EpistemicCategory): ObservabilityConfidence {
  if (category === "validated") return "verified";
  if (category === "runtime_unobserved" || category === "unknown") return "missing";
  if (category === "stale_observability") return "stale";
  return reasons.find((reason) => reason.category === category)?.confidence || "estimated";
}

export function buildEpistemicScores(input: EpistemicScoringInput): EpistemicScore[] {
  const graphNodesById = new Map((input.graph?.nodes || []).map((node) => [node.id, node]));
  const graphNodesByPath = new Map((input.graph?.nodes || []).filter((node) => node.path).map((node) => [node.path, node]));
  const diagnosticsByPath = new Map(input.diagnostics.map((summary) => [summary.path, summary]));
  const diffByPath = new Map(input.diffSummary.map((file) => [file.path, file]));
  const agentTouchedPaths = new Set(input.agentRuns.flatMap((run) => run.touchedFiles || []));
  const contextRead = new Set(input.activeContextLens?.readFiles || []);
  const contextTouched = new Set(input.activeContextLens?.touchedFiles || []);
  const contextChanged = new Set(input.activeContextLens?.changedFiles || []);
  const contextIncluded = new Set([...contextRead, ...contextTouched, ...contextChanged]);
  const realTrace = input.activeTraceRiver && !input.activeTraceRiver.isDemo ? input.activeTraceRiver : null;
  const mappedSpansByPath = new Map<string, TraceRiverProjection["spans"]>();
  const testOrLintSignalPaths = new Set(
    input.observabilityGraph?.signals.filter((signal) => signal.path && (signal.source === "test" || signal.source === "lint")).map((signal) => signal.path as string) || []
  );

  for (const span of realTrace?.spans || []) {
    const path = span.path || span.filePath;
    if (!path || !span.mapped) continue;
    const spans = mappedSpansByPath.get(path) || [];
    spans.push(span);
    mappedSpansByPath.set(path, spans);
  }

  const now = Date.now();
  const refreshTime = validDateTime(input.lastRefreshAt);
  const stale = !refreshTime || now - refreshTime > STALE_OBSERVABILITY_MS;

  return input.files.map((file) => {
    const path = file.path;
    const graphNode = graphNodesByPath.get(path) || graphNodesById.get(file.id);
    const relatedTests = relatedTestsFor(file, graphNode);
    const importers = reverseImportPaths(path, input.graph, graphNodesById, graphNode);
    const diagnostic = diagnosticsByPath.get(path);
    const diff = diffByPath.get(path);
    const agentTouched = agentTouchedPaths.has(path) || contextTouched.has(path) || contextChanged.has(path);
    const traceSpans = mappedSpansByPath.get(path) || [];
    const hasRuntimeObservation = traceSpans.length > 0;
    const hasRuntimeError = traceSpans.some((span) => span.status === "error");
    const hasValidationSignal = hasRuntimeObservation || testOrLintSignalPaths.has(path);
    const reasons: EpistemicReason[] = [];

    if (diagnostic?.errors) {
      reasons.push({
        code: "diagnostic_error",
        category: "diagnostic_error",
        source: "lsp",
        severity: 95,
        confidence: "verified",
        message: `File has ${diagnostic.errors} TypeScript error${diagnostic.errors === 1 ? "" : "s"}.`,
        evidenceIds: signalIdsForPath(input.observabilityGraph, path, "lsp")
      });
    } else if (diagnostic?.warnings) {
      reasons.push({
        code: "diagnostic_warning",
        category: "diagnostic_warning",
        source: "lsp",
        severity: 78,
        confidence: "verified",
        message: `File has ${diagnostic.warnings} TypeScript warning${diagnostic.warnings === 1 ? "" : "s"}.`,
        evidenceIds: signalIdsForPath(input.observabilityGraph, path, "lsp")
      });
    }

    if (diff && !hasValidationSignal) {
      reasons.push({
        code: "changed_without_validation",
        category: "changed_unvalidated",
        source: "git",
        severity: diff.status === "added" || diff.status === "deleted" ? 72 : 66,
        confidence: "verified",
        message: `Git ${diff.status}: +${diff.additions} -${diff.deletions}; no test/lint/runtime validation is attached yet.`,
        evidenceIds: signalIdsForPath(input.observabilityGraph, path, "git")
      });
    }

    if (!isTestPath(path) && relatedTests.length === 0) {
      reasons.push({
        code: "missing_related_tests",
        category: "missing_tests",
        source: "codegraph",
        severity: 60,
        confidence: "estimated",
        message: "No related tests are recorded for this file.",
        evidenceIds: signalIdsForPath(input.observabilityGraph, path, "codegraph")
      });
    }

    if (agentTouched) {
      if (!input.activeContextLens) {
        reasons.push({
          code: "agent_context_snapshot_missing",
          category: "agent_context_missing",
          source: "agent",
          severity: 72,
          confidence: "inferred",
          message: "An agent touched this file, but no context snapshot is selected.",
          evidenceIds: signalIdsForPath(input.observabilityGraph, path, "agent")
        });
      } else {
        const missingTests = relatedTests.filter((testPath) => !contextIncluded.has(testPath));
        const missingImporters = importers.filter((importer) => !contextIncluded.has(importer));
        if (missingTests.length) {
          reasons.push({
            code: "agent_missing_tests",
            category: "agent_context_missing",
            source: "agent",
            severity: 74,
            confidence: "inferred",
            message: `Agent context missed ${missingTests.length} related test${missingTests.length === 1 ? "" : "s"}.`,
            evidenceIds: signalIdsForPath(input.observabilityGraph, path, "agent")
          });
        }
        if (missingImporters.length) {
          reasons.push({
            code: "agent_missing_callers",
            category: "agent_context_missing",
            source: "agent",
            severity: missingImporters.length > 4 ? 76 : 68,
            confidence: "inferred",
            message: `Agent context missed ${missingImporters.length} importer/caller file${missingImporters.length === 1 ? "" : "s"}.`,
            evidenceIds: signalIdsForPath(input.observabilityGraph, path, "agent")
          });
        }
      }
    }

    if (hasRuntimeError) {
      reasons.push({
        code: "runtime_span_error",
        category: "diagnostic_error",
        source: "runtime",
        severity: 88,
        confidence: "verified",
        message: "A mapped runtime trace span for this file ended in error.",
        evidenceIds: traceSpans.map((span) => span.spanId)
      });
    }

    if (!hasRuntimeObservation) {
      reasons.push({
        code: input.activeTraceRiver?.isDemo ? "runtime_demo_only" : "runtime_missing",
        category: "runtime_unobserved",
        source: "runtime",
        severity: 46,
        confidence: "missing",
        message: input.activeTraceRiver?.isDemo
          ? "Only a demo trace is loaded; no real runtime observation is attached to this file."
          : "No real runtime trace span is attached to this file.",
        evidenceIds: []
      });
    }

    if (stale) {
      reasons.push({
        code: input.lastRefreshAt ? "observability_stale" : "observability_incomplete",
        category: "stale_observability",
        source: "system",
        severity: input.lastRefreshAt ? 38 : 42,
        confidence: "stale",
        message: input.lastRefreshAt
          ? "Observability graph has not refreshed recently."
          : "Observability graph has not been refreshed in this session.",
        evidenceIds: []
      });
    }

    if (!input.observabilityGraph?.sources.runtime && !hasRuntimeObservation) {
      reasons.push({
        code: "observability_incomplete",
        category: "runtime_unobserved",
        source: "runtime",
        severity: 44,
        confidence: "missing",
        message: "Runtime ingestion is not connected for this graph.",
        evidenceIds: []
      });
    }

    const liveSignals = signalIdsForPath(input.observabilityGraph, path).filter(Boolean);
    const graphOnly =
      liveSignals.length === signalIdsForPath(input.observabilityGraph, path, "codegraph").length &&
      !diagnostic &&
      !diff &&
      !agentTouched &&
      input.debugActiveFrame?.path !== path &&
      !hasRuntimeObservation &&
      pathsFromEdges(input.graph?.edges || [], graphNodesById, path).length > 0;

    if (graphOnly) {
      reasons.push({
        code: "heuristic_static_graph",
        category: "heuristic_only",
        source: "codegraph",
        severity: 30,
        confidence: "estimated",
        message: "Only static scanner relationships are available for this file.",
        evidenceIds: signalIdsForPath(input.observabilityGraph, path, "codegraph")
      });
    }

    if (!reasons.length) {
      reasons.push({
        code: hasValidationSignal ? "validated_by_signal" : "unknown_evidence",
        category: hasValidationSignal ? "validated" : "unknown",
        source: hasValidationSignal ? "runtime" : "system",
        severity: hasValidationSignal ? 0 : 22,
        confidence: hasValidationSignal ? "verified" : "missing",
        message: hasValidationSignal
          ? "Available runtime/test/lint signal is mapped to this file with no stronger uncertainty."
          : "No live observability evidence is mapped to this file.",
        evidenceIds: hasValidationSignal ? [...traceSpans.map((span) => span.spanId), ...signalIdsForPath(input.observabilityGraph, path)] : []
      });
    }

    const category = primaryCategory(reasons, "unknown");
    const severity = Math.max(...reasons.map((reason) => reason.severity), EPISTEMIC_CATEGORY_META[category].rank);

    return {
      nodeId: file.id,
      path,
      label: file.name,
      category,
      severity,
      confidence: strongestConfidence(reasons, category),
      reasons: reasons.sort((a, b) => b.severity - a.severity),
      validated: category === "validated",
      hasRuntimeObservation,
      relatedTests,
      reverseImportCount: importers.length,
      updatedAt: input.lastRefreshAt || input.observabilityGraph?.generatedAt || input.graph?.generatedAt
    };
  });
}

export function filterEpistemicScores(scores: EpistemicScore[], filter: EpistemicFogFilter) {
  if (filter === "unknown") {
    return scores.filter((score) =>
      ["unknown", "heuristic_only", "runtime_unobserved", "stale_observability"].includes(score.category)
    );
  }
  if (filter === "untested") return scores.filter((score) => score.category === "missing_tests");
  if (filter === "risky") {
    return scores.filter((score) =>
      ["diagnostic_error", "diagnostic_warning", "changed_unvalidated", "agent_context_missing", "missing_tests"].includes(score.category)
    );
  }
  return scores;
}

export function summarizeEpistemicScores(scores: EpistemicScore[]) {
  return scores.reduce(
    (counts, score) => {
      counts[score.category] += 1;
      counts.total += 1;
      return counts;
    },
    {
      total: 0,
      validated: 0,
      changed_unvalidated: 0,
      diagnostic_error: 0,
      diagnostic_warning: 0,
      missing_tests: 0,
      agent_context_missing: 0,
      heuristic_only: 0,
      runtime_unobserved: 0,
      stale_observability: 0,
      unknown: 0
    } satisfies Record<EpistemicCategory | "total", number>
  );
}

export function sortEpistemicScores(scores: EpistemicScore[]) {
  return [...scores].sort((a, b) => b.severity - a.severity || a.path.localeCompare(b.path));
}
