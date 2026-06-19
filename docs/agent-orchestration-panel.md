# Agent Orchestration Panel

The Agent Orchestration Panel is the VR-facing status surface for local coding-agent runs. It is implemented as a reusable React component in `src/agents/AgentOrchestrationPanel.tsx` and mounted into the agent scene through `src/scene/objects/AgentOrchestrationPanel3D.tsx`.

The component is intentionally mock-safe: it can render from a supplied `initialState` in tests, or subscribe to backend telemetry during normal app use.

## Data Sources

Primary live data comes from:

```http
GET /api/agent/events
```

The SSE stream forwards orchestrator events, code graph events, and LLM telemetry events. If the stream disconnects, the panel keeps rendering the last known state and uses REST polling fallback:

```http
GET /api/agent/workflow/runs
GET /api/agent/telemetry
GET /api/graph/stats
```

Graph visual modes also call:

```http
GET /api/graph/export
POST /api/graph/blast-radius
```

## Telemetry Event Format

Every SSE event has a `type` and should include an ISO `timestamp` when available:

```json
{
  "type": "agent_started",
  "timestamp": "2026-06-02T20:00:00.000Z",
  "taskId": "task_001",
  "agent": "CoderAgent"
}
```

Supported event names:

- `run_started`
- `agent_started`
- `agent_token`
- `agent_completed`
- `agent_failed`
- `llm_request_completed`
- `graph_rebuild_started`
- `graph_rebuild_completed`
- `graph_context_selected`
- `patch_generated`
- `patch_apply_completed`
- `test_started`
- `test_completed`
- `critic_review_completed`
- `telemetry_update`
- `run_completed`
- `run_failed`
- `agent-snapshot`

Useful payload fields:

```json
{
  "type": "llm_request_completed",
  "providerName": "ollama",
  "modelName": "qwen3-coder",
  "latencyMs": 1240,
  "timeToFirstTokenMs": 210,
  "tokensPerSecond": 38.4,
  "inputTokenEstimate": 820,
  "outputTokenEstimate": 260
}
```

```json
{
  "type": "graph_context_selected",
  "relevantFiles": ["src/agents/AgentDock.tsx"],
  "selectedSubgraph": {
    "nodeCount": 12,
    "edgeCount": 18
  }
}
```

The panel stores all event-derived data in `OrchestrationTelemetryState` from `src/agents/orchestrationTelemetry.ts`. Agents do not send messages to one another through the UI; the panel reflects explicit graph-state transitions only.

## Resource Metrics

`GET /api/agent/telemetry` returns measured backend process metrics:

```json
{
  "resources": {
    "measured": true,
    "sampledAt": "2026-06-02T20:00:00.000Z",
    "memory": {
      "rssMb": 180.4,
      "heapUsedMb": 72.1,
      "heapTotalMb": 98.5,
      "externalMb": 4.2
    },
    "cpu": {
      "percent": 12.5,
      "cores": 16
    }
  }
}
```

LLM token totals are estimates unless the provider returns authoritative usage. Context usage warnings appear when estimated context usage reaches 80 percent by default. Memory warnings appear when backend RSS reaches 1024 MB by default. Both thresholds are component props.

## Graph View Modes

The graph visualization toggle has three modes:

- `Workflow Graph`: the LangGraph-style agent workflow: Planner, GraphRetriever, Coder, PatchApply, Tester, Debugger, Critic, and Finalizer.
- `Code Graph`: the current repository graph from `GET /api/graph/export?changed=true`.
- `Impact Graph`: a blast-radius projection from `POST /api/graph/blast-radius`, seeded by changed files from the current patch.

All graph modes use the same VR-ready shape:

```json
{
  "nodes": [
    { "id": "file:src/App.tsx", "label": "App.tsx", "type": "file", "path": "src/App.tsx", "metrics": {} }
  ],
  "edges": [
    { "id": "edge-1", "source": "file:src/App.tsx", "target": "file:src/main.tsx", "type": "imports", "weight": 1 }
  ],
  "clusters": [
    { "id": "cluster:src", "label": "src", "nodeIds": ["file:src/App.tsx"], "type": "directory" }
  ],
  "stats": {
    "nodeCount": 1,
    "edgeCount": 1,
    "fileCount": 1,
    "symbolCount": 0,
    "testCount": 0
  }
}
```

The preview renderer caps large graphs before drawing, so huge repositories do not block the UI thread.

## VR Mounting

`AgentOrchestrationPanel3D` mounts the panel as a world-space HTML surface in the agent scene. It currently uses a compact projected panel instead of a final immersive VR layout because the broader cockpit UI is still evolving. The component boundary is the migration point for future OpenXR/WebXR-specific graph nodes, spatial interactions, and theme bindings.

## Tests And Visual Notes

`server/agent-orchestration-panel.test.mjs` covers:

- mocked run-state rendering;
- reducer updates from WebSocket/SSE-style events;
- graph view mode switching;
- memory and context warnings;
- disconnected backend state.

Automated tests render HTML with mocked state rather than storing screenshots. Manual visual verification should open the local app, switch to Agent view, and confirm that the world-space panel appears beside the existing Agent Dock with live or fallback telemetry.
