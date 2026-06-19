import express from "express";
import { createServer as createViteServer } from "vite";
import os from "node:os";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createAgentRunner } from "./agent-runner.mjs";
import { createCodeGraphProvider, readGraphProviderConfig } from "./codegraph-provider.mjs";
import { createCodingAgentOrchestrator } from "./coding-agent-orchestrator.mjs";
import { createDebugService } from "./debug-service.mjs";
import { createLspService } from "./lsp-service.mjs";
import { createLLMProvider, LLMTelemetry, readLLMConfig, requestOptionsFromConfig } from "./llm/index.mjs";
import { createObservabilityStore } from "./observability/observabilityStore.ts";
import { projectTraceToCodeGraph } from "./observability/traceProjection.ts";
import { createTraceStore } from "./observability/traceStore.ts";
import { scanRepository } from "./scan-codegraph.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const demoRoot = path.resolve(process.env.HOLOCODE_REPO_ROOT || path.join(workspaceRoot, "demo-repo"));
const dataPath = path.join(workspaceRoot, "data", "codegraph.json");
const agentDir = path.join(workspaceRoot, ".agent_tasks");
const holocodeDir = path.join(workspaceRoot, ".holocode");
const sessionPath = path.join(holocodeDir, "session.json");
const port = Number(process.env.PORT || 5173);
const execFileAsync = promisify(execFile);
let activeCodeGraphProvider = null;
let lastResourceSample = null;

function processResourceSnapshot() {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const sampledAt = Date.now();
  let cpuPercent = null;
  if (lastResourceSample) {
    const cpuDeltaMicros = cpu.user + cpu.system - lastResourceSample.cpuMicros;
    const wallDeltaMicros = Math.max(1, (sampledAt - lastResourceSample.sampledAt) * 1000);
    cpuPercent = Number(Math.min(100, (cpuDeltaMicros / wallDeltaMicros) * 100).toFixed(1));
  }
  lastResourceSample = {
    sampledAt,
    cpuMicros: cpu.user + cpu.system
  };
  return {
    measured: true,
    sampledAt: new Date(sampledAt).toISOString(),
    memory: {
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(1)),
      externalMb: Number((memory.external / 1024 / 1024).toFixed(1))
    },
    cpu: {
      percent: cpuPercent,
      cores: os.cpus().length
    }
  };
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function safeRepoPath(relativeFilePath) {
  if (!relativeFilePath || typeof relativeFilePath !== "string") {
    throw new Error("Missing file path.");
  }
  if (path.isAbsolute(relativeFilePath)) {
    throw new Error("Absolute paths are not allowed.");
  }
  const normalized = toPosix(relativeFilePath).replace(/^\/+/, "");
  const absolutePath = path.resolve(demoRoot, normalized);
  const rootWithSeparator = demoRoot.endsWith(path.sep) ? demoRoot : `${demoRoot}${path.sep}`;
  if (absolutePath !== demoRoot && !absolutePath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
    throw new Error(`Path is outside configured repo root: ${normalized}`);
  }
  return absolutePath;
}

function normalizeRepoRelativePath(relativeFilePath) {
  const absolutePath = safeRepoPath(relativeFilePath);
  return toPosix(path.relative(demoRoot, absolutePath));
}

async function runGit(args, options = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: demoRoot,
      windowsHide: true,
      maxBuffer: 12 * 1024 * 1024,
      ...options
    });
    return {
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString()
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("Git executable was not found on PATH.");
    }
    const stderr = error.stderr?.toString?.() || error.message;
    throw new Error(stderr.trim() || `Git command failed: git ${args.join(" ")}`);
  }
}

async function getGitContext() {
  try {
    const inside = await runGit(["rev-parse", "--is-inside-work-tree"]);
    if (inside.stdout.trim() !== "true") {
      throw new Error("Configured repo root is not inside a git working tree.");
    }
    const [topLevel, prefix] = await Promise.all([
      runGit(["rev-parse", "--show-toplevel"]),
      runGit(["rev-parse", "--show-prefix"])
    ]);
    return {
      topLevel: topLevel.stdout.trim(),
      prefix: toPosix(prefix.stdout.trim())
    };
  } catch (error) {
    const message = error.message.includes("not a git repository")
      ? "Git is not initialized for the configured repo root."
      : error.message;
    throw new Error(message);
  }
}

function stripGitPrefix(filePath, prefix) {
  const normalized = toPosix(filePath).replace(/^"|"$/g, "");
  if (!prefix) return normalized;
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

function stripGitPrefixFromDiff(diff, prefix) {
  if (!prefix) return diff;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return diff
    .replace(new RegExp(`a/${escaped}`, "g"), "a/")
    .replace(new RegExp(`b/${escaped}`, "g"), "b/");
}

function statusFromPorcelain(code) {
  if (code === "??") return "added";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("R")) return "renamed";
  return "modified";
}

function parseGitStatus(rawStatus, prefix) {
  return rawStatus
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2);
      const rawPath = line.slice(3);
      const pathPart = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() : rawPath;
      return {
        path: stripGitPrefix(pathPart || "", prefix),
        status: statusFromPorcelain(code),
        index: code[0],
        workingTree: code[1],
        raw: line
      };
    })
    .filter((item) => item.path && !item.path.startsWith("../"));
}

