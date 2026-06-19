import { LLMProvider, normalizeBaseUrl } from "./base-provider.mjs";
import { assertOk, jsonHeaders, readJsonResponse, readSseStream } from "./http-utils.mjs";

function splitSystemMessage(messages) {
  const system = messages.find((message) => message.role === "system")?.content;
  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? "")
    }));
  return { system, messages: anthropicMessages };
}

function toAnthropicRequest(provider, messages, options, stream) {
  const split = splitSystemMessage(messages);
  return {
    model: provider.modelName,
    messages: split.messages,
    stream,
    max_tokens: Number.isFinite(options.maxTokens) ? Number(options.maxTokens) : 1024,
    ...(split.system ? { system: split.system } : {}),
    ...(Number.isFinite(options.temperature) ? { temperature: Number(options.temperature) } : {})
  };
}

export class AnthropicProvider extends LLMProvider {
  constructor({
    baseURL = "https://api.anthropic.com",
    apiKey = "",
    modelName = "claude-3-5-sonnet-latest",
    contextWindow = 200000,
    telemetry,
    fetchImpl
  } = {}) {
    super({
      providerName: "anthropic",
      modelName,
      contextWindow,
      supportsStreaming: true,
      supportsJsonMode: false,
      supportsToolCalling: false,
      telemetry,
      fetchImpl
    });
    this.baseURL = normalizeBaseUrl(baseURL);
    this.apiKey = apiKey;
  }

  headers() {
    return jsonHeaders(null, {
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01"
    });
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    try {
      const response = await this.fetchImpl(`${this.baseURL}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        signal: options.signal,
        body: JSON.stringify(toAnthropicRequest(this, messages, options, false))
      });
      await assertOk(response, this.providerName);
      const payload = await readJsonResponse(response);
      const content = Array.isArray(payload.content)
        ? payload.content.map((block) => block.text || "").join("")
        : "";
      return this.completeRequest(context, {
        content,
        outputTokenEstimate: payload?.usage?.output_tokens,
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
      const response = await this.fetchImpl(`${this.baseURL}/v1/messages`, {
        method: "POST",
        headers: this.headers(),
        signal: options.signal,
        body: JSON.stringify(toAnthropicRequest(this, messages, options, true))
      });
      await assertOk(response, this.providerName);

      for await (const data of readSseStream(response.body)) {
        const payload = JSON.parse(data);
        const token = payload?.type === "content_block_delta" ? payload?.delta?.text || "" : "";
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
    return {
      ok: Boolean(this.apiKey),
      provider: this.providerName,
      model: this.modelName,
      note: "Anthropic is implemented through the Messages HTTP API; JSON mode and tool calling are disabled until cockpit agents need them."
    };
  }
}
