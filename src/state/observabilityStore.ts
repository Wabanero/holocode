import { create } from "zustand";
import { fetchAgentResults, fetchAgentWorkflowRuns } from "../api/client";
import {
  buildAgentTopologyFromWorkflowRuns,
  type AgentTopologyFilter,
  type AgentTopologyRun
} from "../observability/agentTopology";
import {
  fetchObservabilityBlastRadius,
  fetchObservabilityContextLens,
  fetchObservabilityGraph,
  fetchObservabilityRisk,
  fetchObservabilityTraceRiver,
  fetchObservabilityTraces,
  type ObservabilityGraphApiResponse
} from "../observability/fetchObservability";
import type { DiffTimelineView } from "../observability/diffTimeline";
import { failingTraceSummary, latestTraceSummary, type TraceRiverProjection, type TraceSummary } from "../observability/traceSelectors";
import type { EpistemicFogFilter } from "../observability/epistemicScoring";
import type {
  BlastRadiusResult,
  CodeGraphRiskResult,
  ContextLensResult,
  ObservabilityNode,
  ObservabilitySignal,
  ObservabilitySignalType,
  ObservabilityViewMode
} from "../observability/observabilityTypes";

const DEFAULT_VISIBLE_SIGNALS: ObservabilitySignalType[] = ["git", "lsp", "agent", "debug", "runtime", "test", "lint"];

type ObservabilityState = {
  observabilityGraph: ObservabilityGraphApiResponse | null;
  selectedObservabilityNodeId: string | null;
  selectedAgentRunId: string | null;
  activeObservabilityMode: ObservabilityViewMode;
  activeBlastRadius: BlastRadiusResult | null;
  blastRadiusDepthLimit: number | null;
  activeContextLens: ContextLensResult | null;
  activeRiskResult: CodeGraphRiskResult | null;
  activeAgentTopology: AgentTopologyRun | null;
  traceSummaries: TraceSummary[];
  activeTraceRiver: TraceRiverProjection | null;
  selectedTraceSpanId: string | null;
  showUnmappedTraceSpans: boolean;
  traceRiverComparison: { beforeTraceId: string; afterTraceId: string } | null;
  epistemicFogFilter: EpistemicFogFilter;
  diffTunnelView: DiffTimelineView;
  agentTopologyRuns: AgentTopologyRun[];
  agentTopologyFilter: AgentTopologyFilter;
  agentTopologyFocusFile: string | null;
  contextLensExpansion: {
    callers: boolean;
    tests: boolean;
  };
  visibleSignals: ObservabilitySignalType[];
  isObservabilityLoading: boolean;
  observabilityError: string | null;
  lastRefreshAt: string | null;
  refreshObservabilityGraph: () => Promise<void>;
  selectObservabilityNode: (nodeId: string | null) => void;
  selectAgentRun: (runId: string | null) => void;
  setObservabilityMode: (mode: ObservabilityViewMode) => void;
  loadBlastRadius: (path: string) => Promise<void>;
  setBlastRadiusDepthLimit: (depth: number | null) => void;
  loadContextLens: (runId?: string) => Promise<void>;
  loadAgentTopology: (runId?: string) => Promise<void>;
  selectAgentTopologyRun: (runId: string | null) => void;
  setAgentTopologyFilter: (filter: AgentTopologyFilter, focusFile?: string | null) => void;
  refreshTraceSummaries: () => Promise<void>;
  loadTraceRiver: (traceId?: string) => Promise<void>;
  loadFailingTraceRiver: () => Promise<void>;
  selectTraceSpan: (spanId: string | null) => void;
  setShowUnmappedTraceSpans: (show: boolean) => void;
  compareLatestTraceRivers: () => Promise<void>;
  setEpistemicFogFilter: (filter: EpistemicFogFilter) => void;
  setDiffTunnelView: (view: DiffTimelineView) => void;
  loadRisk: (path: string) => Promise<void>;
  toggleSignal: (signalType: ObservabilitySignalType) => void;
  expandContextLens: (target: "callers" | "tests") => void;
  clearObservabilityOverlays: () => void;
};

function nodeForPath(graph: ObservabilityGraphApiResponse | null, path: string): ObservabilityNode | null {
  return graph?.nodes.find((node) => node.path === path && node.kind === "file") || null;
}

function signalTypeMatches(signal: ObservabilitySignal, signalType: ObservabilitySignalType) {
  return signal.source === signalType || signal.type === signalType;
}

