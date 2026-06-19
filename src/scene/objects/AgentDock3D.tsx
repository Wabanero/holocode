import { Html, Text } from "@react-three/drei";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function AgentDock3D() {
  const showAgentDock = useWorkspaceStore((state) => state.showAgentDock);
  const agentResults = useWorkspaceStore((state) => state.agentResults);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const createAgentTask = useWorkspaceStore((state) => state.createAgentTask);
  const runAgentTask = useWorkspaceStore((state) => state.runAgentTask);
  const refreshAgentResults = useWorkspaceStore((state) => state.refreshAgentResults);
  const openAgentDiff = useWorkspaceStore((state) => state.openAgentDiff);
  const validatePatch = useWorkspaceStore((state) => state.validatePatch);
  const applyPatch = useWorkspaceStore((state) => state.applyPatch);
  const rejectPatch = useWorkspaceStore((state) => state.rejectPatch);

  if (!showAgentDock) return null;
  const latestTask = agentResults[agentResults.length - 1];
  const latestRun = agentRuns[0];
  const isAgentView = visibleSceneMode === "agent";
  const visibleTasks = agentResults.slice(isAgentView ? -5 : -3);

  return (
    <group position={isAgentView ? [6.2, 1.15, 1.8] : [6.78, 1.52, 0.65]} rotation={[0, isAgentView ? -0.72 : -0.92, 0]}>
      <Text position={[0, isAgentView ? 1.16 : 1.22, 0]} fontSize={isAgentView ? 0.16 : 0.125} color="#48e5c2" anchorX="center">
        Agent Dock
      </Text>
      <mesh position={[0, isAgentView ? 0.38 : 0.34, 0]}>
        <boxGeometry args={[isAgentView ? 1.8 : 1.34, isAgentView ? 1.68 : 1.72, 0.12]} />
        <meshStandardMaterial color="#162623" emissive="#48e5c2" emissiveIntensity={0.08} roughness={0.55} />
      </mesh>
      {visibleTasks.map((task, index) => {
        const run = agentRuns.find((candidate) => candidate.taskId === task.taskId);
        const status = run?.status || task.patchState?.status || (task.diff ? "pending" : "ready");
        const color =
          status === "running" || status === "queued"
            ? "#6db7ff"
            : status === "completed"
              ? "#48e5c2"
              : status === "applied"
                ? "#48e5c2"
                : status === "validated"
                  ? "#f2be5c"
                  : status === "failed" || status === "rejected"
                ? "#f06f6f"
                : "#9aa6a2";
        return (
          <group key={task.taskId} position={[0, (isAgentView ? 0.88 : 0.88) - index * (isAgentView ? 0.34 : 0.39), 0.12]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                openAgentDiff(task.taskId);
              }}
            >
              <boxGeometry args={[isAgentView ? 1.18 : 1.02, isAgentView ? 0.26 : 0.28, 0.08]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.14} />
            </mesh>
            <Text position={[-0.18, 0.035, 0.06]} fontSize={isAgentView ? 0.058 : 0.05} color="#07100e" anchorX="center" maxWidth={0.7}>
              {task.taskId}
            </Text>
            <Text position={[-0.18, -0.064, 0.06]} fontSize={isAgentView ? 0.042 : 0.038} color="#07100e" anchorX="center">
              {status}
            </Text>
            {isAgentView && (
              <Html transform scale={0.82} position={[0.42, 0, 0.09]} className="scene-html scene-agent-mini-run">
                <button
                  onClick={() => void runAgentTask(task.taskId)}
                  disabled={run?.status === "running" || run?.status === "queued"}
                >
                  Run
                </button>
              </Html>
            )}
          </group>
        );
      })}
      {isAgentView ? (
        <Html transform scale={0.86} position={[0, -0.86, 0.16]} className="scene-html scene-agent-controls scene-agent-controls-rail">
          <button onClick={() => void createAgentTask()}>Create task</button>
          <button disabled={!latestTask} onClick={() => latestTask && void runAgentTask(latestTask.taskId)}>
            Run latest
          </button>
          <button onClick={() => void refreshAgentResults()}>Refresh</button>
          <span>{agentResults.length} tasks</span>
        </Html>
      ) : (
        <Text position={[0, -0.5, 0.08]} fontSize={0.045} color="#9ff5df" anchorX="center">
          {agentResults.length} tasks
        </Text>
      )}
      {isAgentView && latestRun && (
        <Html transform scale={0.78} position={[0, -1.34, 0.18]} className="scene-html">
          <div className="agent-run-panel">
            <strong>
              {latestRun.taskId}: {latestRun.status}
            </strong>
            <span>{latestRun.displayCommand}</span>
            <span>{latestRun.workingDirectory}</span>
            {latestRun.lastLogLines.slice(-5).map((line, index) => (
              <code key={`${line}-${index}`}>{line}</code>
            ))}
          </div>
        </Html>
      )}
      {isAgentView && agentResults.find((task) => task.diff) && (
        <Html
          transform
          scale={0.82}
          position={[0, -1.94, 0.16]}
          className="scene-html scene-agent-controls scene-patch-controls scene-patch-controls-rail"
        >
          {agentResults
            .filter((task) => task.diff && task.resultDiffFile)
            .slice(-1)
            .map((task) => (
              <div key={task.taskId}>
                <strong>{task.taskId}</strong>
                <button onClick={() => void validatePatch(task.resultDiffFile || "")}>Validate</button>
                <button onClick={() => void applyPatch(task.resultDiffFile || "")}>Apply</button>
                <button onClick={() => void rejectPatch(task.resultDiffFile || "")}>Reject</button>
              </div>
            ))}
        </Html>
      )}
    </group>
  );
}
