import { Html } from "@react-three/drei";
import type { TraceRiverProjection, TraceSpanProjection, TraceSummary } from "../../../observability/traceSelectors";

function traceLabel(trace: TraceRiverProjection | null) {
  if (!trace) return "No trace selected";
  return trace.isDemo ? `${trace.name} (demo)` : trace.name;
}

export function TraceRiverLegend3D({
  trace,
  traces,
  selectedSpan,
  showUnmapped,
  comparison,
  onSelectTrace,
  onToggleUnmapped,
  onHide
}: {
  trace: TraceRiverProjection | null;
  traces: TraceSummary[];
  selectedSpan: TraceSpanProjection | null;
  showUnmapped: boolean;
  comparison: { beforeTraceId: string; afterTraceId: string } | null;
  onSelectTrace: (traceId: string) => void;
  onToggleUnmapped: () => void;
  onHide: () => void;
}) {
  return (
    <Html transform position={[5.68, 2.42, -0.25]} rotation={[0, -0.62, 0]} className="scene-html trace-river-legend">
      <header>
        <div>
          <span>Execution path</span>
          <strong>Trace Rivers</strong>
        </div>
        <button onClick={onHide}>Hide</button>
      </header>
      {trace ? (
        <>
          <code title={trace.traceId}>{traceLabel(trace)}</code>
          {trace.isDemo ? <p className="trace-demo-note">Demo trace only. Import JSON for real execution data.</p> : null}
          <dl>
            <div>
              <dt>Spans</dt>
              <dd>{trace.stats.spanCount}</dd>
            </div>
            <div>
              <dt>Mapped</dt>
              <dd>{trace.stats.mappedSpanCount}</dd>
            </div>
            <div>
              <dt>Unmapped</dt>
              <dd>{trace.stats.unmappedSpanCount}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd>{trace.stats.errorSpanCount}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{Math.round(trace.stats.totalDurationMs)} ms</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{trace.sourceKind}</dd>
            </div>
          </dl>
          <div className="trace-river-actions">
            <button className={showUnmapped ? "is-active" : ""} onClick={onToggleUnmapped}>
              Unmapped
            </button>
            {traces.slice(0, 4).map((summary) => (
              <button key={summary.traceId} className={summary.traceId === trace.traceId ? "is-active" : ""} onClick={() => onSelectTrace(summary.traceId)}>
                {summary.errorCount ? "failing" : summary.sourceKind}
              </button>
            ))}
          </div>
          {comparison ? (
            <p>
              Comparing {comparison.beforeTraceId} before {comparison.afterTraceId}.
            </p>
          ) : null}
          {selectedSpan ? (
            <section className="trace-active-span">
              <strong>{selectedSpan.name}</strong>
              <span>{selectedSpan.path || selectedSpan.filePath || "unmapped"}</span>
              <span>{selectedSpan.status}</span>
              {selectedSpan.logs.slice(0, 3).map((line, index) => (
                <code key={`${line}-${index}`}>{line}</code>
              ))}
            </section>
          ) : null}
        </>
      ) : (
        <div className="trace-river-empty-panel">
          <strong>No real trace available.</strong>
          <span>Import a trace or run tests/lint when connected.</span>
        </div>
      )}
    </Html>
  );
}
