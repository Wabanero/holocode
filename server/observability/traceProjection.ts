import { fileNodeId, safeIdPart, safeRelativePath } from "./buildObservabilityGraph.ts";
import type { TraceRecord, TraceSpanRecord } from "./traceIngest.ts";

type CodeGraphLike = {
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
};

export type ProjectedTraceSpan = TraceSpanRecord & {
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
  sourceKind: TraceRecord["sourceKind"];
  isDemo: boolean;
  importedAt: string;
  projectedAt: string;
  status: "ok" | "error" | "unknown";
  spans: ProjectedTraceSpan[];
  edges: Array<{
    id: string;
    sourceSpanId: string;
    targetSpanId: string;
    status: "ok" | "error" | "unknown";
  }>;
  unmappedSpans: ProjectedTraceSpan[];
  stats: {
    spanCount: number;
    mappedSpanCount: number;
    unmappedSpanCount: number;
    errorSpanCount: number;
    totalDurationMs: number;
  };
};

function lineInNode(span: TraceSpanRecord, node: Record<string, any>) {
  if (!span.line) return false;
  const start = Number(node.line || node.startLine || 0);
  const end = Number(node.endLine || node.line || node.startLine || 0);
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && span.line >= start && span.line <= Math.max(start, end);
}

function namesMatch(span: TraceSpanRecord, node: Record<string, any>) {
  if (!span.functionName) return false;
  const candidate = String(node.symbolName || node.name || "").toLowerCase();
  const wanted = span.functionName.toLowerCase().split(".").at(-1) || span.functionName.toLowerCase();
  return candidate === wanted || candidate.endsWith(`.${wanted}`);
}

function bestSymbolForSpan(span: TraceSpanRecord, symbols: Array<Record<string, any>>) {
  const sameFile = symbols.filter((node) => safeRelativePath(node.path) === span.filePath);
  const byNameAndLine = sameFile.find((node) => namesMatch(span, node) && lineInNode(span, node));
  if (byNameAndLine) return { node: byNameAndLine, confidence: "verified" as const, reason: "Matched symbol name and line." };
  const byLine = sameFile.find((node) => lineInNode(span, node));
  if (byLine) return { node: byLine, confidence: "verified" as const, reason: "Matched symbol line range." };
  const byName = sameFile.find((node) => namesMatch(span, node));
  if (byName) return { node: byName, confidence: "inferred" as const, reason: "Matched symbol name in the same file." };
  return null;
}

function projectSpan(span: TraceSpanRecord, graph: CodeGraphLike): ProjectedTraceSpan {
  const graphNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const filePath = safeRelativePath(span.filePath);
  const fileNode = filePath ? graphNodes.find((node) => String(node.id) === fileNodeId(filePath) || safeRelativePath(node.path) === filePath && (node.kind === "file" || node.kind === "test")) : null;
  const symbols = graphNodes.filter((node) => node.kind === "function" || node.kind === "class" || node.kind === "method");
  const symbolMatch = filePath ? bestSymbolForSpan({ ...span, filePath }, symbols) : null;

  if (symbolMatch) {
    return {
      ...span,
      path: filePath,
      nodeId: String(symbolMatch.node.id),
      fileNodeId: fileNode ? String(fileNode.id) : filePath ? fileNodeId(filePath) : undefined,
      mapped: true,
      mappingConfidence: symbolMatch.confidence,
      mappingReason: symbolMatch.reason
    };
  }

  if (fileNode && filePath) {
    return {
      ...span,
      path: filePath,
      nodeId: String(fileNode.id),
      fileNodeId: String(fileNode.id),
      mapped: true,
      mappingConfidence: span.line ? "inferred" : "verified",
      mappingReason: span.line ? "Mapped to file; no containing symbol range found." : "Mapped by file path."
    };
  }

  return {
    ...span,
    path: filePath || undefined,
    mapped: false,
    mappingConfidence: "missing",
    mappingReason: filePath ? "File path was not found in the code graph." : "No file path or symbol mapping was provided."
  };
}

function statusForTrace(spans: ProjectedTraceSpan[]) {
  if (spans.some((span) => span.status === "error")) return "error";
  if (spans.some((span) => span.status === "unknown")) return "unknown";
  return "ok";
}

export function projectTraceToCodeGraph(trace: TraceRecord, graph: CodeGraphLike | null | undefined): TraceRiverProjection {
  const projected = trace.spans.map((span) => projectSpan(span, graph || {}));
  const spanIds = new Set(projected.map((span) => span.spanId));
  const edges = projected
    .filter((span) => span.parentSpanId && spanIds.has(span.parentSpanId))
    .map((span) => {
      const parent = projected.find((candidate) => candidate.spanId === span.parentSpanId);
      return {
        id: `trace-edge:${safeIdPart(span.parentSpanId)}->${safeIdPart(span.spanId)}`,
        sourceSpanId: span.parentSpanId || "",
        targetSpanId: span.spanId,
        status: span.status === "error" || parent?.status === "error" ? "error" : span.status
      };
    });
  const unmappedSpans = projected.filter((span) => !span.mapped);
  const totalDurationMs = projected.reduce((total, span) => total + (span.durationMs || 0), 0);

  return {
    traceId: trace.traceId,
    name: trace.name,
    sourceKind: trace.sourceKind,
    isDemo: trace.isDemo,
    importedAt: trace.importedAt,
    projectedAt: new Date().toISOString(),
    status: statusForTrace(projected),
    spans: projected,
    edges,
    unmappedSpans,
    stats: {
      spanCount: projected.length,
      mappedSpanCount: projected.length - unmappedSpans.length,
      unmappedSpanCount: unmappedSpans.length,
      errorSpanCount: projected.filter((span) => span.status === "error").length,
      totalDurationMs
    }
  };
}
