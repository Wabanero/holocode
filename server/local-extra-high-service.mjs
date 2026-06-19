import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { createCodingAgentOrchestrator } from "./coding-agent-orchestrator.mjs";

const execFileAsync = promisify(execFile);

const SKIP_COPY_DIRS = new Set([".git", ".agent_tasks", ".agent_runs", ".holocode", "node_modules", "dist", "build", "coverage", ".next", ".vite", "target"]);

function now() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeId(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "_");
}

function createRunId() {
  return `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function normalizeProviderName(value, fallback = "ollama") {
  const provider = String(value || fallback || "ollama").trim().toLowerCase();
  return provider === "openai" ? "openai_compatible" : provider;
}

function ensureInside(root, target, label) {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  const rootWithSeparator = absoluteRoot.endsWith(path.sep) ? absoluteRoot : `${absoluteRoot}${path.sep}`;
  if (absoluteTarget !== absoluteRoot && !absoluteTarget.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
    throw new Error(`${label} must stay inside ${absoluteRoot}.`);
  }
  return absoluteTarget;
}

function resolveRepoPath({ requestedRepoPath, defaultRepoPath, workspaceRoot, allowExternalRepos }) {
  const raw = requestedRepoPath || defaultRepoPath;
  if (!raw) throw new Error("repoPath is required.");
  const resolved = path.resolve(raw);
  if (!allowExternalRepos) {
    ensureInside(workspaceRoot, resolved, "repoPath");
  }
  return resolved;
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function readJson(filePath) {
  return fs.readFile(filePath, "utf8").then((raw) => JSON.parse(raw));
}

async function copyRepoToWorkspace(repoPath, workspacePath) {
  await fs.mkdir(path.dirname(workspacePath), { recursive: true });
  await fs.rm(workspacePath, { recursive: true, force: true });
  await fs.cp(repoPath, workspacePath, {
    recursive: true,
    filter: (source) => !SKIP_COPY_DIRS.has(path.basename(source))
  });
}

function aggregateRunTelemetry(state, record = {}) {
  const llmCalls = state?.telemetry?.llmCalls || [];
  const latestPatch = state?.currentPatch || null;
  const testCommands = (state?.testRuns || []).flatMap((testRun) => testRun.commands || []);
  const inputTokens = llmCalls.reduce((total, call) => total + (call.inputTokenEstimate || 0), 0);
  const outputTokens = llmCalls.reduce((total, call) => total + (call.outputTokenEstimate || 0), 0);
  const startedAt = state?.timestamps?.startedAt || record.startedAt || record.createdAt;
  const completedAt = state?.timestamps?.completedAt || record.completedAt || null;
  const runtimeMs =
    startedAt && (completedAt || record.updatedAt)
      ? Math.max(0, new Date(completedAt || record.updatedAt).getTime() - new Date(startedAt).getTime())
      : 0;
  return {
    totalInputTokenEstimate: inputTokens,
    totalOutputTokenEstimate: outputTokens,
    totalLlmCalls: llmCalls.length,
    totalRuntimeMs: runtimeMs,
    testCommandsRun: testCommands.map((command) => command.displayCommand),
    graphNodesQueried: state?.telemetry?.selectedSubgraph?.nodeCount || state?.graphContext?.selectedSubgraph?.nodes?.length || 0,
    filesTouched: latestPatch?.filesTouched || [],
    memoryPeakMb: record.memoryPeakMb || null
  };
}

function summarizeStateForRun(state, record = {}) {
  if (!state) {
    return {
      taskId: record.id,
      id: record.id,
      userGoal: record.task,
      repoPath: record.repoPath,
      mode: record.mode,
      status: record.status,
      provider: record.provider,
      graphProvider: record.graphProvider,
      iteration: record.iteration || 0,
      maxIterations: record.maxIterations || 4,
      timestamps: {
        createdAt: record.createdAt,
        startedAt: record.startedAt || null,
        updatedAt: record.updatedAt || record.createdAt,
        completedAt: record.completedAt || null
      },
      telemetry: {
        aggregate: aggregateRunTelemetry(null, record)
      }
    };
  }

  const next = cloneJson(state);
  next.id = state.taskId;
  next.mode = record.mode || "local_extra_high";
  next.graphProvider = record.graphProvider || "internal";
  next.artifacts = record.artifacts || {};
  next.finalApply = record.finalApply || null;
  next.telemetry = {
    ...(next.telemetry || {}),
    aggregate: aggregateRunTelemetry(next, record)
  };
  return next;
}

function patchListFromState(state) {
  return (state?.patches || []).map((patch) => ({
    id: patch.id,
    iteration: patch.iteration,
    summary: patch.summary,
    filesTouched: patch.filesTouched || [],
    confidence: patch.confidence,
    risk: patch.risk,
    validation: patch.validation,
    generatedAt: patch.generatedAt,
    diff: patch.diff
  }));
}

async function persistRunArtifacts(record, state) {
  record.state = state;
  record.status = state.status;
  record.iteration = state.iteration;
  record.updatedAt = state.timestamps?.updatedAt || now();
  record.completedAt = state.timestamps?.completedAt || record.completedAt || null;
  record.memoryPeakMb = Math.max(record.memoryPeakMb || 0, record.lastResourceSnapshot?.memory?.rssMb || 0) || record.memoryPeakMb || null;

  const patchesDir = path.join(record.runDir, "patches");
  await fs.mkdir(patchesDir, { recursive: true });
  for (const patch of state.patches || []) {
    if (patch.diff) {
      await fs.writeFile(path.join(patchesDir, `${patch.id}.diff`), `${patch.diff.trim()}\n`, "utf8");
    }
  }
  if (state.currentPatch?.diff) {
    const finalPatchPath = path.join(record.runDir, "final.diff");
    await fs.writeFile(finalPatchPath, `${state.currentPatch.diff.trim()}\n`, "utf8");
    record.artifacts.finalPatchPath = finalPatchPath;
  }

  const log = [
    `# Local Extra High Run ${record.id}`,
    "",
    `Mode: ${record.mode}`,
    `Status: ${state.status}`,
    `Task: ${record.task}`,
    `Provider: ${state.provider?.providerName || record.provider?.providerName || "unknown"} / ${state.provider?.modelName || record.provider?.modelName || "unknown"}`,
    `Graph provider: ${record.graphProvider}`,
    `Iterations: ${state.iteration}/${state.maxIterations}`,
    "",
    "## Files",
    "",
    ...(state.currentPatch?.filesTouched?.length ? state.currentPatch.filesTouched.map((filePath) => `- ${filePath}`) : ["- None"]),
    "",
    "## Tests",
    "",
    ...((state.testRuns || []).flatMap((testRun) =>
      testRun.commands?.length ? testRun.commands.map((command) => `- ${command.ok ? "ok" : "failed"} ${command.displayCommand}`) : ["- skipped"]
    )),
    "",
    "## Finalizer",
    "",
    JSON.stringify(state.finalizer || {}, null, 2),
    ""
  ].join("\n");
  const logPath = path.join(record.runDir, "run.md");
  await fs.writeFile(logPath, log, "utf8");
  record.artifacts.logPath = logPath;

  await writeJson(path.join(record.runDir, "state.json"), summarizeStateForRun(state, record));
  await writeJson(path.join(record.runDir, "meta.json"), {
    id: record.id,
    mode: record.mode,
    task: record.task,
    repoPath: record.repoPath,
    provider: record.provider,
    graphProvider: record.graphProvider,
    status: record.status,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    artifacts: record.artifacts,
    finalApply: record.finalApply || null,
    memoryPeakMb: record.memoryPeakMb || null
  });
}

