import { LLMProvider, normalizeBaseUrl } from "./base-provider.mjs";
import { assertOk, jsonHeaders, readJsonResponse, readNdjsonStream } from "./http-utils.mjs";

function toOllamaOptions(options) {
  return {
    ...(Number.isFinite(options.temperature) ? { temperature: Number(options.temperature) } : {}),
    ...(Number.isFinite(options.maxTokens) ? { num_predict: Number(options.maxTokens) } : {})
  };
}

export class OllamaProvider extends LLMProvider {
  constructor({
    baseURL = "http://localhost:11434",
    modelName = "qwen3-coder",
    contextWindow = 32768,
    telemetry,
    fetchImpl
  } = {}) {
    super({
      providerName: "ollama",
      modelName,
      contextWindow,
      supportsStreaming: true,
      supportsJsonMode: true,
      supportsToolCalling: false,
      telemetry,
      fetchImpl
    });
    this.baseURL = normalizeBaseUrl(baseURL);
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    try {
      const response = await this.fetchImpl(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: jsonHeaders(),
        signal: options.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream: false,
          options: toOllamaOptions(options),
          ...(options.json ? { format: "json" } : {})
        })
      });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      const content = payload?.message?.content || payload?.response || "";
      return this.completeRequest(context, {
        content,
        outputTokenEstimate: payload?.eval_count,
        raw: payload
      });
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async *stream(messages, options = {}) {
    const context = this.createRequestContext(messages, options, true);
    try {
      const response = await this.fetchImpl(`${this.baseURL}/api/chat`, {
        method: "POST",
        headers: jsonHeaders(),
        signal: options.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages,
          stream: true,
          options: toOllamaOptions(options),
          ...(options.json ? { format: "json" } : {})
        })
      });
      await assertOk(response, this.providerName);

      let finalPayload = null;
      for await (const line of readNdjsonStream(response.body)) {
        const payload = JSON.parse(line);
        finalPayload = payload;
        const token = payload?.message?.content || payload?.response || "";
        if (token) {
          this.emitToken(context, token);
          yield token;
        }
      }

      this.completeRequest(context, {
        outputTokenEstimate: finalPayload?.eval_count,
        raw: finalPayload
      });
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await this.fetchImpl(`${this.baseURL}/api/tags`, { method: "GET" });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      return {
        ok: true,
        provider: this.providerName,
        model: this.modelName,
        models: Array.isArray(payload.models) ? payload.models.map((model) => model.name) : []
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.providerName,
        model: this.modelName,
        error: error.message
      };
    }
  }
}
