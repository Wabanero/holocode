import { Html } from "@react-three/drei";

export type BlastRadiusLegendCounts = {
  core: number;
  direct: number;
  indirect: number;
  tests: number;
  signals: number;
  missingTests: number;
  hidden: number;
};

export function BlastRadiusLegend3D({
  targetPath,
  counts,
  depthLimit,
  heuristic,
  onDepth,
  onReset,
  onHide
}: {
  targetPath: string | null;
  counts: BlastRadiusLegendCounts;
  depthLimit: number | null;
  heuristic: boolean;
  onDepth: (depth: number) => void;
  onReset: () => void;
  onHide: () => void;
}) {
  return (
    <Html transform position={[-5.55, 2.35, -0.6]} rotation={[0, 0.62, 0]} className="scene-html blast-radius-legend">
      <header>
        <div>
          <span>Impact primitive</span>
          <strong>Blast Radius Bubble</strong>
        </div>
        <button onClick={onHide}>Hide</button>
      </header>
      {targetPath ? (
        <>
          <code title={targetPath}>{targetPath}</code>
          <dl>
            <div>
              <dt>Core</dt>
              <dd>{counts.core}</dd>
            </div>
            <div>
              <dt>Direct</dt>
              <dd>{counts.direct}</dd>
            </div>
            <div>
              <dt>Tests/chain</dt>
              <dd>{counts.tests + counts.indirect}</dd>
            </div>
            <div>
              <dt>Signals</dt>
              <dd>{counts.signals}</dd>
            </div>
            <div>
              <dt>Missing tests</dt>
              <dd>{counts.missingTests}</dd>
            </div>
            <div>
              <dt>Hidden cap</dt>
              <dd>{counts.hidden}</dd>
            </div>
          </dl>
          <div className="blast-radius-layer-controls">
            {[1, 2, 3, 4].map((depth) => (
              <button key={depth} className={depthLimit === depth ? "is-active" : ""} onClick={() => onDepth(depth)}>
                L{depth}
              </button>
            ))}
            <button onClick={onReset}>Reset</button>
          </div>
          <p>{heuristic ? "Some edges are inferred or missing source data." : "Using verified code graph edges where available."}</p>
        </>
      ) : (
        <div className="blast-radius-empty-panel">
          <strong>Select a file or diff card first.</strong>
          <span>Then ask for the blast radius.</span>
        </div>
      )}
    </Html>
  );
}
