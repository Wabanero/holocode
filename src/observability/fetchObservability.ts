import type {
  TraceImportPayload,
  TraceListResponse,
  TraceRiverProjection,
  TraceSourceKind
} from "./traceSelectors";
import type {
  BlastRadiusResult,
  CodeGraphRiskResult,
  ContextLensResult,
  ObservabilityEdge,
  ObservabilityGraphSources,
  ObservabilityNode,
  ObservabilitySignal,
  ObservabilityStats
} from "./observabilityTypes";

export type ObservabilityGraphApiResponse = {
  nodes: ObservabilityNode[];
  edges: ObservabilityEdge[];
  signals: ObservabilitySignal[];
  generatedAt: string;
  sources: ObservabilityGraphSources;
  stats?: ObservabilityStats;
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || response.statusText);
  }

  return response.json() as Promise<T>;
}

export function fetchObservabilityGraph() {
  return requestJson<ObservabilityGraphApiResponse>("/api/observability/graph");
}

export function fetchObservabilityBlastRadius(path: string) {
  const query = new URLSearchParams({ path });
  return requestJson<BlastRadiusResult>(`/api/observability/blast-radius?${query.toString()}`);
}

export function fetchObservabilityContextLens(runId = "") {
  const query = new URLSearchParams();
  if (runId) query.set("runId", runId);
  const suffix = query.toString();
  return requestJson<ContextLensResult>(`/api/observability/context-lens${suffix ? `?${suffix}` : ""}`);
}

export function fetchObservabilityRisk(path: string) {
  const query = new URLSearchParams({ path });
  return requestJson<CodeGraphRiskResult>(`/api/observability/risk?${query.toString()}`);
}

export function fetchObservabilityTraces() {
  return requestJson<TraceListResponse>("/api/observability/traces");
}

export function fetchObservabilityTraceRiver(traceId = "") {
  const query = new URLSearchParams();
  if (traceId) query.set("traceId", traceId);
  const suffix = query.toString();
  return requestJson<TraceRiverProjection>(`/api/observability/trace-river${suffix ? `?${suffix}` : ""}`);
}

export function importObservabilityTrace(payload: TraceImportPayload) {
  return requestJson<{
    ok: true;
    trace: {
      traceId: string;
      name: string;
      sourceKind: TraceSourceKind;
      importedAt: string;
      isDemo: boolean;
      spans: TraceImportPayload["spans"];
    };
  }>("/api/observability/traces/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
