import type {
  AgentRunSnapshot,
  CodeEdge,
  CodeGraph,
  CodeNodeKind,
  DebugBreakpoint,
  DebugSessionSnapshot,
  DiffChangedFile,
  GitFileStatus,
  LspDiagnostic,
  LspDiagnosticSeverity,
  LspLocation
} from "../types";

export type ObservabilitySource =
  | "codegraph"
  | "lsp"
  | "git"
  | "agent"
  | "debug"
  | "runtime"
  | "test"
  | "lint"
  | "watchpoint"
  | "manual";

export type ObservabilitySeverity = "info" | "notice" | "warning" | "error" | "critical";

export type ObservabilityConfidence = "verified" | "inferred" | "estimated" | "stale" | "missing";

export type ObservabilityViewMode =
  | "off"
  | "overview"
  | "blast-radius"
  | "context-lens"
  | "agent-topology"
  | "trace-rivers"
  | "epistemic-fog"
  | "diff-time-tunnel"
  | "watchpoints";

export type ObservabilitySignalType =
  | ObservabilitySource
  | "graph-generated"
  | "graph-updated"
  | "graph-query"
  | "blast-radius"
  | "diagnostic"
  | "status"
  | "diff"
  | "patch-validated"
  | "patch-applied"
  | "patch-rejected"
  | "agent-started"
  | "agent-step"
  | "agent-context"
  | "agent-patch"
  | "agent-finished"
  | "agent-failed"
  | "debug-started"
  | "debug-paused"
  | "debug-stopped"
  | "breakpoint"
  | "stack-frame"
  | "watch"
  | "span-started"
  | "span-ended"
  | "runtime-error"
  | "log"
  | "async-hop"
  | "test-run-started"
  | "test-case-passed"
  | "test-case-failed"
  | "test-run-finished"
  | "lint-run-started"
  | "lint-finding"
  | "lint-run-finished"
  | "watchpoint-created"
  | "watchpoint-triggered"
  | "watchpoint-cleared";

export type ObservabilityNodeKind =
  | CodeNodeKind
  | "diagnostic"
  | "diff_hunk"
  | "runtime_span"
  | "agent_step"
  | "debug_frame"
  | "debug_breakpoint"
  | "test_case"
  | "lint_finding"
  | "watchpoint"
  | "context_snapshot";

export type ObservabilityEdgeKind =
  | CodeEdge["type"]
  | "observes"
  | "impacts"
  | "executes"
  | "emits"
  | "mentions"
  | "selects_context"
  | "edits"
  | "tests_runtime"
  | "fails_at"
  | "watches"
  | "precedes"
  | "correlates_with";

export type ObservabilityRange = {
  startLine: number;
  startColumn?: number;
  endLine?: number;
  endColumn?: number;
};

export type ObservabilityVector3 = {
  x: number;
  y: number;
  z: number;
};

export type ObservabilityAvailability = {
  codegraph: boolean;
  lsp: boolean;
  git: boolean;
  agent: boolean;
  agents?: boolean;
  debug: boolean;
  runtime: boolean;
  test: boolean;
  lint: boolean;
};

export type ObservabilityGraphSources = {
  codegraph: boolean;
  git: boolean;
  lsp: boolean;
  agents: boolean;
  debug: boolean;
  runtime: false;
};

export type ObservabilityStats = {
  nodeCount: number;
  edgeCount: number;
  signalCount: number;
  runtimeTraceCount: number;
  agentTraceCount: number;
  watchpointCount: number;
  staleSignalCount: number;
  missingSourceCount: number;
};

export interface BaseObservabilityNode {
  id: string;
  kind: ObservabilityNodeKind;
  label: string;
  source: ObservabilitySource;
  confidence: ObservabilityConfidence;
  codeGraphNodeId?: string;
  path?: string;
  symbolName?: string;
  range?: ObservabilityRange;
  positionHint?: ObservabilityVector3;
  metrics?: Record<string, number | string | boolean | null>;
  updatedAt?: string;
}

export interface CodeEntityObservabilityNode extends BaseObservabilityNode {
  source: "codegraph";
  kind: CodeNodeKind;
  path: string;
}

