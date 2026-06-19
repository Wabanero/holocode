import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import type { CameraPreset } from "../types";
import type { SceneLayout3D } from "./layout/layout3d";

const PRESETS: Record<CameraPreset, { position: Vector3; target: Vector3 }> = {
  cockpit: { position: new Vector3(0.35, 3.35, 9.1), target: new Vector3(0.1, 1.05, 0) },
  architecture: { position: new Vector3(0, 9.8, 9.2), target: new Vector3(0, 0.2, 0) },
  "current-file": { position: new Vector3(0, 2.7, 4.5), target: new Vector3(0, 0.8, 0) },
  dependency: { position: new Vector3(-5.2, 5.4, 7.2), target: new Vector3(0, 0.6, 0) },
  agent: { position: new Vector3(7.5, 3.2, 4.4), target: new Vector3(5.6, 0.7, -0.5) },
  "error-trace": { position: new Vector3(-3.2, 4.5, 6.4), target: new Vector3(0.8, 1.1, -0.8) },
  diagnostics: { position: new Vector3(-6.6, 3.1, 3.9), target: new Vector3(-3.8, 0.9, -1.4) },
  debug: { position: new Vector3(4.8, 3.5, 5.8), target: new Vector3(2.4, 1.0, -2.2) }
};

export function CameraController({ layout }: { layout: SceneLayout3D }) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const pressedKeys = useRef(new Set<string>());
  const { camera } = useThree();
  const cameraPreset = useWorkspaceStore((state) => state.cameraPreset);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);

  const desired = useMemo(() => {
    if (cameraPreset === "current-file" && selectedFileId && layout.nodePositions[selectedFileId]) {
      const target = new Vector3(...layout.nodePositions[selectedFileId]).add(new Vector3(0, 0.72, 0));
      return {
        position: target.clone().add(new Vector3(0.7, 2.1, 3.0)),
        target
      };
    }
    return PRESETS[cameraPreset];
  }, [cameraPreset, layout.nodePositions, selectedFileId]);

  useEffect(() => {
    function down(event: KeyboardEvent) {
      pressedKeys.current.add(event.key.toLowerCase());
    }
    function up(event: KeyboardEvent) {
      pressedKeys.current.delete(event.key.toLowerCase());
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useFrame((_state, delta) => {
    camera.position.lerp(desired.position, Math.min(1, delta * 1.6));
    if (controlsRef.current) {
      controlsRef.current.target.lerp(desired.target, Math.min(1, delta * 1.8));

      const speed = delta * 3.0;
      const move = new Vector3();
      const keys = pressedKeys.current;
      if (keys.has("w") || keys.has("arrowup")) move.z -= speed;
      if (keys.has("s") || keys.has("arrowdown")) move.z += speed;
      if (keys.has("a") || keys.has("arrowleft")) move.x -= speed;
      if (keys.has("d") || keys.has("arrowright")) move.x += speed;
      if (keys.has("q")) move.y -= speed;
      if (keys.has("e")) move.y += speed;
      if (move.lengthSq()) {
        camera.position.add(move);
        controlsRef.current.target.add(move);
      }

      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minDistance={2.2}
      maxDistance={18}
      maxPolarAngle={Math.PI * 0.48}
    />
  );
}
