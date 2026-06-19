import { Html, Text } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { AgentTopologyStep } from "../../../observability/agentTopology";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import { AgentRunStatsPanel3D } from "./AgentRunStatsPanel3D";
import { AgentStepNode3D } from "./AgentStepNode3D";
import { AgentToolEdge3D } from "./AgentToolEdge3D";

type Vec3 = [number, number, number];

function layoutStep(index: number, total: number): Vec3 {
  const columns = Math.min(6, Math.max(1, total));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const rowCount = Math.ceil(total / columns);
  const x = (column - (columns - 1) / 2) * 0.95;
  const y = 0.28 - row * 0.78 + (rowCount > 1 ? 0.18 : 0);
  const z = Math.sin((column / Math.max(1, columns - 1)) * Math.PI) * -0.34 + row * 0.38;
  return [x, y, z];
}

function shouldDimStep(step: AgentTopologyStep, filter: ReturnType<typeof useObservabilityStore.getState>["agentTopologyFilter"], focusFile: string | null) {
  if (filter === "failed") return step.status !== "failed" && step.status !== "needs-human-review";
  if (filter === "token-usage") return !((step.inputTokens || 0) + (step.outputTokens || 0));
  if (filter === "file-focus" && focusFile) return !step.filesTouched.includes(focusFile);
  return false;
}

function shortStepSummary(step: AgentTopologyStep) {
  const parts = [`${step.label}: ${step.status}`];
  if (step.rawNodeName) parts.push(`node=${step.rawNodeName}`);
  if (step.toolName) parts.push(`tool=${step.toolName}`);
  if (step.filesTouched.length) parts.push(`files=${step.filesTouched.slice(0, 5).join(", ")}`);
  if (step.inputTokens || step.outputTokens) parts.push(`tokens=${(step.inputTokens || 0) + (step.outputTokens || 0)}`);
  if (step.error) parts.push(`error=${step.error}`);
  return parts.join(" | ");
}

export function AgentThoughtTopology3D() {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const activeAgentTopology = useObservabilityStore((state) => state.activeAgentTopology);
  const agentTopologyRuns = useObservabilityStore((state) => state.agentTopologyRuns);
  const agentTopologyFilter = useObservabilityStore((state) => state.agentTopologyFilter);
  const agentTopologyFocusFile = useObservabilityStore((state) => state.agentTopologyFocusFile);
  const isObservabilityLoading = useObservabilityStore((state) => state.isObservabilityLoading);
  const observabilityError = useObservabilityStore((state) => state.observabilityError);
  const loadAgentTopology = useObservabilityStore((state) => state.loadAgentTopology);
  const selectAgentTopologyRun = useObservabilityStore((state) => state.selectAgentTopologyRun);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const graph = useWorkspaceStore((state) => state.graph);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);
  const openAgentDiff = useWorkspaceStore((state) => state.openAgentDiff);

  const visible = activeObservabilityMode === "agent-topology";
  const filePaths = useMemo(() => new Set((graph?.nodes || []).filter((node) => node.kind === "file").map((node) => node.path)), [graph]);
  const positions = useMemo(() => {
    const map = new Map<string, Vec3>();
    for (const [index, step] of (activeAgentTopology?.steps || []).entries()) {
      map.set(step.id, layoutStep(index, activeAgentTopology?.steps.length || 1));
    }
    return map;
  }, [activeAgentTopology?.steps]);

  useEffect(() => {
    if (!visible) return undefined;
    void loadAgentTopology(activeAgentTopology?.runId);
    const timer = window.setInterval(() => {
      const current = useObservabilityStore.getState().activeAgentTopology;
      if (!current || current.status === "running" || current.status === "queued") {
        void useObservabilityStore.getState().loadAgentTopology(current?.runId);
      }
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeAgentTopology?.runId, loadAgentTopology, visible]);

  if (!visible) return null;

  const handleStepClick = (step: AgentTopologyStep) => {
    appendTerminal(shortStepSummary(step));
    if (step.kind === "validator" && step.validationOutput) {
      appendTerminal(`Validation output for ${activeAgentTopology?.taskId || step.runId}:\n${step.validationOutput}`);
    }
    if (step.status === "failed" || step.status === "needs-human-review") {
      appendTerminal(step.error ? `Failed step detail: ${step.error}` : `Failed step selected: ${step.label}.`);
    }
    if (step.logFile) {
      appendTerminal(`Log metadata: ${step.logFile}. Raw log content is not rendered in the topology.`);
    }
    if (step.kind === "patch-writer" || step.kind === "validator" || step.kind === "apply-gate") {
      openAgentDiff(activeAgentTopology?.taskId || step.runId);
    }
  };

  const handleFileClick = (path: string) => {
    if (!filePaths.has(path)) {
      appendTerminal(`File badge is outside current graph: ${path}`);
      return;
    }
    focusFile(path);
    void openFile(path);
  };

  return (
    <group position={[0, 2.18, -2.45]} rotation={[0, 0, 0]}>
      <Text position={[0, 0.98, 0]} fontSize={0.16} color="#d5a8ff" anchorX="center" maxWidth={3.2}>
        Agent Thought Topology
      </Text>
      <Text position={[0, 0.78, 0]} fontSize={0.07} color="#9aa6a2" anchorX="center" maxWidth={3.4}>
        operational steps, tools, files, tokens, and patch state
      </Text>

      {activeAgentTopology ? (
        <>
          {activeAgentTopology.edges.map((edge) => {
            const source = positions.get(edge.sourceId);
            const target = positions.get(edge.targetId);
            const sourceStep = activeAgentTopology.steps.find((step) => step.id === edge.sourceId);
            const targetStep = activeAgentTopology.steps.find((step) => step.id === edge.targetId);
            const dimmed =
              sourceStep && targetStep
                ? shouldDimStep(sourceStep, agentTopologyFilter, agentTopologyFocusFile) &&
                  shouldDimStep(targetStep, agentTopologyFilter, agentTopologyFocusFile)
                : false;
            return source && target ? <AgentToolEdge3D key={edge.id} edge={edge} source={source} target={target} dimmed={dimmed} /> : null;
          })}
          {activeAgentTopology.steps.map((step) => {
            const position = positions.get(step.id);
            if (!position) return null;
            const dimmed = shouldDimStep(step, agentTopologyFilter, agentTopologyFocusFile);
            return (
              <AgentStepNode3D
                key={step.id}
                step={step}
                position={position}
                dimmed={dimmed}
                highlighted={!dimmed && (step.status === "failed" || step.status === "running" || step.status === "needs-human-review")}
                showTokenUsage={agentTopologyFilter === "token-usage"}
                focusedFile={agentTopologyFocusFile}
                onStepClick={handleStepClick}
                onFileClick={handleFileClick}
              />
            );
          })}
        </>
      ) : (
        <Html center position={[0, 0.18, 0]} className="scene-html agent-topology-empty">
          <strong>{isObservabilityLoading ? "Loading agent workflow..." : "No workflow run available yet."}</strong>
          <span>{observabilityError || "Create and run an agent workflow first."}</span>
        </Html>
      )}

      <AgentRunStatsPanel3D
        run={activeAgentTopology}
        runs={agentTopologyRuns}
        filter={agentTopologyFilter}
        focusFile={agentTopologyFocusFile}
        onRefresh={() => void loadAgentTopology(activeAgentTopology?.runId)}
        onHide={clearObservabilityOverlays}
        onSelectRun={(runId) => {
          selectAgentTopologyRun(runId);
          void loadAgentTopology(runId);
        }}
      />
    </group>
  );
}
