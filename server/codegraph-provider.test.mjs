import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ExternalJsonCodeGraphProvider, InternalCodeGraphProvider, McpCodeGraphProvider, normalizeExternalGraph } from "./codegraph-provider.mjs";
import { createCodingAgentOrchestrator } from "./coding-agent-orchestrator.mjs";
import { LLMProvider } from "./llm/index.mjs";

const PATCH = `diff --git a/src/b.ts b/src/b.ts
index 1111111..2222222 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-export function b() {
+export function b() {
`;

class ScriptedLLMProvider extends LLMProvider {
  constructor(script) {
    super({
      providerName: "scripted",
      modelName: "scripted-model",
      supportsJsonMode: true,
      supportsStreaming: false,
      supportsToolCalling: false,
      fetchImpl: async () => new Response("{}")
    });
    this.script = new Map(Object.entries(script).map(([role, values]) => [role, [...values]]));
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    const queue = this.script.get(options.agentRole) || [];
    if (!queue.length) throw new Error(`No scripted response for ${options.agentRole}.`);
    const next = queue.shift();
    return this.completeRequest(context, {
      content: typeof next === "string" ? next : JSON.stringify(next)
    });
  }
}

class PassingPatchTool {
  async applyPatch(state) {
    return {
      ok: true,
      patchId: state.currentPatch.id,
      sandboxPath: state.repoPath,
      filesTouched: state.currentPatch.filesTouched,
      output: "patch ok",
      error: null,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }
}

class PassingTestTool {
  async runTests() {
    return {
      ok: true,
      skipped: false,
      workingDirectory: "fixture",
      commands: [{ script: "test", displayCommand: "npm test", ok: true, exitCode: 0, output: "ok" }],
      output: "ok",
      errors: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }
}

async function writeFixtureRepo() {
  const repoPath = await fs.mkdtemp(path.join(os.tmpdir(), "holocode-graph-"));
  await fs.mkdir(path.join(repoPath, "src"), { recursive: true });
  await fs.mkdir(path.join(repoPath, "tests"), { recursive: true });
  await fs.writeFile(
    path.join(repoPath, "package.json"),
    JSON.stringify({ scripts: { test: "node tests/a.test.ts", build: "tsc --noEmit" } }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoPath, "src", "a.ts"),
    [
      'import { b } from "./b";',
      "",
      "export interface AValue { value: number }",
      "",
      "export function a(): AValue {",
      "  return { value: b() };",
      "}"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoPath, "src", "b.ts"),
    [
      "export class Box {",
      "  read() {",
      "    return b();",
      "  }",
      "}",
      "",
      "export function b() {",
      "  return 1;",
      "}"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(repoPath, "tests", "a.test.ts"),
    ['import { a } from "../src/a";', "", "test('a', () => {", "  a();", "});"].join("\n"),
    "utf8"
  );
  return repoPath;
}

const repoPath = await writeFixtureRepo();
const dataPath = path.join(repoPath, "codegraph.json");
const provider = new InternalCodeGraphProvider({ repoPath, dataPath });
const graph = await provider.buildGraph(repoPath);

{
  assert.ok(graph.nodes.some((node) => node.kind === "repository"), "repository node should be present");
  assert.ok(graph.nodes.some((node) => node.kind === "interface" && node.name === "AValue"), "interfaces should be parsed");
  assert.ok(graph.nodes.some((node) => node.kind === "method" && node.symbolName === "Box.read"), "class methods should be parsed");
  assert.ok(graph.nodes.some((node) => node.kind === "package_script" && node.name === "test"), "package scripts should be nodes");
  assert.ok(
    graph.edges.some((edge) => edge.type === "imports" && edge.source === "file:src/a.ts" && edge.target === "file:src/b.ts"),
    "relative imports should create file import edges"
  );
  assert.ok(
    graph.edges.some((edge) => edge.type === "tests" && edge.source === "file:tests/a.test.ts" && edge.target === "file:src/a.ts"),
    "test files should create tests edges"
  );
}

{
  const blastRadius = await provider.getBlastRadius(["src/b.ts"]);
  assert.ok(blastRadius.affectedFiles.includes("src/a.ts"), "blast radius should include direct dependents");
  assert.ok(blastRadius.affectedFiles.includes("tests/a.test.ts"), "blast radius should include transitive test dependents");
}

{
  const vr = await provider.exportGraphForVR({ changedFiles: [{ path: "src/b.ts", additions: 3 }] });
  assert.ok(Array.isArray(vr.nodes));
  assert.ok(Array.isArray(vr.edges));
  assert.ok(Array.isArray(vr.clusters));
  assert.equal(typeof vr.stats.nodeCount, "number");
  assert.ok(vr.nodes.find((node) => node.id === "file:src/b.ts")?.metrics?.changedLines);
}

{
  const context = await provider.queryRelevantContext("change b and check callers", { selectedFiles: ["src/b.ts"] });
  assert.ok(context.relevantFiles.includes("src/b.ts"));
  assert.ok(context.compactSnippets.some((snippet) => snippet.path === "src/b.ts"));
  assert.ok(context.graphExplanation.includes("Selected"));
}

const externalFixture = {
  schemaVersion: "external-fixture-v1",
  nodes: [
    { id: "external-file-a", type: "source_file", label: "a.ts", path: "src/a.ts", owner: "fixture" },
    { id: "external-file-b", type: "file", label: "b.ts", path: "src/b.ts" },
    { id: "external-test-a", type: "test_file", label: "a.test.ts", path: "tests/a.test.ts" },
    { id: "external-symbol-a", type: "function", label: "a", name: "a", path: "src/a.ts", cyclomatic: 2 },
    { id: "external-class-box", type: "class", label: "Box", name: "Box", path: "src/b.ts" },
    { id: "external-unknown", type: "axon_concept", label: "Domain Concept", metadata: { source: "axon" } }
  ],
  edges: [
    { source: "external-file-a", target: "external-symbol-a", type: "contains", role: "definition" },
    { source: "external-file-a", target: "external-file-b", type: "import" },
    { source: "external-symbol-a", target: "external-class-box", type: "call" },
    { source: "external-test-a", target: "external-file-a", type: "tests" },
    { source: "external-unknown", target: "external-file-a", type: "semantic_link", confidence: 0.8 }
  ]
};

{
  const normalized = normalizeExternalGraph(externalFixture, repoPath, "external_json");
  assert.ok(normalized.nodes.some((node) => node.id === "file:src/a.ts" && node.kind === "file"));
  assert.ok(normalized.nodes.some((node) => node.id === "symbol:src/a.ts#a" && node.kind === "function"));
  assert.ok(normalized.edges.some((edge) => edge.source === "file:src/a.ts" && edge.target === "file:src/b.ts" && edge.type === "imports"));
  const unknownNode = normalized.nodes.find((node) => node.id === "external-unknown");
  assert.equal(unknownNode.kind, "unknown");
  assert.equal(unknownNode.metadata.externalType, "axon_concept");
  const unknownEdge = normalized.edges.find((edge) => edge.type === "unknown");
  assert.equal(unknownEdge.metadata.externalType, "semantic_link");
  assert.ok(normalized.validation.warnings.length >= 2);
}

{
  assert.throws(() => normalizeExternalGraph({ nodes: [] }, repoPath, "external_json"), /edges array/);
  assert.throws(
    () => normalizeExternalGraph({ nodes: [{ id: "a", type: "file", path: "src/a.ts" }], edges: [{ source: "a", target: "missing", type: "imports" }] }, repoPath, "external_json"),
    /unknown node/
  );
}

{
  const externalPath = path.join(repoPath, "external-graph.json");
  await fs.writeFile(externalPath, JSON.stringify(externalFixture, null, 2), "utf8");
  const externalProvider = new ExternalJsonCodeGraphProvider({ repoPath, outputPath: externalPath });
  const externalGraph = await externalProvider.buildGraph(repoPath);
  assert.equal(externalGraph.provider.type, "external_json");
  assert.equal(externalGraph.stats.fileCount, 3);
  const vr = await externalProvider.exportGraphForVR();
  assert.ok(vr.nodes.some((node) => node.id === "file:src/a.ts"));
  assert.ok(vr.edges.some((edge) => edge.type === "imports"));
}

{
  const externalProvider = new ExternalJsonCodeGraphProvider({
    repoPath,
    externalCommand: "fixture-graph --repo {repoPath} --out {outputPath}",
    outputPath: path.join(repoPath, "command-output.json"),
    execFileImpl: async (command, args) => {
      assert.equal(command, "fixture-graph");
      assert.ok(args.includes(repoPath));
      return { stdout: JSON.stringify(externalFixture), stderr: "" };
    }
  });
  const externalGraph = await externalProvider.buildGraph(repoPath);
  assert.equal(externalGraph.stats.nodeCount, externalFixture.nodes.length);
}

{
  const mcpProvider = new McpCodeGraphProvider({
    repoPath,
    mcpServerUrl: "http://127.0.0.1:8787",
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:8787/graph");
      assert.equal(options.method, "POST");
      return new Response(JSON.stringify(externalFixture), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
  const graphFromMcp = await mcpProvider.buildGraph(repoPath);
  assert.equal(graphFromMcp.provider.type, "mcp");
  assert.ok(graphFromMcp.edges.some((edge) => edge.type === "calls"));
}

{
  const llm = new ScriptedLLMProvider({
    planner: [
      {
        goal: "change b",
        implementationSteps: ["edit src/b.ts"],
        likelyFiles: ["src/b.ts"],
        riskLevel: "low",
        requiredTools: ["CodeGraphProvider"],
        testStrategy: "npm test"
      }
    ],
    coder: [PATCH],
    critic: [{ approved: true, risks: [], missingTests: [], regressions: [], requiredChanges: [] }]
  });
  const orchestrator = createCodingAgentOrchestrator({
    workspaceRoot: repoPath,
    repoPath,
    provider: llm,
    codeGraphProvider: provider,
    patchApplyTool: new PassingPatchTool(),
    testRunnerTool: new PassingTestTool(),
    enableNativeLangGraph: false
  });
  const state = await orchestrator.run({ taskId: "task_001", userGoal: "change b", selectedFiles: ["src/b.ts"] });
  assert.equal(state.status, "completed");
  assert.ok(state.graphContext.relevantFiles.includes("src/b.ts"));
  assert.ok(state.telemetry.graphStats.nodeCount >= graph.stats.nodeCount);
  assert.ok(state.telemetry.selectedSubgraph.nodeCount > 0);
}

console.log("Code graph provider tests passed.");
