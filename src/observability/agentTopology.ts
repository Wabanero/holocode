import type { AgentResult } from "../types";

export type AgentTopologyStepKind =
  | "planner"
  | "retriever"
  | "coder"
  | "patch-writer"
  | "validator"
  | "tester"
  | "critic"
  | "debugger"
  | "finalizer"
  | "apply-gate"
  | "generic";

export type AgentTopologyStepStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "needs-human-review"
  | "cancelled"
  | "unknown";

export type AgentTopologyEdgeStatus = "pending" | "running" | "completed" | "failed" | "retry" | "unknown";

export type AgentTopologyRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs-human-review"
  | "cancelled"
  | "unknown";

export type AgentTopologyFilter = "all" | "failed" | "token-usage" | "file-focus";

export type AgentTopologyStep = {
  id: string;
  runId: string;
  order: number;
  label: string;
  kind: AgentTopologyStepKind;
  status: AgentTopologyStepStatus;
  rawNodeName?: string;
  iteration?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  elapsedMs?: number | null;
  filesTouched: string[];
  toolName?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  patchPath?: string | null;
  validationOutput?: string | null;
  validationState?: "not-run" | "passed" | "failed" | "unknown";
  error?: string | null;
  logFile?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AgentTopologyEdge = {
  id: string;
  runId: string;
  sourceId: string;
  targetId: string;
  status: AgentTopologyEdgeStatus;
  label?: string | null;
  filesTouched: string[];
  retry: boolean;
  tokenTotal?: number | null;
  latencyMs?: number | null;
};

export type AgentTopologyGraphDefinition = {
  nodes: string[];
  edges: Array<[string, string, string?]>;
};

export type AgentTopologyRun = {
  runId: string;
  taskId: string;
  status: AgentTopologyRunStatus;
  taskTitle: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  elapsedMs?: number | null;
  providerName?: string | null;
  modelName?: string | null;
  tokenBudget?: number | null;
  inputTokensTotal: number;
  outputTokensTotal: number;
  tokenUsageAvailable: boolean;
  filesTouched: string[];
  selectedFiles: string[];
  resultDiffFile?: string | null;
  logFile?: string | null;
  patchState?: string | null;
  validationState: "not-run" | "passed" | "failed" | "unknown";
  validationOutput?: string | null;
  steps: AgentTopologyStep[];
  edges: AgentTopologyEdge[];
  warnings: string[];
};

export type AgentWorkflowRunsResponse = {
  runs: unknown[];
  graph?: {
    nodes?: unknown[];
    edges?: unknown[];
  };
};

type PlainRecord = Record<string, unknown>;

const WORKFLOW_LABELS: Record<string, { label: string; kind: AgentTopologyStepKind; toolName?: string }> = {
  PlannerAgent: { label: "Planner", kind: "planner" },
  GraphRetrieverAgent: { label: "Retriever / graph context", kind: "retriever", toolName: "codegraph" },
  CoderAgent: { label: "Coder", kind: "coder" },
  PatchApplyTool: { label: "Patch validator", kind: "validator", toolName: "git apply --check" },
  TestRunnerTool: { label: "Tester", kind: "tester", toolName: "test runner" },
  DebuggerAgent: { label: "Debugger", kind: "debugger" },
  CriticAgent: { label: "Critic / reviewer", kind: "critic" },
  FinalizerAgent: { label: "Finalizer", kind: "finalizer" },
  ApplyRejectGate: { label: "Apply / reject gate", kind: "apply-gate" }
};

function isRecord(value: unknown): value is PlainRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayOfRecords(value: unknown): PlainRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? unique(value.filter((item): item is string => typeof item === "string").map(normalizeSlash).filter(Boolean)) : [];
}

function normalizeSlash(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "step";
}

function timestampMs(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : null;
}

function elapsedMs(startedAt: unknown, endedAt: unknown) {
  const start = timestampMs(startedAt);
  const end = timestampMs(endedAt);
  if (start === null || end === null) return null;
  return Math.max(0, end - start);
}

function nodeNameFromVisit(visit: PlainRecord) {
  return stringValue(visit.node) || stringValue(visit.name) || stringValue(visit.agent) || stringValue(visit.step) || "WorkflowStep";
}

