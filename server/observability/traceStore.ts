import { createDemoTrace, normalizeImportedTracePayload, traceFromProcessOutput, type TraceRecord } from "./traceIngest.ts";

export type TraceSummary = {
  traceId: string;
  name: string;
  sourceKind: TraceRecord["sourceKind"];
  importedAt: string;
  isDemo: boolean;
  spanCount: number;
  errorCount: number;
  mappedHintCount: number;
};

function summarizeTrace(trace: TraceRecord): TraceSummary {
  return {
    traceId: trace.traceId,
    name: trace.name,
    sourceKind: trace.sourceKind,
    importedAt: trace.importedAt,
    isDemo: trace.isDemo,
    spanCount: trace.spans.length,
    errorCount: trace.spans.filter((span) => span.status === "error").length,
    mappedHintCount: trace.spans.filter((span) => span.filePath || span.functionName).length
  };
}

export function createTraceStore(options: { maxTraces?: number } = {}) {
  const traces = new Map<string, TraceRecord>();
  const maxTraces = Math.max(1, Math.min(200, Math.floor(options.maxTraces || 40)));

  function prune() {
    const sorted = [...traces.values()].sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
    for (const trace of sorted.slice(maxTraces)) {
      traces.delete(trace.traceId);
    }
  }

  function upsert(trace: TraceRecord) {
    traces.set(trace.traceId, trace);
    prune();
    return trace;
  }

  function importTrace(payload: unknown) {
    return upsert(normalizeImportedTracePayload(payload));
  }

  function ingestProcessOutput(input: { output: unknown; command: "test" | "lint"; repoRoot?: string }) {
    const trace = traceFromProcessOutput(input);
    if (!trace.spans.length) return null;
    return upsert(trace);
  }

  function getTrace(traceId: string | null | undefined) {
    if (traceId === "demo" || traceId === "demo-trace-river") return createDemoTrace();
    if (!traceId) return latestTrace();
    return traces.get(traceId) || null;
  }

  function latestTrace() {
    return [...traces.values()].sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())[0] || null;
  }

  function failingTrace() {
    return (
      [...traces.values()]
        .filter((trace) => trace.spans.some((span) => span.status === "error"))
        .sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime())[0] || null
    );
  }

  function listTraces() {
    return {
      traces: [...traces.values()].map(summarizeTrace).sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()),
      demoAvailable: true
    };
  }

  return {
    importTrace,
    ingestProcessOutput,
    getTrace,
    latestTrace,
    failingTrace,
    listTraces
  };
}
