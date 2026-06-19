import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export const LLM_EVENT_TYPES = {
  requestStarted: "llm_request_started",
  token: "llm_token",
  requestCompleted: "llm_request_completed",
  requestFailed: "llm_request_failed"
};

export class LLMTelemetry extends EventEmitter {
  emitEvent(type, payload) {
    const event = {
      type,
      timestamp: new Date().toISOString(),
      ...payload
    };
    this.emit(type, event);
    this.emit("event", event);
    return event;
  }
}

export function estimateTokens(input) {
  if (Array.isArray(input)) {
    return input.reduce((total, message) => {
      const roleTokens = message?.role ? 2 : 0;
      return total + roleTokens + estimateTokens(message?.content ?? "");
    }, 0);
  }

  if (input && typeof input === "object") {
    return estimateTokens(JSON.stringify(input));
  }

  const text = String(input ?? "");
  if (!text) return 0;
  const wordLikeChunks = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(Math.max(text.length / 4, wordLikeChunks * 1.3)));
}

export function normalizeBaseUrl(baseURL) {
  return String(baseURL || "").replace(/\/+$/, "");
}

export function createRuntimeStats() {
  return {
    requestCount: 0,
    failedRequestCount: 0,
    streamingRequestCount: 0,
    inputTokenEstimateTotal: 0,
    outputTokenEstimateTotal: 0,
    lastLatencyMs: null,
    averageLatencyMs: null,
    lastTimeToFirstTokenMs: null,
    lastTokensPerSecond: null,
    lastRequestAt: null,
    lastError: null
  };
}

function average(previousAverage, count, nextValue) {
  if (!Number.isFinite(nextValue)) return previousAverage;
  if (!Number.isFinite(previousAverage)) return nextValue;
  return previousAverage + (nextValue - previousAverage) / count;
}

export class LLMProvider {
  constructor({
    providerName,
    modelName,
    contextWindow = 8192,
    supportsStreaming = true,
    supportsJsonMode = false,
    supportsToolCalling = false,
    telemetry = new LLMTelemetry(),
    fetchImpl = globalThis.fetch
  }) {
    if (!providerName) throw new Error("providerName is required.");
    if (!modelName) throw new Error("modelName is required.");
    if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

    this.providerName = providerName;
    this.modelName = modelName;
    this.contextWindow = contextWindow;
    this.supportsStreaming = supportsStreaming;
    this.supportsJsonMode = supportsJsonMode;
    this.supportsToolCalling = supportsToolCalling;
    this.telemetry = telemetry;
    this.fetchImpl = fetchImpl;
    this.runtimeStats = createRuntimeStats();
  }

  estimateTokens(input) {
    return estimateTokens(input);
  }

  getMetadata() {
    return {
      providerName: this.providerName,
      modelName: this.modelName,
      contextWindow: this.contextWindow,
      supportsStreaming: this.supportsStreaming,
      supportsJsonMode: this.supportsJsonMode,
      supportsToolCalling: this.supportsToolCalling
    };
  }

  getRuntimeStats() {
    return { ...this.runtimeStats };
  }

  createRequestContext(messages, options = {}, streaming = false) {
    const requestId = options.requestId || randomUUID();
    const inputTokenEstimate = this.estimateTokens(messages);
    const startedAt = performance.now();
    const context = {
      requestId,
      startedAt,
      streaming,
      outputText: "",
      outputTokenEstimate: 0,
      firstTokenAt: null,
      inputTokenEstimate,
      agentRole: options.agentRole
    };

    this.runtimeStats.requestCount += 1;
    this.runtimeStats.inputTokenEstimateTotal += inputTokenEstimate;
    this.runtimeStats.lastRequestAt = new Date().toISOString();
    if (streaming) this.runtimeStats.streamingRequestCount += 1;

    this.telemetry.emitEvent(LLM_EVENT_TYPES.requestStarted, {
      requestId,
      provider: this.providerName,
      model: this.modelName,
      agentRole: options.agentRole,
      inputTokenEstimate,
      outputTokenEstimate: 0,
      latencyMs: 0
    });

    return context;
  }

  emitToken(context, token) {
    if (!context.firstTokenAt) {
      context.firstTokenAt = performance.now();
    }
    context.outputText += token;
    context.outputTokenEstimate = this.estimateTokens(context.outputText);
    this.telemetry.emitEvent(LLM_EVENT_TYPES.token, {
      requestId: context.requestId,
      provider: this.providerName,
      model: this.modelName,
      agentRole: context.agentRole,
      token,
      inputTokenEstimate: context.inputTokenEstimate,
      outputTokenEstimate: context.outputTokenEstimate,
      latencyMs: Math.round(performance.now() - context.startedAt),
      timeToFirstTokenMs: Math.round(context.firstTokenAt - context.startedAt)
    });
  }

  completeRequest(context, response = {}) {
    const endedAt = performance.now();
    const latencyMs = Math.round(endedAt - context.startedAt);
    const outputText = response.content ?? context.outputText ?? "";
    const outputTokenEstimate = response.outputTokenEstimate ?? this.estimateTokens(outputText);
    const timeToFirstTokenMs = context.firstTokenAt ? Math.round(context.firstTokenAt - context.startedAt) : null;
    const tokensPerSecond = latencyMs > 0 ? Number((outputTokenEstimate / (latencyMs / 1000)).toFixed(2)) : null;

    this.runtimeStats.outputTokenEstimateTotal += outputTokenEstimate;
    this.runtimeStats.lastLatencyMs = latencyMs;
    this.runtimeStats.averageLatencyMs = average(this.runtimeStats.averageLatencyMs, this.runtimeStats.requestCount, latencyMs);
    this.runtimeStats.lastTimeToFirstTokenMs = timeToFirstTokenMs;
    this.runtimeStats.lastTokensPerSecond = tokensPerSecond;
    this.runtimeStats.lastError = null;

    this.telemetry.emitEvent(LLM_EVENT_TYPES.requestCompleted, {
      requestId: context.requestId,
      provider: this.providerName,
      model: this.modelName,
      agentRole: context.agentRole,
      inputTokenEstimate: context.inputTokenEstimate,
      outputTokenEstimate,
      latencyMs,
      timeToFirstTokenMs,
      tokensPerSecond
    });

    return {
      requestId: context.requestId,
      provider: this.providerName,
      model: this.modelName,
      content: outputText,
      inputTokenEstimate: context.inputTokenEstimate,
      outputTokenEstimate,
      latencyMs,
      timeToFirstTokenMs,
      tokensPerSecond,
      raw: response.raw
    };
  }

  failRequest(context, error) {
    const latencyMs = Math.round(performance.now() - context.startedAt);
    const message = error?.message || String(error);
    this.runtimeStats.failedRequestCount += 1;
    this.runtimeStats.lastLatencyMs = latencyMs;
    this.runtimeStats.lastError = message;
    this.telemetry.emitEvent(LLM_EVENT_TYPES.requestFailed, {
      requestId: context.requestId,
      provider: this.providerName,
      model: this.modelName,
      agentRole: context.agentRole,
      inputTokenEstimate: context.inputTokenEstimate,
      outputTokenEstimate: context.outputTokenEstimate,
      latencyMs,
      error: message
    });
  }

  async generate() {
    throw new Error(`${this.providerName} does not implement generate().`);
  }

  async *stream() {
    throw new Error(`${this.providerName} does not implement stream().`);
  }

  async healthCheck() {
    return {
      ok: false,
      provider: this.providerName,
      model: this.modelName,
      error: "healthCheck() is not implemented."
    };
  }
}
