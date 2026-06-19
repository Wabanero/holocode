import { SceneManager, createSceneConfig } from "../src/SceneManager";

export function sceneManagerTestPlaceholder() {
  const manager = new SceneManager(createSceneConfig("test-user"));
  const scene = manager.initializeScene();
  return scene.panelLimit === 8;
}
