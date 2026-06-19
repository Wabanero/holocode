export type AgentStepKey = "Planner" | "GraphRetriever" | "Coder" | "PatchApply" | "Tester" | "Debugger" | "Critic" | "Finalizer";

export type AgentStepStatus = "idle" | "waiting" | "running" | "success" | "failure";

export type GraphViewMode = "workflow" | "code" | "impact";

export type AgentTimelineStep = {
  key: AgentStepKey;
  label: string;
  status: AgentStepStatus;
  startedAt: string | null;
  endedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  error: string | null;
};

export type TelemetryGraphShape = {
  nodes: Array<{ id: string; label: string; type: string; path?: string; status?: string; metrics?: Record<string, unknown> }>;
  edges: Array<{ id: string; source: string; target: string; type: string; weight?: number; status?: string }>;
  clusters: Array<{ id: string; label: string; nodeIds: string[]; type: string }>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    symbolCount: number;
    testCount: number;
  };
};

export type OrchestrationTelemetryState = {
  connectionStatus: "connecting" | "connected" | "polling" | "disconnected";
  taskTitle: string;
  taskId: string | null;
  status: string;
  iteration: number;
  maxIterations: number;
  providerName: string;
  modelName: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  timeline: AgentTimelineStep[];
  llm: {
    requestCount: number;
    failedRequestCount: number;
    inputTokenEstimateTotal: number;
    outputTokenEstimateTotal: number;
    cumulativeEstimatedTokens: number;
    lastLatencyMs: number | null;
    lastTimeToFirstTokenMs: number | null;
    lastTokensPerSecond: number | null;
    contextWindow: number | null;
    contextUsagePercent: number | null;
    lastTokenPreview: string;
  };
  resources: {
    measured: boolean;
    rssMb: number | null;
    heapUsedMb: number | null;
    heapTotalMb: number | null;
    cpuPercent: number | null;
  };
  graph: {
    providerName: string;
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    symbolCount: number;
    testCount: number;
    lastRebuildAt: string | null;
    selectedContextFilesCount: number;
    blastRadiusNodeCount: number;
  };
  patchTest: {
    filesChanged: string[];
    patchApplyStatus: string;
    testsRun: string[];
    testResult: string;
    parsedErrors: Array<{ path?: string; line?: number; message?: string }>;
    currentRisk: string;
  };
  viewMode: GraphViewMode;
  workflowGraph: TelemetryGraphShape;
  codeGraph: TelemetryGraphShape | null;
  impactGraph: TelemetryGraphShape | null;
  warnings: string[];
  lastError: string | null;
};

export const AGENT_STEPS: Array<{ key: AgentStepKey; label: string; eventNames: string[] }> = [
  { key: "Planner", label: "Planner", eventNames: ["PlannerAgent"] },
  { key: "GraphRetriever", label: "GraphRetriever", eventNames: ["GraphRetrieverAgent"] },
  { key: "Coder", label: "Coder", eventNames: ["CoderAgent"] },
  { key: "PatchApply", label: "PatchApply", eventNames: ["PatchApplyTool"] },
  { key: "Tester", label: "Tester", eventNames: ["TestRunnerTool"] },
  { key: "Debugger", label: "Debugger", eventNames: ["DebuggerAgent"] },
  { key: "Critic", label: "Critic", eventNames: ["CriticAgent"] },
  { key: "Finalizer", label: "Finalizer", eventNames: ["FinalizerAgent"] }
];

export function createWorkflowGraph(): TelemetryGraphShape {
  const nodes = AGENT_STEPS.map((step, index) => ({
    id: step.key,
    label: step.label,
    type: "agent",
    status: "idle",
    metrics: { order: index }
  }));
  const edges = [
    ["Planner", "GraphRetriever"],
    ["GraphRetriever", "Coder"],
    ["Coder", "PatchApply"],
    ["PatchApply", "Tester"],
    ["Tester", "Debugger"],
    ["Tester", "Critic"],
    ["Debugger", "Coder"],
    ["Critic", "Coder"],
    ["Critic", "Debugger"],
    ["Critic", "Finalizer"]
  ].map(([source, target]) => ({
    id: `${source}->${target}`,
    source,
    target,
    type: "workflow",
    weight: source === "Tester" || source === "Critic" ? 0.7 : 1,
    status: "normal"
  }));
  return {
    nodes,
    edges,
    clusters: [{ id: "cluster:workflow", label: "Agent workflow", nodeIds: nodes.map((node) => node.id), type: "workflow" }],
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount: 0,
      symbolCount: 0,
      testCount: 0
    }
  };
}

