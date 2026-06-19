import { AlertTriangle, Cpu, GitBranch, Network, Pause, Play, RefreshCw, Square, Workflow } from "lucide-react";
import { useEffect, useMemo, useReducer } from "react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import {
  cancelAgentWorkflow,
  fetchAgentTelemetry,
  fetchAgentWorkflowRuns,
  fetchGraphBlastRadius,
  fetchGraphStats,
  fetchVRGraphExport
} from "../api/client";
import {
  createInitialTelemetryState,
  elapsedLabel,
  telemetryReducer,
  type GraphViewMode,
  type OrchestrationTelemetryState,
  type TelemetryGraphShape
} from "./orchestrationTelemetry";

type AgentOrchestrationPanelProps = {
  initialState?: OrchestrationTelemetryState;
  eventSourceFactory?: (url: string) => EventSource;
  memoryWarningMb?: number;
  contextWarningPercent?: number;
  embedded?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  queued: "Queued",
  running: "Running",
  planning: "Planning",
  retrieving: "Retrieving",
  coding: "Coding",
  applying_patch: "Applying patch",
  testing: "Testing",
  debugging: "Debugging",
  reviewing: "Reviewing",
  finalizing: "Finalizing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  needs_human_review: "Needs human review"
};

const EVENT_TYPES = [
  "run_started",
  "agent_started",
  "agent_token",
  "agent_completed",
  "agent_failed",
  "llm_request_completed",
  "graph_rebuild_started",
  "graph_rebuild_completed",
  "graph_context_selected",
  "patch_generated",
  "patch_apply_completed",
  "test_started",
  "test_completed",
  "critic_review_completed",
  "telemetry_update",
  "run_completed",
  "run_failed",
  "agent-snapshot"
];

