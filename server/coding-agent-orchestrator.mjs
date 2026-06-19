import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { LLMProvider, estimateTokens } from "./llm/index.mjs";
import { createCodeGraphProvider } from "./codegraph-provider.mjs";

const execFileAsync = promisify(execFile);

export const AGENT_EVENT_TYPES = {
  agentStarted: "agent_started",
  agentCompleted: "agent_completed",
  agentFailed: "agent_failed",
  graphContextSelected: "graph_context_selected",
  patchGenerated: "patch_generated",
  patchApplyStarted: "patch_apply_started",
  patchApplyCompleted: "patch_apply_completed",
  testStarted: "test_started",
  testCompleted: "test_completed",
  debugIterationStarted: "debug_iteration_started",
  criticReviewCompleted: "critic_review_completed",
  runCompleted: "run_completed",
  runFailed: "run_failed",
  telemetryUpdate: "telemetry_update"
};

const GRAPH_NODE_ORDER = [
  "PlannerAgent",
  "GraphRetrieverAgent",
  "CoderAgent",
  "PatchApplyTool",
  "TestRunnerTool",
  "DebuggerAgent",
  "CriticAgent",
  "FinalizerAgent"
];

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".py",
  ".rs",
  ".toml",
  ".yaml",
  ".yml"
]);

const IGNORED_DIRS = new Set([
  ".git",
  ".agent_tasks",
  ".holocode",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".vite",
  "target",
  "__pycache__"
]);

function now() {
  return new Date().toISOString();
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeRelativePath(value) {
  const normalized = normalizeSlash(value).replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0")) return null;
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) return null;
  return normalized;
}

function isLikelySourceFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(extension);
}

function truncateText(value, maxLength = 4000) {
  const text = String(value ?? "");
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n[truncated ${text.length - maxLength} chars]`;
}

function compactState(state) {
  return {
    taskId: state.taskId,
    userGoal: state.userGoal,
    repoPath: state.repoPath,
    provider: state.provider,
    plan: state.plan,
    graphContext: state.graphContext
      ? {
          relevantFiles: state.graphContext.relevantFiles,
          relevantSymbols: state.graphContext.relevantSymbols,
          dependencyPaths: state.graphContext.dependencyPaths,
          blastRadius: state.graphContext.blastRadius,
          testsLikelyAffected: state.graphContext.testsLikelyAffected
        }
      : null,
    selectedFiles: state.selectedFiles,
    patches: state.patches.map((patch) => ({
      id: patch.id,
      filesTouched: patch.filesTouched,
      summary: patch.summary,
      confidence: patch.confidence,
      risk: patch.risk,
      generatedAt: patch.generatedAt,
      iteration: patch.iteration
    })),
    currentPatch: state.currentPatch
      ? {
          id: state.currentPatch.id,
          filesTouched: state.currentPatch.filesTouched,
          summary: state.currentPatch.summary,
          confidence: state.currentPatch.confidence,
          risk: state.currentPatch.risk,
          generatedAt: state.currentPatch.generatedAt,
          iteration: state.currentPatch.iteration
        }
      : null,
    patchApplyResults: state.patchApplyResults,
    testRuns: state.testRuns,
    parsedErrors: state.parsedErrors,
    review: state.review,
    iteration: state.iteration,
    maxIterations: state.maxIterations,
    tokenBudget: state.tokenBudget,
    status: state.status,
    timestamps: state.timestamps,
    telemetry: state.telemetry
  };
}

function makeRunState(input = {}) {
  const createdAt = now();
  return {
    taskId: input.taskId || `agent_${randomUUID()}`,
    userGoal: input.userGoal || input.goal || "",
    repoPath: input.repoPath || process.cwd(),
    provider: {
      providerName: input.providerName || null,
      modelName: input.modelName || null,
      contextWindow: input.contextWindow || null,
      supportsJsonMode: null,
      supportsStreaming: null,
      supportsToolCalling: null
    },
    plan: null,
    graphContext: null,
    selectedFiles: Array.isArray(input.selectedFiles) ? input.selectedFiles.map(normalizeSlash) : [],
    selectedFunction: input.selectedFunction || null,
    previousContext: input.previousContext || "",
    patches: [],
    currentPatch: null,
    patchApplyResults: [],
    testRuns: [],
    parsedErrors: [],
    debug: null,
    review: null,
    finalizer: null,
    iteration: 0,
    maxIterations: Number.isFinite(input.maxIterations) ? Math.max(1, Math.floor(input.maxIterations)) : 4,
    tokenBudget: Number.isFinite(input.tokenBudget) ? Math.max(0, Math.floor(input.tokenBudget)) : null,
    status: "queued",
    cancellationRequested: false,
    timestamps: {
      createdAt,
      startedAt: null,
      updatedAt: createdAt,
      completedAt: null
    },
    telemetry: {
      graphRuntime: "local",
      nodeVisits: [],
      eventsEmitted: 0,
      llmCalls: [],
      tokenEstimate: 0,
      errors: []
    }
  };
}

function appendVisit(state, nodeName) {
  state.telemetry.nodeVisits.push({
    node: nodeName,
    iteration: state.iteration,
    timestamp: now()
  });
}

function updateProviderInfo(state, provider) {
  if (!provider?.getMetadata) return;
  const metadata = provider.getMetadata();
  state.provider = {
    providerName: metadata.providerName,
    modelName: metadata.modelName,
    contextWindow: metadata.contextWindow,
    supportsJsonMode: metadata.supportsJsonMode,
    supportsStreaming: metadata.supportsStreaming,
    supportsToolCalling: metadata.supportsToolCalling
  };
}

function extractJson(text, fallback = {}) {
  const raw = String(text || "").trim();
  if (!raw) return fallback;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}

function stripPatchEnvelope(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const firstDiff = candidate.search(/^diff --git /m);
  if (firstDiff >= 0) return candidate.slice(firstDiff).trim();
  const firstOld = candidate.search(/^--- /m);
  return firstOld >= 0 ? candidate.slice(firstOld).trim() : candidate;
}

export function parseDiffFiles(diff) {
  const files = new Set();
  for (const line of String(diff || "").split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) {
      const normalized = safeRelativePath(gitMatch[2]);
      if (normalized) files.add(normalized);
      continue;
    }
    const headerMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (headerMatch) {
      const normalized = safeRelativePath(headerMatch[1]);
      if (normalized) files.add(normalized);
    }
  }
  return [...files];
}

export function validateUnifiedDiffPatch(diff) {
  const text = String(diff || "").trim();
  const errors = [];
  if (!text) errors.push("Patch is empty.");
  if (!/^diff --git /m.test(text) && !/^--- /m.test(text)) {
    errors.push("Patch must be a unified diff with file headers.");
  }
  if (!/^@@ /m.test(text) && !/^new file mode /m.test(text) && !/^deleted file mode /m.test(text)) {
    errors.push("Patch must include at least one hunk or file mode change.");
  }
  const filesTouched = parseDiffFiles(text);
  if (!filesTouched.length) errors.push("Patch does not include any safe repo-relative file paths.");
  for (const filePath of filesTouched) {
    if (!safeRelativePath(filePath)) errors.push(`Unsafe patch path: ${filePath}`);
  }
  return {
    ok: errors.length === 0,
    errors,
    filesTouched
  };
}

function summarizePatch(diff) {
  const additions = String(diff || "").split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const deletions = String(diff || "").split(/\r?\n/).filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const filesTouched = parseDiffFiles(diff);
  return {
    filesTouched,
    summary: `${filesTouched.length} file(s), +${additions}/-${deletions}`,
    confidence: filesTouched.length ? "medium" : "low",
    risk: filesTouched.length > 5 || additions + deletions > 250 ? "high" : "medium"
  };
}

export function parseErrorLocations(text) {
  const errors = [];
  const seen = new Set();
  const add = (pathValue, line, column, message = "") => {
    const normalized = safeRelativePath(pathValue);
    const numericLine = Number(line);
    const numericColumn = column === undefined ? null : Number(column);
    if (!normalized || !Number.isFinite(numericLine)) return;
    const key = `${normalized}:${numericLine}:${numericColumn || ""}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    errors.push({
      path: normalized,
      line: numericLine,
      column: Number.isFinite(numericColumn) ? numericColumn : null,
      message: truncateText(message, 240)
    });
  };

  for (const line of String(text || "").split(/\r?\n/)) {
    const colon = line.match(/((?:src|server|tests|test|demo-repo|[\w.-]+)[/\w.-]+\.(?:tsx?|jsx?|mjs|cjs|json|css|py|rs)):(\d+):?(\d+)?/);
    if (colon) add(colon[1], colon[2], colon[3], line.trim());

    const ts = line.match(/((?:src|server|tests|test|demo-repo|[\w.-]+)[/\w.-]+\.(?:tsx?|jsx?))\((\d+),(\d+)\)/);
    if (ts) add(ts[1], ts[2], ts[3], line.trim());
  }

  return errors.slice(0, 24);
}

