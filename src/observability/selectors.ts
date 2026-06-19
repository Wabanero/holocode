import type { ObservabilityGraphApiResponse } from "./fetchObservability";
import type {
  CodeGraphRiskResult,
  ObservabilityEdge,
  ObservabilityNode,
  ObservabilitySignal,
  ObservabilitySignalType,
  ObservabilityViewMode
} from "./observabilityTypes";

type ObservabilitySelectorState = {
  observabilityGraph: ObservabilityGraphApiResponse | null;
  selectedObservabilityNodeId: string | null;
  activeObservabilityMode: ObservabilityViewMode;
  activeRiskResult: CodeGraphRiskResult | null;
  visibleSignals: ObservabilitySignalType[];
};

function signalsForNode(graph: ObservabilityGraphApiResponse | null, nodeId: string) {
  return graph?.signals.filter((signal) => signal.nodeId === nodeId) || [];
}

function signalIsVisible(signal: ObservabilitySignal, visibleSignals: ObservabilitySignalType[]) {
  return visibleSignals.includes(signal.source) || visibleSignals.includes(signal.type);
}

function nodeIdsForSignals(graph: ObservabilityGraphApiResponse | null, predicate: (signal: ObservabilitySignal) => boolean) {
  return new Set((graph?.signals || []).filter(predicate).map((signal) => signal.nodeId).filter(Boolean) as string[]);
}

function nodesByIds(graph: ObservabilityGraphApiResponse | null, ids: Set<string>) {
  return (graph?.nodes || []).filter((node) => ids.has(node.id));
}

export function highRiskNodes(state: ObservabilitySelectorState) {
  const graph = state.observabilityGraph;
  const severeSignalNodeIds = nodeIdsForSignals(
    graph,
    (signal) => signal.severity === "error" || signal.severity === "critical"
  );
  const nodes = nodesByIds(graph, severeSignalNodeIds);
  if (state.activeRiskResult && state.activeRiskResult.score >= 50) {
    const selected = graph?.nodes.find((node) => node.id === state.activeRiskResult?.nodeId);
    if (selected && !nodes.some((node) => node.id === selected.id)) return [...nodes, selected];
  }
  return nodes;
}

export function changedNodes(state: ObservabilitySelectorState) {
  const graph = state.observabilityGraph;
  const changedIds = nodeIdsForSignals(graph, (signal) => signal.source === "git");
  for (const node of graph?.nodes || []) {
    if (node.source === "git") changedIds.add(node.id);
  }
  return nodesByIds(graph, changedIds);
}

export function diagnosticNodes(state: ObservabilitySelectorState) {
  const graph = state.observabilityGraph;
  const diagnosticIds = nodeIdsForSignals(graph, (signal) => signal.source === "lsp");
  for (const node of graph?.nodes || []) {
    if (node.source === "lsp") diagnosticIds.add(node.id);
  }
  return nodesByIds(graph, diagnosticIds);
}

export function agentTouchedNodes(state: ObservabilitySelectorState) {
  const graph = state.observabilityGraph;
  const agentIds = nodeIdsForSignals(graph, (signal) => signal.source === "agent");
  for (const edge of graph?.edges || []) {
    if (edge.source === "agent" && (edge.kind === "edits" || edge.kind === "selects_context")) {
      agentIds.add(edge.targetNodeId);
    }
  }
  for (const node of graph?.nodes || []) {
    if (node.source === "agent") agentIds.add(node.id);
  }
  return nodesByIds(graph, agentIds);
}

export function nodesWithoutTests(state: ObservabilitySelectorState) {
  const graph = state.observabilityGraph;
  const testedIds = new Set<string>();
  for (const edge of graph?.edges || []) {
    if (edge.kind !== "tests") continue;
    testedIds.add(edge.sourceNodeId);
    testedIds.add(edge.targetNodeId);
  }
  return (graph?.nodes || []).filter(
    (node) =>
      node.source === "codegraph" &&
      node.kind === "file" &&
      !node.path?.includes(".test.") &&
      !node.path?.startsWith("tests/") &&
      !testedIds.has(node.id)
  );
}

export function visibleObservabilityEdges(state: ObservabilitySelectorState): ObservabilityEdge[] {
  const graph = state.observabilityGraph;
  if (!graph || state.activeObservabilityMode === "off") return [];
  if (state.activeObservabilityMode === "overview") return graph.edges.filter((edge) => state.visibleSignals.includes(edge.source));

  const visibleSignalNodeIds = nodeIdsForSignals(graph, (signal) => signalIsVisible(signal, state.visibleSignals));
  if (state.selectedObservabilityNodeId) visibleSignalNodeIds.add(state.selectedObservabilityNodeId);

  return graph.edges.filter(
    (edge) =>
      state.visibleSignals.includes(edge.source) &&
      (visibleSignalNodeIds.size === 0 || visibleSignalNodeIds.has(edge.sourceNodeId) || visibleSignalNodeIds.has(edge.targetNodeId))
  );
}

export function selectedNodeRisk(state: ObservabilitySelectorState) {
  if (!state.activeRiskResult || !state.selectedObservabilityNodeId) return null;
  return state.activeRiskResult.nodeId === state.selectedObservabilityNodeId ? state.activeRiskResult : null;
}

export function selectedObservabilityNode(state: ObservabilitySelectorState): ObservabilityNode | null {
  if (!state.observabilityGraph || !state.selectedObservabilityNodeId) return null;
  return state.observabilityGraph.nodes.find((node) => node.id === state.selectedObservabilityNodeId) || null;
}

export function selectedNodeSignals(state: ObservabilitySelectorState): ObservabilitySignal[] {
  if (!state.selectedObservabilityNodeId) return [];
  return signalsForNode(state.observabilityGraph, state.selectedObservabilityNodeId).filter((signal) =>
    signalIsVisible(signal, state.visibleSignals)
  );
}
