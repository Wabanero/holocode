import { Line, Text } from "@react-three/drei";
import { Vector3 } from "three";
import type { SceneLayout3D } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function ErrorPath3D({ layout }: { layout: SceneLayout3D }) {
  const showErrorPath = useWorkspaceStore((state) => state.showErrorPath);
  const frames = [
    "file:src/App.tsx",
    "file:src/SceneManager.ts",
    "symbol:src/SceneManager.ts#setupHandTracking",
    "file:src/xr/HandTrackingSystem.ts",
    "symbol:src/xr/HandTrackingSystem.ts#classifyGesture"
  ];
  const points = frames
    .map((id) => layout.nodePositions[id])
    .filter(Boolean)
    .map((position) => new Vector3(position[0], position[1] + 1.25, position[2]));

  if (!showErrorPath || points.length < 2) return null;

  return (
    <group>
      <Line points={points} color="#f06f6f" lineWidth={4} transparent opacity={0.82} />
      {points.map((point, index) => (
        <group key={`${point.x}-${index}`} position={[point.x, point.y, point.z]}>
          <mesh>
            <sphereGeometry args={[0.14, 20, 20]} />
            <meshStandardMaterial color="#f06f6f" emissive="#f06f6f" emissiveIntensity={0.55} />
          </mesh>
          <Text position={[0, 0.28, 0]} fontSize={0.08} color="#ffd0d0" anchorX="center">
            frame {index + 1}
          </Text>
        </group>
      ))}
    </group>
  );
}