function buildMessages(system, payload) {
  return [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(payload, null, 2) }
  ];
}

async function callLLMJson(provider, role, system, payload, options = {}) {
  const messages = buildMessages(system, payload);
  const result = await provider.generate(messages, {
    ...options,
    agentRole: role,
    json: provider.supportsJsonMode !== false
  });
  return {
    json: extractJson(result.content, {}),
    result,
    inputTokenEstimate: estimateTokens(messages),
    outputTokenEstimate: result.outputTokenEstimate ?? estimateTokens(result.content)
  };
}

async function callLLMText(provider, role, system, payload, options = {}) {
  const messages = buildMessages(system, payload);
  const result = await provider.generate(messages, {
    ...options,
    agentRole: role,
    json: false
  });
  return {
    text: String(result.content || ""),
    result,
    inputTokenEstimate: estimateTokens(messages),
    outputTokenEstimate: result.outputTokenEstimate ?? estimateTokens(result.content)
  };
}

class PlannerAgent {
  constructor({ providerFactory, requestOptions = {} }) {
    this.providerFactory = providerFactory;
    this.requestOptions = requestOptions;
  }

  async run(state, context) {
    const provider = await this.providerFactory();
    updateProviderInfo(state, provider);
    const { json, result, inputTokenEstimate, outputTokenEstimate } = await callLLMJson(
      provider,
      "planner",
      [
        "You are PlannerAgent in a local coding workflow.",
        "Agents do not chat with each other. You only read the serialized graph state supplied by the orchestrator.",
        "Return strict JSON with keys: goal, implementationSteps, likelyFiles, riskLevel, requiredTools, testStrategy."
      ].join("\n"),
      {
        userTask: state.userGoal,
        repoPath: state.repoPath,
        selectedFiles: state.selectedFiles,
        selectedFunction: state.selectedFunction,
        previousContext: state.previousContext
      },
      { ...this.requestOptions, signal: context.signal }
    );

    state.plan = {
      goal: String(json.goal || state.userGoal || "Implement the requested change."),
      implementationSteps: Array.isArray(json.implementationSteps) ? json.implementationSteps.map(String) : [],
      likelyFiles: Array.isArray(json.likelyFiles) ? json.likelyFiles.map(normalizeSlash) : state.selectedFiles,
      riskLevel: ["low", "medium", "high"].includes(json.riskLevel) ? json.riskLevel : "medium",
      requiredTools: Array.isArray(json.requiredTools) ? json.requiredTools.map(String) : ["CodeGraphProvider", "PatchApplyTool", "TestRunnerTool"],
      testStrategy: String(json.testStrategy || "Run detected project tests and lint commands.")
    };
    state.telemetry.llmCalls.push({ agent: "PlannerAgent", requestId: result.requestId, inputTokenEstimate, outputTokenEstimate });
    return state;
  }
}

