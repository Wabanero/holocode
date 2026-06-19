import { promises as fs } from "node:fs";
import path from "node:path";
import { OllamaProvider } from "./ollama-provider.mjs";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.mjs";
import { AnthropicProvider } from "./anthropic-provider.mjs";
import { MLXProvider } from "./mlx-provider.mjs";

const PROVIDERS = new Set(["ollama", "openai_compatible", "anthropic", "mlx"]);

function numberFrom(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeProviderName(value) {
  const provider = String(value || "ollama").trim().toLowerCase();
  if (provider === "openai") return "openai_compatible";
  return PROVIDERS.has(provider) ? provider : "ollama";
}

export function llmConfigFromEnv(env = process.env) {
  return {
    provider: normalizeProviderName(env.LLM_PROVIDER),
    modelName: env.LLM_MODEL || "qwen3-coder",
    baseURL: env.LLM_BASE_URL || "",
    apiKey: env.LLM_API_KEY || "",
    temperature: numberFrom(env.LLM_TEMPERATURE, undefined),
    maxTokens: numberFrom(env.LLM_MAX_TOKENS, undefined)
  };
}

export async function readLLMConfig({ workspaceRoot, env = process.env } = {}) {
  const envConfig = llmConfigFromEnv(env);
  if (!workspaceRoot) return envConfig;

  const configPath = path.join(workspaceRoot, "holocode.config.json");
  const fileConfig = await fs
    .readFile(configPath, "utf8")
    .then((raw) => JSON.parse(raw).llm || {})
    .catch((error) => {
      if (error.code === "ENOENT") return {};
      throw new Error(`Invalid holocode.config.json llm config: ${error.message}`);
    });

  return {
    ...envConfig,
    ...fileConfig,
    provider: normalizeProviderName(env.LLM_PROVIDER || fileConfig.provider),
    modelName: env.LLM_MODEL || fileConfig.modelName || envConfig.modelName,
    baseURL: env.LLM_BASE_URL || fileConfig.baseURL || envConfig.baseURL,
    apiKey: env.LLM_API_KEY || fileConfig.apiKey || envConfig.apiKey,
    temperature: numberFrom(env.LLM_TEMPERATURE, fileConfig.temperature ?? envConfig.temperature),
    maxTokens: numberFrom(env.LLM_MAX_TOKENS, fileConfig.maxTokens ?? envConfig.maxTokens)
  };
}

export function createLLMProvider(config = {}, dependencies = {}) {
  const provider = normalizeProviderName(config.provider);
  const common = {
    modelName: config.modelName || "qwen3-coder",
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    contextWindow: config.contextWindow,
    telemetry: dependencies.telemetry,
    fetchImpl: dependencies.fetchImpl
  };

  if (provider === "openai_compatible") {
    return new OpenAICompatibleProvider({
      ...common,
      baseURL: common.baseURL || "https://api.openai.com"
    });
  }

  if (provider === "anthropic") {
    return new AnthropicProvider({
      ...common,
      baseURL: common.baseURL || "https://api.anthropic.com"
    });
  }

  if (provider === "mlx") {
    return new MLXProvider({
      ...common,
      baseURL: common.baseURL || "http://localhost:8080"
    });
  }

  return new OllamaProvider({
    ...common,
    baseURL: common.baseURL || "http://localhost:11434"
  });
}

export function requestOptionsFromConfig(config = {}, options = {}) {
  return {
    ...(Number.isFinite(config.temperature) ? { temperature: config.temperature } : {}),
    ...(Number.isFinite(config.maxTokens) ? { maxTokens: config.maxTokens } : {}),
    ...options
  };
}
