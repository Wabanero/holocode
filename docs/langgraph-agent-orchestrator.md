# LangGraph Agent Orchestrator

HoloCode now includes a stateful coding-agent workflow in `server/coding-agent-orchestrator.mjs`. The workflow is modeled as a LangGraph-style state graph: every node receives one serializable `AgentRunState`, returns an updated state, and the next node is selected by explicit edges or conditional routing.

The runtime detects `@langchain/langgraph` and compiles a native `StateGraph` when the package is available. The checked-in local runner executes the same node and edge definition as an offline fallback, so tests and development do not require a package install. The graph definition is exported through `codingAgent.graphDefinition`.

## Graph

```text
START
  -> PlannerAgent
  -> GraphRetrieverAgent
  -> CoderAgent
  -> PatchApplyTool
  -> TestRunnerTool
  -> conditional:
       patch/test failed -> DebuggerAgent -> CoderAgent
       patch/test passed -> CriticAgent
  -> conditional:
       critic rejects -> CoderAgent or DebuggerAgent
       critic approves -> FinalizerAgent
  -> END
```

`maxIterations` defaults to `4`. Each `CoderAgent` patch attempt increments the iteration counter. If patch apply, tests, or critic review keep failing after the limit, the run stops as `needs_human_review`.

## State Only

Agents do not chat with each other. The planner output, retrieved context, generated patches, patch results, test logs, debugger diagnosis, and critic review all live on `AgentRunState`.

That gives the workflow three useful properties:

- every transition is serializable and replayable;
- deterministic tools cannot be bypassed by LLM conversation;
- UI clients can subscribe to state events without needing agent internals.

Important state fields include:

- `taskId`, `userGoal`, `repoPath`
- `provider` model metadata
- `plan`
- `graphContext`
- `selectedFiles`
- `patches`, `currentPatch`
- `patchApplyResults`
- `testRuns`
- `parsedErrors`
- `review`
- `iteration`, `maxIterations`
- `tokenBudget`
- `status`, `timestamps`, `telemetry`

## Agents And Tools

`PlannerAgent`, `CoderAgent`, `DebuggerAgent`, and `CriticAgent` use the existing `LLMProvider` abstraction. The provider is supplied through `provider` or `providerFactory`, so the workflow works with Ollama, OpenAI-compatible APIs, Anthropic, MLX, or a mocked provider.

`GraphRetrieverAgent` uses the `CodeGraphProvider` interface from `server/codegraph-provider.mjs`. The internal provider builds a dynamic graph from the repo and returns relevant files, symbols, dependency paths, impacted tests, compact snippets, blast radius, and a selected subgraph.

`PatchApplyTool` is deterministic. `SandboxPatchApplyTool` validates unified diff format, rejects unsafe paths, copies the repo into `.agent_tasks/sandboxes/<taskId>/attempt_<n>`, and runs `git apply --check` plus `git apply` inside that sandbox. It does not overwrite source files in the user repo.

`TestRunnerTool` is deterministic. `NodePackageTestRunnerTool` detects `package.json`, chooses npm/yarn/pnpm from lock files, and runs only detected `lint`, `test`, and `build` scripts.

## Events

Every transition emits SSE/WebSocket-ready events:

- `agent_started`
- `agent_completed`
- `agent_failed`
- `graph_context_selected`
- `patch_generated`
- `patch_apply_started`
- `patch_apply_completed`
- `test_started`
- `test_completed`
- `debug_iteration_started`
- `critic_review_completed`
- `run_completed`
- `run_failed`
- `telemetry_update`

The existing `/api/agent/events` SSE endpoint now includes workflow events in addition to legacy external-agent events.

## API

Run the workflow:

```http
POST /api/agent/workflow/run
```

Body:

```json
{
  "taskId": "task_001",
  "goal": "Implement the requested change",
  "selectedFiles": ["src/App.tsx"],
  "selectedFunctions": [],
  "maxIterations": 4
}
```

List workflow runs:

```http
GET /api/agent/workflow/runs
```

Cancel a run:

```http
POST /api/agent/workflow/cancel
```

Body:

```json
{ "taskId": "task_001" }
```

When the workflow is launched with a `task_###` id, the server persists:

- `.agent_tasks/task_###_result.diff`
- `.agent_tasks/task_###_log.md`
- `.agent_tasks/task_###_workflow.json`

That keeps generated patches compatible with the existing Diff Stack and patch review controls.

## Adding A New Agent

1. Add a class with `run(state, context)` in `server/coding-agent-orchestrator.mjs`.
2. Read only from `state` and return the updated `state`.
3. Add the node to `GRAPH_NODE_ORDER`.
4. Add an edge or conditional route in `graphDefinition`.
5. Insert the node in `runLocalGraph`.
6. Emit a specific event if the UI needs to visualize the transition.
7. Add a scripted-provider unit test for the new route.

Keep deterministic tools separate from LLM agents. If the step mutates files, runs commands, or validates patches, implement it as a tool node.

## VR Panel Integration

The current Agent Dock can already display task files, logs, result diffs, and patch state from `.agent_tasks`. To connect the workflow fully:

1. Add client helpers for `/api/agent/workflow/run`, `/api/agent/workflow/runs`, and `/api/agent/workflow/cancel`.
2. Subscribe to the underscore event names on `/api/agent/events`.
3. Map `graph_context_selected` to highlighted file nodes and dependency beams.
4. Map `patch_generated` to Diff Stack refresh.
5. Map `test_completed` and `debug_iteration_started` to the error-path/debug visualization.
6. Map `critic_review_completed` to the agent review card.
7. Refresh `/api/agent-results` after `run_completed` or `run_failed` so persisted diffs appear in the existing patch controls.
