import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  root: process.cwd(),
  appType: "custom",
  configFile: false,
  server: { middlewareMode: true },
  logLevel: "silent"
});

try {
  const { AgentOrchestrationPanel } = await vite.ssrLoadModule("/src/agents/AgentOrchestrationPanel.tsx");
  const {
    createInitialTelemetryState,
    telemetryReducer,
    withWarnings
  } = await vite.ssrLoadModule("/src/agents/orchestrationTelemetry.ts");

  {
    const state = {
      ...createInitialTelemetryState(),
      taskTitle: "Implement telemetry panel",
      taskId: "task_042",
      status: "running",
      providerName: "ollama",
      modelName: "qwen3-coder",
      graph: {
        ...createInitialTelemetryState().graph,
        providerName: "internal",
        nodeCount: 12,
        edgeCount: 18,
        fileCount: 4,
        symbolCount: 7
      }
    };
    const html = renderToString(React.createElement(AgentOrchestrationPanel, { initialState: state }));
    assert.ok(html.includes("Agent Orchestration"));
    assert.ok(html.includes("task_042"));
    assert.ok(html.includes("qwen3-coder"));
  }

  {
    const state = createInitialTelemetryState();
    const next = telemetryReducer(state, {
      type: "event",
      event: {
        type: "agent_started",
        agent: "CoderAgent",
        timestamp: "2026-06-02T10:00:00.000Z"
      }
    });
    const coder = next.timeline.find((step) => step.key === "Coder");
    assert.equal(next.connectionStatus, "connected");
    assert.equal(coder.status, "running");
    assert.equal(coder.startedAt, "2026-06-02T10:00:00.000Z");
  }

  {
    const state = createInitialTelemetryState();
    const next = telemetryReducer(state, { type: "set_view_mode", mode: "code" });
    assert.equal(next.viewMode, "code");
  }

  {
    const state = {
      ...createInitialTelemetryState(),
      llm: {
        ...createInitialTelemetryState().llm,
        contextUsagePercent: 84
      },
      resources: {
        ...createInitialTelemetryState().resources,
        rssMb: 1536
      }
    };
    const warned = withWarnings(state, { memoryRssMb: 1024, contextPercent: 80 });
    assert.ok(warned.warnings.some((warning) => warning.includes("Context usage")));
    assert.ok(warned.warnings.some((warning) => warning.includes("RSS memory")));
  }

  {
    const state = createInitialTelemetryState();
    const next = telemetryReducer(state, {
      type: "connection",
      status: "disconnected",
      error: "Telemetry stream disconnected."
    });
    assert.equal(next.connectionStatus, "disconnected");
    assert.equal(next.lastError, "Telemetry stream disconnected.");
  }

  console.log("Agent orchestration panel tests passed.");
} finally {
  await vite.close();
}