export interface DiagnosticObservabilityNode extends BaseObservabilityNode {
  source: "lsp";
  kind: "diagnostic";
  diagnosticId: string;
  severity: LspDiagnosticSeverity;
}

export interface DiffObservabilityNode extends BaseObservabilityNode {
  source: "git";
  kind: "diff_hunk";
  path: string;
  changeStatus: DiffChangedFile["status"];
  additions: number;
  deletions: number;
}

export interface RuntimeSpanObservabilityNode extends BaseObservabilityNode {
  source: "runtime";
  kind: "runtime_span";
  traceId: string;
  spanId: string;
  durationMs?: number;
}

export interface AgentStepObservabilityNode extends BaseObservabilityNode {
  source: "agent";
  kind: "agent_step";
  traceId: string;
  stepId: string;
  status: AgentStepStatus;
}

export interface DebugObservabilityNode extends BaseObservabilityNode {
  source: "debug";
  kind: "debug_frame" | "debug_breakpoint";
  debugSessionId?: string;
  breakpointId?: string;
  frameId?: string;
}

export interface TestOrLintObservabilityNode extends BaseObservabilityNode {
  source: "test" | "lint";
  kind: "test_case" | "lint_finding";
  status: "passed" | "failed" | "skipped" | "unknown";
}

export interface WatchpointObservabilityNode extends BaseObservabilityNode {
  source: "watchpoint" | "manual";
  kind: "watchpoint";
  watchpointId: string;
}

export type ObservabilityNode =
  | CodeEntityObservabilityNode
  | DiagnosticObservabilityNode
  | DiffObservabilityNode
  | RuntimeSpanObservabilityNode
  | AgentStepObservabilityNode
  | DebugObservabilityNode
  | TestOrLintObservabilityNode
  | WatchpointObservabilityNode;

export interface ObservabilityEdge {
  id: string;
  kind: ObservabilityEdgeKind;
  sourceNodeId: string;
  targetNodeId: string;
  source: ObservabilitySource;
  confidence: ObservabilityConfidence;
  weight?: number;
  directed: boolean;
  observedAt?: string;
  evidenceSignalIds?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BaseObservabilitySignal {
  id: string;
  source: ObservabilitySource;
  observedAt: string;
  nodeId?: string;
  path?: string;
  range?: ObservabilityRange;
  severity: ObservabilitySeverity;
  confidence: ObservabilityConfidence;
  message: string;
}

export interface CodeGraphSignal extends BaseObservabilitySignal {
  source: "codegraph";
  type: "graph-generated" | "graph-updated" | "graph-query" | "blast-radius";
  graphGeneratedAt?: CodeGraph["generatedAt"];
  affectedNodeIds?: string[];
}

export interface LspDiagnosticSignal extends BaseObservabilitySignal {
  source: "lsp";
  type: "diagnostic";
  diagnostic: Pick<LspDiagnostic, "id" | "path" | "severity" | "code" | "source" | "message"> & ObservabilityRange;
}

export interface GitSignal extends BaseObservabilitySignal {
  source: "git";
  type: "status" | "diff" | "patch-validated" | "patch-applied" | "patch-rejected";
  fileStatus?: GitFileStatus["status"];
  changedFile?: DiffChangedFile;
  patchState?: "pending" | "validated" | "applied" | "rejected" | "failed";
}

export interface AgentSignal extends BaseObservabilitySignal {
  source: "agent";
  type: "agent-started" | "agent-step" | "agent-context" | "agent-patch" | "agent-finished" | "agent-failed";
  taskId: string;
  runStatus?: AgentRunSnapshot["status"];
  stepId?: string;
  contextSnapshotId?: string;
}

export interface DebugSignal extends BaseObservabilitySignal {
  source: "debug";
  type: "debug-started" | "debug-paused" | "debug-stopped" | "breakpoint" | "stack-frame" | "watch";
  status?: DebugSessionSnapshot["status"];
  breakpoint?: Pick<DebugBreakpoint, "id" | "path" | "line" | "enabled">;
}

export interface RuntimeSignal extends BaseObservabilitySignal {
  source: "runtime";
  type: "span-started" | "span-ended" | "runtime-error" | "log" | "async-hop";
  traceId: string;
  spanId?: string;
  durationMs?: number;
}

export interface TestSignal extends BaseObservabilitySignal {
  source: "test";
  type: "test-run-started" | "test-case-passed" | "test-case-failed" | "test-run-finished";
  runId: string;
  testName?: string;
  command?: string;
}

export interface LintSignal extends BaseObservabilitySignal {
  source: "lint";
  type: "lint-run-started" | "lint-finding" | "lint-run-finished";
  runId: string;
  ruleId?: string;
}

export interface WatchpointSignal extends BaseObservabilitySignal {
  source: "watchpoint" | "manual";
  type: "watchpoint-created" | "watchpoint-triggered" | "watchpoint-cleared";
  watchpointId: string;
}

export type ObservabilitySignal =
  | CodeGraphSignal
  | LspDiagnosticSignal
  | GitSignal
  | AgentSignal
  | DebugSignal
  | RuntimeSignal
  | TestSignal
  | LintSignal
  | WatchpointSignal;

export type RuntimeTraceStatus = "recording" | "completed" | "failed" | "partial" | "unavailable";

export interface RuntimeTrace {
  traceId: string;
  source: "runtime";
  status: RuntimeTraceStatus;
  startedAt: string;
  endedAt?: string;
  entryNodeId?: string;
  rootSpanIds: string[];
  spans: RuntimeSpan[];
  correlatedSignalIds: string[];
  missingReason?: "not-instrumented" | "not-running" | "source-map-missing" | "trace-pruned" | "unknown";
}

interface BaseRuntimeSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  nodeId?: string;
  path?: string;
  range?: ObservabilityRange;
  status: "ok" | "error" | "cancelled" | "unknown";
  attributes?: Record<string, string | number | boolean | null>;
}

