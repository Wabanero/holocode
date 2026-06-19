import React, { useMemo, useState } from "react";
import { SceneManager, createSceneConfig } from "./SceneManager";
import { createDefaultVoiceRouter, parseVoiceCommand } from "./agents/VoiceCommandRouter";
import { buildAgentTask } from "./agents/AgentTaskBuilder";
import { buildCodeGraph } from "./utils/codeGraph";

export type CockpitMode = "focus" | "architecture" | "debug" | "agent";

export function App() {
  const [mode, setMode] = useState<CockpitMode>("focus");
  const sceneConfig = useMemo(() => createSceneConfig("demo-user"), []);
  const manager = useMemo(() => new SceneManager(sceneConfig), [sceneConfig]);
  const voiceRouter = useMemo(() => createDefaultVoiceRouter(setMode), []);

  function initializeCockpit() {
    manager.initializeScene();
    const command = parseVoiceCommand("show dependencies");
    voiceRouter.route(command);
    return buildCodeGraph(["src/App.tsx", "src/SceneManager.ts"]);
  }

  function createRefactorTask() {
    return buildAgentTask({
      goal: "Split scene setup from hand tracking orchestration.",
      selectedFiles: ["src/SceneManager.ts", "src/xr/HandTrackingSystem.ts"],
      selectedFunctions: ["initializeScene", "setupHandTracking"],
      constraints: ["Do not change public SceneManager API.", "Return patch only."]
    });
  }

  const graph = initializeCockpit();
  const task = mode === "agent" ? createRefactorTask() : null;

  return (
    <main>
    <h1>HoloCode Demo Cockpit </h1>
      < p > Current mode: { mode } </p>
        < pre > { JSON.stringify(graph, null, 2) } </pre>
  { task ? <pre>{ task } </pre> : null}
  </main>
  );
}

export default App;
