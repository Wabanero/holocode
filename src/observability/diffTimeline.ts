import type {
  AgentResult,
  AgentRunSnapshot,
  DiffChangedFile,
  LspFileSummary,
  PatchState
} from "../types";

export type DiffTimelineEventKind =
  | "task_created"
  | "agent_run_started"
  | "agent_log_event"
  | "patch_detected"
  | "patch_validated"
  | "patch_validation_failed"
  | "patch_apply_blocked"
  | "patch_applied"
  | "patch_rejected"
  | "git_diff_changed"
  | "diagnostic_changed"
  | "test_result_changed";

export type DiffTimelineSource = "git" | "agent" | "patch" | "diagnostic" | "test" | "terminal";

export type DiffTimelineView = "current" | "patch-lineage" | "compare-attempts";

export type DiffTimelineEvent = {
  id: string;
  kind: DiffTimelineEventKind;
  source: DiffTimelineSource;
  order: number;
  label: string;
  message: string;
  at?: string | null;
  taskId?: string | null;
  filePath?: string | null;
  status?: "pending" | "success" | "failed" | "blocked" | "rejected" | "applied" | "info";
  metadata?: Record<string, string | number | boolean | null>;
};

export type DiffHunkSummary = {
  id: string;
  filePath: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  additions: number;
  deletions: number;
  source: "git" | "agent";
  taskId?: string | null;
  eventIds: string[];
};

export type DiffTimelineFile = {
  path: string;
  status: DiffChangedFile["status"] | "unknown";
  additions: number;
  deletions: number;
  source: "git" | "agent";
  taskId?: string | null;
};

export type DiffValidationGateState =
  | { state: "none"; label: "No patch"; message: string }
  | { state: "pending"; label: "Pending"; message: string; output?: string | null }
  | { state: "open"; label: "Validated"; message: string; output?: string | null }
  | { state: "closed"; label: "Invalid"; message: string; output?: string | null }
  | { state: "locked"; label: "Dirty tree"; message: string; output?: string | null }
  | { state: "applied"; label: "Applied"; message: string; output?: string | null; branch?: string | null }
  | { state: "rejected"; label: "Rejected"; message: string; output?: string | null };

export type DiffTimeline = {
  id: string;
  generatedAt: string;
  view: DiffTimelineView;
  mode: "git" | "agent" | "compare" | "empty";
  title: string;
  taskId?: string | null;
  diffPath?: string | null;
  events: DiffTimelineEvent[];
  hunks: DiffHunkSummary[];
  files: DiffTimelineFile[];
  gate: DiffValidationGateState;
  selectedAgentResult?: AgentResult | null;
  warnings: string[];
};

export type DiffTimelineInput = {
  view: DiffTimelineView;
  currentDiff: string;
  activeDiff: string;
  activeDiffFile: string | null;
  diffSummary: DiffChangedFile[];
  agentResults: AgentResult[];
  agentRuns: AgentRunSnapshot[];
  currentAgentTaskId: string | null;
  diagnostics: LspFileSummary[];
  terminalLines: string[];
};

const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "diff";
}

function normalizeSlash(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function shortText(value: string, max = 140) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function parseDiffHeader(line: string) {
  const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!match) return null;
  return normalizeSlash(match[2] === "/dev/null" ? match[1] : match[2]);
}

function statusFromSection(lines: string[], fallback?: DiffChangedFile["status"]): DiffChangedFile["status"] | "unknown" {
  if (lines.some((line) => line.startsWith("new file mode"))) return "added";
  if (lines.some((line) => line.startsWith("deleted file mode"))) return "deleted";
  if (lines.some((line) => line.startsWith("rename from ") || line.startsWith("rename to "))) return "renamed";
  return fallback || "modified";
}

