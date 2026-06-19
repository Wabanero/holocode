import { Html } from "@react-three/drei";
import type { ContextLensResult } from "../../../observability/observabilityTypes";

export function ContextLegend3D({
  lens,
  missingTests,
  missingCallers,
  tokenUsageLabel,
  tokenUsagePercent,
  onHide
}: {
  lens: ContextLensResult | null;
  missingTests: number;
  missingCallers: number;
  tokenUsageLabel: string;
  tokenUsagePercent: number | null;
  onHide: () => void;
}) {
  return (
    <Html transform position={[5.95, 2.45, 0.55]} rotation={[0, -0.68, 0]} className="scene-html context-lens-legend">
      <header>
        <div>
          <strong>LLM Context Lens</strong>
          <span>{lens?.runId || lens?.taskId || "no run selected"}</span>
        </div>
        <button onClick={onHide}>Hide</button>
      </header>
      {lens?.runId || lens?.taskId ? (
        <>
          <dl>
            <div>
              <dt>Read/context</dt>
              <dd>{lens.readFiles?.length || 0}</dd>
            </div>
            <div>
              <dt>Touched</dt>
              <dd>{lens.touchedFiles?.length || 0}</dd>
            </div>
            <div>
              <dt>Changed</dt>
              <dd>{lens.changedFiles?.length || 0}</dd>
            </div>
            <div>
              <dt>Artifacts</dt>
              <dd>{lens.artifactPaths?.length ?? lens.producedPatchPaths?.length ?? 0}</dd>
            </div>
            <div>
              <dt>Missing tests</dt>
              <dd>{missingTests}</dd>
            </div>
            <div>
              <dt>Missing callers</dt>
              <dd>{missingCallers}</dd>
            </div>
          </dl>
          <div className="context-token-row">
            <span>{tokenUsageLabel}</span>
            <div className="context-token-track">
              <i style={{ width: `${tokenUsagePercent ?? 0}%` }} />
            </div>
          </div>
          {lens.agentSteps?.length ? (
            <ol>
              {lens.agentSteps.slice(0, 6).map((step, index) => (
                <li key={`${step.name}-${step.timestamp || index}`}>
                  <span>{step.name}</span>
                  <em>{step.status}</em>
                </li>
              ))}
            </ol>
          ) : (
            <p>No workflow step metadata available.</p>
          )}
          {lens.inferenceNotes?.length ? <p>{lens.inferenceNotes[0]}</p> : null}
        </>
      ) : (
        <p>No agent run available yet. Create and run an agent task first.</p>
      )}
    </Html>
  );
}