export interface FunctionRuntimeSpan extends BaseRuntimeSpan {
  kind: "function-call";
  functionName?: string;
}

export interface HttpRuntimeSpan extends BaseRuntimeSpan {
  kind: "http-request";
  method?: string;
  url?: string;
  statusCode?: number;
}

export interface AsyncRuntimeSpan extends BaseRuntimeSpan {
  kind: "async-hop";
  scheduler?: "promise" | "timer" | "event" | "worker" | "unknown";
}

export interface ErrorRuntimeSpan extends BaseRuntimeSpan {
  kind: "error";
  errorName?: string;
  errorMessage: string;
  stack?: Array<Pick<LspLocation, "path" | "startLine" | "startColumn" | "endLine" | "endColumn" | "name">>;
}

export type RuntimeSpan = FunctionRuntimeSpan | HttpRuntimeSpan | AsyncRuntimeSpan | ErrorRuntimeSpan;

export type AgentStepStatus = "queued" | "running" | "completed" | "failed" | "skipped" | "waiting-for-user";

export interface AgentTrace {
  traceId: string;
  taskId: string;
  runId?: string;
  source: "agent";
  status: AgentRunSnapshot["status"] | "waiting-for-user" | "cancelled";
  startedAt?: string | null;
  endedAt?: string | null;
  userGoal?: string;
  steps: AgentStep[];
  contextSnapshots: AgentContextSnapshot[];
  touchedNodeIds: string[];
  touchedFiles: string[];
  producedPatchPaths: string[];
}

interface BaseAgentStep {
  traceId: string;
  stepId: string;
  name: string;
  status: AgentStepStatus;
  startedAt?: string;
  endedAt?: string;
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
  selectedNodeIds: string[];
  selectedSignalIds: string[];
  error?: string;
}

export interface AgentPlanningStep extends BaseAgentStep {
  kind: "planning";
  planSummary?: string;
}

export interface AgentGraphContextStep extends BaseAgentStep {
  kind: "graph-context";
  contextSnapshotId: string;
  blastRadiusNodeCount?: number;
}

export interface AgentToolStep extends BaseAgentStep {
  kind: "tool-call";
  toolName: "codegraph" | "git" | "lsp" | "debug" | "test" | "lint" | "file" | "shell" | "llm" | "other";
  commandLabel?: string;
  safeBoundary: "read-only" | "preview-only" | "explicit-write" | "external-process";
}