export function createLocalExtraHighService({
  workspaceRoot,
  defaultRepoPath,
  runsRoot = null,
  baseLlmConfig = {},
  graphProviderConfig = {},
  allowExternalRepos = false,
  providerFactoryForRun,
  graphProviderFactory,
  patchApplyToolFactory,
  testRunnerToolFactory,
  requestOptionsForRun = () => ({}),
  processResourceSnapshot = null,
  execFileImpl = execFileAsync
} = {}) {
  if (!workspaceRoot) throw new Error("workspaceRoot is required.");
  const resolvedRunsRoot = runsRoot || path.join(workspaceRoot, ".agent_runs");
  const emitter = new EventEmitter();
  const records = new Map();

  function safeRunDir(runId) {
    return ensureInside(resolvedRunsRoot, path.join(resolvedRunsRoot, sanitizeId(runId)), "runDir");
  }

  function emit(record, event) {
    const resourceSnapshot = processResourceSnapshot ? processResourceSnapshot() : null;
    if (resourceSnapshot?.memory?.rssMb) {
      record.memoryPeakMb = Math.max(record.memoryPeakMb || 0, resourceSnapshot.memory.rssMb);
      record.lastResourceSnapshot = resourceSnapshot;
    }
    record.updatedAt = event.timestamp || now();
    const next = {
      taskId: record.id,
      runId: record.id,
      mode: record.mode,
      timestamp: now(),
      ...event
    };
    record.events.push(next);
    emitter.emit("event", next);
    void appendJsonLine(path.join(record.runDir, "events.jsonl"), next).catch((error) => {
      emitter.emit("event", {
        type: "agent_failed",
        taskId: record.id,
        runId: record.id,
        mode: record.mode,
        agent: "LocalExtraHighPersistence",
        error: error.message,
        timestamp: now()
      });
    });
    return next;
  }

  function makeProviderConfig(input) {
    return {
      ...baseLlmConfig,
      provider: normalizeProviderName(input.provider, baseLlmConfig.provider),
      modelName: input.model || input.modelName || baseLlmConfig.modelName || "qwen3-coder"
    };
  }

  async function loadRecordFromDisk(runId) {
    const runDir = safeRunDir(runId);
    const meta = await readJson(path.join(runDir, "meta.json")).catch(() => null);
    if (!meta) return null;
    const state = await readJson(path.join(runDir, "state.json")).catch(() => null);
    return {
      ...meta,
      runDir,
      state,
      events: [],
      artifacts: meta.artifacts || {},
      finalApply: meta.finalApply || null
    };
  }

  function getRecord(runId) {
    return records.get(runId) || null;
  }

  function listRuns() {
    return [...records.values()]
      .map((record) => summarizeStateForRun(record.state, record))
      .sort((a, b) => String(b.timestamps?.startedAt || b.timestamps?.createdAt || "").localeCompare(String(a.timestamps?.startedAt || a.timestamps?.createdAt || "")));
  }

  async function getRun(runId) {
    const record = getRecord(runId) || (await loadRecordFromDisk(runId));
    return record ? summarizeStateForRun(record.state, record) : null;
  }

  async function getPatches(runId) {
    const record = getRecord(runId) || (await loadRecordFromDisk(runId));
    if (!record) return null;
    return {
      runId,
      patches: patchListFromState(record.state),
      currentPatch: record.state?.currentPatch || null,
      finalPatchPath: record.artifacts?.finalPatchPath || null
    };
  }

  async function startRun(input = {}) {
    if (input.mode && input.mode !== "local_extra_high") {
      throw new Error('Only mode "local_extra_high" is supported.');
    }
    const repoPath = resolveRepoPath({
      requestedRepoPath: input.repoPath,
      defaultRepoPath,
      workspaceRoot,
      allowExternalRepos
    });
    const id = sanitizeId(input.id || input.taskId || createRunId());
    const runDir = safeRunDir(id);
    const providerConfig = makeProviderConfig(input);
    const graphProviderName = input.graphProvider || graphProviderConfig.type || "internal";
    const createdAt = now();
    const record = {
      id,
      mode: "local_extra_high",
      task: String(input.task || input.goal || ""),
      repoPath,
      provider: {
        providerName: providerConfig.provider,
        modelName: providerConfig.modelName,
        contextWindow: providerConfig.contextWindow || null
      },
      graphProvider: graphProviderName,
      status: "queued",
      iteration: 0,
      maxIterations: Number.isFinite(input.maxIterations) ? Math.max(1, Math.floor(input.maxIterations)) : 4,
      runTests: input.runTests !== false,
      createdAt,
      startedAt: null,
      updatedAt: createdAt,
      completedAt: null,
      memoryPeakMb: null,
      artifacts: {},
      finalApply: null,
      events: [],
      runDir,
      state: null,
      orchestrator: null,
      promise: null
    };
    records.set(id, record);
    await fs.mkdir(runDir, { recursive: true });
    await writeJson(path.join(runDir, "meta.json"), {
      id,
      mode: record.mode,
      task: record.task,
      repoPath,
      provider: record.provider,
      graphProvider: graphProviderName,
      status: record.status,
      createdAt,
      startedAt: null,
      updatedAt: createdAt,
      completedAt: null,
      artifacts: {},
      finalApply: null,
      memoryPeakMb: null
    });
    emit(record, { type: "run_started", status: "queued", run: summarizeStateForRun(null, record) });

    record.promise = executeRun(record, input, providerConfig).catch((error) => {
      record.status = "failed";
      record.completedAt = now();
      emit(record, { type: "run_failed", status: "failed", error: error.message, run: summarizeStateForRun(record.state, record) });
    });

    return summarizeStateForRun(null, record);
  }

  async function executeRun(record, input, providerConfig) {
    record.status = "running";
    record.startedAt = now();

    const graphProvider = graphProviderFactory({
      type: record.graphProvider,
      config: graphProviderConfig,
      repoPath: record.repoPath,
      runDir: record.runDir
    });
    const unsubscribeGraph = graphProvider.subscribe
      ? graphProvider.subscribe((event) => emit(record, { ...event, taskId: record.id, runId: record.id }))
      : () => {};
    const providerFactory = () => providerFactoryForRun(providerConfig, { runId: record.id });
    const patchApplyTool = patchApplyToolFactory?.({ runId: record.id, runDir: record.runDir, repoPath: record.repoPath });
    const testRunnerTool = record.runTests
      ? testRunnerToolFactory?.({ runId: record.id, runDir: record.runDir, repoPath: record.repoPath })
      : {
          async runTests(state) {
            return {
              ok: true,
              skipped: true,
              workingDirectory: state.patchApplyResults.at(-1)?.sandboxPath || state.repoPath,
              commands: [],
              output: "runTests=false; test runner skipped.",
              errors: [],
              startedAt: now(),
              completedAt: now()
            };
          }
        };

    const orchestrator = createCodingAgentOrchestrator({
      workspaceRoot,
      repoPath: record.repoPath,
      providerFactory,
      requestOptions: requestOptionsForRun(providerConfig, input),
      codeGraphProvider: graphProvider,
      patchApplyTool,
      testRunnerTool,
      enableNativeLangGraph: input.enableNativeLangGraph !== false
    });
    record.orchestrator = orchestrator;
    const unsubscribeAgent = orchestrator.subscribe((event) => {
      record.state = orchestrator.getRunState?.(record.id) || orchestrator.getRun(record.id) || record.state;
      emit(record, { ...event, run: summarizeStateForRun(record.state, record) });
    });

    try {
      if (graphProvider.buildGraph) {
        await graphProvider.buildGraph(record.repoPath);
      }
      const finalState = await orchestrator.run({
        taskId: record.id,
        userGoal: record.task,
        repoPath: record.repoPath,
        selectedFiles: input.selectedFiles || [],
        selectedFunction: input.selectedFunction || null,
        previousContext: input.previousContext || "",
        maxIterations: record.maxIterations,
        tokenBudget: input.tokenBudget
      });
      record.state = finalState;
      record.status = finalState.status;
      record.completedAt = finalState.timestamps?.completedAt || now();
      await persistRunArtifacts(record, finalState);
      emit(record, {
        type: finalState.status === "completed" ? "run_completed" : "run_failed",
        status: finalState.status,
        reason: finalState.status === "needs_human_review" ? "needs_human_review" : undefined,
        state: summarizeStateForRun(finalState, record),
        run: summarizeStateForRun(finalState, record)
      });
    } finally {
      unsubscribeAgent();
      unsubscribeGraph();
    }
  }

  async function cancel(runId) {
    const record = getRecord(runId);
    if (!record) return false;
    const cancelled = record.orchestrator?.cancel(runId) || false;
    record.status = cancelled ? "cancelled" : record.status;
    emit(record, { type: "run_failed", status: record.status, reason: "cancelled", run: summarizeStateForRun(record.state, record) });
    await writeJson(path.join(record.runDir, "meta.json"), {
      id: record.id,
      mode: record.mode,
      task: record.task,
      repoPath: record.repoPath,
      provider: record.provider,
      graphProvider: record.graphProvider,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
      artifacts: record.artifacts,
      finalApply: record.finalApply || null,
      memoryPeakMb: record.memoryPeakMb || null
    });
    return cancelled;
  }

  async function applyFinal(runId) {
    const record = getRecord(runId) || (await loadRecordFromDisk(runId));
    if (!record) throw new Error(`Unknown agent run: ${runId}`);
    const diff = record.state?.currentPatch?.diff || "";
    if (!diff.trim()) throw new Error("No final patch is available for this run.");
    const workspacePath = ensureInside(record.runDir, path.join(record.runDir, "final_workspace"), "finalWorkspace");
    const patchPath = ensureInside(record.runDir, path.join(record.runDir, "final.diff"), "finalPatchPath");
    await copyRepoToWorkspace(record.repoPath, workspacePath);
    await fs.writeFile(patchPath, `${diff.trim()}\n`, "utf8");
    const output = [];
    try {
      const check = await execFileImpl("git", ["apply", "--check", patchPath], {
        cwd: workspacePath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });
      output.push(check.stdout || check.stderr || "git apply --check passed.");
      const apply = await execFileImpl("git", ["apply", patchPath], {
        cwd: workspacePath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024
      });
      output.push(apply.stdout || apply.stderr || "Patch applied to final workspace.");
      record.finalApply = {
        status: "applied_workspace",
        workspacePath,
        patchPath,
        output: output.join("\n"),
        appliedAt: now()
      };
      await persistRunArtifacts(record, record.state);
      emit(record, { type: "run_final_patch_applied", status: record.status, finalApply: record.finalApply, run: summarizeStateForRun(record.state, record) });
      return { ok: true, runId, finalApply: record.finalApply, run: summarizeStateForRun(record.state, record) };
    } catch (error) {
      record.finalApply = {
        status: "failed",
        workspacePath,
        patchPath,
        output: [...output, error.stdout, error.stderr, error.message].filter(Boolean).join("\n"),
        error: error.message,
        failedAt: now()
      };
      await writeJson(path.join(record.runDir, "meta.json"), {
        id: record.id,
        mode: record.mode,
        task: record.task,
        repoPath: record.repoPath,
        provider: record.provider,
        graphProvider: record.graphProvider,
        status: record.status,
        createdAt: record.createdAt,
        startedAt: record.startedAt,
        updatedAt: record.updatedAt,
        completedAt: record.completedAt,
        artifacts: record.artifacts,
        finalApply: record.finalApply,
        memoryPeakMb: record.memoryPeakMb || null
      });
      emit(record, { type: "run_final_patch_failed", status: record.status, error: error.message, finalApply: record.finalApply });
      return { ok: false, runId, error: error.message, finalApply: record.finalApply, run: summarizeStateForRun(record.state, record) };
    }
  }

  async function revert(runId) {
    const record = getRecord(runId) || (await loadRecordFromDisk(runId));
    if (!record) throw new Error(`Unknown agent run: ${runId}`);
    const workspacePath = record.finalApply?.workspacePath
      ? ensureInside(record.runDir, record.finalApply.workspacePath, "finalWorkspace")
      : ensureInside(record.runDir, path.join(record.runDir, "final_workspace"), "finalWorkspace");
    await fs.rm(workspacePath, { recursive: true, force: true });
    record.finalApply = {
      status: "reverted",
      workspacePath,
      revertedAt: now()
    };
    if (record.state) await persistRunArtifacts(record, record.state);
    emit(record, { type: "run_reverted", status: record.status, finalApply: record.finalApply, run: summarizeStateForRun(record.state, record) });
    return { ok: true, runId, finalApply: record.finalApply, run: summarizeStateForRun(record.state, record) };
  }

  function subscribe(listener) {
    emitter.on("event", listener);
    return () => emitter.off("event", listener);
  }

  function eventsFor(runId) {
    return getRecord(runId)?.events || [];
  }

  return {
    startRun,
    cancel,
    getRun,
    getPatches,
    listRuns,
    applyFinal,
    revert,
    subscribe,
    eventsFor
  };
}