function stepInfo(nodeName: string, fallbackIndex: number) {
  if (WORKFLOW_LABELS[nodeName]) return WORKFLOW_LABELS[nodeName];
  const normalized = nodeName.toLowerCase();
  if (normalized.includes("planner")) return WORKFLOW_LABELS.PlannerAgent;
  if (normalized.includes("retriever") || normalized.includes("context") || normalized.includes("graph")) return WORKFLOW_LABELS.GraphRetrieverAgent;
  if (normalized.includes("coder")) return WORKFLOW_LABELS.CoderAgent;
  if (normalized.includes("patch") || normalized.includes("apply")) return WORKFLOW_LABELS.PatchApplyTool;
  if (normalized.includes("test")) return WORKFLOW_LABELS.TestRunnerTool;
  if (normalized.includes("debug")) return WORKFLOW_LABELS.DebuggerAgent;
  if (normalized.includes("critic") || normalized.includes("review")) return WORKFLOW_LABELS.CriticAgent;
  if (normalized.includes("final")) return WORKFLOW_LABELS.FinalizerAgent;
  return { label: `Step ${fallbackIndex + 1}`, kind: "generic" as const };
}

function normalizeRunStatus(value: unknown): AgentTopologyRunStatus {
  const status = stringValue(value)?.replace(/_/g, "-");
  if (status === "queued" || status === "running" || status === "completed" || status === "failed" || status === "cancelled") return status;
  if (status === "needs-human-review") return "needs-human-review";
  return "unknown";
}

function statusForStep(params: {
  runStatus: AgentTopologyRunStatus;
  nodeName: string;
  order: number;
  total: number;
  errors: PlainRecord[];
  run: PlainRecord;
}) {
  const { runStatus, nodeName, order, total, errors, run } = params;
  const errorForNode = errors.find((error) => stringValue(error.node) === nodeName || stringValue(error.agent) === nodeName);
  if (errorForNode) return "failed";

  if (nodeName === "PatchApplyTool") {
    const latestPatchApply = arrayOfRecords(run.patchApplyResults).at(-1);
    if (latestPatchApply && latestPatchApply.ok === false) return "failed";
    if (latestPatchApply && latestPatchApply.ok === true) return "completed";
  }

  if (nodeName === "TestRunnerTool") {
    const latestTest = arrayOfRecords(run.testRuns).at(-1);
    if (latestTest && latestTest.ok === false) return "failed";
    if (latestTest && latestTest.ok === true) return "completed";
  }

  if (nodeName === "CriticAgent") {
    const review = isRecord(run.review) ? run.review : null;
    if (review?.approved === false) return "failed";
    if (review?.approved === true) return "completed";
  }

  if (runStatus === "cancelled") return order === total - 1 ? "cancelled" : "completed";
  if (runStatus === "failed") return order === total - 1 ? "failed" : "completed";
  if (runStatus === "needs-human-review") return order === total - 1 ? "needs-human-review" : "completed";
  if (runStatus === "running") return order === total - 1 ? "running" : "completed";
  if (runStatus === "queued") return order === 0 ? "queued" : "skipped";
  if (runStatus === "completed") return "completed";
  return "unknown";
}

function statusForGate(patchState: string | null, runStatus: AgentTopologyRunStatus): AgentTopologyStepStatus {
  if (patchState === "applied" || patchState === "validated") return "completed";
  if (patchState === "rejected" || patchState === "failed") return "failed";
  if (runStatus === "completed") return "completed";
  if (runStatus === "needs-human-review") return "needs-human-review";
  return "queued";
}

function edgeStatusFromSteps(source: AgentTopologyStep, target: AgentTopologyStep): AgentTopologyEdgeStatus {
  if (target.status === "failed" || target.status === "needs-human-review" || target.status === "cancelled") return "failed";
  if (source.status === "running" || target.status === "running") return "running";
  if (target.status === "completed") return "completed";
  if (target.status === "queued") return "pending";
  return "unknown";
}