function parseNumstat(rawNumstat, prefix, statusByPath = new Map()) {
  const summary = new Map();
  for (const line of rawNumstat.split(/\r?\n/).filter(Boolean)) {
    const [additionsRaw, deletionsRaw, ...pathParts] = line.split(/\t/);
    const rawPath = pathParts.join("\t");
    const filePath = stripGitPrefix(rawPath.includes(" => ") ? rawPath.split(" => ").pop() || rawPath : rawPath, prefix);
    if (!filePath || filePath.startsWith("../")) continue;
    const existing = summary.get(filePath) || {
      path: filePath,
      status: statusByPath.get(filePath) || "modified",
      additions: 0,
      deletions: 0
    };
    existing.additions += additionsRaw === "-" ? 0 : Number(additionsRaw || 0);
    existing.deletions += deletionsRaw === "-" ? 0 : Number(deletionsRaw || 0);
    existing.status = statusByPath.get(filePath) || existing.status;
    summary.set(filePath, existing);
  }
  return summary;
}

async function getGitStatusSnapshot() {
  const context = await getGitContext();
  const { stdout } = await runGit(["status", "--porcelain=v1", "--", "."]);
  const files = parseGitStatus(stdout, context.prefix);
  return {
    repoRoot: demoRoot,
    gitRoot: context.topLevel,
    files
  };
}

async function getGitDiffSnapshot() {
  const context = await getGitContext();
  const [statusSnapshot, unstagedDiff, stagedDiff, unstagedNumstat, stagedNumstat] = await Promise.all([
    getGitStatusSnapshot(),
    runGit(["diff", "--no-ext-diff", "--", "."]),
    runGit(["diff", "--cached", "--no-ext-diff", "--", "."]),
    runGit(["diff", "--numstat", "--", "."]),
    runGit(["diff", "--cached", "--numstat", "--", "."])
  ]);
  const statusByPath = new Map(statusSnapshot.files.map((file) => [file.path, file.status]));
  const summary = parseNumstat(`${unstagedNumstat.stdout}\n${stagedNumstat.stdout}`, context.prefix, statusByPath);

  for (const statusFile of statusSnapshot.files) {
    if (!summary.has(statusFile.path)) {
      summary.set(statusFile.path, {
        path: statusFile.path,
        status: statusFile.status,
        additions: 0,
        deletions: 0
      });
    }
  }

  const diff = stripGitPrefixFromDiff(`${stagedDiff.stdout}${stagedDiff.stdout ? "\n" : ""}${unstagedDiff.stdout}`, context.prefix);

  return {
    repoRoot: demoRoot,
    gitRoot: context.topLevel,
    diff,
    changedFiles: [...summary.values()].sort((a, b) => a.path.localeCompare(b.path))
  };
}

async function readGraph() {
  if (activeCodeGraphProvider?.getGraph) {
    return activeCodeGraphProvider.getGraph();
  }
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return scanRepository({ rootDir: demoRoot, dataPath });
  }
}

async function listAgentResults() {
  await fs.mkdir(agentDir, { recursive: true });
  const names = await fs.readdir(agentDir);
  const taskNames = names.filter((name) => /^task_\d+\.md$/.test(name)).sort();

  return Promise.all(
    taskNames.map(async (name) => {
      const taskId = name.replace(/\.md$/, "");
      const taskPath = path.join(agentDir, name);
      const diffPath = path.join(agentDir, `${taskId}_result.diff`);
      const logPath = path.join(agentDir, `${taskId}_log.md`);
      const patchStatePath = path.join(agentDir, `${taskId}_patch.json`);
      const [task, diff, log, patchStateRaw] = await Promise.all([
        fs.readFile(taskPath, "utf8").catch(() => ""),
        fs.readFile(diffPath, "utf8").catch(() => ""),
        fs.readFile(logPath, "utf8").catch(() => ""),
        fs.readFile(patchStatePath, "utf8").catch(() => "")
      ]);
      let patchState = diff ? { taskId, status: "pending", updatedAt: null } : null;
      if (patchStateRaw) {
        try {
          patchState = JSON.parse(patchStateRaw);
        } catch {
          patchState = { taskId, status: "failed", message: "Patch state file is invalid JSON.", updatedAt: null };
        }
      }

      return {
        taskId,
        taskFile: `.agent_tasks/${name}`,
        resultDiffFile: diff ? `.agent_tasks/${taskId}_result.diff` : null,
        logFile: log ? `.agent_tasks/${taskId}_log.md` : null,
        task,
        diff,
        log,
        patchState
      };
    })
  );
}

function safeAgentDiffPath(diffPath) {
  if (!diffPath || typeof diffPath !== "string") {
    throw new Error("Missing diffPath.");
  }
  if (path.isAbsolute(diffPath)) {
    throw new Error("Absolute diff paths are not allowed.");
  }
  const normalized = toPosix(diffPath).replace(/^\/+/, "");
  if (!/^\.agent_tasks\/task_\d+_result\.diff$/.test(normalized)) {
    throw new Error("diffPath must match .agent_tasks/task_*_result.diff.");
  }
  const absolutePath = path.resolve(workspaceRoot, normalized);
  const agentRoot = agentDir.endsWith(path.sep) ? agentDir : `${agentDir}${path.sep}`;
  if (!absolutePath.toLowerCase().startsWith(agentRoot.toLowerCase())) {
    throw new Error("Diff path is outside .agent_tasks.");
  }
  return {
    absolutePath,
    relativePath: normalized,
    taskId: path.basename(normalized).replace("_result.diff", "")
  };
}

function branchNameForTask(taskId) {
  return `holocode/${taskId.replace("_", "-").replace(/[^A-Za-z0-9/_-]/g, "")}`;
}

function safeAgentTaskId(taskId) {
  const value = String(taskId || "");
  if (!/^task_\d+$/.test(value)) {
    throw new Error("taskId must match task_001.");
  }
  return value;
}