export function parseUnifiedDiff(
  diff: string,
  source: "git" | "agent",
  summary: DiffChangedFile[] = [],
  taskId?: string | null
) {
  const summaryByPath = new Map(summary.map((file) => [normalizeSlash(file.path), file]));
  const lines = diff.split(/\r?\n/);
  const files = new Map<string, DiffTimelineFile>();
  const hunks: DiffHunkSummary[] = [];
  let currentPath: string | null = null;
  let currentSection: string[] = [];
  let currentHunk: DiffHunkSummary | null = null;

  function flushSection() {
    if (!currentPath) return;
    const known = summaryByPath.get(currentPath);
    if (!files.has(currentPath)) {
      files.set(currentPath, {
        path: currentPath,
        status: statusFromSection(currentSection, known?.status),
        additions: known?.additions || currentSection.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
        deletions: known?.deletions || currentSection.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
        source,
        taskId
      });
    }
  }

  for (const line of lines) {
    const nextPath = parseDiffHeader(line);
    if (nextPath) {
      flushSection();
      currentPath = nextPath;
      currentSection = [line];
      currentHunk = null;
      continue;
    }

    if (!currentPath) continue;
    currentSection.push(line);

    const hunkMatch = line.match(HUNK_RE);
    if (hunkMatch) {
      currentHunk = {
        id: `hunk:${safeIdPart(taskId || source)}:${safeIdPart(currentPath)}:${hunks.length}`,
        filePath: currentPath,
        header: line,
        oldStart: Number(hunkMatch[1]),
        oldLines: Number(hunkMatch[2] || 1),
        newStart: Number(hunkMatch[3]),
        newLines: Number(hunkMatch[4] || 1),
        additions: 0,
        deletions: 0,
        source,
        taskId,
        eventIds: []
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) currentHunk.additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) currentHunk.deletions += 1;
  }
  flushSection();

  for (const known of summary) {
    const path = normalizeSlash(known.path);
    if (!files.has(path)) {
      files.set(path, {
        path,
        status: known.status,
        additions: known.additions,
        deletions: known.deletions,
        source,
        taskId
      });
    }
  }

  return { files: [...files.values()], hunks };
}

function selectedAgentResult(input: DiffTimelineInput) {
  const withDiff = input.agentResults.filter((result) => result.diff);
  if (!withDiff.length) return null;
  if (input.activeDiff) {
    const exact = withDiff.find((result) => result.diff === input.activeDiff);
    if (exact) return exact;
  }
  if (input.currentAgentTaskId) {
    const current = withDiff.find((result) => result.taskId === input.currentAgentTaskId);
    if (current) return current;
  }
  return withDiff.at(-1) || null;
}

function runForTask(runs: AgentRunSnapshot[], taskId: string | null | undefined) {
  if (!taskId) return null;
  return runs.find((run) => run.taskId === taskId) || null;
}

function gateForPatch(patchState: PatchState | null | undefined, hasDirtyTree: boolean): DiffValidationGateState {
  if (!patchState) return { state: "none", label: "No patch", message: "No agent patch state is selected." };
  const message = patchState.message || patchState.output || "Patch state is recorded.";
  const output = patchState.output || patchState.message || null;
  if (patchState.status === "validated") {
    if (hasDirtyTree) {
      return {
        state: "locked",
        label: "Dirty tree",
        message: "Patch validates, but the existing apply path requires a clean working tree.",
        output
      };
    }
    return { state: "open", label: "Validated", message, output };
  }
  if (patchState.status === "applied") return { state: "applied", label: "Applied", message, output, branch: patchState.branch || null };
  if (patchState.status === "rejected") return { state: "rejected", label: "Rejected", message, output };
  if (patchState.status === "failed") {
    const blocked = /working tree is not clean|commit, stash, or discard/i.test(message);
    return blocked
      ? { state: "locked", label: "Dirty tree", message, output }
      : { state: "closed", label: "Invalid", message, output };
  }
  return { state: "pending", label: "Pending", message, output };
}

