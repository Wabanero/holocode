import { Html, Text, useCursor } from "@react-three/drei";
import { useState } from "react";
import type { Vec3 } from "../../layout/layout3d";

type GhostKind = "test" | "caller" | "importer" | "missing";

const GHOST_COLOR: Record<GhostKind, string> = {
  test: "#f2be5c",
  caller: "#8fb7ff",
  importer: "#8fb7ff",
  missing: "#f06f6f"
};

export function ContextGhostNode({
  position,
  path,
  kind,
  onOpen
}: {
  position: Vec3;
  path: string;
  kind: GhostKind;
  onOpen: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = GHOST_COLOR[kind];
  useCursor(hovered);

  return (
    <group
      position={position}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(path);
      }}
    >
      <mesh>
        <boxGeometry args={[0.48, 0.22, 0.22]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.7 : 0.32} transparent opacity={hovered ? 0.46 : 0.24} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.012, 8, 40]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 0.82 : 0.42} />
      </mesh>
      <Text position={[0, 0.24, 0]} fontSize={0.065} color={color} anchorX="center" maxWidth={1.1}>
        {kind}
      </Text>
      <Html center distanceFactor={8} position={[0, -0.24, 0.04]} className="scene-object-label">
        <span>{path}</span>
      </Html>
    </group>
  );
}
