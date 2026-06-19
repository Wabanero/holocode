import { Text } from "@react-three/drei";
import type { SceneFile } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function TestConstellation3D({ tests }: { tests: SceneFile[] }) {
  const showTests = useWorkspaceStore((state) => state.showTests);
  const openFile = useWorkspaceStore((state) => state.openFile);

  if (!showTests || !tests.length) return null;

  return (
    <group>
      <Text position={[0, 1.05, -7.2]} fontSize={0.17} color="#c7a8ff" anchorX="center">
        Test Constellation
      </Text>
      {tests.map((test) => (
        <group key={test.id} position={[test.position[0], test.position[1] + 0.55, test.position[2]]}>
          <mesh
            onDoubleClick={(event) => {
              event.stopPropagation();
              void openFile(test.path);
            }}
          >
            <octahedronGeometry args={[0.22, 0]} />
            <meshStandardMaterial color="#c7a8ff" emissive="#c7a8ff" emissiveIntensity={0.15} roughness={0.4} />
          </mesh>
          <Text position={[0, 0.36, 0]} fontSize={0.085} color="#e9eeee" anchorX="center" maxWidth={1.2}>
            {test.name}
          </Text>
        </group>
      ))}
    </group>
  );
}