function patchStateEvent(task: AgentResult, gate: DiffValidationGateState, order: number): DiffTimelineEvent | null {
  const state = task.patchState;
  if (!state || state.status === "pending") return null;
  if (state.status === "validated") {
    return {
      id: `event:${task.taskId}:patch_validated`,
      kind: gate.state === "locked" ? "patch_apply_blocked" : "patch_validated",
      source: "patch",
      order,
      label: gate.state === "locked" ? "Apply blocked" : "Patch validated",
      message: gate.message,
      at: state.updatedAt,
      taskId: task.taskId,
      status: gate.state === "locked" ? "blocked" : "success"
    };
  }
  if (state.status === "applied") {
    return {
      id: `event:${task.taskId}:patch_applied`,
      kind: "patch_applied",
      source: "patch",
      order,
      label: "Patch applied",
      message: state.branch ? `Patch applied on ${state.branch}.` : gate.message,
      at: state.updatedAt,
      taskId: task.taskId,
      status: "applied",
      metadata: { branch: state.branch || null }
    };
  }
  if (state.status === "rejected") {
    return {
      id: `event:${task.taskId}:patch_rejected`,
      kind: "patch_rejected",
      source: "patch",
      order,
      label: "Patch rejected",
      message: gate.message,
      at: state.updatedAt,
      taskId: task.taskId,
      status: "rejected"
    };
  }
  return {
    id: `event:${task.taskId}:patch_failed`,
    kind: gate.state === "locked" ? "patch_apply_blocked" : "patch_validation_failed",
    source: "patch",
    order,
    label: gate.state === "locked" ? "Apply blocked" : "Validation failed",
    message: gate.message,
    at: state.updatedAt,
    taskId: task.taskId,
    status: gate.state === "locked" ? "blocked" : "failed"
  };
}

function diagnosticEvents(paths: string[], diagnostics: LspFileSummary[], order: number, taskId?: string | null) {
  const pathSet = new Set(paths);
  return diagnostics
    .filter((summary) => pathSet.has(summary.path))
    .map((summary, index): DiffTimelineEvent => ({
      id: `event:${taskId || "git"}:diagnostic:${safeIdPart(summary.path)}:${index}`,
      kind: "diagnostic_changed",
      source: "diagnostic",
      order: order + index / 100,
      label: summary.errors ? "Diagnostics error" : summary.warnings ? "Diagnostics warning" : "Diagnostics state",
      message: `Current diagnostics on ${summary.path}: ${summary.errors} errors, ${summary.warnings} warnings.`,
      filePath: summary.path,
      taskId,
      status: summary.errors ? "failed" : summary.warnings ? "blocked" : "info"
    }));
}

function testEvents(paths: string[], terminalLines: string[], order: number, taskId?: string | null) {
  const relevant = terminalLines
    .filter((line) => /\b(test|vitest|jest|playwright|lint)\b/i.test(line) && /\b(pass|passed|fail|failed|error|ok)\b/i.test(line))
    .slice(-3);
  return relevant.map((line, index): DiffTimelineEvent => ({
    id: `event:${taskId || "git"}:test:${index}`,
    kind: "test_result_changed",
    source: "terminal",
    order: order + index / 100,
    label: /fail|error/i.test(line) ? "Test/lint failed" : "Test/lint observed",
    message: shortText(line, 180),
    taskId,
    status: /fail|error/i.test(line) ? "failed" : "success",
    metadata: { affectedFiles: paths.length }
  }));
}

function sortEvents(events: DiffTimelineEvent[]) {
  return [...events].sort((a, b) => {
    const aTime = a.at ? new Date(a.at).getTime() : NaN;
    const bTime = b.at ? new Date(b.at).getTime() : NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    return a.order - b.order;
  });
}

function wireHunksToEvents(hunks: DiffHunkSummary[], eventIds: string[]) {
  return hunks.map((hunk) => ({ ...hunk, eventIds }));
}

