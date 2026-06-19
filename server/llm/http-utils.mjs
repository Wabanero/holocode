export async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

export async function assertOk(response, providerName) {
  if (response.ok) return;
  const payload = await readJsonResponse(response);
  const detail = payload?.error?.message || payload?.error || payload?.message || payload?.text || response.statusText;
  throw new Error(`${providerName} request failed (${response.status}): ${detail}`);
}

export async function* readNdjsonStream(body) {
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) yield trimmed;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) yield buffer.trim();
}

export async function* readSseStream(body) {
  for await (const line of readNdjsonStream(body)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data) yield data;
  }
}

export function jsonHeaders(apiKey, extraHeaders = {}) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extraHeaders
  };
}

export function mergeAbortSignals(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const controller = new AbortController();
  const abort = () => controller.abort(primary.reason || secondary.reason);
  if (primary.aborted || secondary.aborted) {
    abort();
    return controller.signal;
  }
  primary.addEventListener("abort", abort, { once: true });
  secondary.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