function llmCallsByAgent(run: PlainRecord) {
  const telemetry = isRecord(run.telemetry) ? run.telemetry : {};
  const calls = arrayOfRecords(telemetry.llmCalls);
  const byAgent = new Map<string, PlainRecord[]>();
  for (const call of calls) {
    const agent = stringValue(call.agent) || stringValue(call.node) || "WorkflowStep";
    byAgent.set(agent, [...(byAgent.get(agent) || []), call]);
  }
  return byAgent;
}

function tokensForCalls(calls: PlainRecord[]) {
  const input = calls.reduce((total, call) => total + (numberValue(call.inputTokenEstimate) || numberValue(call.inputTokens) || 0), 0);
  const output = calls.reduce((total, call) => total + (numberValue(call.outputTokenEstimate) || numberValue(call.outputTokens) || 0), 0);
  const latency = calls.reduce((total, call) => total + (numberValue(call.latencyMs) || 0), 0);
  return {
    input,
    output,
    latency: latency || null
  };
}

function selectedFilesFromTask(task?: AgentResult) {
  if (!task?.task) return [];
  return unique(
    task.task
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*-\s+(.+?\.(?:tsx?|jsx?|json|css|md|mjs|cjs|html|py|yml|yaml))(?:\s|$)/i);
        return match?.[1] ? normalizeSlash(match[1].trim()) : "";
      })
      .filter(Boolean)
  );
}

function fileTouchesForNode(nodeName: string, run: PlainRecord, task?: AgentResult) {
  const selectedFiles = arrayOfStrings(run.selectedFiles);
  const currentPatch = isRecord(run.currentPatch) ? run.currentPatch : null;
  const touched = arrayOfStrings(currentPatch?.filesTouched);
  const context = isRecord(run.graphContext) ? run.graphContext : null;
  const relevantFiles = arrayOfStrings(context?.relevantFiles);
  const testsLikelyAffected = arrayOfStrings(context?.testsLikelyAffected);

  if (nodeName === "PlannerAgent") return selectedFiles.length ? selectedFiles : selectedFilesFromTask(task);
  if (nodeName === "GraphRetrieverAgent") return relevantFiles.length ? relevantFiles : selectedFiles;
  if (nodeName === "CoderAgent" || nodeName === "PatchApplyTool") return touched.length ? touched : selectedFiles;
  if (nodeName === "TestRunnerTool") return testsLikelyAffected.length ? testsLikelyAffected : touched;
  if (nodeName === "DebuggerAgent") {
    const parsedErrors = arrayOfRecords(run.parsedErrors).map((error) => stringValue(error.path)).filter((path): path is string => Boolean(path));
    return unique([...parsedErrors.map(normalizeSlash), ...touched]);
  }
  if (nodeName === "CriticAgent" || nodeName === "FinalizerAgent") return touched;
  return selectedFiles;
}

function latestPatchState(task?: AgentResult) {
  return task?.patchState?.status || null;
}

function validationState(run: PlainRecord, task?: AgentResult): AgentTopologyRun["validationState"] {
  const latestPatchApply = arrayOfRecords(run.patchApplyResults).at(-1);
  if (latestPatchApply) return latestPatchApply.ok === false ? "failed" : latestPatchApply.ok === true ? "passed" : "unknown";
  if (task?.patchState?.status === "validated" || task?.patchState?.status === "applied") return "passed";
  if (task?.patchState?.status === "failed" || task?.patchState?.status === "rejected") return "failed";
  return "not-run";
}

function validationOutput(run: PlainRecord, task?: AgentResult) {
  const latestPatchApply = arrayOfRecords(run.patchApplyResults).at(-1);
  return stringValue(latestPatchApply?.output) || stringValue(latestPatchApply?.error) || task?.patchState?.output || null;
}