class CoderAgent {
  constructor({ providerFactory, requestOptions = {} }) {
    this.providerFactory = providerFactory;
    this.requestOptions = requestOptions;
  }

  async run(state, context) {
    const provider = await this.providerFactory();
    updateProviderInfo(state, provider);
    const { text, result, inputTokenEstimate, outputTokenEstimate } = await callLLMText(
      provider,
      "coder",
      [
        "You are CoderAgent in a local coding workflow.",
        "You receive task, plan, retrieved context, and previous errors through graph state only.",
        "Return a unified diff patch only. Do not include prose, markdown fences, or commentary.",
        "Patch paths must be repo-relative and use diff --git headers."
      ].join("\n"),
      {
        task: state.userGoal,
        plan: state.plan,
        retrievedContext: state.graphContext,
        previousErrors: state.parsedErrors,
        debugRequest: state.debug,
        review: state.review
      },
      { ...this.requestOptions, signal: context.signal }
    );

    const diff = stripPatchEnvelope(text);
    const metadata = summarizePatch(diff);
    const validation = validateUnifiedDiffPatch(diff);
    const patch = {
      id: `patch_${String(state.patches.length + 1).padStart(3, "0")}`,
      diff,
      summary: metadata.summary,
      filesTouched: validation.filesTouched.length ? validation.filesTouched : metadata.filesTouched,
      confidence: validation.ok ? metadata.confidence : "low",
      risk: validation.ok ? metadata.risk : "high",
      validation,
      iteration: state.iteration + 1,
      generatedAt: now()
    };
    state.iteration += 1;
    state.currentPatch = patch;
    state.patches.push(patch);
    state.telemetry.llmCalls.push({ agent: "CoderAgent", requestId: result.requestId, inputTokenEstimate, outputTokenEstimate });
    return state;
  }
}

class DebuggerAgent {
  constructor({ providerFactory, requestOptions = {} }) {
    this.providerFactory = providerFactory;
    this.requestOptions = requestOptions;
  }

  async run(state, context) {
    const provider = await this.providerFactory();
    updateProviderInfo(state, provider);
    const latestPatchApply = state.patchApplyResults.at(-1) || null;
    const latestTestRun = state.testRuns.at(-1) || null;
    const { json, result, inputTokenEstimate, outputTokenEstimate } = await callLLMJson(
      provider,
      "debugger",
      [
        "You are DebuggerAgent in a local coding workflow.",
        "Diagnose only from graph state: failed patch/test logs, parsed errors, current patch, and relevant files.",
        "Return strict JSON with keys: diagnosis, requiredFix, updatedPatchRequest, likelyFiles."
      ].join("\n"),
      {
        failedPatch: latestPatchApply,
        failedTests: latestTestRun,
        parsedErrorLocations: state.parsedErrors,
        currentPatch: state.currentPatch,
        relevantFiles: state.graphContext?.relevantFiles || []
      },
      { ...this.requestOptions, signal: context.signal }
    );

    state.debug = {
      diagnosis: String(json.diagnosis || "The previous attempt failed."),
      requiredFix: String(json.requiredFix || "Revise the patch to address the latest failure."),
      updatedPatchRequest: String(json.updatedPatchRequest || "Generate a corrected unified diff patch."),
      likelyFiles: Array.isArray(json.likelyFiles) ? json.likelyFiles.map(normalizeSlash) : state.currentPatch?.filesTouched || [],
      createdAt: now(),
      iteration: state.iteration
    };
    state.telemetry.llmCalls.push({ agent: "DebuggerAgent", requestId: result.requestId, inputTokenEstimate, outputTokenEstimate });
    return state;
  }
}

class CriticAgent {
  constructor({ providerFactory, requestOptions = {} }) {
    this.providerFactory = providerFactory;
    this.requestOptions = requestOptions;
  }

  async run(state, context) {
    const provider = await this.providerFactory();
    updateProviderInfo(state, provider);
    const { json, result, inputTokenEstimate, outputTokenEstimate } = await callLLMJson(
      provider,
      "critic",
      [
        "You are CriticAgent in a local coding workflow.",
        "Review only the final patch, user task, and deterministic test results in graph state.",
        "Return strict JSON with keys: approved, risks, missingTests, regressions, requiredChanges, nextAgent.",
        "nextAgent may be coder or debugger when rejected."
      ].join("\n"),
      {
        finalPatch: state.currentPatch,
        task: state.userGoal,
        testResults: state.testRuns.at(-1) || null
      },
      { ...this.requestOptions, signal: context.signal }
    );

    state.review = {
      approved: Boolean(json.approved),
      risks: Array.isArray(json.risks) ? json.risks.map(String) : [],
      missingTests: Array.isArray(json.missingTests) ? json.missingTests.map(String) : [],
      regressions: Array.isArray(json.regressions) ? json.regressions.map(String) : [],
      requiredChanges: Array.isArray(json.requiredChanges) ? json.requiredChanges.map(String) : [],
      nextAgent: json.nextAgent === "debugger" ? "debugger" : "coder",
      reviewedAt: now()
    };
    state.telemetry.llmCalls.push({ agent: "CriticAgent", requestId: result.requestId, inputTokenEstimate, outputTokenEstimate });
    return state;
  }
}

