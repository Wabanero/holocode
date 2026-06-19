# LLM Providers

HoloCode Cockpit uses a provider-agnostic LLM layer under `server/llm`. It exposes one `LLMProvider` interface for generate calls, streaming token output, JSON mode where supported, provider metadata, token estimates, request metrics, cancellation through `AbortSignal`, health checks, and model capability flags.

## Configuration

You can configure the provider in `holocode.config.json`:

```json
{
  "llm": {
    "provider": "ollama",
    "modelName": "qwen3-coder",
    "baseURL": "http://localhost:11434",
    "temperature": 0.2,
    "maxTokens": 4096
  }
}
```

Environment variables override the config file:

```powershell
$env:LLM_PROVIDER = "ollama"
$env:LLM_MODEL = "qwen3-coder"
$env:LLM_BASE_URL = "http://localhost:11434"
$env:LLM_TEMPERATURE = "0.2"
$env:LLM_MAX_TOKENS = "4096"
```

Supported values for `LLM_PROVIDER` are `ollama`, `openai_compatible`, `anthropic`, and `mlx`.

## Ollama

Install and run Ollama, then pull a coding model:

```powershell
ollama pull qwen3-coder
ollama serve
```

Use this local Qwen3-Coder example:

```powershell
$env:LLM_PROVIDER = "ollama"
$env:LLM_MODEL = "qwen3-coder"
$env:LLM_BASE_URL = "http://localhost:11434"
```

`OllamaProvider` uses the native `/api/chat` endpoint and supports streaming plus native JSON formatting through `format: "json"`.

## OpenAI-Compatible APIs

Use `OpenAICompatibleProvider` for OpenAI itself or local gateways that expose `/v1/chat/completions`:

```powershell
$env:LLM_PROVIDER = "openai_compatible"
$env:LLM_MODEL = "gpt-4.1-mini"
$env:LLM_BASE_URL = "https://api.openai.com"
$env:LLM_API_KEY = "..."
```

For a local gateway:

```powershell
$env:LLM_PROVIDER = "openai_compatible"
$env:LLM_MODEL = "qwen3-coder"
$env:LLM_BASE_URL = "http://localhost:1234"
$env:LLM_API_KEY = "local-key-if-required"
```

The provider supports streaming, JSON response mode, and tool-call payload forwarding when the gateway supports them.

## Anthropic

`AnthropicProvider` is implemented with the Messages HTTP API and no SDK dependency:

```powershell
$env:LLM_PROVIDER = "anthropic"
$env:LLM_MODEL = "claude-3-5-sonnet-latest"
$env:LLM_BASE_URL = "https://api.anthropic.com"
$env:LLM_API_KEY = "..."
```

Structured JSON mode and tool calling are intentionally disabled in the provider flags until agent orchestration needs those paths.

## MLX

`MLXProvider` is a clean local-server stub for future Apple Silicon integration. It assumes an external server that accepts `POST /generate` and optionally `GET /health`:

```powershell
$env:LLM_PROVIDER = "mlx"
$env:LLM_MODEL = "qwen3-coder"
$env:LLM_BASE_URL = "http://localhost:8080"
```

The intended future backend is an MLX-LM or vllm-mlx HTTP service that maps the cockpit request body to the local model runtime. The cockpit provider already sends `messages`, a flattened `prompt`, `stream`, `temperature`, and `max_tokens`.

## Telemetry

Every provider emits these events through `LLMTelemetry`:

- `llm_request_started`
- `llm_token`
- `llm_request_completed`
- `llm_request_failed`

Events include `requestId`, `provider`, `model`, optional `agentRole`, token estimates, `latencyMs`, streaming first-token timing, computed tokens per second, and failure details.