function statusClass(status: string) {
  if (status === "success" || status === "completed" || status === "passed") return "is-success";
  if (status === "failure" || status === "failed" || status === "needs_human_review") return "is-danger";
  if (status === "running") return "is-running";
  if (status === "waiting") return "is-waiting";
  return "is-idle";
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${value.toLocaleString()}${suffix}`;
}

function graphForMode(state: OrchestrationTelemetryState): TelemetryGraphShape {
  if (state.viewMode === "code") return state.codeGraph || state.workflowGraph;
  if (state.viewMode === "impact") return state.impactGraph || state.codeGraph || state.workflowGraph;
  return state.workflowGraph;
}

function buildImpactGraphFromBlastRadius(payload: any): TelemetryGraphShape {
  const blast = payload?.blastRadius || payload || {};
  const files = blast.affectedFiles || [];
  const symbols = blast.affectedSymbols || [];
  const nodes = [
    ...files.map((filePath: string) => ({ id: `file:${filePath}`, label: filePath.split("/").pop() || filePath, type: "file", path: filePath })),
    ...symbols.slice(0, 40).map((symbol: any) => ({
      id: symbol.id,
      label: symbol.symbolName || symbol.name,
      type: symbol.kind || "symbol",
      path: symbol.path,
      metrics: symbol.metrics || {}
    }))
  ];
  const seenNodes = new Set(nodes.map((node) => node.id));
  const edges = (blast.edges || []).filter((edge: any) => seenNodes.has(edge.source) && seenNodes.has(edge.target));
  return {
    nodes,
    edges,
    clusters: [{ id: "cluster:impact", label: "Impact", nodeIds: nodes.map((node) => node.id), type: "impact" }],
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount: files.length,
      symbolCount: symbols.length,
      testCount: blast.affectedTests?.length || 0
    }
  };
}

function GraphPreview({ graph, mode }: { graph: TelemetryGraphShape; mode: GraphViewMode }) {
  const capped = useMemo(() => {
    const nodes = graph.nodes.slice(0, mode === "workflow" ? 12 : 48);
    const nodeSet = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target)).slice(0, 72);
    return { nodes, edges };
  }, [graph, mode]);
  const positioned = useMemo(
    () =>
      capped.nodes.map((node, index) => {
        if (mode === "workflow") {
          return { ...node, x: 46 + (index % 4) * 136, y: 45 + Math.floor(index / 4) * 70 };
        }
        const angle = capped.nodes.length <= 1 ? 0 : (index / capped.nodes.length) * Math.PI * 2;
        const radius = 118;
        return { ...node, x: 240 + Math.cos(angle) * radius, y: 145 + Math.sin(angle) * radius };
      }),
    [capped.nodes, mode]
  );
  const byId = new Map(positioned.map((node) => [node.id, node]));

  return (
    <div className="orchestration-graph-preview">
      <svg viewBox="0 0 520 310" role="img" aria-label={`${mode} graph preview`}>
        {capped.edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="orchestration-graph-edge" />;
        })}
        {positioned.map((node) => (
          <g key={node.id} transform={`translate(${node.x - 42}, ${node.y - 18})`} className={`orchestration-graph-node ${node.status || ""}`}>
            <rect width="84" height="36" rx="7" />
            <text x="42" y="16">
              {node.label}
            </text>
            <text x="42" y="28" className="orchestration-graph-node-kind">
              {node.type}
            </text>
          </g>
        ))}
      </svg>
      {graph.nodes.length > capped.nodes.length ? <span className="orchestration-graph-cap">Showing {capped.nodes.length} of {graph.nodes.length} nodes</span> : null}
    </div>
  );
}

export function AgentOrchestrationPanel({
  initialState,
  eventSourceFactory,
  memoryWarningMb = 1024,
  contextWarningPercent = 80,
  embedded = false
}: AgentOrchestrationPanelProps) {
  const [state, dispatch] = useReducer(telemetryReducer, initialState || createInitialTelemetryState());

  const refreshTelemetry = async () => {
    try {
      const [runs, telemetry, graphStats] = await Promise.all([
        fetchAgentWorkflowRuns().catch(() => ({ runs: [] })),
        fetchAgentTelemetry().catch(() => ({})),
        fetchGraphStats().catch(() => ({ stats: {} as any }))
      ]);
      dispatch({
        type: "snapshot",
        payload: {
          ...telemetry,
          runs: runs.runs,
          graph: {
            ...(telemetry as any).graph,
            stats: (telemetry as any).graph?.stats || graphStats.stats
          }
        }
      });
      dispatch({ type: "connection", status: "polling", error: null });
    } catch (error) {
      dispatch({ type: "connection", status: "disconnected", error: (error as Error).message });
    }
  };

  useEffect(() => {
    dispatch({ type: "thresholds", memoryRssMb: memoryWarningMb, contextPercent: contextWarningPercent });
  }, [contextWarningPercent, memoryWarningMb]);

  useEffect(() => {
    if (initialState) return;
    let cancelled = false;
    const poll = async () => {
      try {
        if (cancelled) return;
        await refreshTelemetry();
      } catch (error) {
        if (!cancelled) dispatch({ type: "connection", status: "disconnected", error: (error as Error).message });
      }
    };
    void poll();
    const timer = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [initialState]);

  useEffect(() => {
    if (initialState || typeof EventSource === "undefined") return;
    const source = eventSourceFactory ? eventSourceFactory("/api/agent/events") : new EventSource("/api/agent/events");
    dispatch({ type: "connection", status: "connecting", error: null });
    const handle = (message: MessageEvent<string>) => {
      try {
        dispatch({ type: "event", event: JSON.parse(message.data) });
      } catch (error) {
        dispatch({ type: "connection", status: "disconnected", error: (error as Error).message });
      }
    };
    EVENT_TYPES.forEach((type) => source.addEventListener(type, handle as EventListener));
    source.onerror = () => dispatch({ type: "connection", status: "disconnected", error: "Telemetry stream disconnected." });
    return () => {
      EVENT_TYPES.forEach((type) => source.removeEventListener(type, handle as EventListener));
      source.close();
    };
  }, [eventSourceFactory, initialState]);

  useEffect(() => {
    if (initialState) return;
    let cancelled = false;
    const loadGraph = async () => {
      try {
        if (state.viewMode === "code" && !state.codeGraph) {
          const graph = await fetchVRGraphExport({ changed: true });
          if (!cancelled) dispatch({ type: "graph_export", mode: "code", graph });
        }
        if (state.viewMode === "impact" && !state.impactGraph) {
          const impact = await fetchGraphBlastRadius(state.patchTest.filesChanged);
          if (!cancelled) dispatch({ type: "graph_export", mode: "impact", graph: buildImpactGraphFromBlastRadius(impact) });
        }
      } catch (error) {
        if (!cancelled) dispatch({ type: "connection", status: "disconnected", error: (error as Error).message });
      }
    };
    void loadGraph();
    return () => {
      cancelled = true;
    };
  }, [initialState, state.codeGraph, state.impactGraph, state.patchTest.filesChanged, state.viewMode]);

  const visibleGraph = graphForMode(state);
  const isHumanReview = state.status === "needs_human_review";

  return (
    <Panel
      title="Agent Orchestration"
      eyebrow={`${state.connectionStatus} telemetry`}
      className={`orchestration-panel ${embedded ? "is-embedded" : ""}`}
      actions={
        <>
          <Button title="Refresh telemetry" icon={<RefreshCw size={15} />} onClick={() => void refreshTelemetry()} />
          <Button
            title="Cancel workflow"
            icon={<Square size={15} />}
            disabled={!state.taskId || state.status !== "running"}
            onClick={() => state.taskId && void cancelAgentWorkflow(state.taskId).then((payload) => dispatch({ type: "snapshot", payload }))}
          />
          <Button title="Pause unavailable" icon={<Pause size={15} />} disabled />
          <Button title="Resume unavailable" icon={<Play size={15} />} disabled />
        </>
      }
    >
      <div className="orchestration-grid">
        <section className={`orchestration-run-card ${isHumanReview ? "needs-review" : ""}`}>
          <div>
            <span>Run Header</span>
            <strong>{state.taskTitle}</strong>
          </div>
          <dl>
            <div>
              <dt>Task</dt>
              <dd>{state.taskId || "none"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className={statusClass(state.status)}>{STATUS_LABELS[state.status] || state.status}</dd>
            </div>
            <div>
              <dt>Iteration</dt>
              <dd>{state.iteration}/{state.maxIterations}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{state.providerName} / {state.modelName}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{elapsedLabel(state.startedAt, state.completedAt)}</dd>
            </div>
          </dl>
        </section>

        <section className="orchestration-section timeline-section">
          <h3>Agent Timeline</h3>
          <div className="orchestration-timeline">
            {state.timeline.map((step) => (
              <article key={step.key} className={`timeline-node ${statusClass(step.status)}`}>
                <span>{step.label}</span>
                <strong>{step.status}</strong>
                <small>{step.startedAt ? new Date(step.startedAt).toLocaleTimeString() : "waiting"}</small>
                <small>{step.inputTokens + step.outputTokens ? `${step.inputTokens + step.outputTokens} est tokens` : "tokens n/a"}</small>
                {step.error ? <em>{step.error}</em> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="orchestration-section metrics-section">
          <h3>
            <Cpu size={14} />
            Resource Metrics
          </h3>
          <div className="metric-grid">
            <span>RSS <strong>{formatNumber(state.resources.rssMb, " MB")}</strong><small>{state.resources.measured ? "measured" : "unavailable"}</small></span>
            <span>Heap <strong>{formatNumber(state.resources.heapUsedMb, " MB")}</strong><small>measured</small></span>
            <span>CPU <strong>{formatNumber(state.resources.cpuPercent, "%")}</strong><small>{state.resources.cpuPercent === null ? "unavailable" : "sampled"}</small></span>
            <span>Latency <strong>{formatNumber(state.llm.lastLatencyMs, " ms")}</strong><small>measured</small></span>
            <span>TTFT <strong>{formatNumber(state.llm.lastTimeToFirstTokenMs, " ms")}</strong><small>measured if streamed</small></span>
            <span>Tokens/s <strong>{formatNumber(state.llm.lastTokensPerSecond)}</strong><small>estimated</small></span>
            <span>Input <strong>{formatNumber(state.llm.inputTokenEstimateTotal)}</strong><small>estimated</small></span>
            <span>Output <strong>{formatNumber(state.llm.outputTokenEstimateTotal)}</strong><small>estimated</small></span>
            <span>Context <strong>{state.llm.contextUsagePercent === null ? "n/a" : `${state.llm.contextUsagePercent}%`}</strong><small>estimated</small></span>
            <span>LLM Calls <strong>{state.llm.requestCount}</strong><small>{state.llm.failedRequestCount} failed</small></span>
          </div>
        </section>

        <section className="orchestration-section graph-metrics-section">
          <h3>
            <Network size={14} />
            Graph Metrics
          </h3>
          <div className="metric-grid graph-metrics">
            <span>Provider <strong>{state.graph.providerName}</strong></span>
            <span>Nodes <strong>{state.graph.nodeCount}</strong></span>
            <span>Edges <strong>{state.graph.edgeCount}</strong></span>
            <span>Files <strong>{state.graph.fileCount}</strong></span>
            <span>Symbols <strong>{state.graph.symbolCount}</strong></span>
            <span>Tests <strong>{state.graph.testCount}</strong></span>
            <span>Context <strong>{state.graph.selectedContextFilesCount}</strong></span>
            <span>Blast Radius <strong>{state.graph.blastRadiusNodeCount}</strong></span>
          </div>
        </section>

        <section className="orchestration-section patch-test-section">
          <h3>
            <GitBranch size={14} />
            Patch / Test Status
          </h3>
          <div className="patch-test-grid">
            <span>Patch apply <strong className={statusClass(state.patchTest.patchApplyStatus)}>{state.patchTest.patchApplyStatus}</strong></span>
            <span>Test result <strong className={statusClass(state.patchTest.testResult)}>{state.patchTest.testResult}</strong></span>
            <span>Risk <strong>{state.patchTest.currentRisk}</strong></span>
            <span>Files changed <strong>{state.patchTest.filesChanged.length}</strong></span>
          </div>
          <div className="orchestration-list">
            {state.patchTest.filesChanged.slice(0, 5).map((file) => <code key={file}>{file}</code>)}
            {state.patchTest.testsRun.slice(0, 4).map((command) => <code key={command}>{command}</code>)}
            {state.patchTest.parsedErrors.slice(0, 3).map((error, index) => (
              <code key={`${error.path}-${error.line}-${index}`} className="is-danger">
                {error.path || "error"}:{error.line || "?"} {error.message || ""}
              </code>
            ))}
          </div>
        </section>

        <section className="orchestration-section graph-view-section">
          <h3>
            <Workflow size={14} />
            Graph Visualization
          </h3>
          <div className="graph-toggle" role="tablist" aria-label="Graph view mode">
            {(["workflow", "code", "impact"] as GraphViewMode[]).map((mode) => (
              <button key={mode} className={state.viewMode === mode ? "is-active" : ""} onClick={() => dispatch({ type: "set_view_mode", mode })}>
                {mode === "workflow" ? "Workflow Graph" : mode === "code" ? "Code Graph" : "Impact Graph"}
              </button>
            ))}
          </div>
          <GraphPreview graph={visibleGraph} mode={state.viewMode} />
        </section>

        {state.warnings.length || state.connectionStatus === "disconnected" ? (
          <section className="orchestration-warnings">
            <AlertTriangle size={15} />
            <div>
              {state.connectionStatus === "disconnected" ? <strong>Backend telemetry disconnected.</strong> : null}
              {state.warnings.map((warning) => <span key={warning}>{warning}</span>)}
              {state.lastError ? <span>{state.lastError}</span> : null}
            </div>
          </section>
        ) : null}
      </div>
    </Panel>
  );
}
