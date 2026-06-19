import { HandTrackingSystem, createHandTrackingSystem } from "./xr/HandTrackingSystem";
import { buildCodeGraph } from "./utils/codeGraph";

export interface SceneConfig {
  userId: string;
  renderer: "webgl" | "webgpu";
  enableHandTracking: boolean;
  maxPanels: number;
}

export function createSceneConfig(userId: string): SceneConfig {
  return {
    userId,
    renderer: "webgl",
    enableHandTracking: true,
    maxPanels: 8
  };
}

export class SceneManager {
  private handTracking: HandTrackingSystem | null = null;

  constructor(private readonly config: SceneConfig) {}

  initializeScene() {
    const renderer = this.initRenderer();
    const assets = this.loadAssets();
    const graph = buildCodeGraph(["src/App.tsx", "src/SceneManager.ts"]);

    if (this.config.enableHandTracking) {
      this.setupHandTracking();
    }

    return {
      renderer,
      assets,
      graph,
      panelLimit: this.config.maxPanels
    };
  }

  initRenderer() {
    return {
      type: this.config.renderer,
      antialias: true,
      passthroughAware: true
    };
  }

  loadAssets() {
    return ["editor-panel", "file-tree-panel", "agent-dock-panel"];
  }

  setupHandTracking() {
    this.handTracking = createHandTrackingSystem({
      handedness: "both",
      gestureThreshold: 0.72
    });
    return this.handTracking.start();
  }
}