class FinalizerAgent {
  async run(state) {
    const latestTests = state.testRuns.at(-1);
    const latestPatch = state.currentPatch;
    state.finalizer = {
      finalSummary: latestPatch?.summary || "No patch was generated.",
      filesChanged: latestPatch?.filesTouched || [],
      testsRun: latestTests?.commands?.map((command) => command.displayCommand) || [],
      risks: state.review?.risks || [],
      instructions: "Patch was applied and tested in the orchestrator sandbox. Keep the generated diff if you want to apply it to the real repo; discard the sandbox to revert.",
      completedAt: now()
    };
    return state;
  }
}

export class SimpleCodeGraphProvider {
  constructor({ repoPath, readGraph = null, maxFiles = 8, maxCharsPerFile = 5000 } = {}) {
    this.repoPath = repoPath;
    this.readGraph = readGraph;
    this.maxFiles = maxFiles;
    this.maxCharsPerFile = maxCharsPerFile;
  }

  async query({ state }) {
    const repoPath = state.repoPath || this.repoPath;
    const graph = this.readGraph ? await this.readGraph().catch(() => null) : null;
    const files = await this.listFiles(repoPath);
    const terms = this.searchTerms(state);
    const ranked = this.rankFiles(files, state, terms, graph).slice(0, this.maxFiles);
    const contextFiles = [];
    for (const filePath of ranked) {
      const absolutePath = path.join(repoPath, filePath);
      const content = await fs.readFile(absolutePath, "utf8").catch(() => "");
      contextFiles.push({
        path: filePath,
        content: truncateText(content, this.maxCharsPerFile)
      });
    }

    const relevantSymbols = this.extractSymbols(contextFiles, graph);
    const dependencyPaths = this.extractDependencies(contextFiles, graph);
    const testsLikelyAffected = this.findLikelyTests(files, ranked, graph);

    return {
      relevantFiles: ranked,
      relevantSymbols,
      dependencyPaths,
      blastRadius: [...new Set([...ranked, ...dependencyPaths.flatMap((edge) => [edge.source, edge.target]).filter(Boolean)])],
      testsLikelyAffected,
      contextBundle: contextFiles
        .map((file) => [`# ${file.path}`, file.content].join("\n"))
        .join("\n\n---\n\n")
    };
  }