export const useObservabilityStore = create<ObservabilityState>((set, get) => ({
  observabilityGraph: null,
  selectedObservabilityNodeId: null,
  selectedAgentRunId: null,
  activeObservabilityMode: "off",
  activeBlastRadius: null,
  blastRadiusDepthLimit: null,
  activeContextLens: null,
  activeRiskResult: null,
  activeAgentTopology: null,
  traceSummaries: [],
  activeTraceRiver: null,
  selectedTraceSpanId: null,
  showUnmappedTraceSpans: false,
  traceRiverComparison: null,
  epistemicFogFilter: "all",
  diffTunnelView: "current",
  agentTopologyRuns: [],
  agentTopologyFilter: "all",
  agentTopologyFocusFile: null,
  contextLensExpansion: {
    callers: false,
    tests: false
  },
  visibleSignals: DEFAULT_VISIBLE_SIGNALS,
  isObservabilityLoading: false,
  observabilityError: null,
  lastRefreshAt: null,

  async refreshObservabilityGraph() {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const observabilityGraph = await fetchObservabilityGraph();
      set({
        observabilityGraph,
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  selectObservabilityNode(nodeId) {
    set({ selectedObservabilityNodeId: nodeId });
  },

  selectAgentRun(runId) {
    set({ selectedAgentRunId: runId });
  },

  setObservabilityMode(mode) {
    set((state) => ({
      activeObservabilityMode: mode,
      selectedObservabilityNodeId: mode === "off" ? null : state.selectedObservabilityNodeId
    }));
  },

  async loadBlastRadius(path) {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const activeBlastRadius = await fetchObservabilityBlastRadius(path);
      const selectedNode = nodeForPath(get().observabilityGraph, path);
      set({
        activeBlastRadius,
        blastRadiusDepthLimit: null,
        activeObservabilityMode: "blast-radius",
        selectedObservabilityNodeId: selectedNode?.id || activeBlastRadius.seedNodeIds[0] || null,
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  setBlastRadiusDepthLimit(depth) {
    set({ blastRadiusDepthLimit: depth });
  },

  async loadContextLens(runId = "") {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const activeContextLens = await fetchObservabilityContextLens(runId);
      const selectedAgentRunId = activeContextLens.runId || activeContextLens.taskId || runId || null;
      set({
        activeContextLens,
        activeObservabilityMode: "context-lens",
        selectedAgentRunId,
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  async loadAgentTopology(runId) {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const [workflowRuns, agentResults] = await Promise.all([
        fetchAgentWorkflowRuns().catch(() => ({ runs: [], graph: { nodes: [], edges: [] } })),
        fetchAgentResults().catch(() => ({ results: [] }))
      ]);
      const topology = buildAgentTopologyFromWorkflowRuns(workflowRuns, agentResults.results, runId || get().selectedAgentRunId);
      set({
        activeAgentTopology: topology.selected,
        agentTopologyRuns: topology.runs,
        selectedAgentRunId: topology.selected?.runId || runId || null,
        activeObservabilityMode: "agent-topology",
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  selectAgentTopologyRun(runId) {
    set((state) => ({
      selectedAgentRunId: runId,
      activeAgentTopology: runId
        ? state.agentTopologyRuns.find((run) => run.runId === runId || run.taskId === runId) || state.activeAgentTopology
        : null
    }));
  },

  setAgentTopologyFilter(filter, focusFile = null) {
    set({
      agentTopologyFilter: filter,
      agentTopologyFocusFile: focusFile
    });
  },

  async refreshTraceSummaries() {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const traceList = await fetchObservabilityTraces();
      set({
        traceSummaries: traceList.traces,
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  async loadTraceRiver(traceId) {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const traceList = await fetchObservabilityTraces().catch(() => ({ traces: [], demoAvailable: false }));
      const targetTraceId = traceId || latestTraceSummary(traceList.traces)?.traceId || "";
      if (!targetTraceId) {
        set({
          traceSummaries: traceList.traces,
          activeTraceRiver: null,
          selectedTraceSpanId: null,
          activeObservabilityMode: "trace-rivers",
          isObservabilityLoading: false,
          observabilityError: null,
          lastRefreshAt: new Date().toISOString()
        });
        return;
      }
      const activeTraceRiver = await fetchObservabilityTraceRiver(targetTraceId);
      set({
        traceSummaries: traceList.traces,
        activeTraceRiver,
        selectedTraceSpanId: activeTraceRiver.spans[0]?.spanId || null,
        activeObservabilityMode: "trace-rivers",
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        activeObservabilityMode: "trace-rivers",
        activeTraceRiver: null,
        selectedTraceSpanId: null,
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  async loadFailingTraceRiver() {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const traceList = await fetchObservabilityTraces();
      const targetTraceId = failingTraceSummary(traceList.traces)?.traceId || latestTraceSummary(traceList.traces)?.traceId || "";
      if (!targetTraceId) {
        set({
          traceSummaries: traceList.traces,
          activeTraceRiver: null,
          selectedTraceSpanId: null,
          activeObservabilityMode: "trace-rivers",
          isObservabilityLoading: false,
          observabilityError: null,
          lastRefreshAt: new Date().toISOString()
        });
        return;
      }
      const activeTraceRiver = await fetchObservabilityTraceRiver(targetTraceId);
      const failedSpan = activeTraceRiver.spans.find((span) => span.status === "error");
      set({
        traceSummaries: traceList.traces,
        activeTraceRiver,
        selectedTraceSpanId: failedSpan?.spanId || activeTraceRiver.spans[0]?.spanId || null,
        activeObservabilityMode: "trace-rivers",
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        activeObservabilityMode: "trace-rivers",
        activeTraceRiver: null,
        selectedTraceSpanId: null,
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  selectTraceSpan(spanId) {
    set({ selectedTraceSpanId: spanId });
  },

  setShowUnmappedTraceSpans(show) {
    set({
      activeObservabilityMode: "trace-rivers",
      showUnmappedTraceSpans: show
    });
  },

  async compareLatestTraceRivers() {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const traceList = await fetchObservabilityTraces();
      const [after, before] = traceList.traces;
      set({
        traceSummaries: traceList.traces,
        traceRiverComparison: before && after ? { beforeTraceId: before.traceId, afterTraceId: after.traceId } : null,
        activeObservabilityMode: "trace-rivers",
        isObservabilityLoading: false,
        observabilityError: before && after ? null : "At least two traces are needed for comparison.",
        lastRefreshAt: new Date().toISOString()
      });
      if (after) await get().loadTraceRiver(after.traceId);
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  setEpistemicFogFilter(filter) {
    set({
      activeObservabilityMode: "epistemic-fog",
      epistemicFogFilter: filter
    });
  },

  setDiffTunnelView(view) {
    set({
      activeObservabilityMode: "diff-time-tunnel",
      diffTunnelView: view
    });
  },

  async loadRisk(path) {
    set({ isObservabilityLoading: true, observabilityError: null });
    try {
      const activeRiskResult = await fetchObservabilityRisk(path);
      const selectedNode = nodeForPath(get().observabilityGraph, path);
      set({
        activeRiskResult,
        selectedObservabilityNodeId: selectedNode?.id || activeRiskResult.nodeId,
        isObservabilityLoading: false,
        observabilityError: null,
        lastRefreshAt: new Date().toISOString()
      });
    } catch (error) {
      set({
        isObservabilityLoading: false,
        observabilityError: (error as Error).message,
        lastRefreshAt: new Date().toISOString()
      });
    }
  },

  toggleSignal(signalType) {
    set((state) => ({
      visibleSignals: state.visibleSignals.includes(signalType)
        ? state.visibleSignals.filter((candidate) => candidate !== signalType)
        : [...state.visibleSignals, signalType]
    }));
  },

  expandContextLens(target) {
    set((state) => ({
      activeObservabilityMode: "context-lens",
      contextLensExpansion: {
        ...state.contextLensExpansion,
        [target]: true
      }
    }));
  },

  clearObservabilityOverlays() {
    set({
      selectedObservabilityNodeId: null,
      selectedAgentRunId: null,
      activeObservabilityMode: "off",
      activeBlastRadius: null,
      blastRadiusDepthLimit: null,
      activeContextLens: null,
      activeRiskResult: null,
      activeAgentTopology: null,
      traceSummaries: [],
      activeTraceRiver: null,
      selectedTraceSpanId: null,
      showUnmappedTraceSpans: false,
      traceRiverComparison: null,
      epistemicFogFilter: "all",
      diffTunnelView: "current",
      agentTopologyRuns: [],
      agentTopologyFilter: "all",
      agentTopologyFocusFile: null,
      contextLensExpansion: {
        callers: false,
        tests: false
      },
      observabilityError: null
    });
  }
}));

export type { ObservabilityState };
export { signalTypeMatches };