function buildSteps(run: PlainRecord, task: AgentResult | undefined, runStatus: AgentTopologyRunStatus, runId: string) {
  const telemetry = isRecord(run.telemetry) ? run.telemetry : {};
  const visits = arrayOfRecords(telemetry.nodeVisits);
  const errors = arrayOfRecords(telemetry.errors);
  const callsByAgent = llmCallsByAgent(run);
  const completedAt = stringValue(isRecord(run.timestamps) ? run.timestamps.completedAt : null);

  const steps = visits.map((visit, index) => {
    const nodeName = nodeNameFromVisit(visit);
    const info = stepInfo(nodeName, index);
    const calls = callsByAgent.get(nodeName) || [];
    const tokenUsage = tokensForCalls(calls);
    const startedAt = stringValue(visit.timestamp);
    const nextStartedAt = stringValue(visits[index + 1]?.timestamp);
    const endedAt = nextStartedAt || (index === visits.length - 1 ? completedAt : null);
    const stepError = errors.find((error) => stringValue(error.node) === nodeName || stringValue(error.agent) === nodeName);
    return {
      id: `${runId}:${safeIdPart(nodeName)}:${index}`,
      runId,
      order: index,
      label: info.label,
      kind: info.kind,
      status: statusForStep({ runStatus, nodeName, order: index, total: visits.length, errors, run }),
      rawNodeName: nodeName,
      iteration: numberValue(visit.iteration),
      startedAt,
      endedAt,
      elapsedMs: elapsedMs(startedAt, endedAt),
      filesTouched: fileTouchesForNode(nodeName, run, task),
      toolName: info.toolName || null,
      inputTokens: tokenUsage.input || null,
      outputTokens: tokenUsage.output || null,
      latencyMs: tokenUsage.latency,
      patchPath: nodeName === "PatchApplyTool" || nodeName === "CoderAgent" ? task?.resultDiffFile || null : null,
      validationOutput: nodeName === "PatchApplyTool" ? validationOutput(run, task) : null,
      validationState: nodeName === "PatchApplyTool" ? validationState(run, task) : undefined,
      error: stringValue(stepError?.message) || stringValue(stepError?.error),
      logFile: task?.logFile || null,
      metadata: {
        iteration: numberValue(visit.iteration),
        operationalOnly: true
      }
    } satisfies AgentTopologyStep;
  });

  return steps.length ? steps : deriveFallbackSteps(run, task, runStatus, runId);
}

function deriveFallbackSteps(run: PlainRecord, task: AgentResult | undefined, runStatus: AgentTopologyRunStatus, runId: string) {
  const steps: AgentTopologyStep[] = [];
  const selectedFiles = arrayOfStrings(run.selectedFiles);
  const currentPatch = isRecord(run.currentPatch) ? run.currentPatch : null;
  const touchedFiles = arrayOfStrings(currentPatch?.filesTouched);

  if (selectedFiles.length || task) {
    steps.push({
      id: `${runId}:task`,
      runId,
      order: steps.length,
      label: "Task context",
      kind: "retriever",
      status: runStatus === "queued" ? "queued" : "completed",
      rawNodeName: "TaskContext",
      filesTouched: selectedFiles.length ? selectedFiles : selectedFilesFromTask(task),
      logFile: task?.logFile || null
    });
  }

  if (currentPatch || task?.diff) {
    steps.push({
      id: `${runId}:patch`,
      runId,
      order: steps.length,
      label: "Patch writer",
      kind: "patch-writer",
      status: runStatus === "running" ? "running" : "completed",
      rawNodeName: "PatchWriter",
      filesTouched: touchedFiles.length ? touchedFiles : selectedFiles,
      patchPath: task?.resultDiffFile || null,
      logFile: task?.logFile || null
    });
  }

  if (arrayOfRecords(run.patchApplyResults).length || task?.patchState) {
    steps.push({
      id: `${runId}:validation`,
      runId,
      order: steps.length,
      label: "Patch validation",
      kind: "validator",
      status: validationState(run, task) === "failed" ? "failed" : "completed",
      rawNodeName: "PatchApplyTool",
      filesTouched: touchedFiles,
      toolName: "git apply --check",
      patchPath: task?.resultDiffFile || null,
      validationState: validationState(run, task),
      validationOutput: validationOutput(run, task),
      logFile: task?.logFile || null
    });
  }

  if (arrayOfRecords(run.testRuns).length) {
    const latestTest = arrayOfRecords(run.testRuns).at(-1);
    steps.push({
      id: `${runId}:tests`,
      runId,
      order: steps.length,
      label: "Tester",
      kind: "tester",
      status: latestTest?.ok === false ? "failed" : "completed",
      rawNodeName: "TestRunnerTool",
      filesTouched: touchedFiles,
      toolName: "test runner",
      logFile: task?.logFile || null
    });
  }

  if (isRecord(run.review)) {
    steps.push({
      id: `${runId}:review`,
      runId,
      order: steps.length,
      label: "Critic / reviewer",
      kind: "critic",
      status: run.review.approved === false ? "failed" : "completed",
      rawNodeName: "CriticAgent",
      filesTouched: touchedFiles,
      logFile: task?.logFile || null
    });
  }

  if (!steps.length) {
    steps.push({
      id: `${runId}:workflow`,
      runId,
      order: 0,
      label: "Workflow",
      kind: "generic",
      status: runStatus === "unknown" ? "queued" : runStatus,
      rawNodeName: "Workflow",
      filesTouched: selectedFiles.length ? selectedFiles : selectedFilesFromTask(task),
      logFile: task?.logFile || null
    });
  }

  return steps.map((step, index) => ({ ...step, order: index }));
}