function buildAgentTimeline(input: DiffTimelineInput, task: AgentResult): DiffTimeline {
  const run = runForTask(input.agentRuns, task.taskId);
  const parsed = parseUnifiedDiff(task.diff, "agent", [], task.taskId);
  const changedPaths = unique(parsed.files.map((file) => file.path));
  const gate = gateForPatch(task.patchState, input.diffSummary.length > 0);
  const events: DiffTimelineEvent[] = [
    {
      id: `event:${task.taskId}:task_created`,
      kind: "task_created",
      source: "agent",
      order: 1,
      label: "Task created",
      message: shortText(task.task || `Agent task ${task.taskId}`),
      taskId: task.taskId,
      status: "info",
      metadata: { taskFile: task.taskFile }
    }
  ];

  if (run?.startedAt) {
    events.push({
      id: `event:${task.taskId}:agent_run_started`,
      kind: "agent_run_started",
      source: "agent",
      order: 2,
      label: "Agent run started",
      message: run.displayCommand || run.command,
      at: run.startedAt,
      taskId: task.taskId,
      status: run.status === "failed" ? "failed" : run.status === "running" ? "pending" : "info",
      metadata: { resultDiffFile: run.resultDiffFile || task.resultDiffFile || null }
    });
  }

  for (const [index, line] of (run?.lastLogLines || []).slice(-3).entries()) {
    events.push({
      id: `event:${task.taskId}:agent_log:${index}`,
      kind: "agent_log_event",
      source: "agent",
      order: 3 + index / 100,
      label: "Agent log",
      message: shortText(line, 170),
      taskId: task.taskId,
      status: /error|failed/i.test(line) ? "failed" : "info",
      metadata: { logFile: run?.logFile || task.logFile || null }
    });
  }

  if (task.diff) {
    events.push({
      id: `event:${task.taskId}:patch_detected`,
      kind: "patch_detected",
      source: "patch",
      order: 5,
      label: "Patch detected",
      message: `${parsed.files.length} files, ${parsed.hunks.length} hunks in ${task.resultDiffFile || "agent result diff"}.`,
      taskId: task.taskId,
      status: "pending",
      metadata: { diffPath: task.resultDiffFile || null }
    });
  }

  const patchEvent = patchStateEvent(task, gate, 7);
  if (patchEvent) events.push(patchEvent);

  if (input.currentDiff || input.diffSummary.length) {
    events.push({
      id: `event:${task.taskId}:git_diff_changed`,
      kind: "git_diff_changed",
      source: "git",
      order: 9,
      label: "Working tree diff",
      message: `${input.diffSummary.length} files currently changed in git.`,
      taskId: task.taskId,
      status: input.diffSummary.length ? "info" : "success",
      metadata: { changedFiles: input.diffSummary.length }
    });
  }

  events.push(...diagnosticEvents(changedPaths, input.diagnostics, 10, task.taskId));
  events.push(...testEvents(changedPaths, input.terminalLines, 11, task.taskId));
  const sorted = sortEvents(events);
  const eventIds = sorted.map((event) => event.id);

  return {
    id: `diff-tunnel:${task.taskId}`,
    generatedAt: new Date().toISOString(),
    view: input.view,
    mode: "agent",
    title: `Patch lineage: ${task.taskId}`,
    taskId: task.taskId,
    diffPath: task.resultDiffFile,
    events: sorted,
    hunks: wireHunksToEvents(parsed.hunks, eventIds),
    files: parsed.files,
    gate,
    selectedAgentResult: task,
    warnings: [
      ...(!run ? ["No workflow run snapshot is available for this task."] : []),
      ...(input.diagnostics.length ? ["Diagnostic history is not available; showing current diagnostics only."] : []),
      ...(!input.terminalLines.some((line) => /\b(test|lint)\b/i.test(line)) ? ["No structured test/lint result history is available."] : [])
    ]
  };
}

function buildGitTimeline(input: DiffTimelineInput): DiffTimeline {
  const parsed = parseUnifiedDiff(input.activeDiff || input.currentDiff, "git", input.diffSummary);
  const changedPaths = unique(parsed.files.map((file) => file.path));
  const events: DiffTimelineEvent[] = [];

  if (input.currentDiff || input.diffSummary.length) {
    events.push({
      id: "event:git:git_diff_changed",
      kind: "git_diff_changed",
      source: "git",
      order: 1,
      label: "Current working tree",
      message: `${input.diffSummary.length || parsed.files.length} files changed in the current git diff.`,
      filePath: input.activeDiffFile,
      status: "info",
      metadata: { selectedFile: input.activeDiffFile || null }
    });
  }

  events.push(...diagnosticEvents(changedPaths, input.diagnostics, 2));
  events.push(...testEvents(changedPaths, input.terminalLines, 3));
  const sorted = sortEvents(events);

  return {
    id: "diff-tunnel:git",
    generatedAt: new Date().toISOString(),
    view: input.view,
    mode: parsed.files.length || events.length ? "git" : "empty",
    title: "Current working tree timeline",
    events: sorted,
    hunks: wireHunksToEvents(parsed.hunks, sorted.map((event) => event.id)),
    files: parsed.files,
    gate: { state: "none", label: "No patch", message: "Normal git diffs do not have an agent validation gate." },
    selectedAgentResult: null,
    warnings: [
      ...(input.diagnostics.length ? ["Diagnostic history is not available; showing current diagnostics only."] : []),
      ...(!input.terminalLines.some((line) => /\b(test|lint)\b/i.test(line)) ? ["No structured test/lint result history is available."] : [])
    ]
  };
}

