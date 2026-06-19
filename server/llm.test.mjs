import assert from "node:assert/strict";
import {
  LLMTelemetry,
  MockLLMProvider,
  OllamaProvider,
  createLLMProvider,
  estimateTokens,
  llmConfigFromEnv
} from "./llm/index.mjs";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

function streamResponse(text) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      }
    }),
    { status: 200 }
  );
}

async function collectStream(stream) {
  const tokens = [];
  for await (const token of stream) {
    tokens.push(token);
  }
  return tokens;
}

{
  const telemetry = new LLMTelemetry();
  const events = [];
  telemetry.on("event", (event) => events.push(event));
  const provider = new MockLLMProvider({ response: "hello cockpit", telemetry });
  const result = await provider.generate([{ role: "user", content: "Hello" }], { agentRole: "navigator" });

  assert.equal(provider.providerName, "mock");
  assert.equal(provider.supportsStreaming, true);
  assert.equal(provider.supportsJsonMode, true);
  assert.equal(result.content, "hello cockpit");
  assert.equal(events[0].type, "llm_request_started");
  assert.equal(events.at(-1).type, "llm_request_completed");
  assert.equal(provider.getRuntimeStats().requestCount, 1);
}

{
  const textEstimate = estimateTokens("This is a small local model prompt.");
  const messageEstimate = estimateTokens([
    { role: "system", content: "You are concise." },
    { role: "user", content: "Generate a TypeScript type." }
  ]);

  assert.ok(textEstimate > 0);
  assert.ok(messageEstimate > textEstimate / 2);
  assert.equal(estimateTokens(""), 0);
}

{
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      model: "qwen3-coder",
      message: { role: "assistant", content: "ok from ollama" },
      eval_count: 3
    });
  };
  const provider = new OllamaProvider({ modelName: "qwen3-coder", fetchImpl });
  const result = await provider.generate([{ role: "user", content: "Ping" }], { json: true, temperature: 0.1, maxTokens: 12 });
  const body = JSON.parse(calls[0].init.body);

  assert.equal(calls[0].url, "http://localhost:11434/api/chat");
  assert.equal(body.model, "qwen3-coder");
  assert.equal(body.format, "json");
  assert.equal(body.options.temperature, 0.1);
  assert.equal(body.options.num_predict, 12);
  assert.equal(result.content, "ok from ollama");
  assert.equal(result.outputTokenEstimate, 3);
}

{
  const telemetry = new LLMTelemetry();
  const events = [];
  telemetry.on("event", (event) => events.push(event));
  const fetchImpl = async () =>
    streamResponse(
      [
        JSON.stringify({ message: { content: "hel" }, done: false }),
        JSON.stringify({ message: { content: "lo" }, done: false }),
        JSON.stringify({ done: true, eval_count: 2 })
      ].join("\n")
    );

  const provider = new OllamaProvider({ modelName: "qwen3-coder", telemetry, fetchImpl });
  const tokens = await collectStream(provider.stream([{ role: "user", content: "Stream" }]));
  const tokenEvents = events.filter((event) => event.type === "llm_token");
  const completed = events.find((event) => event.type === "llm_request_completed");

  assert.deepEqual(tokens, ["hel", "lo"]);
  assert.equal(tokenEvents.length, 2);
  assert.equal(tokenEvents[0].token, "hel");
  assert.ok(Number.isFinite(completed.timeToFirstTokenMs));
  assert.ok(Number.isFinite(completed.tokensPerSecond));
}

{
  const config = llmConfigFromEnv({
    LLM_PROVIDER: "openai",
    LLM_MODEL: "local-coder",
    LLM_BASE_URL: "http://localhost:1234",
    LLM_API_KEY: "test-key",
    LLM_TEMPERATURE: "0.25",
    LLM_MAX_TOKENS: "2048"
  });
  const provider = createLLMProvider(config, { fetchImpl: async () => jsonResponse({ data: [] }) });

  assert.equal(config.provider, "openai_compatible");
  assert.equal(config.modelName, "local-coder");
  assert.equal(config.temperature, 0.25);
  assert.equal(config.maxTokens, 2048);
  assert.equal(provider.providerName, "openai_compatible");
}

console.log("LLM provider tests passed.");
