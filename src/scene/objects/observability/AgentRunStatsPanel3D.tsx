import { Html } from "@react-three/drei";
import type { AgentTopologyFilter, AgentTopologyRun } from "../../../observability/agentTopology";

function formatElapsed(ms?: number | null) {
  if (!ms) return "elapsed unavailable";
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`;
}

function tokenLabel(run: AgentTopologyRun) {
  if (!run.tokenUsageAvailable) return "token usage unavailable";
  const total = run.inputTokensTotal + run.outputTokensTotal;
  return `${total.toLocaleString()} tokens`;
}

export function AgentRunStatsPanel3D({
  run,
  runs,
  filter,
  focusFile,
  onRefresh,
  onHide,
  onSelectRun
}: {
  run: AgentTopologyRun | null;
  runs: AgentTopologyRun[];
  filter: AgentTopologyFilter;
  focusFile: string | null;
  onRefresh: () => void;
  onHide: () => void;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <Html transform position={[4.35, 2.35, -1.05]} rotation={[0, -0.58, 0]} className="scene-html agent-topology-panel">
      <header>
        <div>
          <span>Operational workflow</span>
          <strong>Agent Thought Topology</strong>
        </div>
        <button onClick={onHide}>Hide</button>
      </header>

      {run ? (
        <>
          <dl>
            <div>
              <dt>Run</dt>
              <dd>{run.taskId}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className={`is-${run.status}`}>{run.status}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{formatElapsed(run.elapsedMs)}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>{tokenLabel(run)}</dd>
            </div>
            <div>
              <dt>Patch</dt>
              <dd>{run.patchState || run.validationState}</dd>
            </div>
            <div>
              <dt>Files</dt>
              <dd>{run.filesTouched.length}</dd>
            </div>
          </dl>
          <div className="agent-topology-run-actions">
            <button onClick={onRefresh}>Refresh</button>
            {runs.slice(0, 4).map((candidate) => (
              <button key={candidate.runId} className={candidate.runId === run.runId ? "is-active" : ""} onClick={() => onSelectRun(candidate.runId)}>
                {candidate.taskId}
              </button>
            ))}
          </div>
          <div className="agent-topology-filter-note">
            <span>Filter: {filter}</span>
            {focusFile ? <code>{focusFile}</code> : null}
          </div>
          {run.warnings.length ? (
            <ul>
              {run.warnings.slice(0, 3).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p>Showing observable workflow metadata only.</p>
          )}
        </>
      ) : (
        <div className="agent-topology-empty-panel">
          <strong>No workflow run available yet.</strong>
          <span>Create and run an agent workflow first.</span>
          <button onClick={onRefresh}>Refresh</button>
        </div>
      )}
    </Html>
  );
}