function buildCompareTimeline(input: DiffTimelineInput): DiffTimeline {
  const tasks = input.agentResults.filter((result) => result.diff);
  if (!tasks.length) return emptyTimeline(input.view);
  const events: DiffTimelineEvent[] = [];
  const hunks: DiffHunkSummary[] = [];
  const files: DiffTimelineFile[] = [];

  for (const [index, task] of tasks.entries()) {
    const run = runForTask(input.agentRuns, task.taskId);
    const parsed = parseUnifiedDiff(task.diff, "agent", [], task.taskId);
    const baseOrder = index * 10;
    events.push({
      id: `event:${task.taskId}:patch_detected`,
      kind: "patch_detected",
      source: "patch",
      order: baseOrder + 1,
      label: `${task.taskId} patch`,
      message: `${parsed.files.length} files, ${parsed.hunks.length} hunks.`,
      at: run?.endedAt || run?.startedAt || task.patchState?.updatedAt || null,
      taskId: task.taskId,
      status: task.patchState?.status === "failed" ? "failed" : task.patchState?.status === "applied" ? "applied" : "info"
    });
    const gate = gateForPatch(task.patchState, input.diffSummary.length > 0);
    const stateEvent = patchStateEvent(task, gate, baseOrder + 2);
    if (stateEvent) events.push(stateEvent);
    hunks.push(...parsed.hunks);
    files.push(...parsed.files);
  }

  const sorted = sortEvents(events);
  return {
    id: "diff-tunnel:compare-agent-attempts",
    generatedAt: new Date().toISOString(),
    view: input.view,
    mode: "compare",
    title: "Agent patch attempts",
    events: sorted,
    hunks: wireHunksToEvents(hunks, sorted.map((event) => event.id)),
    files,
    gate: { state: "none", label: "No patch", message: "Compare mode shows each attempt's recorded patch state." },
    selectedAgentResult: null,
    warnings: ["Compare mode is read-only; it does not apply, reject, or roll back patches."]
  };
}

function emptyTimeline(view: DiffTimelineView): DiffTimeline {
  return {
    id: "diff-tunnel:empty",
    generatedAt: new Date().toISOString(),
    view,
    mode: "empty",
    title: "No diff available",
    events: [],
    hunks: [],
    files: [],
    gate: { state: "none", label: "No patch", message: "No diff or agent patch is available." },
    selectedAgentResult: null,
    warnings: []
  };
}

export function buildDiffTimeline(input: DiffTimelineInput): DiffTimeline {
  if (input.view === "compare-attempts") return buildCompareTimeline(input);

  const activeAgent = selectedAgentResult(input);
  const activeDiffIsAgent = Boolean(activeAgent?.diff && input.activeDiff && activeAgent.diff === input.activeDiff);
  if ((input.view === "patch-lineage" || activeDiffIsAgent || (!input.currentDiff && !input.diffSummary.length)) && activeAgent?.diff) {
    return buildAgentTimeline(input, activeAgent);
  }

  const gitTimeline = buildGitTimeline(input);
  if (gitTimeline.mode !== "empty") return gitTimeline;
  if (activeAgent?.diff) return buildAgentTimeline(input, activeAgent);
  return emptyTimeline(input.view);
}

export function eventKindLabel(kind: DiffTimelineEventKind) {
  return kind.replace(/_/g, " ");
}
