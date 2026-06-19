import assert from "node:assert/strict";
import { createCodingAgentOrchestrator } from "./coding-agent-orchestrator.mjs";
import { LLMProvider } from "./llm/index.mjs";

const PATCH_ONE = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-export const value = 1;
+export const value = 2;
`;

const PATCH_TWO = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..3333333 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-export const value = 1;
+export const value = 3;
`;

class ScriptedLLMProvider extends LLMProvider {
  constructor(script) {
    super({
      providerName: "scripted",
      modelName: "scripted-model",
      contextWindow: 4096,
      supportsJsonMode: true,
      supportsStreaming: false,
      supportsToolCalling: false,
      fetchImpl: async () => new Response("{}")
    });
    this.script = new Map(Object.entries(script).map(([role, values]) => [role, [...values]]));
    this.calls = [];
  }

  async generate(messages, options = {}) {
    const context = this.createRequestContext(messages, options, false);
    const role = options.agentRole;
    this.calls.push({ role, messages, options });
    const queue = this.script.get(role) || [];
    if (!queue.length) {
      throw new Error(`No scripted response for ${role}.`);
    }
    const value = queue.shift();
    const content = typeof value === "string" ? value : JSON.stringify(value);
    return this.completeRequest(context, { content });
  }
}

class MockCodeGraphProvider {
  async query() {
    return {
      relevantFiles: ["src/foo.ts"],
      relevantSymbols: [{ name: "value", path: "src/foo.ts", kind: "symbol", line: 1 }],
      dependencyPaths: [],
      blastRadius: ["src/foo.ts"],
      testsLikelyAffected: ["src/foo.test.ts"],
      contextBundle: "# src/foo.ts\nexport const value = 1;"
    };
  }
}

class MockPatchApplyTool {
  constructor(results = []) {
    this.results = [...results];
    this.calls = [];
  }

  async applyPatch(state) {
    this.calls.push(state.currentPatch?.id);
    const next = this.results.length ? this.results.shift() : { ok: true };
    return {
      patchId: state.currentPatch?.id || null,
      sandboxPath: `sandbox/${state.currentPatch?.id || "patch"}`,
      filesTouched: state.currentPatch?.filesTouched || [],
      output: next.output || (next.ok ? "patch ok" : "patch failed"),
      error: next.ok ? null : next.error || "patch failed",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      ...next
    };
  }
}

class MockTestRunnerTool {
  constructor(results = []) {
    this.results = [...results];
    this.calls = 0;
  }

  async runTests() {
    this.calls += 1;
    const next = this.results.length ? this.results.shift() : { ok: true };
    return {
      ok: next.ok,
      skipped: false,
      workingDirectory: "sandbox",
      commands: [
        {
          script: "test",
          displayCommand: "npm test",
          ok: next.ok,
          exitCode: next.ok ? 0 : 1,
          output: next.output || (next.ok ? "passing" : "src/foo.ts:1:1 failing"),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        }
      ],
      output: next.output || (next.ok ? "passing" : "src/foo.ts:1:1 failing"),
      errors: next.ok ? [] : [{ path: "src/foo.ts", line: 1, column: 1, message: "failing" }],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    };
  }
}

function makeOrchestrator({ provider, patchTool, testTool, maxIterations } = {}) {
  const events = [];
  const orchestrator = createCodingAgentOrchestrator({
    workspaceRoot: process.cwd(),
    repoPath: process.cwd(),
    provider,
    codeGraphProvider: new MockCodeGraphProvider(),
    patchApplyTool: patchTool || new MockPatchApplyTool(),
    testRunnerTool: testTool || new MockTestRunnerTool(),
    enableNativeLangGraph: false
  });
  orchestrator.subscribe((event) => events.push(event));
  return { orchestrator, events, maxIterations };
}

