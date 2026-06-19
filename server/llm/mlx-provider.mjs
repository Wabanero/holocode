import { LLMProvider, normalizeBaseUrl } from "./base-provider.mjs";
import { assertOk, jsonHeaders, readJsonResponse, readNdjsonStream } from "./http-utils.mjs";

function toPrompt(messages) {
  return messages.map((message) => `${message.role || "user"}: ${message.content ?? ""}`).join("\n");
}

export class MLXProvider extends LLMProvider {
  constructor({
    baseURL = "http://localhost:8080",
    modelName = "qwen3-coder",
    contextWindow = 32768,
    telemetry,
    fetchImpl
  } = {}) {
    super({
      providerName: "mlx",
      modelName,
      contextWindow,
      supportsStreaming: true,
      supportsJsonMode: false,
      supportsToolCalling: false,
      telemetry,
      fetchImpl
    });
    this.baseURL = normalizeBaseUrl(baseURL);
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    try {
      const response = await this.fetchImpl(`${this.baseURL}/generate`, {
        method: "POST",
        headers: jsonHeaders(),
        signal: options.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages,
          prompt: toPrompt(messages),
          stream: false,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      const content = payload.content || payload.text || payload.response || "";
      return this.completeRequest(context, { content, raw: payload });
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async *stream(messages, options = {}) {
    const context = this.createRequestContext(messages, options, true);
    try {
      const response = await this.fetchImpl(`${this.baseURL}/generate`, {
        method: "POST",
        headers: jsonHeaders(),
        signal: options.signal,
        body: JSON.stringify({
          model: this.modelName,
          messages,
          prompt: toPrompt(messages),
          stream: true,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      });
      await assertOk(response, this.providerName);

      for await (const line of readNdjsonStream(response.body)) {
        const payload = JSON.parse(line);
        const token = payload.token || payload.text || payload.response || "";
        if (token) {
          this.emitToken(context, token);
          yield token;
        }
      }

      this.completeRequest(context);
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      const response = await this.fetchImpl(`${this.baseURL}/health`, { method: "GET" });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      return {
        ok: true,
        provider: this.providerName,
        model: this.modelName,
        raw: payload
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.providerName,
        model: this.modelName,
        error: error.message,
        note: "MLXProvider expects a future local MLX-LM or vllm-mlx compatible HTTP server."
      };
    }
  }
}