export function createInitialTelemetryState(): OrchestrationTelemetryState {
  return {
    connectionStatus: "connecting",
    taskTitle: "No active workflow",
    taskId: null,
    status: "idle",
    iteration: 0,
    maxIterations: 4,
    providerName: "unknown",
    modelName: "unknown",
    startedAt: null,
    updatedAt: null,
    completedAt: null,
    timeline: AGENT_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      status: "idle",
      startedAt: null,
      endedAt: null,
      inputTokens: 0,
      outputTokens: 0,
      error: null
    })),
    llm: {
      requestCount: 0,
      failedRequestCount: 0,
      inputTokenEstimateTotal: 0,
      outputTokenEstimateTotal: 0,
      cumulativeEstimatedTokens: 0,
      lastLatencyMs: null,
      lastTimeToFirstTokenMs: null,
      lastTokensPerSecond: null,
      contextWindow: null,
      contextUsagePercent: null,
      lastTokenPreview: ""
    },
    resources: {
      measured: false,
      rssMb: null,
      heapUsedMb: null,
      heapTotalMb: null,
      cpuPercent: null
    },
    graph: {
      providerName: "unknown",
      nodeCount: 0,
      edgeCount: 0,
      fileCount: 0,
      symbolCount: 0,
      testCount: 0,
      lastRebuildAt: null,
      selectedContextFilesCount: 0,
      blastRadiusNodeCount: 0
    },
    patchTest: {
      filesChanged: [],
      patchApplyStatus: "idle",
      testsRun: [],
      testResult: "idle",
      parsedErrors: [],
      currentRisk: "unknown"
    },
    viewMode: "workflow",
    workflowGraph: createWorkflowGraph(),
    codeGraph: null,
    impactGraph: null,
    warnings: [],
    lastError: null
  };
}

function stepKeyFromAgent(agent: string | undefined): AgentStepKey | null {
  if (!agent) return null;
  const match = AGENT_STEPS.find((step) => step.eventNames.includes(agent) || step.key === agent);
  return match?.key || null;
}

function updateStep(state: OrchestrationTelemetryState, key: AgentStepKey, update: Partial<AgentTimelineStep>) {
  return {
    ...state,
    timeline: state.timeline.map((step) => (step.key === key ? { ...step, ...update } : step)),
    workflowGraph: {
      ...state.workflowGraph,
      nodes: state.workflowGraph.nodes.map((node) => (node.id === key ? { ...node, status: update.status || node.status } : node))
    }
  };
}

function latestRunFromPayload(event: Record<string, any>) {
  if (event.state) return event.state;
  if (event.run) return event.run;
  if (Array.isArray(event.workflowRuns) && event.workflowRuns[0]) return event.workflowRuns[0];
  if (Array.isArray(event.runs) && event.runs[0]?.taskId && event.runs[0]?.telemetry) return event.runs[0];
  return null;
}