export function registerLocalExtraHighRoutes(app, service) {
  app.get("/api/agent-runs", (_request, response) => {
    response.json({ runs: service.listRuns() });
  });

  app.post("/api/agent-runs/start", async (request, response) => {
    try {
      const run = await service.startRun(request.body || {});
      response.json({ ok: true, runId: run.id || run.taskId, run });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.post("/api/agent-runs/:id/cancel", async (request, response) => {
    try {
      response.json({ ok: await service.cancel(request.params.id), run: await service.getRun(request.params.id) });
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get("/api/agent-runs/:id", async (request, response) => {
    const run = await service.getRun(request.params.id);
    if (!run) {
      response.status(404).json({ ok: false, error: "Run not found." });
      return;
    }
    response.json({ ok: true, run });
  });

  app.get("/api/agent-runs/:id/events", (request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });
    const send = (event) => {
      if (event.taskId !== request.params.id && event.runId !== request.params.id) return;
      response.write(`event: ${event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of service.eventsFor(request.params.id)) send(event);
    const unsubscribe = service.subscribe(send);
    const keepAlive = setInterval(() => {
      response.write(": keep-alive\n\n");
    }, 15000);
    request.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      response.end();
    });
  });

  app.get("/api/agent-runs/:id/patches", async (request, response) => {
    const patches = await service.getPatches(request.params.id);
    if (!patches) {
      response.status(404).json({ ok: false, error: "Run not found." });
      return;
    }
    response.json({ ok: true, ...patches });
  });

  app.post("/api/agent-runs/:id/apply-final", async (request, response) => {
    const result = await service.applyFinal(request.params.id);
    response.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/agent-runs/:id/revert", async (request, response) => {
    try {
      response.json(await service.revert(request.params.id));
    } catch (error) {
      response.status(400).json({ ok: false, error: error.message });
    }
  });
}
