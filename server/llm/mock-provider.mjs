import { LLMProvider } from "./base-provider.mjs";

export class MockLLMProvider extends LLMProvider {
  constructor({ modelName = "mock-model", response = "mock response", tokens = ["mock", " response"], telemetry, fetchImpl = fetch } = {}) {
    super({
      providerName: "mock",
      modelName,
      contextWindow: 4096,
      supportsStreaming: true,
      supportsJsonMode: true,
      supportsToolCalling: true,
      telemetry,
      fetchImpl
    });
    this.response = response;
    this.tokens = tokens;
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    try {
      return this.completeRequest(context, { content: this.response });
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async *stream(messages, options = {}) {
    const context = this.createRequestContext(messages, options, true);
    try {
      for (const token of this.tokens) {
        if (options.signal?.aborted) {
          throw new Error("Request aborted.");
        }
        this.emitToken(context, token);
        yield token;
      }
      this.completeRequest(context);
    } catch (error) {
      this.failRequest(context, error);
      throw error;
    }
  }

  async healthCheck() {
    return {
      ok: true,
      provider: this.providerName,
      model: this.modelName
    };
  }
}
