import { Html, Text } from "@react-three/drei";
import { useMemo } from "react";
import type { SceneFolder } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function FolderDistrict3D({ folder }: { folder: SceneFolder }) {
  const selectedFolderId = useWorkspaceStore((state) => state.selectedFolderId);
  const selectFolder = useWorkspaceStore((state) => state.selectFolder);
  const selected = selectedFolderId === folder.id;
  const color = useMemo(() => (folder.path === "tests" ? "#3c2f24" : "#163b35"), [folder.path]);

  return (
    <group position={folder.position} onClick={() => selectFolder(folder.id)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <cylinderGeometry args={[folder.radius, folder.radius, 0.08, 48]} />
        <meshStandardMaterial color={color} transparent opacity={selected ? 0.82 : 0.52} roughness={0.76} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[folder.radius * 0.86, folder.radius * 0.9, 48]} />
        <meshBasicMaterial color={selected ? "#48e5c2" : "#6f7976"} transparent opacity={selected ? 0.8 : 0.35} />
      </mesh>
      <Text
        position={[0, 0.1, -folder.radius - 0.24]}
        fontSize={0.18}
        color={selected ? "#e9eeee" : "#a5b0ad"}
        anchorX="center"
      >
        {folder.name}
      </Text>
      <Html center position={[0, 0.1, folder.radius + 0.25]} className="scene-object-label">
        <span>{folder.path}</span>
      </Html>
    </group>
  );
}
