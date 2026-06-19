import { safeIdPart, safeRelativePath } from "./buildObservabilityGraph.ts";
import { stackFramesToTracePayload } from "./stackTraceParser.ts";

export type TraceSpanStatus = "ok" | "error" | "unknown";
export type TraceSourceKind = "import" | "test" | "lint" | "stack" | "demo";

export type TraceSpanRecord = {
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
};

export type TraceRecord = {
  traceId: string;
  name: string;
  sourceKind: TraceSourceKind;
  importedAt: string;
  isDemo: boolean;
  spans: TraceSpanRecord[];
};

const MAX_SPANS = 500;
const MAX_LOGS_PER_SPAN = 12;
const MAX_LOG_LENGTH = 800;

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finitePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function safeIsoTime(value: unknown) {
  const text = stringValue(value);
  if (!text) return undefined;
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
}

function safeLine(value: unknown) {
  const line = Number(value);
  return Number.isInteger(line) && line > 0 ? line : undefined;
}

function safeStatus(value: unknown): TraceSpanStatus {
  return value === "ok" || value === "error" || value === "unknown" ? value : "unknown";
}

function safeSourceKind(value: unknown): TraceSourceKind {
  return value === "test" || value === "lint" || value === "stack" || value === "demo" ? value : "import";
}

function safeLogs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, MAX_LOGS_PER_SPAN)
    .map((item) => item.slice(0, MAX_LOG_LENGTH));
}

function safeTraceId(value: unknown) {
  const raw = stringValue(value);
  if (!raw) throw new Error("traceId is required.");
  return safeIdPart(raw).slice(0, 120);
}

function safeSpanId(value: unknown, fallback: string) {
  const raw = stringValue(value, fallback);
  return safeIdPart(raw).slice(0, 140);
}

function safeSpanPath(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = safeRelativePath(value);
  if (!normalized) throw new Error(`Unsafe span filePath: ${String(value)}`);
  return normalized;
}

export function normalizeImportedTracePayload(payload: any, options: { sourceKind?: TraceSourceKind; isDemo?: boolean } = {}): TraceRecord {
  if (!payload || typeof payload !== "object") throw new Error("Trace payload must be a JSON object.");
  if (!Array.isArray(payload.spans)) throw new Error("Trace payload must include a spans array.");
  const traceId = safeTraceId(payload.traceId);
  const spans = payload.spans.slice(0, MAX_SPANS).map((span: any, index: number): TraceSpanRecord => {
    if (!span || typeof span !== "object") throw new Error(`Invalid span at index ${index}.`);
    const spanId = safeSpanId(span.spanId, `${traceId}:span:${index + 1}`);
    const parentSpanId = span.parentSpanId ? safeSpanId(span.parentSpanId, "") : undefined;
    return {
      spanId,
      parentSpanId,
      name: stringValue(span.name, `Span ${index + 1}`).slice(0, 160),
      filePath: safeSpanPath(span.filePath),
      functionName: stringValue(span.functionName) || undefined,
      line: safeLine(span.line),
      startTime: safeIsoTime(span.startTime),
      durationMs: finitePositiveNumber(span.durationMs),
      status: safeStatus(span.status),
      logs: safeLogs(span.logs)
    };
  });

  return {
    traceId,
    name: stringValue(payload.name, traceId).slice(0, 180),
    sourceKind: options.sourceKind || safeSourceKind(payload.sourceKind),
    importedAt: new Date().toISOString(),
    isDemo: Boolean(options.isDemo || payload.isDemo),
    spans
  };
}

export function traceFromProcessOutput(input: {
  output: unknown;
  command: "test" | "lint";
  repoRoot?: string;
}) {
  const payload = stackFramesToTracePayload({
    output: input.output,
    command: input.command,
    name: `${input.command} stack trace`,
    repoRoot: input.repoRoot
  });
  return normalizeImportedTracePayload(payload, {
    sourceKind: input.command,
    isDemo: false
  });
}

export function createDemoTrace() {
  return normalizeImportedTracePayload(
    {
      traceId: "demo-trace-river",
      name: "Demo trace river",
      spans: [
        {
          spanId: "demo:app",
          name: "Demo entry span",
          filePath: "src/App.tsx",
          functionName: "App",
          line: 8,
          durationMs: 42,
          status: "ok",
          logs: ["Demo trace only. Import a JSON trace for real execution data."]
        },
        {
          spanId: "demo:router",
          parentSpanId: "demo:app",
          name: "Demo command route",
          filePath: "src/agents/VoiceCommandRouter.ts",
          functionName: "parseVoiceCommand",
          durationMs: 118,
          status: "error",
          logs: ["Demo error span. Not from runtime execution."]
        },
        {
          spanId: "demo:graph",
          parentSpanId: "demo:router",
          name: "Demo graph lookup",
          filePath: "src/utils/codeGraph.ts",
          functionName: "buildCodeGraph",
          durationMs: 66,
          status: "unknown",
          logs: ["Demo unmapped/unknown style span."]
        }
      ]
    },
    { sourceKind: "demo", isDemo: true }
  );
}
