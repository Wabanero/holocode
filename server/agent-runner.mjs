import { EventEmitter } from "node:events";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function now() {
  return new Date().toISOString();
}

function defaultConfig() {
  return {
    agent: {
      command: "codex",
      args: ["exec", "--input", "{taskFile}"],
      workingDirectory: "."
    }
  };
}

function taskIdFromInput(taskId) {
  const value = String(taskId || "");
  if (!/^task_\d+$/.test(value)) {
    throw new Error("taskId must match task_001.");
  }
  return value;
}

function splitLines(chunk) {
  return String(chunk)
    .split(/\r?\n/)
    .filter((line) => line.length);
}

function parseSelectedFiles(taskMarkdown) {
  const section = taskMarkdown.match(/## Selected Files\s+([\s\S]*?)(?:\n## |\n# |$)/);
  if (!section) return [];
  return section[1]
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter((line) => line && line !== "None selected");
}

function parseDiffFiles(diff) {
  const files = new Set();
  for (const line of diff.split(/\r?\n/)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) files.add(match[2]);
  }
  return [...files];
}

function sanitizeStreamText(text) {
  return String(text).replace(/\u001b\[[0-9;]*m/g, "");
}

export function createAgentRunner({ workspaceRoot, agentDir }) {
  const runs = new Map();
  const emitter = new EventEmitter();
  const configPath = path.join(workspaceRoot, "holocode.config.json");

  async function readConfig() {
    const fallback = defaultConfig();
    try {
      const raw = await fs.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        ...fallback,
        ...parsed,
        agent: {
          ...fallback.agent,
          ...(parsed.agent || {})
        }
      };
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw new Error(`Invalid holocode.config.json: ${error.message}`);
    }
  }

  function safeWorkspacePath(relativeValue, label) {
    const raw = String(relativeValue || ".");
    if (path.isAbsolute(raw)) {
      throw new Error(`${label} must be relative to the workspace root.`);
    }
    const absolutePath = path.resolve(workspaceRoot, raw);
    const rootWithSeparator = workspaceRoot.endsWith(path.sep) ? workspaceRoot : `${workspaceRoot}${path.sep}`;
    if (absolutePath !== workspaceRoot && !absolutePath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
      throw new Error(`${label} is outside the workspace root.`);
    }
    return absolutePath;
  }

  function taskPaths(taskId) {
    const id = taskIdFromInput(taskId);
    const taskPath = path.join(agentDir, `${id}.md`);
    const logPath = path.join(agentDir, `${id}_log.md`);
    const resultDiffPath = path.join(agentDir, `${id}_result.diff`);
    return {
      taskId: id,
      taskPath,
      logPath,
      resultDiffPath,
      taskFile: `.agent_tasks/${id}.md`,
      logFile: `.agent_tasks/${id}_log.md`,
      resultDiffFile: `.agent_tasks/${id}_result.diff`
    };
  }

  function replacePlaceholders(value, context) {
    return String(value)
      .replaceAll("{taskId}", context.taskId)
      .replaceAll("{taskFile}", context.taskFile)
      .replaceAll("{taskPath}", context.taskPath)
      .replaceAll("{logFile}", context.logFile)
      .replaceAll("{resultDiffFile}", context.resultDiffFile)
      .replaceAll("{workspaceRoot}", workspaceRoot);
  }

  function snapshot(run) {
    return {
      taskId: run.taskId,
      status: run.status,
      command: run.command,
      args: run.args,
      displayCommand: [run.command, ...run.args].join(" "),
      workingDirectory: run.workingDirectory,
      taskFile: run.taskFile,
      logFile: run.logFile,
      resultDiffFile: run.resultDiffFile,
      touchedFiles: run.touchedFiles,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      exitCode: run.exitCode,
      error: run.error,
      lastLogLines: run.lastLogLines
    };
  }

  function emit(type, run, payload = {}) {
    const event = {
      type,
      run: snapshot(run),
      ...payload
    };
    emitter.emit("event", event);
  }

  function appendRunLog(run, stream, text) {
    const clean = sanitizeStreamText(text);
    const lines = splitLines(clean);
    run.lastLogLines = [...run.lastLogLines, ...lines.map((line) => `[${stream}] ${line}`)].slice(-80);
    run.logStream?.write(clean);
    emit("agent-log", run, { stream, text: clean });
  }

  async function buildRun(taskId) {
    const paths = taskPaths(taskId);
    await fs.access(paths.taskPath).catch(() => {
      throw new Error(`Agent task not found: ${paths.taskFile}. Create a task first.`);
    });
    const [config, taskMarkdown] = await Promise.all([readConfig(), fs.readFile(paths.taskPath, "utf8")]);
    const agent = config.agent || {};
    if (!agent.command || typeof agent.command !== "string") {
      throw new Error("holocode.config.json must define agent.command.");
    }
    if (!Array.isArray(agent.args)) {
      throw new Error("holocode.config.json agent.args must be an array.");
    }
    const context = {
      ...paths,
      taskPath: toPosix(path.relative(workspaceRoot, paths.taskPath)),
      logPath: toPosix(path.relative(workspaceRoot, paths.logPath)),
      resultDiffPath: toPosix(path.relative(workspaceRoot, paths.resultDiffPath))
    };
    const command = replacePlaceholders(agent.command, context);
    const args = agent.args.map((arg) => replacePlaceholders(arg, context));
    const workingDirectory = safeWorkspacePath(agent.workingDirectory || ".", "agent.workingDirectory");
    return {
      taskId: paths.taskId,
      status: "queued",
      command,
      args,
      workingDirectory,
      taskPath: paths.taskPath,
      taskFile: paths.taskFile,
      logPath: paths.logPath,
      logFile: paths.logFile,
      resultDiffPath: paths.resultDiffPath,
      resultDiffFile: paths.resultDiffFile,
      touchedFiles: parseSelectedFiles(taskMarkdown),
      startedAt: null,
      endedAt: null,
      exitCode: null,
      error: null,
      lastLogLines: [],
      process: null,
      logStream: null
    };
  }

  async function finishRun(run, status, payload = {}) {
    if (run.endedAt) return;
    run.status = status;
    run.endedAt = now();
    run.exitCode = payload.exitCode ?? run.exitCode;
    run.error = payload.error ?? run.error;
    const diff = await fs.readFile(run.resultDiffPath, "utf8").catch(() => "");
    if (diff) {
      run.touchedFiles = [...new Set([...run.touchedFiles, ...parseDiffFiles(diff)])];
    }
    run.logStream?.end();
    run.logStream = null;
    emit("agent-finished", run, { diffDetected: Boolean(diff) });
  }

  async function runAgentTask(taskId) {
    const id = taskIdFromInput(taskId);
    const existing = runs.get(id);
    if (existing?.status === "running" || existing?.status === "queued") {
      return snapshot(existing);
    }

    const run = await buildRun(id);
    runs.set(id, run);
    await fs.mkdir(agentDir, { recursive: true });
    run.logStream = createWriteStream(run.logPath, { flags: "w", encoding: "utf8" });
    run.status = "running";
    run.startedAt = now();

    const header = [
      `# Agent Run ${run.taskId}`,
      "",
      `Started: ${run.startedAt}`,
      `Command: \`${[run.command, ...run.args].join(" ")}\``,
      `Working directory: \`${run.workingDirectory}\``,
      `Task file: \`${run.taskFile}\``,
      `Result diff: \`${run.resultDiffFile}\``,
      "",
      "## Stream",
      ""
    ].join("\n");
    run.logStream.write(header);
    run.lastLogLines = [
      `$ ${[run.command, ...run.args].join(" ")}`,
      `cwd: ${run.workingDirectory}`,
      `task: ${run.taskFile}`
    ];
    emit("agent-started", run);

    try {
      run.process = spawn(run.command, run.args, {
        cwd: run.workingDirectory,
        shell: false,
        windowsHide: true,
        env: {
          ...process.env,
          HOLOCODE_TASK_FILE: run.taskFile,
          HOLOCODE_TASK_ID: run.taskId,
          HOLOCODE_RESULT_DIFF: run.resultDiffFile,
          HOLOCODE_LOG_FILE: run.logFile
        }
      });
    } catch (error) {
      await finishRun(run, "failed", { error: error.message });
      return snapshot(run);
    }

    run.process.stdout?.on("data", (chunk) => appendRunLog(run, "stdout", chunk.toString()));
    run.process.stderr?.on("data", (chunk) => appendRunLog(run, "stderr", chunk.toString()));
    run.process.on("error", async (error) => {
      appendRunLog(run, "stderr", `${error.message}\n`);
      await finishRun(run, "failed", { error: error.message });
    });
    run.process.on("close", async (code) => {
      await finishRun(run, code === 0 ? "completed" : "failed", {
        exitCode: code,
        error: code === 0 ? null : `Agent exited with code ${code}.`
      });
    });

    return snapshot(run);
  }

  function listRuns() {
    return [...runs.values()].map(snapshot).sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
  }

  function subscribe(listener) {
    emitter.on("event", listener);
    return () => emitter.off("event", listener);
  }

  return {
    runAgentTask,
    listRuns,
    subscribe
  };
}
