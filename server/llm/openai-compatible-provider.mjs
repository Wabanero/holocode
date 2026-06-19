import { LLMProvider, normalizeBaseUrl } from "./base-provider.mjs";
import { assertOk, jsonHeaders, readJsonResponse, readSseStream } from "./http-utils.mjs";

function endpointFor(baseURL) {
  return `${normalizeBaseUrl(baseURL)}/v1/chat/completions`;
}

function toOpenAIRequest(provider, messages, options, stream) {
  return {
    model: provider.modelName,
    messages,
    stream,
    ...(Number.isFinite(options.temperature) ? { temperature: Number(options.temperature) } : {}),
    ...(Number.isFinite(options.maxTokens) ? { max_tokens: Number(options.maxTokens) } : {}),
    ...(options.json && provider.supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(options.tools && provider.supportsToolCalling ? { tools: options.tools } : {})
  };
}

export class OpenAICompatibleProvider extends LLMProvider {
  constructor({
    baseURL = "https://api.openai.com",
    apiKey = "",
    modelName = "gpt-4.1-mini",
    contextWindow = 128000,
    supportsJsonMode = true,
    supportsToolCalling = true,
    telemetry,
    fetchImpl
  } = {}) {
    super({
      providerName: "openai_compatible",
      modelName,
      contextWindow,
      supportsStreaming: true,
      supportsJsonMode,
      supportsToolCalling,
      telemetry,
      fetchImpl
    });
    this.baseURL = normalizeBaseUrl(baseURL);
    this.apiKey = apiKey;
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    try {
      const response = await this.fetchImpl(endpointFor(this.baseURL), {
        method: "POST",
        headers: jsonHeaders(this.apiKey),
        signal: options.signal,
        body: JSON.stringify(toOpenAIRequest(this, messages, options, false))
      });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      const content = payload?.choices?.[0]?.message?.content || "";
      return this.completeRequest(context, {
        content,
        outputTokenEstimate: payload?.usage?.completion_tokens,
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
      const response = await this.fetchImpl(endpointFor(this.baseURL), {
        method: "POST",
        headers: jsonHeaders(this.apiKey),
        signal: options.signal,
        body: JSON.stringify(toOpenAIRequest(this, messages, options, true))
      });
      await assertOk(response, this.providerName);

      for await (const data of readSseStream(response.body)) {
        if (data === "[DONE]") break;
        const payload = JSON.parse(data);
        const token = payload?.choices?.[0]?.delta?.content || "";
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
      const response = await this.fetchImpl(`${this.baseURL}/v1/models`, {
        method: "GET",
        headers: jsonHeaders(this.apiKey)
      });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      return {
        ok: true,
        provider: this.providerName,
        model: this.modelName,
        models: Array.isArray(payload.data) ? payload.data.map((model) => model.id) : []
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
