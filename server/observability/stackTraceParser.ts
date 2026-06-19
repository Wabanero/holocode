import path from "node:path";
import { safeIdPart, safeRelativePath } from "./buildObservabilityGraph.ts";

export type ParsedStackFrame = {
  functionName?: string;
  filePath?: string;
  line?: number;
  column?: number;
  raw: string;
};

function normalizePathLike(value: string, repoRoot?: string) {
  let candidate = value.trim().replace(/^file:\/+/, "");
  candidate = candidate.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(candidate) && repoRoot) {
    const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!candidate.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return null;
    candidate = candidate.slice(normalizedRoot.length + 1);
  }
  return safeRelativePath(candidate);
}

function parseFrameLine(line: string, repoRoot?: string): ParsedStackFrame | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const nodeFrame = trimmed.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
  const anonymousFrame = trimmed.match(/^at\s+(.+?):(\d+):(\d+)$/);
  const pythonFrame = trimmed.match(/^File\s+"(.+?)",\s+line\s+(\d+),\s+in\s+(.+)$/);
  const viteFrame = trimmed.match(/^(.*?)(?:\s+)?\((.+?):(\d+):(\d+)\)$/);

  if (nodeFrame) {
    const filePath = normalizePathLike(nodeFrame[2], repoRoot);
    if (!filePath) return null;
    return {
      functionName: nodeFrame[1].replace(/^async\s+/, ""),
      filePath,
      line: Number(nodeFrame[3]),
      column: Number(nodeFrame[4]),
      raw: trimmed
    };
  }

  if (anonymousFrame) {
    const filePath = normalizePathLike(anonymousFrame[1], repoRoot);
    if (!filePath) return null;
    return {
      filePath,
      line: Number(anonymousFrame[2]),
      column: Number(anonymousFrame[3]),
      raw: trimmed
    };
  }

  if (pythonFrame) {
    const filePath = normalizePathLike(pythonFrame[1], repoRoot);
    if (!filePath) return null;
    return {
      functionName: pythonFrame[3],
      filePath,
      line: Number(pythonFrame[2]),
      raw: trimmed
    };
  }

  if (viteFrame) {
    const filePath = normalizePathLike(viteFrame[2], repoRoot);
    if (!filePath) return null;
    return {
      functionName: viteFrame[1] || undefined,
      filePath,
      line: Number(viteFrame[3]),
      column: Number(viteFrame[4]),
      raw: trimmed
    };
  }

  return null;
}

export function parseStackTrace(output: unknown, options: { repoRoot?: string; maxFrames?: number } = {}) {
  const frames: ParsedStackFrame[] = [];
  const maxFrames = Math.max(1, Math.min(250, Math.floor(options.maxFrames || 80)));
  for (const line of String(output || "").split(/\r?\n/)) {
    const frame = parseFrameLine(line, options.repoRoot);
    if (frame) frames.push(frame);
    if (frames.length >= maxFrames) break;
  }
  return frames;
}

export function stackFramesToTracePayload(input: {
  output: unknown;
  traceId?: string;
  name?: string;
  command?: string;
  repoRoot?: string;
}) {
  const frames = parseStackTrace(input.output, { repoRoot: input.repoRoot });
  const traceId = input.traceId || `stack:${safeIdPart(input.command || input.name || Date.now())}`;
  return {
    traceId,
    name: input.name || `Stack trace: ${input.command || "process output"}`,
    sourceKind: "stack",
    spans: frames.map((frame, index) => ({
      spanId: `${traceId}:frame:${index + 1}`,
      parentSpanId: index ? `${traceId}:frame:${index}` : undefined,
      name: frame.functionName || path.basename(frame.filePath || "unknown"),
      filePath: frame.filePath,
      functionName: frame.functionName,
      line: frame.line,
      status: index === 0 ? "error" : "unknown",
      logs: [frame.raw]
    }))
  };
}