export interface AgentPatchStep extends BaseAgentStep {
  kind: "patch";
  patchPath?: string;
  changedFiles: string[];
  validationStatus: "not-run" | "passed" | "failed";
}

export interface AgentReviewStep extends BaseAgentStep {
  kind: "review";
  approved: boolean | null;
  riskLevel?: CodeGraphRiskScore["level"];
}

export type AgentStep = AgentPlanningStep | AgentGraphContextStep | AgentToolStep | AgentPatchStep | AgentReviewStep;

export interface AgentContextSnapshot {
  id: string;
  traceId: string;
  createdAt: string;
  source: "agent";
  promptBudgetTokens?: number;
  estimatedTokens: number;
  selectedNodeIds: string[];
  selectedFilePaths: string[];
  selectedSymbolIds: string[];
  selectedSignalIds: string[];
  omittedNodeIds: string[];
  graphStats?: Pick<CodeGraph["stats"], "files" | "symbols" | "imports" | "nodeCount" | "edgeCount" | "fileCount" | "symbolCount" | "testCount">;
  redactions: Array<{ kind: "secret" | "environment" | "absolute-path" | "terminal-log"; count: number }>;
  rationale?: string;
}

export interface CodeGraphRiskScore {
  nodeId: string;
  score: number;
  level: "low" | "medium" | "high" | "critical" | "unknown";
  confidence: ObservabilityConfidence;
  calculatedAt: string;
  factors: Array<{
    kind: "dependency-centrality" | "diagnostics" | "diff-size" | "test-coverage" | "runtime-heat" | "agent-attention" | "debug-focus" | "watchpoint";
    weight: number;
    value: number;
    signalIds?: string[];
    explanation: string;
  }>;
  missingInputs: Array<"codegraph" | "lsp" | "git" | "agent" | "debug" | "runtime" | "test" | "lint">;
}

