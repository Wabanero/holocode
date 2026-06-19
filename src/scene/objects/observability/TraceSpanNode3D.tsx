import { Html, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Mesh } from "three";
import type { PositionedTraceSpan, TraceRiverProjection } from "../../../observability/traceSelectors";
import { spanDurationWeight } from "../../../observability/traceSelectors";

const STATUS_COLOR: Record<PositionedTraceSpan["status"], string> = {
  ok: "#48e5c2",
  error: "#f06f6f",
  unknown: "#8a9692"
};

function shortLabel(span: PositionedTraceSpan) {
  return span.functionName || span.name || span.path || span.spanId;
}

export function TraceSpanNode3D({
  span,
  trace,
  selected,
  onSelect,
  onOpen
}: {
  span: PositionedTraceSpan;
  trace: TraceRiverProjection;
  selected: boolean;
  onSelect: (spanId: string) => void;
  onOpen: (span: PositionedTraceSpan) => void;
}) {
  const mesh = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const color = STATUS_COLOR[span.status];
  const weight = spanDurationWeight(span, trace);
  const radius = 0.12 + weight * 0.1;

  useFrame(({ clock }) => {
    if (!mesh.current || span.status !== "error") return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 5.8) * 0.12;
    mesh.current.scale.setScalar(pulse);
  });

  return (
    <group position={[span.position[0], span.position[1] + 0.82, span.position[2]]}>
      <mesh
        ref={mesh}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect(span.spanId);
          if (span.path || span.filePath) onOpen(span);
        }}
      >
        <sphereGeometry args={[radius, 24, 16]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || hovered ? 0.74 : 0.28}
          transparent
          opacity={span.status === "unknown" ? 0.48 : 0.92}
          roughness={0.36}
        />
      </mesh>
      <Text position={[0, radius + 0.14, 0]} fontSize={0.06} color={selected ? "#d8fff4" : color} anchorX="center" maxWidth={1.0}>
        {shortLabel(span)}
      </Text>
      {hovered ? (
        <Html center position={[0, 0.46, 0]} className="scene-html trace-span-hover">
          <strong>{span.name}</strong>
          <span>{span.path || span.filePath || "unmapped"}</span>
          <span>{span.durationMs ? `${Math.round(span.durationMs)} ms` : "duration unavailable"}</span>
          <p>{span.mappingReason}</p>
        </Html>
      ) : null}
    </group>
  );
}