{
  const provider = new ScriptedLLMProvider({
    planner: [
      {
        goal: "change value",
        implementationSteps: ["edit src/foo.ts"],
        likelyFiles: ["src/foo.ts"],
        riskLevel: "low",
        requiredTools: ["PatchApplyTool", "TestRunnerTool"],
        testStrategy: "npm test"
      }
    ],
    coder: [PATCH_ONE],
    critic: [{ approved: true, risks: [], missingTests: [], regressions: [], requiredChanges: [] }]
  });
  const { orchestrator, events } = makeOrchestrator({ provider });
  const state = await orchestrator.run({ taskId: "task_001", userGoal: "change value", maxIterations: 4 });

  assert.equal(state.status, "completed");
  assert.equal(state.iteration, 1);
  assert.equal(state.plan.goal, "change value");
  assert.deepEqual(state.graphContext.relevantFiles, ["src/foo.ts"]);
  assert.equal(state.patchApplyResults[0].ok, true);
  assert.equal(state.testRuns[0].ok, true);
  assert.equal(state.review.approved, true);
  assert.ok(events.some((event) => event.type === "graph_context_selected"));
  assert.ok(events.some((event) => event.type === "patch_generated"));
  assert.ok(events.some((event) => event.type === "run_completed"));
}

{
  const provider = new ScriptedLLMProvider({
    planner: [{ goal: "fix tests", implementationSteps: [], likelyFiles: ["src/foo.ts"], riskLevel: "medium", requiredTools: [], testStrategy: "npm test" }],
    coder: [PATCH_ONE, PATCH_TWO],
    debugger: [{ diagnosis: "test failed", requiredFix: "adjust value", updatedPatchRequest: "try value 3", likelyFiles: ["src/foo.ts"] }],
    critic: [{ approved: true, risks: [], missingTests: [], regressions: [], requiredChanges: [] }]
  });
  const testTool = new MockTestRunnerTool([{ ok: false, output: "src/foo.ts:1:1 expected 3" }, { ok: true }]);
  const { orchestrator, events } = makeOrchestrator({ provider, testTool });
  const state = await orchestrator.run({ taskId: "task_002", userGoal: "fix tests", maxIterations: 4 });

  assert.equal(state.status, "completed");
  assert.equal(state.iteration, 2);
  assert.equal(state.patches.length, 2);
  assert.equal(state.testRuns.length, 2);
  assert.equal(testTool.calls, 2);
  assert.equal(provider.calls.map((call) => call.role).join(","), "planner,coder,debugger,coder,critic");
  assert.ok(events.some((event) => event.type === "debug_iteration_started"));
}

{
  const provider = new ScriptedLLMProvider({
    planner: [{ goal: "cannot pass", implementationSteps: [], likelyFiles: ["src/foo.ts"], riskLevel: "high", requiredTools: [], testStrategy: "npm test" }],
    coder: [PATCH_ONE, PATCH_TWO],
    debugger: [{ diagnosis: "still failing", requiredFix: "try again", updatedPatchRequest: "revise", likelyFiles: ["src/foo.ts"] }]
  });
  const testTool = new MockTestRunnerTool([
    { ok: false, output: "src/foo.ts:1:1 first failure" },
    { ok: false, output: "src/foo.ts:1:1 second failure" }
  ]);
  const { orchestrator, events } = makeOrchestrator({ provider, testTool });
  const state = await orchestrator.run({ taskId: "task_003", userGoal: "cannot pass", maxIterations: 2 });

  assert.equal(state.status, "needs_human_review");
  assert.equal(state.iteration, 2);
  assert.equal(state.patches.length, 2);
  assert.equal(state.testRuns.length, 2);
  assert.ok(events.some((event) => event.type === "run_failed" && event.reason === "needs_human_review"));
}

{
  const provider = new ScriptedLLMProvider({
    planner: [{ goal: "critic loop", implementationSteps: [], likelyFiles: ["src/foo.ts"], riskLevel: "medium", requiredTools: [], testStrategy: "npm test" }],
    coder: [PATCH_ONE, PATCH_TWO],
    critic: [
      {
        approved: false,
        risks: ["edge case"],
        missingTests: ["missing assertion"],
        regressions: [],
        requiredChanges: ["tighten change"],
        nextAgent: "coder"
      },
      { approved: true, risks: [], missingTests: [], regressions: [], requiredChanges: [] }
    ]
  });
  const { orchestrator } = makeOrchestrator({ provider });
  const state = await orchestrator.run({ taskId: "task_004", userGoal: "critic loop", maxIterations: 4 });

  assert.equal(state.status, "completed");
  assert.equal(state.iteration, 2);
  assert.equal(state.patches.length, 2);
  assert.equal(state.review.approved, true);
  assert.equal(provider.calls.map((call) => call.role).join(","), "planner,coder,critic,coder,critic");
}

console.log("Agent orchestrator tests passed.");