export type CodeGraphRiskReason = {
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

export type CodeGraphRiskResult = CodeGraphRiskScore & {
  path: string;
  reasons: CodeGraphRiskReason[];
  relatedTests: string[];
  reverseImportCount: number;
  complexity: number;
  localMedianComplexity: number;
};

export interface BlastRadiusResult {
  id: string;
  generatedAt: string;
  seedNodeIds: string[];
  seedPaths: string[];
  affectedNodeIds: string[];
  affectedPaths: string[];
  affectedTestPaths: string[];
  edges: ObservabilityEdge[];
  riskScores: CodeGraphRiskScore[];
  maxDepth: number;
  confidence: ObservabilityConfidence;
  missingSources: ObservabilitySource[];
}

export interface ContextLensResult {
  id: string;
  generatedAt: string;
  focusNodeId?: string;
  focusPath?: string;
  runId?: string | null;
  taskId?: string | null;
  mode: "agent" | "manual" | "debug" | "diagnostic" | "diff";
  promptBudgetTokens?: number;
  estimatedTokens: number;
  includedNodeIds: string[];
  includedSignalIds: string[];
  omittedNodeIds: string[];
  contextSnapshots: AgentContextSnapshot[];
  rationale: string;
  confidence: ObservabilityConfidence;
  touchedFiles?: string[];
  changedFiles?: string[];
  readFiles?: string[];
  producedPatchPaths?: string[];
  artifactPaths?: string[];
  inferenceNotes?: string[];
  agentSteps?: Array<{ name: string; status: string; timestamp?: string }>;
}

export interface DiffTimeTunnel {
  id: string;
  generatedAt: string;
  focusNodeIds: string[];
  focusPaths: string[];
  events: DiffTimeEvent[];
  window: {
    startAt: string;
    endAt: string;
  };
  missingSources: ObservabilitySource[];
}

export type DiffTimeEvent =
  | {
      kind: "git-change";
      id: string;
      at: string;
      path: string;
      status: DiffChangedFile["status"];
      additions: number;
      deletions: number;
      signalId?: string;
    }
  | {
      kind: "agent-step";
      id: string;
      at: string;
      traceId: string;
      stepId: string;
      status: AgentStepStatus;
      signalId?: string;
    }
  | {
      kind: "diagnostic-change";
      id: string;
      at: string;
      path: string;
      severity: LspDiagnosticSeverity;
      countDelta: number;
      signalId?: string;
    }
  | {
      kind: "runtime-span";
      id: string;
      at: string;
      traceId: string;
      spanId: string;
      durationMs?: number;
      status: RuntimeSpan["status"];
      signalId?: string;
    }
  | {
      kind: "test-or-lint";
      id: string;
      at: string;
      source: "test" | "lint";
      status: "started" | "passed" | "failed" | "completed" | "unknown";
      path?: string;
      signalId?: string;
    }
  | {
      kind: "debug-event";
      id: string;
      at: string;
      status: DebugSessionSnapshot["status"];
      path?: string;
      line?: number;
      signalId?: string;
    };

export interface SpatialWatchpoint {
  id: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  enabled: boolean;
  target:
    | { kind: "node"; nodeId: string }
    | { kind: "file"; path: string; range?: ObservabilityRange }
    | { kind: "symbol"; nodeId: string; path: string; symbolName: string; range?: ObservabilityRange }
    | { kind: "diagnostic"; diagnosticId: string }
    | { kind: "runtime-span"; traceId: string; spanId: string }
    | { kind: "expression"; path: string; expression: string };
  trigger:
    | { kind: "signal"; sources: ObservabilitySource[]; severities?: ObservabilitySeverity[] }
    | { kind: "risk-threshold"; level: CodeGraphRiskScore["level"]; minScore: number }
    | { kind: "value-change"; expression: string }
    | { kind: "breakpoint"; breakpointId?: string };
  lastTriggeredAt?: string;
  lastSignalIds: string[];
  safeAction: "notify-only" | "focus-only" | "open-read-only-panel";
}

export type EpistemicState =
  | {
      state: "known";
      confidence: "verified";
      evidenceSignalIds: string[];
      updatedAt: string;
    }
  | {
      state: "inferred";
      confidence: "inferred" | "estimated";
      evidenceSignalIds: string[];
      assumptions: string[];
      updatedAt: string;
    }
  | {
      state: "stale";
      confidence: "stale";
      evidenceSignalIds: string[];
      updatedAt: string;
      staleBecause: "graph-outdated" | "git-changed" | "trace-pruned" | "agent-run-ended" | "unknown";
    }
  | {
      state: "missing";
      confidence: "missing";
      missingSources: ObservabilitySource[];
      reason: "not-configured" | "not-run" | "not-supported" | "permission-denied" | "failed" | "unknown";
    }
  | {
      state: "conflicting";
      confidence: "estimated";
      evidenceSignalIds: string[];
      conflictSummary: string;
      updatedAt: string;
    };

export type ObservabilityMode =
  | { mode: "off" }
  | { mode: "llm-context-lens"; focusNodeId?: string; agentTraceId?: string; tokenBudget?: number }
  | { mode: "blast-radius"; seedNodeIds: string[]; includeTests: boolean; includeRuntime: boolean }
  | { mode: "agent-thought-topology"; traceId?: string; showTokenPressure: boolean }
  | { mode: "trace-rivers"; traceIds?: string[]; minDurationMs?: number }
  | { mode: "epistemic-fog"; sources: ObservabilitySource[]; showMissing: boolean; showStale: boolean }
  | { mode: "diff-time-tunnel"; tunnelId?: string; focusPaths?: string[] }
  | { mode: "spatial-watchpoints"; watchpointIds?: string[] }
  | { mode: "semantic-gravity"; factors: CodeGraphRiskScore["factors"][number]["kind"][]; maxInfluence: number };

export interface ObservabilityGraph {
  id: string;
  repoRoot: string;
  generatedAt: string;
  baseCodeGraphGeneratedAt?: CodeGraph["generatedAt"];
  nodes: ObservabilityNode[];
  edges: ObservabilityEdge[];
  signals: ObservabilitySignal[];
  runtimeTraces: RuntimeTrace[];
  agentTraces: AgentTrace[];
  diffTimeTunnels: DiffTimeTunnel[];
  watchpoints: SpatialWatchpoint[];
  epistemicByNodeId: Record<string, EpistemicState>;
  riskByNodeId: Record<string, CodeGraphRiskScore>;
  availability: ObservabilityAvailability;
  stats: ObservabilityStats;
  activeMode: ObservabilityMode;
}
