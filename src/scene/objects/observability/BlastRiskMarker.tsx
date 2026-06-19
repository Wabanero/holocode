import { Html, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import type { Vec3 } from "../../layout/layout3d";

export type BlastMarkerKind = "core" | "direct" | "indirect" | "test" | "diagnostic" | "changed" | "agent" | "debug" | "missing-test";

const MARKER_STYLE: Record<BlastMarkerKind, { color: string; label: string; radius: number }> = {
  core: { color: "#d8fff4", label: "core", radius: 0.16 },
  direct: { color: "#6db7ff", label: "direct", radius: 0.12 },
  indirect: { color: "#7fd9ff", label: "indirect", radius: 0.1 },
  test: { color: "#a7d36f", label: "test", radius: 0.11 },
  diagnostic: { color: "#f06f6f", label: "diagnostic", radius: 0.13 },
  changed: { color: "#f2be5c", label: "changed", radius: 0.13 },
  agent: { color: "#d5a8ff", label: "agent", radius: 0.13 },
  debug: { color: "#ff8f70", label: "debug", radius: 0.13 },
  "missing-test": { color: "#f06f6f", label: "missing test", radius: 0.12 }
};

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.at(-2)}/${parts.at(-1)}` : path;
}

export function BlastRiskMarker({
  position,
  path,
  kind,
  reason,
  layer,
  onOpen
}: {
  position: Vec3;
  path: string;
  kind: BlastMarkerKind;
  reason: string;
  layer: number;
  onOpen: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const style = MARKER_STYLE[kind];
  const yOffset = kind === "core" ? 0.28 : kind === "diagnostic" || kind === "changed" || kind === "agent" || kind === "debug" ? 0.5 : 0.34;

  return (
    <group position={[position[0], position[1] + yOffset, position[2]]}>
      <mesh
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onOpen(path);
        }}
      >
        {kind === "changed" || kind === "agent" ? <octahedronGeometry args={[style.radius, 0]} /> : kind === "missing-test" ? <tetrahedronGeometry args={[style.radius, 0]} /> : <sphereGeometry args={[style.radius, 18, 12]} />}
        <meshStandardMaterial
          color={style.color}
          emissive={style.color}
          emissiveIntensity={hovered || kind === "core" ? 0.62 : 0.24}
          roughness={0.4}
          transparent
          opacity={kind === "indirect" ? 0.62 : 0.9}
        />
      </mesh>
      <Text position={[0, style.radius + 0.11, 0]} fontSize={0.047} color={style.color} anchorX="center" maxWidth={0.9}>
        {style.label}
      </Text>
      {hovered ? (
        <Html center position={[0, 0.42, 0]} className="scene-html blast-radius-hover">
          <strong>{shortPath(path)}</strong>
          <span>Layer {layer}</span>
          <p>{reason}</p>
        </Html>
      ) : null}
    </group>
  );
}
