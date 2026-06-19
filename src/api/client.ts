import type {
  AgentResult,
  AgentRunSnapshot,
  CodeGraph,
  DebugSessionSnapshot,
  GitDiffSnapshot,
  GitStatusSnapshot,
  LspDiagnosticsSnapshot,
  LspDocumentSymbol,
  LspHover,
  LspLocation,
  LspRenamePreview,
  PatchActionResponse,
  RunCommandName,
  VRGraphExport,
  WorkspaceSession
} from "../types";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.error || response.statusText);
  }

  return response.json() as Promise<T>;
}

export function fetchGraph() {
  return requestJson<CodeGraph>("/api/graph");
}

export function scanGraph() {
  return requestJson<{ ok: true; graph: CodeGraph }>("/api/scan", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function fetchGraphStats() {
  return requestJson<{ stats: CodeGraph["stats"] }>("/api/graph/stats");
}

export function fetchVRGraphExport(options: { changed?: boolean } = {}) {
  const query = new URLSearchParams({ changed: String(Boolean(options.changed)) });
  return requestJson<VRGraphExport>(`/api/graph/export?${query.toString()}`);
}

export function queryGraphContext(payload: { task: string; hints?: Record<string, unknown> }) {
  return requestJson<{ ok: true; context: unknown }>("/api/graph/query", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchGraphBlastRadius(changedFiles: string[]) {
  return requestJson<{ ok: true; blastRadius: unknown }>("/api/graph/blast-radius", {
    method: "POST",
    body: JSON.stringify({ changedFiles })
  });
}

export function rebuildGraph() {
  return requestJson<{ ok: true; graph: CodeGraph; stats: CodeGraph["stats"] }>("/api/graph/rebuild", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function importExternalGraph(graph: unknown, providerType = "external_json") {
  return requestJson<{ ok: true; graph: CodeGraph; stats: CodeGraph["stats"]; validation?: unknown }>("/api/graph/import", {
    method: "POST",
    body: JSON.stringify({ graph, providerType })
  });
}

export function rebuildExternalGraph() {
  return requestJson<{ ok: true; graph: CodeGraph; stats: CodeGraph["stats"]; validation?: unknown }>("/api/graph/rebuild-external", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function fetchFile(path: string) {
  const query = new URLSearchParams({ path });
  return requestJson<{ path: string; content: string }>(`/api/files/read?${query.toString()}`);
}

export function saveFile(path: string, content: string) {
  return requestJson<{ ok: true; path: string; graph: CodeGraph; git?: GitDiffSnapshot | { error: string; diff: ""; changedFiles: [] } }>(
    "/api/files/save",
    {
      method: "POST",
      body: JSON.stringify({ path, content })
    }
  );
}

export function fetchGitStatus() {
  return requestJson<GitStatusSnapshot>("/api/git/status");
}

export function fetchGitDiff() {
  return requestJson<GitDiffSnapshot>("/api/git/diff");
}

export function fetchGitDiffSummary() {
  return requestJson<Pick<GitDiffSnapshot, "changedFiles">>("/api/git/diff-summary");
}

export function fetchLspDiagnostics() {
  return requestJson<LspDiagnosticsSnapshot>("/api/lsp/diagnostics");
}

export function fetchDocumentSymbols(path: string) {
  const query = new URLSearchParams({ path });
  return requestJson<{ path: string; symbols: LspDocumentSymbol[] }>(`/api/lsp/document-symbols?${query.toString()}`);
}

export function fetchHover(path: string, line: number, column: number) {
  const query = new URLSearchParams({ path, line: String(line), column: String(column) });
  return requestJson<LspHover>(`/api/lsp/hover?${query.toString()}`);
}

export function fetchDefinition(path: string, line: number, column: number) {
  const query = new URLSearchParams({ path, line: String(line), column: String(column) });
  return requestJson<{ path: string; line: number; column: number; locations: LspLocation[] }>(
    `/api/lsp/definition?${query.toString()}`
  );
}

export function fetchReferences(path: string, line: number, column: number) {
  const query = new URLSearchParams({ path, line: String(line), column: String(column) });
  return requestJson<{ path: string; line: number; column: number; locations: LspLocation[] }>(
    `/api/lsp/references?${query.toString()}`
  );
}

export function fetchRenamePreview(path: string, line: number, column: number, newName: string) {
  return requestJson<LspRenamePreview>("/api/lsp/rename-preview", {
    method: "POST",
    body: JSON.stringify({ path, line, column, newName })
  });
}

export function fetchDebugState() {
  return requestJson<DebugSessionSnapshot>("/api/debug/state");
}

export function addDebugBreakpoint(path: string, line: number) {
  return requestJson<DebugSessionSnapshot>("/api/debug/breakpoints/add", {
    method: "POST",
    body: JSON.stringify({ path, line })
  });
}

export function removeDebugBreakpoint(path: string, line: number) {
  return requestJson<DebugSessionSnapshot>("/api/debug/breakpoints/remove", {
    method: "POST",
    body: JSON.stringify({ path, line })
  });
}

export function startDebugSession(path: string, line?: number) {
  return requestJson<DebugSessionSnapshot>("/api/debug/start", {
    method: "POST",
    body: JSON.stringify({ path, line })
  });
}

export function stepOverDebug() {
  return requestJson<DebugSessionSnapshot>("/api/debug/step-over", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function stepIntoDebug() {
  return requestJson<DebugSessionSnapshot>("/api/debug/step-into", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function continueDebugSession() {
  return requestJson<DebugSessionSnapshot>("/api/debug/continue", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function addDebugWatch(expression: string) {
  return requestJson<DebugSessionSnapshot>("/api/debug/watches/add", {
    method: "POST",
    body: JSON.stringify({ expression })
  });
}

export function saveLegacyFile(path: string, content: string) {
  return requestJson<{ ok: true; path: string; graph: CodeGraph }>("/api/file", {
    method: "POST",
    body: JSON.stringify({ path, content })
  });
}

export function createAgentTask(payload: {
  goal: string;
  selectedFiles: string[];
  selectedFunctions: Array<{ name: string; path: string; line: number }>;
}) {
  return requestJson<{
    ok: true;
    taskId: string;
    taskFile: string;
    content: string;
    results: AgentResult[];
  }>("/api/agent-task", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchAgentResults() {
  return requestJson<{ results: AgentResult[] }>("/api/agent-results");
}

export function fetchAgentRuns() {
  return requestJson<{ runs: AgentRunSnapshot[] }>("/api/agent/runs");
}

export function fetchAgentWorkflowRuns() {
  return requestJson<{ runs: unknown[]; graph: { nodes: string[]; edges: unknown[] } }>("/api/agent/workflow/runs");
}

export function fetchAgentTelemetry() {
  return requestJson<{
    resources?: unknown;
    provider?: unknown;
    graph?: unknown;
    runs?: unknown[];
  }>("/api/agent/telemetry");
}

export function cancelAgentWorkflow(taskId: string) {
  return requestJson<{ ok: boolean; runs: unknown[] }>("/api/agent/workflow/cancel", {
    method: "POST",
    body: JSON.stringify({ taskId })
  });
}

export function runAgent(taskId: string) {
  return requestJson<{ ok: true; run: AgentRunSnapshot; runs: AgentRunSnapshot[]; results: AgentResult[] }>("/api/agent/run", {
    method: "POST",
    body: JSON.stringify({ taskId })
  });
}

export function validatePatch(diffPath: string) {
  return requestJson<PatchActionResponse>("/api/patch/validate", {
    method: "POST",
    body: JSON.stringify({ diffPath })
  });
}

export function applyPatch(diffPath: string, mode = "new-branch") {
  return requestJson<PatchActionResponse>("/api/patch/apply", {
    method: "POST",
    body: JSON.stringify({ diffPath, mode })
  });
}

export function rejectPatch(diffPath: string) {
  return requestJson<PatchActionResponse>("/api/patch/reject", {
    method: "POST",
    body: JSON.stringify({ diffPath })
  });
}

export function fetchWorkspaceSession() {
  return requestJson<{ session: WorkspaceSession | null; path: string }>("/api/session");
}

export function saveWorkspaceSession(session: WorkspaceSession) {
  return requestJson<{ ok: true; session: WorkspaceSession; path: string }>("/api/session", {
    method: "POST",
    body: JSON.stringify({ session })
  });
}

export function resetWorkspaceSession() {
  return requestJson<{ ok: true; path: string }>("/api/session/reset", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function runCommand(command: RunCommandName) {
  return requestJson<{ ok: true; command: RunCommandName; output: string; graph?: CodeGraph; gitStatus?: GitStatusSnapshot }>(
    "/api/run",
    {
      method: "POST",
      body: JSON.stringify({ command })
    }
  );
}
