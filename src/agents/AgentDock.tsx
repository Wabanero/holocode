import { Bot, FileDiff, FilePlus2, Play, RefreshCw } from "lucide-react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import { DiffViewer } from "./DiffViewer";

export function AgentDock() {
  const agentResults = useWorkspaceStore((state) => state.agentResults);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const activeDiff = useWorkspaceStore((state) => state.activeDiff);
  const createAgentTask = useWorkspaceStore((state) => state.createAgentTask);
  const runAgentTask = useWorkspaceStore((state) => state.runAgentTask);
  const refreshAgentResults = useWorkspaceStore((state) => state.refreshAgentResults);
  const showFirstDiff = useWorkspaceStore((state) => state.showFirstDiff);
  const latest = agentResults[agentResults.length - 1];

  return (
    <Panel
      title="Agent Dock"
      eyebrow="file bridge"
      className="agent-panel"
      actions={
        <>
          <Button title="Create agent task" icon={<FilePlus2 size={16} />} onClick={() => void createAgentTask()} />
          <Button
            title="Run latest agent task"
            icon={<Play size={16} />}
            disabled={!latest}
            onClick={() => latest && void runAgentTask(latest.taskId)}
          />
          <Button title="Refresh agent results" icon={<RefreshCw size={16} />} onClick={() => void refreshAgentResults()} />
          <Button title="Show diff" icon={<FileDiff size={16} />} onClick={showFirstDiff} />
        </>
      }
    >
      <div className="agent-status">
        <Bot size={18} />
        <span>{agentResults.length ? `${agentResults.length} task files found` : "No task files yet"}</span>
      </div>

      <div className="agent-task-list">
        {agentResults.map((result) => (
          <article className="agent-task" key={result.taskId}>
            {(() => {
              const run = agentRuns.find((candidate) => candidate.taskId === result.taskId);
              return <span>{run ? `${run.status} | ${run.displayCommand}` : result.patchState?.status || "ready"}</span>;
            })()}
            <strong>{result.taskId}</strong>
            <span>{result.taskFile}</span>
            <span>{result.resultDiffFile || "waiting for result diff"}</span>
          </article>
        ))}
      </div>

      {latest?.log ? (
        <div className="agent-log">
          <h3>{latest.taskId} log</h3>
          <pre>{latest.log}</pre>
        </div>
      ) : null}

      <DiffViewer diff={activeDiff || latest?.diff || ""} />
    </Panel>
  );
}