function parseAgentTaskGoal(taskMarkdown) {
  const section = String(taskMarkdown || "").match(/## Goal\s+([\s\S]*?)(?:\n## |\n# |$)/);
  return section?.[1]?.trim() || "";
}

async function writePatchState(taskId, state) {
  const patchState = {
    taskId,
    updatedAt: new Date().toISOString(),
    ...state
  };
  await fs.writeFile(path.join(agentDir, `${taskId}_patch.json`), `${JSON.stringify(patchState, null, 2)}\n`, "utf8");
  return patchState;
}

async function validatePatchFile(diffPath) {
  const safe = safeAgentDiffPath(diffPath);
  await fs.access(safe.absolutePath);
  try {
    const result = await runGit(["apply", "--check", safe.absolutePath]);
    const patchState = await writePatchState(safe.taskId, {
      status: "validated",
      diffPath: safe.relativePath,
      message: "git apply --check passed.",
      output: result.stdout || result.stderr
    });
    return { ok: true, taskId: safe.taskId, diffPath: safe.relativePath, patchState, output: patchState.output };
  } catch (error) {
    const patchState = await writePatchState(safe.taskId, {
      status: "failed",
      diffPath: safe.relativePath,
      message: error.message
    });
    return { ok: false, taskId: safe.taskId, diffPath: safe.relativePath, patchState, output: error.message };
  }
}

async function applyPatchFile(diffPath, mode) {
  if (mode !== "new-branch") {
    throw new Error('Only mode "new-branch" is supported.');
  }

  const safe = safeAgentDiffPath(diffPath);
  await fs.access(safe.absolutePath);
  const status = await getGitStatusSnapshot();
  if (status.files.length) {
    const message = `Working tree is not clean. Commit, stash, or discard changes before applying ${safe.relativePath}.`;
    await writePatchState(safe.taskId, {
      status: "failed",
      diffPath: safe.relativePath,
      message
    });
    throw new Error(message);
  }

  const branch = branchNameForTask(safe.taskId);
  const output = [];
  const validation = await validatePatchFile(safe.relativePath);
  output.push(validation.output || "git apply --check passed.");
  if (!validation.ok) {
    return {
      ok: false,
      taskId: safe.taskId,
      diffPath: safe.relativePath,
      branch,
      patchState: validation.patchState,
      output: validation.output || "Patch validation failed."
    };
  }

  try {
    const checkout = await runGit(["checkout", "-b", branch]);
    output.push(checkout.stdout || checkout.stderr || `Created branch ${branch}.`);
    const secondCheck = await runGit(["apply", "--check", safe.absolutePath]);
    output.push(secondCheck.stdout || secondCheck.stderr || "git apply --check passed on new branch.");
    const applied = await runGit(["apply", safe.absolutePath]);
    output.push(applied.stdout || applied.stderr || "Patch applied.");
    const graph = activeCodeGraphProvider
      ? await activeCodeGraphProvider.updateGraph([])
      : await scanRepository({ rootDir: demoRoot, dataPath });
    const git = await getGitDiffSnapshot().catch((gitError) => ({ error: gitError.message, changedFiles: [], diff: "" }));
    const patchState = await writePatchState(safe.taskId, {
      status: "applied",
      diffPath: safe.relativePath,
      branch,
      message: "Patch applied on safe branch.",
      output: output.join("\n")
    });
    return { ok: true, taskId: safe.taskId, diffPath: safe.relativePath, branch, patchState, output: output.join("\n"), graph, git };
  } catch (error) {
    const patchState = await writePatchState(safe.taskId, {
      status: "failed",
      diffPath: safe.relativePath,
      branch,
      message: error.message,
      output: output.join("\n")
    });
    return { ok: false, taskId: safe.taskId, diffPath: safe.relativePath, branch, patchState, output: `${output.join("\n")}\n${error.message}`.trim() };
  }
}

async function nextTaskId() {
  await fs.mkdir(agentDir, { recursive: true });
  const names = await fs.readdir(agentDir);
  const max = names.reduce((highest, name) => {
    const match = name.match(/^task_(\d+)\.md$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `task_${String(max + 1).padStart(3, "0")}`;
}

async function ensureAgentTaskFile({ taskId, goal, selectedFiles, selectedFunctions }) {
  const graph = await readGraph();
  const safeTaskId = safeAgentTaskId(taskId);
  const taskPath = path.join(agentDir, `${safeTaskId}.md`);
  const existing = await fs.readFile(taskPath, "utf8").catch(() => "");
  if (existing) return { taskId: safeTaskId, taskPath, markdown: existing };

  const markdown = buildAgentTaskMarkdown({
    taskId: safeTaskId,
    goal,
    selectedFiles,
    selectedFunctions,
    graph
  });
  await fs.mkdir(agentDir, { recursive: true });
  await fs.writeFile(taskPath, markdown, "utf8");
  return { taskId: safeTaskId, taskPath, markdown };
}

async function persistCodingWorkflowArtifacts(state) {
  if (!/^task_\d+$/.test(state.taskId)) return null;
  await fs.mkdir(agentDir, { recursive: true });
  const diffPath = path.join(agentDir, `${state.taskId}_result.diff`);
  const logPath = path.join(agentDir, `${state.taskId}_log.md`);
  const statePath = path.join(agentDir, `${state.taskId}_workflow.json`);
  const diff = state.currentPatch?.diff || "";
  const latestTests = state.testRuns.at(-1);
  const log = [
    `# LangGraph Agent Run ${state.taskId}`,
    "",
    `Status: ${state.status}`,
    `Iterations: ${state.iteration}/${state.maxIterations}`,
    `Provider: ${state.provider?.providerName || "unknown"} / ${state.provider?.modelName || "unknown"}`,
    "",
    "## Plan",
    "",
    JSON.stringify(state.plan || {}, null, 2),
    "",
    "## Files",
    "",
    (state.currentPatch?.filesTouched || []).map((filePath) => `- ${filePath}`).join("\n") || "- None",
    "",
    "## Tests",
    "",
    latestTests?.commands?.length
      ? latestTests.commands.map((command) => `- ${command.ok ? "ok" : "failed"} ${command.displayCommand}`).join("\n")
      : latestTests?.output || "No test commands were run.",
    "",
    "## Review",
    "",
    JSON.stringify(state.review || {}, null, 2),
    ""
  ].join("\n");
  if (diff) {
    await fs.writeFile(diffPath, `${diff.trim()}\n`, "utf8");
  }
  await fs.writeFile(logPath, log, "utf8");
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return {
    diffPath: diff ? `.agent_tasks/${state.taskId}_result.diff` : null,
    logPath: `.agent_tasks/${state.taskId}_log.md`,
    statePath: `.agent_tasks/${state.taskId}_workflow.json`
  };
}

function dependencyContext(graph, selectedFiles) {
  const fileIds = new Set(selectedFiles.map((filePath) => `file:${filePath}`));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const relatedEdges = graph.edges.filter(
    (edge) => edge.type === "imports" && (fileIds.has(edge.source) || fileIds.has(edge.target))
  );

  return relatedEdges
    .map((edge) => {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      return `- ${source?.path || edge.source} -> ${target?.path || edge.target}`;
    })
    .join("\n");
}

function buildAgentTaskMarkdown({ taskId, goal, selectedFiles, selectedFunctions, graph }) {
  const dependencyLines = dependencyContext(graph, selectedFiles) || "- No direct dependencies detected.";

  return `# Agent Task ${taskId}

## Goal

${goal || "Improve the selected code while preserving current behavior."}

## Selected Files

${selectedFiles.length ? selectedFiles.map((filePath) => `- ${filePath}`).join("\n") : "- None selected"}

## Selected Functions

${selectedFunctions.length ? selectedFunctions.map((fn) => `- ${fn.name} (${fn.path}:${fn.line})`).join("\n") : "- None selected"}

## Current Dependency Context

${dependencyLines}

## Constraints

- Do not change public APIs unless explicitly required.
- Keep edits focused on the selected files and their direct dependencies.
- Add or update tests when behavior changes.
- Explain risk briefly in the log file.

## Expected Output Format

- Return patch only in \`${taskId}_result.diff\`.
- Return reasoning, commands, and test notes in \`${taskId}_log.md\`.
- Do not apply the patch directly.
`;
}

function sanitizeString(value, fallback = null) {
  return typeof value === "string" && value.length < 512 ? value : fallback;
}

function sanitizeBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function sanitizeVector(value, fallback) {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  return [
    sanitizeNumber(value[0], fallback[0]),
    sanitizeNumber(value[1], fallback[1]),
    sanitizeNumber(value[2], fallback[2])
  ];
}

function sanitizeSession(rawSession) {
  const session = rawSession?.session || rawSession || {};
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    editorPanels: Array.isArray(session.editorPanels)
      ? session.editorPanels.slice(0, 12).map((panel) => ({
          id: sanitizeString(panel.id, `panel-${Math.random().toString(36).slice(2)}`),
          path: sanitizeString(panel.path, ""),
          title: sanitizeString(panel.title, panel.path || "Panel"),
          kind: ["source", "test", "caller", "callee", "diff", "debug"].includes(panel.kind) ? panel.kind : "source",
          readOnly: sanitizeBoolean(panel.readOnly, false),
          position: sanitizeVector(panel.position, [0, 1.95, 2.25]),
          rotation: sanitizeVector(panel.rotation, [-0.04, 0, 0]),
          targetLine: panel.targetLine ? Math.max(1, Math.floor(Number(panel.targetLine))) : null
        }))
      : [],
    activeEditorPanelId: sanitizeString(session.activeEditorPanelId, null),
    editorLayout: ["free", "source-test", "caller-callee", "diff-review", "debugging"].includes(session.editorLayout)
      ? session.editorLayout
      : "free",
    pinnedCards: Array.isArray(session.pinnedCards)
      ? session.pinnedCards.slice(0, 24).map((card) => ({
          id: sanitizeString(card.id, ""),
          name: sanitizeString(card.name, "Symbol"),
          path: sanitizeString(card.path, ""),
          line: Math.max(1, Math.floor(Number(card.line || 1))),
          size: Math.max(1, Math.floor(Number(card.size || 1))),
          kind: card.kind === "class" ? "class" : "function",
          x: sanitizeNumber(card.x, 72),
          y: sanitizeNumber(card.y, 118)
        }))
      : [],
    selectedFilePath: sanitizeString(session.selectedFilePath, null),
    cameraPreset: ["cockpit", "architecture", "current-file", "dependency", "agent", "error-trace", "diagnostics", "debug"].includes(
      session.cameraPreset
    )
      ? session.cameraPreset
      : "cockpit",
    visibleSceneMode: ["cockpit", "architecture", "current-file", "dependency", "agent", "error-trace", "diagnostics", "debug"].includes(
      session.visibleSceneMode
    )
      ? session.visibleSceneMode
      : "cockpit",
    visibleDependencyMode: ["hidden", "incoming", "outgoing", "all"].includes(session.visibleDependencyMode)
      ? session.visibleDependencyMode
      : "outgoing",
    graphFocus: ["dependencies", "callers", "sankey", "all"].includes(session.graphFocus) ? session.graphFocus : "dependencies",
    showTests: sanitizeBoolean(session.showTests, true),
    showAgentDock: sanitizeBoolean(session.showAgentDock, true),
    showDiffStack: sanitizeBoolean(session.showDiffStack, true),
    showErrorPath: sanitizeBoolean(session.showErrorPath, false),
    showDiagnosticsPanel: sanitizeBoolean(session.showDiagnosticsPanel, false),
    activeDiffFile: sanitizeString(session.activeDiffFile, null),
    activeDiagnosticId: sanitizeString(session.activeDiagnosticId, null),
    currentAgentTaskId: sanitizeString(session.currentAgentTaskId, null),
    worldDetail: ["module", "file", "function"].includes(session.worldDetail) ? session.worldDetail : "file",
    graphScopeFilter: ["all", "current-file", "current-module"].includes(session.graphScopeFilter)
      ? session.graphScopeFilter
      : "all",
    showExternalPackages: sanitizeBoolean(session.showExternalPackages, true),
    showFunctions: sanitizeBoolean(session.showFunctions, true),
    showChangedFilesOnly: sanitizeBoolean(session.showChangedFilesOnly, false),
    showDiagnosticsOnly: sanitizeBoolean(session.showDiagnosticsOnly, false),
    maxVisibleBeams: Math.max(0, Math.min(2000, Math.floor(Number(session.maxVisibleBeams || 180)))),
    showFpsOverlay: sanitizeBoolean(session.showFpsOverlay, true)
  };
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: "8mb" }));
  const graphConfig = await readGraphProviderConfig({ workspaceRoot });
  activeCodeGraphProvider = createCodeGraphProvider({
    ...graphConfig,
    repoPath: demoRoot,
    dataPath
  });
  const lspService = createLspService({ repoRoot: demoRoot });
  const debugService = createDebugService({ repoRoot: demoRoot, readGraph });
  const agentRunner = createAgentRunner({ workspaceRoot, agentDir });
  const llmConfig = await readLLMConfig({ workspaceRoot });
  const llmTelemetry = new LLMTelemetry();
  const llmStats = {
    requestCount: 0,
    failedRequestCount: 0,
    inputTokenEstimateTotal: 0,
    outputTokenEstimateTotal: 0,
    lastLatencyMs: null,
    lastTimeToFirstTokenMs: null,
    lastTokensPerSecond: null,
    lastRequestAt: null,
    lastError: null
  };
  llmTelemetry.on("event", (event) => {
    if (event.type === "llm_request_started") {
      llmStats.requestCount += 1;
      llmStats.lastRequestAt = event.timestamp;
      llmStats.inputTokenEstimateTotal += event.inputTokenEstimate || 0;
    }
    if (event.type === "llm_request_completed") {
      llmStats.outputTokenEstimateTotal += event.outputTokenEstimate || 0;
      llmStats.lastLatencyMs = event.latencyMs ?? llmStats.lastLatencyMs;
      llmStats.lastTimeToFirstTokenMs = event.timeToFirstTokenMs ?? llmStats.lastTimeToFirstTokenMs;
      llmStats.lastTokensPerSecond = event.tokensPerSecond ?? llmStats.lastTokensPerSecond;
      llmStats.lastError = null;
    }
    if (event.type === "llm_request_failed") {
      llmStats.failedRequestCount += 1;
      llmStats.lastError = event.error || "LLM request failed.";
    }
  });
  const codingAgent = createCodingAgentOrchestrator({
    workspaceRoot,
    repoPath: demoRoot,
    providerFactory: () => createLLMProvider(llmConfig, { telemetry: llmTelemetry }),
    requestOptions: requestOptionsFromConfig(llmConfig),
    codeGraphProvider: activeCodeGraphProvider
  });
  const observabilityStore = createObservabilityStore({
    readGraph,
    getGitStatusSnapshot,
    getGitDiffSnapshot,
    getLspDiagnostics: () => lspService.diagnostics(),
    getAgentWorkflowRuns: () => codingAgent.listRuns(),
    getAgentResults: listAgentResults,
    getDebugState: () => debugService.state()
  });
  const traceStore = createTraceStore();

  await fs.mkdir(agentDir, { recursive: true });
  await fs.mkdir(holocodeDir, { recursive: true });
  await activeCodeGraphProvider.buildGraph(demoRoot);

  app.get("/api/graph", async (_request, response) => {
    response.json(await readGraph());
  });

  app.post("/api/scan", async (_request, response) => {
    const graph = await activeCodeGraphProvider.buildGraph(demoRoot);
    response.json({ ok: true, graph });
  });

  app.get("/api/graph/stats", async (_request, response) => {
    await readGraph();
    response.json({ stats: activeCodeGraphProvider.getGraphStats() });
  });

  app.get("/api/graph/export", async (request, response) => {
    try {
      const includeChanged = String(request.query.changed || "false") === "true";
      const git = includeChanged ? await getGitDiffSnapshot().catch(() => ({ changedFiles: [] })) : { changedFiles: [] };
      response.json(await activeCodeGraphProvider.exportGraphForVR({ changedFiles: git.changedFiles || [] }));
    } catch (error) {
      response.status(400).json({ error: error.message, nodes: [], edges: [], clusters: [], stats: activeCodeGraphProvider.getGraphStats() });
    }
  });

  app.get("/api/observability/graph", async (_request, response) => {
    try {
      response.json(await observabilityStore.getGraph());
    } catch (error) {
      response.status(500).json({
        nodes: [],
        edges: [],
        signals: [],
        generatedAt: new Date().toISOString(),
        sources: {
          codegraph: false,
          git: false,
          lsp: false,
          agents: false,
          debug: false,
          runtime: false
        },
        error: error.message
      });
    }
  });

  app.get("/api/observability/blast-radius", async (request, response) => {
    try {
      const normalizedPath = normalizeRepoRelativePath(String(request.query.path || ""));
      response.json(await observabilityStore.getBlastRadius(normalizedPath));
    } catch (error) {
      response.status(400).json({ error: error.message, affectedNodeIds: [], affectedPaths: [], affectedTestPaths: [] });
    }
  });

  app.get("/api/observability/context-lens", async (request, response) => {
    try {
      const runId = String(request.query.runId || "").trim();
      if (runId && !/^[A-Za-z0-9_.:-]+$/.test(runId)) {
        throw new Error("runId contains unsupported characters.");
      }
      response.json(await observabilityStore.getContextLens(runId));
    } catch (error) {
      response.status(400).json({ error: error.message, includedNodeIds: [], includedSignalIds: [], touchedFiles: [] });
    }
  });

  app.get("/api/observability/risk", async (request, response) => {
    try {
      const normalizedPath = normalizeRepoRelativePath(String(request.query.path || ""));
      response.json(await observabilityStore.getRisk(normalizedPath));
    } catch (error) {
      response.status(400).json({ error: error.message, score: 0, reasons: [] });
    }
  });

  app.get("/api/observability/traces", (_request, response) => {
    response.json(traceStore.listTraces());
  });

  app.get("/api/observability/trace-river", async (request, response) => {
    try {
      const rawTraceId = String(request.query.traceId || "").trim();
      if (rawTraceId && !/^[A-Za-z0-9_.:-]+$/.test(rawTraceId)) {
        throw new Error("traceId contains unsupported characters.");
      }
      const trace =
        rawTraceId === "failing"
          ? traceStore.failingTrace()
          : rawTraceId === "latest"
            ? traceStore.latestTrace()
            : traceStore.getTrace(rawTraceId || null);
      if (!trace) {
        response.status(404).json({
          error: "No real trace available. Import a trace or run tests/lint when connected.",
          traceId: null,
          spans: [],
          edges: [],
          unmappedSpans: []
        });
        return;
      }
      response.json(projectTraceToCodeGraph(trace, await readGraph()));
    } catch (error) {
      response.status(400).json({ error: error.message, spans: [], edges: [], unmappedSpans: [] });
    }
  });

  app.post("/api/observability/traces/import", (request, response) => {
    try {
      const trace = traceStore.importTrace(request.body);
      response.json({ ok: true, trace });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/graph/query", async (request, response) => {
    try {
      const result = await activeCodeGraphProvider.queryRelevantContext(request.body.task || request.body.goal || "", request.body.hints || {});
      response.json({ ok: true, context: result });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/graph/import", async (request, response) => {
    try {
      const rawGraph = request.body.graph || request.body;
      const graph = await activeCodeGraphProvider.importGraphFromJson(rawGraph, demoRoot, {
        source: "api_import",
        providerType: request.body.providerType || graphConfig.type || "external_json"
      });
      response.json({ ok: true, graph, stats: graph.stats, validation: graph.validation });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/graph/blast-radius", async (request, response) => {
    try {
      const result = await activeCodeGraphProvider.getBlastRadius(request.body.changedFiles || request.body.files || []);
      response.json({ ok: true, blastRadius: result });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/graph/rebuild-external", async (_request, response) => {
    try {
      if (!["external_json", "external-json", "json", "mcp", "external-mcp", "code-review-graph", "codereviewgraph", "emerge", "glato-emerge"].includes(String(graphConfig.type || "").toLowerCase())) {
        throw new Error("The active graph provider is not configured as an external provider.");
      }
      const graph = await activeCodeGraphProvider.buildGraph(demoRoot);
      response.json({ ok: true, graph, stats: graph.stats, validation: graph.validation || null });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/graph/rebuild", async (_request, response) => {
    try {
      const graph = await activeCodeGraphProvider.buildGraph(demoRoot);
      response.json({ ok: true, graph, stats: graph.stats });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/file", async (request, response) => {
    try {
      const filePath = String(request.query.path || "");
      const normalizedPath = normalizeRepoRelativePath(filePath);
      const absolutePath = safeRepoPath(normalizedPath);
      const content = await fs.readFile(absolutePath, "utf8");
      response.json({ path: normalizedPath, content });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.post("/api/file", async (request, response) => {
    try {
      const { path: filePath, content } = request.body;
      const normalizedPath = normalizeRepoRelativePath(filePath);
      const absolutePath = safeRepoPath(normalizedPath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content ?? "", "utf8");
      const graph = await activeCodeGraphProvider.updateGraph([normalizedPath]);
      const git = await getGitDiffSnapshot().catch((gitError) => ({ error: gitError.message, changedFiles: [], diff: "" }));
      response.json({ ok: true, path: normalizedPath, graph, git });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.get("/api/files/read", async (request, response) => {
    try {
      const filePath = String(request.query.path || "");
      const normalizedPath = normalizeRepoRelativePath(filePath);
      const absolutePath = safeRepoPath(normalizedPath);
      const content = await fs.readFile(absolutePath, "utf8");
      response.json({ path: normalizedPath, content });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.post("/api/files/save", async (request, response) => {
    try {
      const { path: filePath, content } = request.body;
      const normalizedPath = normalizeRepoRelativePath(filePath);
      const absolutePath = safeRepoPath(normalizedPath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content ?? "", "utf8");
      const graph = await activeCodeGraphProvider.updateGraph([normalizedPath]);
      const git = await getGitDiffSnapshot().catch((gitError) => ({ error: gitError.message, changedFiles: [], diff: "" }));
      response.json({ ok: true, path: normalizedPath, graph, git });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.get("/api/session", async (_request, response) => {
    const session = await fs
      .readFile(sessionPath, "utf8")
      .then((raw) => sanitizeSession(JSON.parse(raw)))
      .catch(() => null);
    response.json({ session, path: ".holocode/session.json" });
  });

  app.post("/api/session", async (request, response) => {
    try {
      const session = sanitizeSession(request.body);
      await fs.mkdir(holocodeDir, { recursive: true });
      await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
      response.json({ ok: true, session, path: ".holocode/session.json" });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.post("/api/session/reset", async (_request, response) => {
    await fs.unlink(sessionPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    response.json({ ok: true, path: ".holocode/session.json" });
  });

  app.get("/api/git/status", async (_request, response) => {
    try {
      response.json(await getGitStatusSnapshot());
    } catch (error) {
      response.status(400).json({ error: error.message, files: [] });
    }
  });

  app.get("/api/git/diff", async (_request, response) => {
    try {
      response.json(await getGitDiffSnapshot());
    } catch (error) {
      response.status(400).json({ error: error.message, diff: "", changedFiles: [] });
    }
  });

  app.get("/api/git/diff-summary", async (_request, response) => {
    try {
      const snapshot = await getGitDiffSnapshot();
      response.json({ changedFiles: snapshot.changedFiles });
    } catch (error) {
      response.status(400).json({ error: error.message, changedFiles: [] });
    }
  });

  app.get("/api/lsp/diagnostics", (_request, response) => {
    try {
      response.json(lspService.diagnostics());
    } catch (error) {
      response.status(400).json({ error: error.message, diagnostics: [], summary: [] });
    }
  });

  app.get("/api/lsp/document-symbols", (request, response) => {
    try {
      response.json(lspService.documentSymbols(String(request.query.path || "")));
    } catch (error) {
      response.status(400).json({ error: error.message, symbols: [] });
    }
  });

  app.get("/api/lsp/hover", (request, response) => {
    try {
      response.json(
        lspService.hover(String(request.query.path || ""), Number(request.query.line || 1), Number(request.query.column || 1))
      );
    } catch (error) {
      response.status(400).json({ error: error.message, contents: "", documentation: "" });
    }
  });

  app.get("/api/lsp/definition", (request, response) => {
    try {
      response.json(
        lspService.definition(String(request.query.path || ""), Number(request.query.line || 1), Number(request.query.column || 1))
      );
    } catch (error) {
      response.status(400).json({ error: error.message, locations: [] });
    }
  });

  app.get("/api/lsp/references", (request, response) => {
    try {
      response.json(
        lspService.references(String(request.query.path || ""), Number(request.query.line || 1), Number(request.query.column || 1))
      );
    } catch (error) {
      response.status(400).json({ error: error.message, locations: [] });
    }
  });

  app.post("/api/lsp/rename-preview", (request, response) => {
    try {
      const { path: filePath, line, column, newName } = request.body;
      response.json(lspService.renamePreview(filePath, line, column, newName));
    } catch (error) {
      response.status(400).json({ error: error.message, canRename: false, locations: [] });
    }
  });

  app.get("/api/debug/state", (_request, response) => {
    response.json(debugService.state());
  });

  app.post("/api/debug/breakpoints/add", async (request, response) => {
    try {
      response.json(await debugService.addBreakpoint(request.body));
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/breakpoints/remove", async (request, response) => {
    try {
      response.json(await debugService.removeBreakpoint(request.body));
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/start", async (request, response) => {
    try {
      response.json(await debugService.start(request.body));
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/step-over", async (_request, response) => {
    try {
      response.json(await debugService.stepOver());
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/step-into", async (_request, response) => {
    try {
      response.json(await debugService.stepInto());
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/continue", async (_request, response) => {
    try {
      response.json(await debugService.continueRun());
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/watches/add", async (request, response) => {
    try {
      response.json(await debugService.addWatch(request.body.expression));
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/debug/watches/remove", async (request, response) => {
    try {
      response.json(await debugService.removeWatch(request.body.id));
    } catch (error) {
      response.status(400).json({ error: error.message, ...debugService.state() });
    }
  });

  app.post("/api/agent-task", async (request, response) => {
    try {
      const graph = await readGraph();
      const taskId = await nextTaskId();
      const selectedFiles = request.body.selectedFiles || [];
      const selectedFunctions = request.body.selectedFunctions || [];
      const markdown = buildAgentTaskMarkdown({
        taskId,
        goal: request.body.goal,
        selectedFiles,
        selectedFunctions,
        graph
      });
      const taskPath = path.join(agentDir, `${taskId}.md`);
      await fs.writeFile(taskPath, markdown, "utf8");
      response.json({
        ok: true,
        taskId,
        taskFile: `.agent_tasks/${taskId}.md`,
        content: markdown,
        results: await listAgentResults()
      });
    } catch (error) {
      response.status(400).json({ error: error.message });
    }
  });

  app.get("/api/agent-results", async (_request, response) => {
    response.json({ results: await listAgentResults() });
  });

  app.get("/api/agent/runs", (_request, response) => {
    response.json({ runs: agentRunner.listRuns() });
  });

  app.get("/api/agent/workflow/runs", (_request, response) => {
    response.json({ runs: codingAgent.listRuns(), graph: codingAgent.graphDefinition });
  });

  app.get("/api/agent/telemetry", async (_request, response) => {
    response.json({
      resources: processResourceSnapshot(),
      provider: {
        providerName: llmConfig.provider,
        modelName: llmConfig.modelName,
        contextWindow: llmConfig.contextWindow || null,
        stats: llmStats
      },
      graph: {
        providerName: graphConfig.type || "internal",
        stats: activeCodeGraphProvider.getGraphStats()
      },
      runs: codingAgent.listRuns().slice(0, 3)
    });
  });

  app.get("/api/agent/events", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    const send = (event) => {
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "agent-snapshot", runs: agentRunner.listRuns(), workflowRuns: codingAgent.listRuns() });
    const unsubscribe = agentRunner.subscribe(send);
    const unsubscribeWorkflow = codingAgent.subscribe(send);
    const unsubscribeGraph = activeCodeGraphProvider.subscribe(send);
    const forwardLlm = (event) => {
      send(event.type === "llm_token" ? { ...event, type: "agent_token" } : event);
    };
    llmTelemetry.on("event", forwardLlm);
    const keepAlive = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 15000);
    request.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      unsubscribeWorkflow();
      unsubscribeGraph();
      llmTelemetry.off("event", forwardLlm);
      response.end();
    });
  });

  app.get("/api/graph/events", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    const send = (event) => {
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "graph_snapshot", stats: activeCodeGraphProvider.getGraphStats() });
    const unsubscribeGraph = activeCodeGraphProvider.subscribe(send);
    const keepAlive = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 15000);
    request.on("close", () => {
      clearInterval(keepAlive);
      unsubscribeGraph();
      response.end();
    });
  });

  app.post("/api/agent/run", async (request, response) => {
    try {
      const run = await agentRunner.runAgentTask(request.body.taskId);
      response.json({ ok: true, run, runs: agentRunner.listRuns(), results: await listAgentResults() });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message, runs: agentRunner.listRuns(), results: await listAgentResults() });
    }
  });

  app.post("/api/agent/workflow/run", async (request, response) => {
    try {
      const selectedFiles = Array.isArray(request.body.selectedFiles) ? request.body.selectedFiles : [];
      const selectedFunctions = Array.isArray(request.body.selectedFunctions) ? request.body.selectedFunctions : [];
      const taskId = request.body.taskId ? safeAgentTaskId(request.body.taskId) : await nextTaskId();
      const task = await ensureAgentTaskFile({
        taskId,
        goal: request.body.goal || "Improve the selected code while preserving behavior.",
        selectedFiles,
        selectedFunctions
      });
      const userGoal = request.body.goal || parseAgentTaskGoal(task.markdown) || task.markdown;
      const state = await codingAgent.run({
        taskId: task.taskId,
        userGoal,
        repoPath: demoRoot,
        selectedFiles,
        selectedFunction: request.body.selectedFunction || selectedFunctions[0] || null,
        previousContext: request.body.previousContext || "",
        maxIterations: request.body.maxIterations,
        tokenBudget: request.body.tokenBudget
      });
      const artifacts = await persistCodingWorkflowArtifacts(state);
      response.json({
        ok: state.status === "completed",
        state,
        artifacts,
        runs: codingAgent.listRuns(),
        results: await listAgentResults()
      });
    } catch (error) {
      response.status(400).json({
        ok: false,
        error: error.message,
        runs: codingAgent.listRuns(),
        results: await listAgentResults()
      });
    }
  });

  app.post("/api/agent/workflow/cancel", (request, response) => {
    try {
      const taskId = safeAgentTaskId(request.body.taskId);
      response.json({ ok: codingAgent.cancel(taskId), runs: codingAgent.listRuns() });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message, runs: codingAgent.listRuns() });
    }
  });

  app.get("/api/diff", async (request, response) => {
    const taskId = String(request.query.task || "task_001").replace(/[^A-Za-z0-9_-]/g, "");
    const diffPath = path.join(agentDir, `${taskId}_result.diff`);
    const diff = await fs.readFile(diffPath, "utf8").catch(() => "");
    response.json({ taskId, diff });
  });

  app.post("/api/patch/validate", async (request, response) => {
    try {
      const result = await validatePatchFile(request.body.diffPath);
      response.json({
        ...result,
        results: await listAgentResults()
      });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message, results: await listAgentResults() });
    }
  });

  app.post("/api/patch/apply", async (request, response) => {
    try {
      const result = await applyPatchFile(request.body.diffPath, request.body.mode || "new-branch");
      response.json({
        ...result,
        results: await listAgentResults()
      });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message, results: await listAgentResults() });
    }
  });

  app.post("/api/patch/reject", async (request, response) => {
    try {
      const safe = safeAgentDiffPath(request.body.diffPath);
      const patchState = await writePatchState(safe.taskId, {
        status: "rejected",
        diffPath: safe.relativePath,
        message: "Patch rejected by user."
      });
      response.json({
        ok: true,
        taskId: safe.taskId,
        diffPath: safe.relativePath,
        patchState,
        output: "Patch rejected by user.",
        results: await listAgentResults()
      });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message, results: await listAgentResults() });
    }
  });

  app.post("/api/run", async (request, response) => {
    const command = String(request.body.command || "");
    if (command === "scan") {
      const graph = await activeCodeGraphProvider.buildGraph(demoRoot);
      response.json({
        ok: true,
        command,
        output: `Graph scan complete: ${graph.stats.files} files, ${graph.stats.symbols} symbols, ${graph.stats.imports} imports.`,
        graph
      });
      return;
    }

    if (command === "git-status") {
      try {
        const status = await getGitStatusSnapshot();
        const output = status.files.length
          ? status.files.map((file) => `${file.status.padEnd(8)} ${file.path}`).join("\n")
          : "Git status clean.";
        response.json({ ok: true, command, output, gitStatus: status });
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
      return;
    }

    const outputLines = [
      `$ ${command === "lint" ? "npm run lint" : "npm test"}`,
      "Placeholder runner: command boundary is wired, real process streaming is a next milestone.",
      command === "lint" ? "No lint process was executed." : "No test process was executed.",
      `Completed at ${new Date().toLocaleTimeString()}.`
    ];
    // TODO(trace-rivers): when this safe runner executes real test/lint output, parse stdout/stderr with traceStore.ingestProcessOutput.
    response.json({ ok: true, command, output: outputLines.join("\n") });
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
    root: workspaceRoot
  });
  app.use(vite.middlewares);

  return app;
}

createApp()
  .then((app) => {
    app.listen(port, "127.0.0.1", () => {
      console.log(`HoloCode Cockpit running at http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