  async listFiles(repoPath) {
    const results = [];
    const walk = async (directory, relative = "") => {
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(absolutePath, relativePath);
          continue;
        }
        if (entry.isFile() && isLikelySourceFile(relativePath)) {
          results.push(normalizeSlash(relativePath));
        }
      }
    };
    await walk(repoPath);
    return results.sort();
  }

  searchTerms(state) {
    const text = [
      state.userGoal,
      state.plan?.goal,
      ...(state.plan?.likelyFiles || []),
      ...(state.plan?.implementationSteps || []),
      ...(state.selectedFiles || [])
    ].join(" ");
    return [...new Set(String(text).toLowerCase().match(/[a-z0-9_./-]{3,}/g) || [])];
  }

  rankFiles(files, state, terms, graph) {
    const graphFiles = new Set((graph?.nodes || []).filter((node) => node.kind === "file").map((node) => normalizeSlash(node.path)));
    const likelyFiles = new Set([...(state.plan?.likelyFiles || []), ...(state.selectedFiles || [])].map(normalizeSlash));
    return files
      .map((filePath) => {
        const lower = filePath.toLowerCase();
        let score = 0;
        if (likelyFiles.has(filePath)) score += 100;
        if (graphFiles.has(filePath)) score += 4;
        if (/(^|\/)(test|tests|__tests__)\//.test(lower) || /\.test\./.test(lower) || /\.spec\./.test(lower)) score -= 8;
        for (const term of terms) {
          if (lower.includes(term.replace(/^src\//, ""))) score += term.includes("/") ? 12 : 3;
        }
        return { filePath, score };
      })
      .sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath))
      .map((item) => item.filePath);
  }

  extractSymbols(contextFiles, graph) {
    const graphSymbols = new Map();
    for (const node of graph?.nodes || []) {
      if (node.kind === "function" || node.kind === "class") {
        const list = graphSymbols.get(normalizeSlash(node.path)) || [];
        list.push({
          name: node.name,
          path: normalizeSlash(node.path),
          kind: node.kind,
          line: node.line || null
        });
        graphSymbols.set(normalizeSlash(node.path), list);
      }
    }

    const symbols = [];
    for (const file of contextFiles) {
      symbols.push(...(graphSymbols.get(file.path) || []));
      const regex = /\b(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g;
      let match;
      while ((match = regex.exec(file.content))) {
        const line = file.content.slice(0, match.index).split(/\r?\n/).length;
        symbols.push({ name: match[1], path: file.path, kind: "symbol", line });
      }
    }
    return symbols.slice(0, 32);
  }

  extractDependencies(contextFiles, graph) {
    const paths = [];
    const contextSet = new Set(contextFiles.map((file) => file.path));
    for (const edge of graph?.edges || []) {
      if (edge.type !== "imports") continue;
      const source = normalizeSlash(edge.source || "").replace(/^file:/, "");
      const target = normalizeSlash(edge.target || "").replace(/^file:/, "");
      if (contextSet.has(source) || contextSet.has(target)) {
        paths.push({ source, target, type: "imports" });
      }
    }
    for (const file of contextFiles) {
      const imports = [...file.content.matchAll(/from\s+["'](.+?)["']|import\s+["'](.+?)["']/g)]
        .map((match) => match[1] || match[2])
        .filter(Boolean)
        .slice(0, 16);
      for (const importPath of imports) {
        paths.push({ source: file.path, target: importPath, type: "imports" });
      }
    }
    return paths.slice(0, 48);
  }

  findLikelyTests(files, relevantFiles, graph) {
    const graphTests = new Set();
    for (const node of graph?.nodes || []) {
      if (node.kind === "file" && Array.isArray(node.relatedTests)) {
        for (const testPath of node.relatedTests) graphTests.add(normalizeSlash(testPath));
      }
    }
    const relevantNames = new Set(relevantFiles.map((file) => path.basename(file).replace(/\.(test|spec)?\.?[tj]sx?$/, "").toLowerCase()));
    return files
      .filter((file) => graphTests.has(file) || /\.test\.|\.spec\.|(^|\/)(test|tests|__tests__)\//.test(file.toLowerCase()))
      .filter((file) => {
        const lower = path.basename(file).toLowerCase();
        return graphTests.has(file) || [...relevantNames].some((name) => lower.includes(name));
      })
      .slice(0, 12);
  }
}

class GraphRetrieverAgent {
  constructor({ codeGraphProvider }) {
    this.codeGraphProvider = codeGraphProvider;
  }

  async run(state, context) {
    const graphContext = this.codeGraphProvider.queryRelevantContext
      ? await this.codeGraphProvider.queryRelevantContext(state.plan?.goal || state.userGoal, {
          selectedFiles: state.selectedFiles,
          currentFile: state.selectedFiles[0],
          currentSymbol: state.selectedFunction?.name || state.selectedFunction || "",
          likelyFiles: state.plan?.likelyFiles || [],
          maxFiles: 8,
          signal: context.signal
        })
      : await this.codeGraphProvider.query({ state, signal: context.signal });
    state.graphContext = graphContext;
    state.telemetry.graphStats = graphContext.graphStats || this.codeGraphProvider.getGraphStats?.() || null;
    state.telemetry.selectedSubgraph = graphContext.selectedSubgraph
      ? {
          nodeCount: graphContext.selectedSubgraph.nodes?.length || 0,
          edgeCount: graphContext.selectedSubgraph.edges?.length || 0
        }
      : null;
    return state;
  }
}

async function copyRepoToSandbox(repoPath, sandboxPath) {
  await fs.mkdir(path.dirname(sandboxPath), { recursive: true });
  await fs.rm(sandboxPath, { recursive: true, force: true });
  await fs.cp(repoPath, sandboxPath, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      return !IGNORED_DIRS.has(base);
    }
  });
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

export class SandboxPatchApplyTool {
  constructor({ workspaceRoot, sandboxRoot = null, execFileImpl = execFileAsync } = {}) {
    if (!workspaceRoot) throw new Error("workspaceRoot is required.");
    this.workspaceRoot = workspaceRoot;
    this.sandboxRoot = sandboxRoot || path.join(workspaceRoot, ".agent_tasks", "sandboxes");
    this.execFileImpl = execFileImpl;
  }

  async applyPatch(state, { signal } = {}) {
    const startedAt = now();
    const patch = state.currentPatch;
    const validation = patch?.validation || validateUnifiedDiffPatch(patch?.diff || "");
    if (!patch || !validation.ok) {
      return {
        ok: false,
        patchId: patch?.id || null,
        sandboxPath: null,
        filesTouched: validation.filesTouched,
        output: validation.errors.join("\n") || "Patch validation failed.",
        error: validation.errors.join("\n") || "Patch validation failed.",
        startedAt,
        completedAt: now()
      };
    }

    if (signal?.aborted) throw new Error("Run cancelled.");
    const safeTask = state.taskId.replace(/[^A-Za-z0-9_-]/g, "_");
    const sandboxPath = ensureInside(this.sandboxRoot, path.join(this.sandboxRoot, safeTask, `attempt_${patch.iteration}`), "sandboxPath");
    const patchPath = ensureInside(this.sandboxRoot, path.join(sandboxPath, ".holocode.patch.diff"), "patchPath");

    try {
      await copyRepoToSandbox(state.repoPath, sandboxPath);
      await fs.writeFile(patchPath, `${patch.diff.trim()}\n`, "utf8");
      await this.execFileImpl("git", ["apply", "--check", patchPath], {
        cwd: sandboxPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        signal
      });
      const applied = await this.execFileImpl("git", ["apply", patchPath], {
        cwd: sandboxPath,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        signal
      });
      return {
        ok: true,
        patchId: patch.id,
        sandboxPath,
        filesTouched: validation.filesTouched,
        output: [applied.stdout, applied.stderr].filter(Boolean).join("\n") || "Patch applied in sandbox.",
        error: null,
        startedAt,
        completedAt: now()
      };
    } catch (error) {
      return {
        ok: false,
        patchId: patch.id,
        sandboxPath,
        filesTouched: validation.filesTouched,
        output: [error.stdout, error.stderr, error.message].filter(Boolean).join("\n"),
        error: error.message,
        startedAt,
        completedAt: now()
      };
    }
  }
}

function packageManagerFor(repoPath, files) {
  if (files.has("pnpm-lock.yaml")) return { command: "pnpm", runArgs: (script) => ["run", script] };
  if (files.has("yarn.lock")) return { command: "yarn", runArgs: (script) => (script === "test" ? ["test"] : ["run", script]) };
  if (files.has("package-lock.json") || files.has("package.json")) {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    return { command: npmCommand, runArgs: (script) => (script === "test" ? ["test"] : ["run", script]) };
  }
  return null;
}

export class NodePackageTestRunnerTool {
  constructor({ execFileImpl = execFileAsync, timeoutMs = 120000 } = {}) {
    this.execFileImpl = execFileImpl;
    this.timeoutMs = timeoutMs;
  }

  async runTests(state, { signal } = {}) {
    const startedAt = now();
    const latestApply = state.patchApplyResults.at(-1);
    const workingDirectory = latestApply?.sandboxPath || state.repoPath;
    const packagePath = path.join(workingDirectory, "package.json");
    const packageJson = await fs
      .readFile(packagePath, "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (!packageJson) {
      return {
        ok: true,
        skipped: true,
        workingDirectory,
        commands: [],
        output: "No package.json found. Test runner skipped.",
        errors: [],
        startedAt,
        completedAt: now()
      };
    }

    const names = new Set(await fs.readdir(workingDirectory).catch(() => []));
    const manager = packageManagerFor(workingDirectory, names);
    const scripts = packageJson.scripts || {};
    const safeScripts = ["lint", "test", "build"].filter((script) => typeof scripts[script] === "string");
    if (!manager || !safeScripts.length) {
      return {
        ok: true,
        skipped: true,
        workingDirectory,
        commands: [],
        output: "No safe npm/yarn/pnpm lint, test, or build scripts were detected.",
        errors: [],
        startedAt,
        completedAt: now()
      };
    }

    const commands = [];
    const logs = [];
    for (const script of safeScripts) {
      if (signal?.aborted) throw new Error("Run cancelled.");
      const args = manager.runArgs(script);
      const displayCommand = `${manager.command} ${args.join(" ")}`;
      const commandStartedAt = now();
      try {
        const result = await this.execFileImpl(manager.command, args, {
          cwd: workingDirectory,
          windowsHide: true,
          timeout: this.timeoutMs,
          maxBuffer: 20 * 1024 * 1024,
          signal
        });
        const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
        commands.push({
          script,
          displayCommand,
          ok: true,
          exitCode: 0,
          output: truncateText(output, 12000),
          startedAt: commandStartedAt,
          completedAt: now()
        });
        logs.push(output);
      } catch (error) {
        const output = [error.stdout, error.stderr, error.message].filter(Boolean).join("\n");
        commands.push({
          script,
          displayCommand,
          ok: false,
          exitCode: Number.isFinite(error.code) ? error.code : null,
          output: truncateText(output, 12000),
          startedAt: commandStartedAt,
          completedAt: now()
        });
        logs.push(output);
        break;
      }
    }

    const output = logs.join("\n\n");
    return {
      ok: commands.every((command) => command.ok),
      skipped: false,
      workingDirectory,
      commands,
      output: truncateText(output, 24000),
      errors: parseErrorLocations(output),
      startedAt,
      completedAt: now()
    };
  }
}

function routeAfterTests(state) {
  const latestPatch = state.patchApplyResults.at(-1);
  const latestTests = state.testRuns.at(-1);
  if (state.iteration >= state.maxIterations && (!latestPatch?.ok || !latestTests?.ok)) return "needs_human_review";
  if (!latestPatch?.ok || !latestTests?.ok) return "debugger";
  return "critic";
}

function routeAfterCritic(state) {
  if (state.review?.approved) return "finalizer";
  if (state.iteration >= state.maxIterations) return "needs_human_review";
  return state.review?.nextAgent === "debugger" ? "debugger" : "coder";
}

async function loadLangGraphRuntime() {
  try {
    const runtime = await import("@langchain/langgraph");
    return runtime?.StateGraph ? runtime : null;
  } catch {
    return null;
  }
}

export function createCodingAgentOrchestrator({
  workspaceRoot,
  repoPath,
  provider,
  providerFactory,
  requestOptions = {},
  codeGraphProvider,
  patchApplyTool,
  testRunnerTool,
  enableNativeLangGraph = true
} = {}) {
  if (!provider && !providerFactory) {
    throw new Error("A provider or providerFactory is required.");
  }
  const resolvedProviderFactory = providerFactory || (() => provider);
  const emitter = new EventEmitter();
  const runs = new Map();
  const controllers = new Map();
  const activeCodeGraphProvider = codeGraphProvider || createCodeGraphProvider({ type: "internal", repoPath });
  const activePatchApplyTool = patchApplyTool || new SandboxPatchApplyTool({ workspaceRoot: workspaceRoot || process.cwd() });
  const activeTestRunnerTool = testRunnerTool || new NodePackageTestRunnerTool();
  let graphRuntimePromise = null;

  const agents = {
    planner: new PlannerAgent({ providerFactory: resolvedProviderFactory, requestOptions }),
    graphRetriever: new GraphRetrieverAgent({ codeGraphProvider: activeCodeGraphProvider }),
    coder: new CoderAgent({ providerFactory: resolvedProviderFactory, requestOptions }),
    debugger: new DebuggerAgent({ providerFactory: resolvedProviderFactory, requestOptions }),
    critic: new CriticAgent({ providerFactory: resolvedProviderFactory, requestOptions }),
    finalizer: new FinalizerAgent()
  };

  function emit(state, type, payload = {}) {
    state.timestamps.updatedAt = now();
    state.telemetry.eventsEmitted += 1;
    const event = {
      type,
      taskId: state.taskId,
      status: state.status,
      iteration: state.iteration,
      timestamp: state.timestamps.updatedAt,
      ...payload
    };
    emitter.emit("event", event);
    return event;
  }

  function emitTelemetry(state) {
    emit(state, AGENT_EVENT_TYPES.telemetryUpdate, {
      telemetry: cloneJson(state.telemetry)
    });
  }

  async function runNode(state, nodeName, fn, eventNames = {}) {
    if (state.cancellationRequested) throw new Error("Run cancelled.");
    appendVisit(state, nodeName);
    state.status = eventNames.status || state.status;
    emit(state, eventNames.started || AGENT_EVENT_TYPES.agentStarted, { agent: nodeName });
    try {
      const next = await fn(state);
      emit(next, eventNames.completed || AGENT_EVENT_TYPES.agentCompleted, { agent: nodeName });
      emitTelemetry(next);
      return next;
    } catch (error) {
      state.telemetry.errors.push({ node: nodeName, message: error.message, timestamp: now() });
      emit(state, eventNames.failed || AGENT_EVENT_TYPES.agentFailed, { agent: nodeName, error: error.message });
      throw error;
    }
  }

  async function runPlanner(state, context) {
    return runNode(state, "PlannerAgent", (current) => agents.planner.run(current, context), { status: "planning" });
  }

  async function runRetriever(state, context) {
    return runNode(state, "GraphRetrieverAgent", (current) => agents.graphRetriever.run(current, context), {
      status: "retrieving",
      completed: AGENT_EVENT_TYPES.graphContextSelected
    });
  }

  async function runCoder(state, context) {
    return runNode(state, "CoderAgent", (current) => agents.coder.run(current, context), {
      status: "coding",
      completed: AGENT_EVENT_TYPES.patchGenerated
    });
  }

  async function runPatchApply(state, context) {
    return runNode(
      state,
      "PatchApplyTool",
      async (current) => {
        const result = await activePatchApplyTool.applyPatch(current, context);
        current.patchApplyResults.push(result);
        if (!result.ok) current.parsedErrors = parseErrorLocations(result.output || result.error || "");
        return current;
      },
      {
        status: "applying_patch",
        started: AGENT_EVENT_TYPES.patchApplyStarted,
        completed: AGENT_EVENT_TYPES.patchApplyCompleted
      }
    );
  }

  async function runTests(state, context) {
    return runNode(
      state,
      "TestRunnerTool",
      async (current) => {
        const latestPatch = current.patchApplyResults.at(-1);
        if (!latestPatch?.ok) {
          current.testRuns.push({
            ok: false,
            skipped: true,
            workingDirectory: latestPatch?.sandboxPath || current.repoPath,
            commands: [],
            output: "Patch apply failed. Tests were not run.",
            errors: current.parsedErrors,
            startedAt: now(),
            completedAt: now()
          });
          return current;
        }
        const result = await activeTestRunnerTool.runTests(current, context);
        current.testRuns.push(result);
        if (!result.ok) current.parsedErrors = result.errors?.length ? result.errors : parseErrorLocations(result.output);
        return current;
      },
      {
        status: "testing",
        started: AGENT_EVENT_TYPES.testStarted,
        completed: AGENT_EVENT_TYPES.testCompleted
      }
    );
  }

  async function runDebugger(state, context) {
    emit(state, AGENT_EVENT_TYPES.debugIterationStarted, { iteration: state.iteration });
    return runNode(state, "DebuggerAgent", (current) => agents.debugger.run(current, context), { status: "debugging" });
  }

  async function runCritic(state, context) {
    return runNode(state, "CriticAgent", (current) => agents.critic.run(current, context), {
      status: "reviewing",
      completed: AGENT_EVENT_TYPES.criticReviewCompleted
    });
  }

  async function runFinalizer(state, context) {
    return runNode(state, "FinalizerAgent", (current) => agents.finalizer.run(current, context), { status: "finalizing" });
  }

  async function runLocalGraph(initialState, context) {
    let state = initialState;
    state.telemetry.graphRuntime = "local";
    state = await runPlanner(state, context);
    state = await runRetriever(state, context);

    while (state.status !== "completed" && state.status !== "needs_human_review") {
      state = await runCoder(state, context);
      state = await runPatchApply(state, context);
      state = await runTests(state, context);

      const testRoute = routeAfterTests(state);
      if (testRoute === "needs_human_review") {
        state.status = "needs_human_review";
        break;
      }
      if (testRoute === "debugger") {
        state = await runDebugger(state, context);
        continue;
      }

      state = await runCritic(state, context);
      const criticRoute = routeAfterCritic(state);
      if (criticRoute === "finalizer") {
        state = await runFinalizer(state, context);
        state.status = "completed";
        break;
      }
      if (criticRoute === "needs_human_review") {
        state.status = "needs_human_review";
        break;
      }
      if (criticRoute === "debugger") {
        state = await runDebugger(state, context);
      }
    }

    return state;
  }

  async function runNativeLangGraph(runtime, initialState, context) {
    const { StateGraph, Annotation } = runtime;
    if (!StateGraph || !Annotation?.Root) {
      return runLocalGraph(initialState, context);
    }

    const defaults = makeRunState({ taskId: "default", userGoal: "", repoPath: initialState.repoPath });
    const channels = Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [
        key,
        Annotation({
          reducer: (_previous, next) => next,
          default: () => cloneJson(value)
        })
      ])
    );
    const StateAnnotation = Annotation.Root(channels);
    const START = runtime.START || "__start__";
    const END = runtime.END || "__end__";
    const graph = new StateGraph(StateAnnotation)
      .addNode("planner", (state) => runPlanner(state, context))
      .addNode("graphRetriever", (state) => runRetriever(state, context))
      .addNode("coder", (state) => runCoder(state, context))
      .addNode("patchApply", (state) => runPatchApply(state, context))
      .addNode("testRunner", (state) => runTests(state, context))
      .addNode("debugger", (state) => runDebugger(state, context))
      .addNode("critic", (state) => runCritic(state, context))
      .addNode("finalizer", async (state) => {
        const next = await runFinalizer(state, context);
        next.status = "completed";
        return next;
      })
      .addNode("needsHumanReview", (state) => {
        state.status = "needs_human_review";
        return state;
      })
      .addEdge(START, "planner")
      .addEdge("planner", "graphRetriever")
      .addEdge("graphRetriever", "coder")
      .addEdge("coder", "patchApply")
      .addEdge("patchApply", "testRunner")
      .addConditionalEdges("testRunner", routeAfterTests, {
        debugger: "debugger",
        critic: "critic",
        needs_human_review: "needsHumanReview"
      })
      .addEdge("debugger", "coder")
      .addConditionalEdges("critic", routeAfterCritic, {
        coder: "coder",
        debugger: "debugger",
        finalizer: "finalizer",
        needs_human_review: "needsHumanReview"
      })
      .addEdge("needsHumanReview", END)
      .addEdge("finalizer", END);

    const compiled = graph.compile();
    const finalState = await compiled.invoke(initialState);
    finalState.telemetry.graphRuntime = "@langchain/langgraph";
    return finalState;
  }

  async function run(input = {}) {
    const state = makeRunState({
      ...input,
      repoPath: input.repoPath || repoPath,
      providerName: input.providerName,
      modelName: input.modelName
    });
    const controller = new AbortController();
    controllers.set(state.taskId, controller);
    runs.set(state.taskId, state);
    state.status = "running";
    state.timestamps.startedAt = now();
    emit(state, AGENT_EVENT_TYPES.agentStarted, { agent: "LangGraphWorkflow", graphNodes: GRAPH_NODE_ORDER });

    try {
      const runtime = enableNativeLangGraph
        ? await (graphRuntimePromise ||= loadLangGraphRuntime()).catch(() => null)
        : null;
      const finalState = runtime
        ? await runNativeLangGraph(runtime, state, { signal: controller.signal })
        : await runLocalGraph(state, { signal: controller.signal });
      finalState.timestamps.completedAt = now();
      runs.set(finalState.taskId, finalState);
      controllers.delete(finalState.taskId);

      if (finalState.status === "completed") {
        emit(finalState, AGENT_EVENT_TYPES.runCompleted, { state: compactState(finalState) });
      } else if (finalState.status === "needs_human_review") {
        emit(finalState, AGENT_EVENT_TYPES.runFailed, {
          reason: "needs_human_review",
          state: compactState(finalState)
        });
      }
      return finalState;
    } catch (error) {
      state.status = controller.signal.aborted ? "cancelled" : "failed";
      state.timestamps.completedAt = now();
      state.telemetry.errors.push({ node: "LangGraphWorkflow", message: error.message, timestamp: now() });
      runs.set(state.taskId, state);
      controllers.delete(state.taskId);
      emit(state, AGENT_EVENT_TYPES.runFailed, { error: error.message, state: compactState(state) });
      return state;
    }
  }

  function cancel(taskId) {
    const controller = controllers.get(taskId);
    const state = runs.get(taskId);
    if (!controller || !state) return false;
    state.cancellationRequested = true;
    controller.abort();
    return true;
  }

  function listRuns() {
    return [...runs.values()]
      .map(compactState)
      .sort((a, b) => String(b.timestamps.startedAt || "").localeCompare(String(a.timestamps.startedAt || "")));
  }

  function getRun(taskId) {
    const state = runs.get(taskId);
    return state ? compactState(state) : null;
  }

  function getRunState(taskId) {
    return runs.get(taskId) || null;
  }

  function subscribe(listener) {
    emitter.on("event", listener);
    return () => emitter.off("event", listener);
  }

  return {
    run,
    cancel,
    listRuns,
    getRun,
    getRunState,
    subscribe,
    graphDefinition: {
      nodes: GRAPH_NODE_ORDER,
      edges: [
        ["START", "PlannerAgent"],
        ["PlannerAgent", "GraphRetrieverAgent"],
        ["GraphRetrieverAgent", "CoderAgent"],
        ["CoderAgent", "PatchApplyTool"],
        ["PatchApplyTool", "TestRunnerTool"],
        ["TestRunnerTool", "DebuggerAgent", "patch_failed_or_tests_failed"],
        ["TestRunnerTool", "CriticAgent", "tests_passed"],
        ["DebuggerAgent", "CoderAgent"],
        ["CriticAgent", "CoderAgent", "critic_rejects_code_change"],
        ["CriticAgent", "DebuggerAgent", "critic_rejects_failure_analysis_needed"],
        ["CriticAgent", "FinalizerAgent", "critic_approves"],
        ["FinalizerAgent", "END"]
      ]
    }
  };
}

export { makeRunState as createInitialAgentRunState, compactState };