function mergeRunState(state: OrchestrationTelemetryState, run: any) {
  if (!run) return state;
  const provider = run.provider || {};
  const timestamps = run.timestamps || {};
  const currentPatch = run.currentPatch || {};
  const latestPatch = Array.isArray(run.patchApplyResults) ? run.patchApplyResults.at(-1) : null;
  const latestTest = Array.isArray(run.testRuns) ? run.testRuns.at(-1) : null;
  const llmCalls = run.telemetry?.llmCalls || [];
  const inputTokens = llmCalls.reduce((total: number, call: any) => total + (call.inputTokenEstimate || 0), 0);
  const outputTokens = llmCalls.reduce((total: number, call: any) => total + (call.outputTokenEstimate || 0), 0);
  const contextWindow = provider.contextWindow || state.llm.contextWindow;
  return {
    ...state,
    taskTitle: run.userGoal || state.taskTitle,
    taskId: run.taskId || state.taskId,
    status: run.status || state.status,
    iteration: run.iteration ?? state.iteration,
    maxIterations: run.maxIterations ?? state.maxIterations,
    providerName: provider.providerName || state.providerName,
    modelName: provider.modelName || state.modelName,
    startedAt: timestamps.startedAt || state.startedAt,
    updatedAt: timestamps.updatedAt || state.updatedAt,
    completedAt: timestamps.completedAt || state.completedAt,
    llm: {
      ...state.llm,
      requestCount: Math.max(state.llm.requestCount, llmCalls.length),
      inputTokenEstimateTotal: Math.max(state.llm.inputTokenEstimateTotal, inputTokens),
      outputTokenEstimateTotal: Math.max(state.llm.outputTokenEstimateTotal, outputTokens),
      cumulativeEstimatedTokens: Math.max(state.llm.cumulativeEstimatedTokens, inputTokens + outputTokens),
      contextWindow,
      contextUsagePercent: contextWindow ? Math.round((inputTokens / contextWindow) * 100) : state.llm.contextUsagePercent
    },
    graph: {
      ...state.graph,
      nodeCount: run.telemetry?.graphStats?.nodeCount ?? state.graph.nodeCount,
      edgeCount: run.telemetry?.graphStats?.edgeCount ?? state.graph.edgeCount,
      fileCount: run.telemetry?.graphStats?.fileCount ?? run.telemetry?.graphStats?.files ?? state.graph.fileCount,
      symbolCount: run.telemetry?.graphStats?.symbolCount ?? run.telemetry?.graphStats?.symbols ?? state.graph.symbolCount,
      testCount: run.telemetry?.graphStats?.testCount ?? state.graph.testCount,
      selectedContextFilesCount: run.graphContext?.relevantFiles?.length ?? run.graphContext?.topRelevantFiles?.length ?? state.graph.selectedContextFilesCount,
      blastRadiusNodeCount:
        run.graphContext?.blastRadius?.affectedFiles?.length ??
        run.telemetry?.selectedSubgraph?.nodeCount ??
        state.graph.blastRadiusNodeCount
    },
    patchTest: {
      filesChanged: currentPatch.filesTouched || state.patchTest.filesChanged,
      patchApplyStatus: latestPatch ? (latestPatch.ok ? "passed" : "failed") : state.patchTest.patchApplyStatus,
      testsRun: latestTest?.commands?.map((command: any) => command.displayCommand) || state.patchTest.testsRun,
      testResult: latestTest ? (latestTest.ok ? "passed" : "failed") : state.patchTest.testResult,
      parsedErrors: run.parsedErrors || latestTest?.errors || state.patchTest.parsedErrors,
      currentRisk: currentPatch.risk || state.patchTest.currentRisk
    }
  };
}

function mergeTelemetryPayload(state: OrchestrationTelemetryState, payload: any) {
  const resources = payload.resources || {};
  const memory = resources.memory || {};
  const cpu = resources.cpu || {};
  const provider = payload.provider || {};
  const stats = provider.stats || {};
  const graph = payload.graph || {};
  const graphStats = graph.stats || {};
  const contextWindow = provider.contextWindow || state.llm.contextWindow;
  const inputTokens = stats.inputTokenEstimateTotal ?? state.llm.inputTokenEstimateTotal;
  const outputTokens = stats.outputTokenEstimateTotal ?? state.llm.outputTokenEstimateTotal;
  return {
    ...state,
    providerName: provider.providerName || state.providerName,
    modelName: provider.modelName || state.modelName,
    resources: {
      measured: Boolean(resources.measured),
      rssMb: memory.rssMb ?? state.resources.rssMb,
      heapUsedMb: memory.heapUsedMb ?? state.resources.heapUsedMb,
      heapTotalMb: memory.heapTotalMb ?? state.resources.heapTotalMb,
      cpuPercent: cpu.percent ?? state.resources.cpuPercent
    },
    llm: {
      ...state.llm,
      requestCount: stats.requestCount ?? state.llm.requestCount,
      failedRequestCount: stats.failedRequestCount ?? state.llm.failedRequestCount,
      inputTokenEstimateTotal: inputTokens,
      outputTokenEstimateTotal: outputTokens,
      cumulativeEstimatedTokens: inputTokens + outputTokens,
      lastLatencyMs: stats.lastLatencyMs ?? state.llm.lastLatencyMs,
      lastTimeToFirstTokenMs: stats.lastTimeToFirstTokenMs ?? state.llm.lastTimeToFirstTokenMs,
      lastTokensPerSecond: stats.lastTokensPerSecond ?? state.llm.lastTokensPerSecond,
      contextWindow,
      contextUsagePercent: contextWindow ? Math.round((inputTokens / contextWindow) * 100) : state.llm.contextUsagePercent
    },
    graph: {
      ...state.graph,
      providerName: graph.providerName || state.graph.providerName,
      nodeCount: graphStats.nodeCount ?? state.graph.nodeCount,
      edgeCount: graphStats.edgeCount ?? state.graph.edgeCount,
      fileCount: graphStats.fileCount ?? graphStats.files ?? state.graph.fileCount,
      symbolCount: graphStats.symbolCount ?? graphStats.symbols ?? state.graph.symbolCount,
      testCount: graphStats.testCount ?? state.graph.testCount
    }
  };
}

