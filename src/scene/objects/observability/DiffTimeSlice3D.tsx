import { Html, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Group } from "three";
import type { DiffTimelineEvent } from "../../../observability/diffTimeline";

export type Vec3 = [number, number, number];

const EVENT_COLORS: Record<DiffTimelineEvent["kind"], string> = {
  task_created: "#6db7ff",
  agent_run_started: "#d5a8ff",
  agent_log_event: "#9aa6a2",
  patch_detected: "#f2be5c",
  patch_validated: "#48e5c2",
  patch_validation_failed: "#f06f6f",
  patch_apply_blocked: "#f2be5c",
  patch_applied: "#48e5c2",
  patch_rejected: "#f06f6f",
  git_diff_changed: "#f2be5c",
  diagnostic_changed: "#f06f6f",
  test_result_changed: "#a7d36f"
};

function shortTime(value?: string | null) {
  if (!value) return "time unavailable";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "time unavailable";
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function colorForDiffEvent(event: DiffTimelineEvent) {
  return EVENT_COLORS[event.kind] || "#b6c2be";
}

export function DiffTimeSlice3D({
  event,
  position,
  selected,
  onSelect
}: {
  event: DiffTimelineEvent;
  position: Vec3;
  selected: boolean;
  onSelect: (event: DiffTimelineEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const group = useRef<Group>(null);
  const color = colorForDiffEvent(event);
  const pulse = event.status === "failed" || event.status === "blocked" || event.status === "pending";

  useFrame(({ clock }) => {
    if (!group.current) return;
    const scale = pulse ? 1 + Math.sin(clock.elapsedTime * 4.2) * 0.04 : 1;
    group.current.scale.setScalar(selected || hovered ? scale * 1.06 : scale);
  });

  return (
    <group ref={group} position={position}>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        onPointerOver={(pointerEvent: ThreeEvent<PointerEvent>) => {
          pointerEvent.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(pointerEvent: ThreeEvent<MouseEvent>) => {
          pointerEvent.stopPropagation();
          onSelect(event);
        }}
      >
        <torusGeometry args={[0.72, selected ? 0.035 : 0.024, 10, 72]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected || hovered ? 0.8 : 0.34}
          transparent
          opacity={event.status === "pending" ? 0.62 : 0.9}
        />
      </mesh>
      <Text position={[0, 0.82, 0]} fontSize={0.07} color={selected ? "#d8fff4" : color} anchorX="center" maxWidth={1.5}>
        {event.label}
      </Text>
      <Text position={[0, 0.68, 0]} fontSize={0.044} color="#9aa6a2" anchorX="center" maxWidth={1.5}>
        {shortTime(event.at)}
      </Text>
      {hovered ? (
        <Html center position={[0, 1.08, 0]} className="scene-html diff-time-hover">
          <strong>{event.label}</strong>
          <span>{event.kind.replace(/_/g, " ")}</span>
          <p>{event.message}</p>
        </Html>
      ) : null}
    </group>
  );
}
