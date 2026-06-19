import type { SceneLayout3D, Vec3 } from "../scene/layout/layout3d";

export type TraceSpanStatus = "ok" | "error" | "unknown";
export type TraceSourceKind = "import" | "test" | "lint" | "stack" | "demo";

export type TraceSummary = {
  traceId: string;
  name: string;
  sourceKind: TraceSourceKind;
  importedAt: string;
  isDemo: boolean;
  spanCount: number;
  errorCount: number;
  mappedHintCount: number;
};

export type TraceSpanProjection = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  filePath?: string;
  functionName?: string;
  line?: number;
  startTime?: string;
  durationMs?: number;
  status: TraceSpanStatus;
  logs: string[];
  nodeId?: string;
  fileNodeId?: string;
  path?: string;
  mapped: boolean;
  mappingConfidence: "verified" | "inferred" | "missing";
  mappingReason: string;
};

export type TraceRiverProjection = {
  traceId: string;
  name: string;
  sourceKind: TraceSourceKind;
  isDemo: boolean;
  importedAt: string;
  projectedAt: string;
  status: TraceSpanStatus;
  spans: TraceSpanProjection[];
  edges: Array<{
    id: string;
    sourceSpanId: string;
    targetSpanId: string;
    status: TraceSpanStatus;
  }>;
  unmappedSpans: TraceSpanProjection[];
  stats: {
    spanCount: number;
    mappedSpanCount: number;
    unmappedSpanCount: number;
    errorSpanCount: number;
    totalDurationMs: number;
  };
};

export type TraceListResponse = {
  traces: TraceSummary[];
  demoAvailable: boolean;
};

export type TraceImportPayload = {
  traceId: string;
  name: string;
  spans: Array<{
    spanId: string;
    parentSpanId?: string;
    name: string;
    filePath?: string;
    functionName?: string;
    line?: number;
    startTime?: string;
    durationMs?: number;
    status?: TraceSpanStatus;
    logs?: string[];
  }>;
};

export type PositionedTraceSpan = TraceSpanProjection & {
  position: Vec3;
};

export function latestTraceSummary(traces: TraceSummary[]) {
  return [...traces].sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())[0] || null;
}

export function failingTraceSummary(traces: TraceSummary[]) {
  return traces.find((trace) => trace.errorCount > 0) || null;
}

export function mappedTraceSpans(trace: TraceRiverProjection | null) {
  return trace?.spans.filter((span) => span.mapped) || [];
}

export function unmappedTraceSpans(trace: TraceRiverProjection | null) {
  return trace?.unmappedSpans || [];
}

export function spanDurationWeight(span: TraceSpanProjection, trace: TraceRiverProjection | null) {
  const maxDuration = Math.max(1, ...(trace?.spans || []).map((candidate) => candidate.durationMs || 0));
  return Math.max(0.2, Math.min(1, (span.durationMs || 0) / maxDuration));
}

export function positionTraceSpans(trace: TraceRiverProjection | null, layout: SceneLayout3D): PositionedTraceSpan[] {
  if (!trace) return [];
  return trace.spans
    .map((span): PositionedTraceSpan | null => {
      const nodeId = span.nodeId || span.fileNodeId || (span.path ? `file:${span.path}` : "");
      const position = nodeId ? layout.nodePositions[nodeId] : null;
      return position ? { ...span, position } : null;
    })
    .filter((span): span is PositionedTraceSpan => Boolean(span));
}

export function traceEdgesWithPositions(trace: TraceRiverProjection | null, positionedSpans: PositionedTraceSpan[]) {
  if (!trace) return [];
  const byId = new Map(positionedSpans.map((span) => [span.spanId, span]));
  return trace.edges
    .map((edge) => {
      const source = byId.get(edge.sourceSpanId);
      const target = byId.get(edge.targetSpanId);
      return source && target ? { ...edge, source, target } : null;
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
}