function appendApplyGate(steps: AgentTopologyStep[], run: PlainRecord, task: AgentResult | undefined, runStatus: AgentTopologyRunStatus, runId: string) {
  const patchState = latestPatchState(task);
  const hasPatch = Boolean(task?.resultDiffFile || task?.diff || isRecord(run.currentPatch));
  if (!hasPatch) return steps;
  const gateAlreadyExists = steps.some((step) => step.kind === "apply-gate");
  if (gateAlreadyExists) return steps;
  const gateStep: AgentTopologyStep = {
    id: `${runId}:apply-gate`,
    runId,
    order: steps.length,
    label: "Apply / reject gate",
    kind: "apply-gate",
    status: statusForGate(patchState, runStatus),
    rawNodeName: "ApplyRejectGate",
    filesTouched: unique(steps.flatMap((step) => step.filesTouched)),
    patchPath: task?.resultDiffFile || null,
    validationState: validationState(run, task),
    validationOutput: validationOutput(run, task),
    logFile: task?.logFile || null,
    metadata: {
      patchState,
      operationalOnly: true
    }
  };
  return [...steps, gateStep];
}

function buildEdges(steps: AgentTopologyStep[], runId: string): AgentTopologyEdge[] {
  const seenRawNodes = new Set<string>();
  return steps.slice(0, -1).map((source, index) => {
    const target = steps[index + 1];
    const rawKey = target.rawNodeName || target.kind;
    const retry = seenRawNodes.has(rawKey) || target.iteration !== null && target.iteration !== undefined && source.iteration !== null && source.iteration !== undefined && target.iteration > source.iteration;
    seenRawNodes.add(source.rawNodeName || source.kind);
    return {
      id: `${source.id}->${target.id}`,
      runId,
      sourceId: source.id,
      targetId: target.id,
      status: retry ? "retry" : edgeStatusFromSteps(source, target),
      label: retry ? "retry" : null,
      filesTouched: unique([...source.filesTouched, ...target.filesTouched]).slice(0, 8),
      retry,
      tokenTotal: (target.inputTokens || 0) + (target.outputTokens || 0) || null,
      latencyMs: target.latencyMs || target.elapsedMs || null
    };
  });
}

function graphDefinitionFromPayload(payload: AgentWorkflowRunsResponse | null): AgentTopologyGraphDefinition {
  const graph = payload?.graph || {};
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.filter((node): node is string => typeof node === "string") : [],
    edges: Array.isArray(graph.edges)
      ? graph.edges
          .filter((edge): edge is unknown[] => Array.isArray(edge) && typeof edge[0] === "string" && typeof edge[1] === "string")
          .map((edge) => {
            const source = edge[0] as string;
            const target = edge[1] as string;
            const label = typeof edge[2] === "string" ? edge[2] : undefined;
            return [source, target, label] satisfies [string, string, string?];
          })
      : []
  };
}

function taskForRun(run: PlainRecord, agentResults: AgentResult[]) {
  const taskId = stringValue(run.taskId);
  if (!taskId) return undefined;
  return agentResults.find((result) => result.taskId === taskId);
}