export function withWarnings(state: OrchestrationTelemetryState, thresholds = { memoryRssMb: 1024, contextPercent: 80 }) {
  const warnings: string[] = [];
  if ((state.llm.contextUsagePercent || 0) >= thresholds.contextPercent) {
    warnings.push(`Context usage is ${state.llm.contextUsagePercent}% estimated.`);
  }
  if ((state.resources.rssMb || 0) >= thresholds.memoryRssMb) {
    warnings.push(`Backend RSS memory is ${state.resources.rssMb} MB measured.`);
  }
  if (state.status === "needs_human_review") {
    warnings.push("Needs human review.");
  }
  return { ...state, warnings };
}

export function telemetryReducer(
  state: OrchestrationTelemetryState,
  action:
    | { type: "event"; event: Record<string, any> }
    | { type: "snapshot"; payload: any }
    | { type: "graph_export"; mode: "code" | "impact"; graph: TelemetryGraphShape }
    | { type: "set_view_mode"; mode: GraphViewMode }
    | { type: "connection"; status: OrchestrationTelemetryState["connectionStatus"]; error?: string | null }
    | { type: "thresholds"; memoryRssMb: number; contextPercent: number }
) {
  let next = state;
  if (action.type === "set_view_mode") {
    next = { ...state, viewMode: action.mode };
  } else if (action.type === "graph_export") {
    next = action.mode === "code" ? { ...state, codeGraph: action.graph } : { ...state, impactGraph: action.graph };
  } else if (action.type === "connection") {
    next = { ...state, connectionStatus: action.status, lastError: action.error ?? state.lastError };
  } else if (action.type === "snapshot") {
    next = mergeTelemetryPayload(mergeRunState(state, action.payload.runs?.[0]), action.payload);
  } else if (action.type === "event") {
    const event = action.event;
    const type = event.type;
    next = { ...state, connectionStatus: "connected", updatedAt: event.timestamp || new Date().toISOString() };
    const run = latestRunFromPayload(event);
    if (run) next = mergeRunState(next, run);

    if (type === "agent_started" || type === "run_started") {
      const step = stepKeyFromAgent(event.agent);
      if (step) next = updateStep(next, step, { status: "running", startedAt: event.timestamp || new Date().toISOString(), error: null });
    }
    if (type === "agent_completed") {
      const step = stepKeyFromAgent(event.agent);
      if (step) next = updateStep(next, step, { status: "success", endedAt: event.timestamp || new Date().toISOString() });
    }
    if (type === "agent_failed") {
      const step = stepKeyFromAgent(event.agent);
      if (step) next = updateStep(next, step, { status: "failure", endedAt: event.timestamp || new Date().toISOString(), error: event.error || "failed" });
    }
    if (type === "agent_token") {
      next = { ...next, llm: { ...next.llm, lastTokenPreview: `${next.llm.lastTokenPreview}${event.token || ""}`.slice(-120) } };
    }
    if (type === "llm_request_completed") {
      next = {
        ...next,
        llm: {
          ...next.llm,
          requestCount: next.llm.requestCount + 1,
          inputTokenEstimateTotal: next.llm.inputTokenEstimateTotal + (event.inputTokenEstimate || 0),
          outputTokenEstimateTotal: next.llm.outputTokenEstimateTotal + (event.outputTokenEstimate || 0),
          cumulativeEstimatedTokens:
            next.llm.cumulativeEstimatedTokens + (event.inputTokenEstimate || 0) + (event.outputTokenEstimate || 0),
          lastLatencyMs: event.latencyMs ?? next.llm.lastLatencyMs,
          lastTimeToFirstTokenMs: event.timeToFirstTokenMs ?? next.llm.lastTimeToFirstTokenMs,
          lastTokensPerSecond: event.tokensPerSecond ?? next.llm.lastTokensPerSecond
        }
      };
    }
    if (type === "patch_generated") {
      next = {
        ...next,
        patchTest: {
          ...next.patchTest,
          filesChanged: event.state?.currentPatch?.filesTouched || next.patchTest.filesChanged,
          currentRisk: event.state?.currentPatch?.risk || next.patchTest.currentRisk
        }
      };
    }
    if (type === "patch_apply_completed") {
      next = { ...next, patchTest: { ...next.patchTest, patchApplyStatus: event.state?.patchApplyResults?.at?.(-1)?.ok ? "passed" : "completed" } };
      next = updateStep(next, "PatchApply", { status: "success", endedAt: event.timestamp || new Date().toISOString() });
    }
    if (type === "test_started") {
      next = updateStep(next, "Tester", { status: "running", startedAt: event.timestamp || new Date().toISOString() });
    }
    if (type === "test_completed") {
      const latestTest = event.state?.testRuns?.at?.(-1);
      next = {
        ...updateStep(next, "Tester", { status: latestTest?.ok === false ? "failure" : "success", endedAt: event.timestamp || new Date().toISOString() }),
        patchTest: {
          ...next.patchTest,
          testsRun: latestTest?.commands?.map((command: any) => command.displayCommand) || next.patchTest.testsRun,
          testResult: latestTest ? (latestTest.ok ? "passed" : "failed") : "completed",
          parsedErrors: latestTest?.errors || next.patchTest.parsedErrors
        }
      };
    }
    if (type === "critic_review_completed") {
      next = updateStep(next, "Critic", { status: event.state?.review?.approved === false ? "failure" : "success", endedAt: event.timestamp || new Date().toISOString() });
    }
    if (type === "graph_rebuild_completed") {
      const stats = event.stats || {};
      next = {
        ...next,
        graph: {
          ...next.graph,
          nodeCount: stats.nodeCount ?? next.graph.nodeCount,
          edgeCount: stats.edgeCount ?? next.graph.edgeCount,
          fileCount: stats.fileCount ?? stats.files ?? next.graph.fileCount,
          symbolCount: stats.symbolCount ?? stats.symbols ?? next.graph.symbolCount,
          testCount: stats.testCount ?? next.graph.testCount,
          lastRebuildAt: event.timestamp || new Date().toISOString()
        }
      };
    }
    if (type === "graph_context_selected") {
      next = {
        ...next,
        graph: {
          ...next.graph,
          selectedContextFilesCount: event.relevantFiles?.length ?? next.graph.selectedContextFilesCount,
          blastRadiusNodeCount: event.selectedSubgraph?.nodeCount ?? next.graph.blastRadiusNodeCount
        }
      };
    }
    if (type === "run_completed") next = { ...next, status: "completed", completedAt: event.timestamp || next.completedAt };
    if (type === "run_failed") next = { ...next, status: event.reason === "needs_human_review" ? "needs_human_review" : "failed", lastError: event.error || event.reason || null };
    if (type === "telemetry_update") {
      next = mergeRunState(next, { telemetry: event.telemetry });
    }
  }
  const thresholds = action.type === "thresholds" ? { memoryRssMb: action.memoryRssMb, contextPercent: action.contextPercent } : undefined;
  return withWarnings(next, thresholds);
}

export function elapsedLabel(startedAt: string | null, endedAt: string | null = null) {
  if (!startedAt) return "not started";
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "unknown";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}