function compareRunsByUpdatedAt(a: PlainRecord, b: PlainRecord) {
  const aTimes = isRecord(a.timestamps) ? a.timestamps : {};
  const bTimes = isRecord(b.timestamps) ? b.timestamps : {};
  const aTime = timestampMs(aTimes.updatedAt) || timestampMs(aTimes.completedAt) || timestampMs(aTimes.startedAt) || 0;
  const bTime = timestampMs(bTimes.updatedAt) || timestampMs(bTimes.completedAt) || timestampMs(bTimes.startedAt) || 0;
  return bTime - aTime;
}

export function buildAgentTopologyRun(run: PlainRecord, agentResults: AgentResult[] = []): AgentTopologyRun {
  const task = taskForRun(run, agentResults);
  const taskId = stringValue(run.taskId) || task?.taskId || "unknown-run";
  const runId = taskId;
  const timestamps = isRecord(run.timestamps) ? run.timestamps : {};
  const runStatus = normalizeRunStatus(run.status);
  const provider = isRecord(run.provider) ? run.provider : {};
  const currentPatch = isRecord(run.currentPatch) ? run.currentPatch : null;
  const selectedFiles = arrayOfStrings(run.selectedFiles);
  const filesTouched = unique([...arrayOfStrings(currentPatch?.filesTouched), ...(task?.diff ? selectedFilesFromTask(task) : [])]);
  const calls = arrayOfRecords(isRecord(run.telemetry) ? run.telemetry.llmCalls : null);
  const inputTokensTotal = calls.reduce((total, call) => total + (numberValue(call.inputTokenEstimate) || numberValue(call.inputTokens) || 0), 0);
  const outputTokensTotal = calls.reduce((total, call) => total + (numberValue(call.outputTokenEstimate) || numberValue(call.outputTokens) || 0), 0);
  const steps = appendApplyGate(buildSteps(run, task, runStatus, runId), run, task, runStatus, runId);
  const validation = validationState(run, task);
  const warnings: string[] = [];
  if (!calls.length) warnings.push("Token usage unavailable.");
  if (!task?.logFile) warnings.push("Log metadata unavailable.");
  if (validation === "not-run") warnings.push("Patch validation output unavailable.");

  return {
    runId,
    taskId,
    status: runStatus,
    taskTitle: stringValue(run.userGoal) || task?.task?.split(/\r?\n/).find((line) => line.startsWith("Improve ")) || "Agent workflow",
    startedAt: stringValue(timestamps.startedAt),
    updatedAt: stringValue(timestamps.updatedAt),
    completedAt: stringValue(timestamps.completedAt),
    elapsedMs: elapsedMs(timestamps.startedAt, timestamps.completedAt || timestamps.updatedAt),
    providerName: stringValue(provider.providerName),
    modelName: stringValue(provider.modelName),
    tokenBudget: numberValue(run.tokenBudget) || numberValue(provider.contextWindow),
    inputTokensTotal,
    outputTokensTotal,
    tokenUsageAvailable: inputTokensTotal + outputTokensTotal > 0,
    filesTouched: filesTouched.length ? filesTouched : unique(steps.flatMap((step) => step.filesTouched)),
    selectedFiles: selectedFiles.length ? selectedFiles : selectedFilesFromTask(task),
    resultDiffFile: task?.resultDiffFile || null,
    logFile: task?.logFile || null,
    patchState: latestPatchState(task),
    validationState: validation,
    validationOutput: validationOutput(run, task),
    steps,
    edges: buildEdges(steps, runId),
    warnings
  };
}

export function buildAgentTopologyFromWorkflowRuns(
  payload: AgentWorkflowRunsResponse | null,
  agentResults: AgentResult[] = [],
  selectedRunId?: string | null
) {
  const runs = (payload?.runs || []).filter(isRecord);
  const sortedRuns = [...runs].sort(compareRunsByUpdatedAt);
  const topologyRuns = sortedRuns.map((run) => buildAgentTopologyRun(run, agentResults));
  const selected =
    (selectedRunId ? topologyRuns.find((run) => run.runId === selectedRunId || run.taskId === selectedRunId) : null) ||
    topologyRuns[0] ||
    null;

  return {
    graphDefinition: graphDefinitionFromPayload(payload),
    runs: topologyRuns,
    selected
  };
}
