import { Html, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState } from "react";
import type { DiffValidationGateState } from "../../../observability/diffTimeline";
import type { Vec3 } from "./DiffTimeSlice3D";

const GATE_COLORS: Record<DiffValidationGateState["state"], string> = {
  none: "#8a9692",
  pending: "#f2be5c",
  open: "#48e5c2",
  closed: "#f06f6f",
  locked: "#f2be5c",
  applied: "#48e5c2",
  rejected: "#f06f6f"
};

export function DiffValidationGate3D({
  gate,
  position,
  onShowOutput,
  onShowBranch
}: {
  gate: DiffValidationGateState;
  position: Vec3;
  onShowOutput: (gate: DiffValidationGateState) => void;
  onShowBranch: (branch: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = GATE_COLORS[gate.state];
  const closed = gate.state === "closed" || gate.state === "locked";
  const open = gate.state === "open" || gate.state === "applied";

  if (gate.state === "none") return null;

  return (
    <group position={position}>
      <mesh
        position={[-0.42, 0.15, 0]}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onShowOutput(gate);
        }}
      >
        <boxGeometry args={[0.08, 1.0, 0.08]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.66 : 0.28} />
      </mesh>
      <mesh
        position={[0.42, 0.15, 0]}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onShowOutput(gate);
        }}
      >
        <boxGeometry args={[0.08, 1.0, 0.08]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hovered ? 0.66 : 0.28} />
      </mesh>
      {closed ? (
        <>
          <mesh rotation={[0, 0, 0.72]}>
            <boxGeometry args={[0.92, 0.055, 0.055]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.62} />
          </mesh>
          <mesh rotation={[0, 0, -0.72]}>
            <boxGeometry args={[0.92, 0.055, 0.055]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.62} />
          </mesh>
        </>
      ) : null}
      {open ? (
        <>
          <mesh position={[-0.18, 0.22, 0]} rotation={[0, 0, -0.45]}>
            <boxGeometry args={[0.46, 0.04, 0.04]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0.18, 0.22, 0]} rotation={[0, 0, 0.45]}>
            <boxGeometry args={[0.46, 0.04, 0.04]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        </>
      ) : null}
      {gate.state === "pending" ? (
        <mesh>
          <torusGeometry args={[0.34, 0.022, 8, 42]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.44} />
        </mesh>
      ) : null}
      {gate.state === "rejected" ? (
        <Text position={[0, 0.18, 0.08]} fontSize={0.18} color={color} anchorX="center">
          STOP
        </Text>
      ) : null}
      {gate.state === "applied" && "branch" in gate && gate.branch ? (
        <mesh
          position={[0, 0.72, 0]}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            if (gate.branch) onShowBranch(gate.branch);
          }}
        >
          <coneGeometry args={[0.15, 0.34, 4]} />
          <meshStandardMaterial color="#48e5c2" emissive="#48e5c2" emissiveIntensity={0.72} />
        </mesh>
      ) : null}
      <Text position={[0, -0.52, 0]} fontSize={0.07} color={color} anchorX="center" maxWidth={1.3}>
        {gate.label}
      </Text>
      {hovered ? (
        <Html center position={[0, 0.92, 0]} className="scene-html diff-time-hover">
          <strong>Validation gate</strong>
          <span>{gate.label}</span>
          <p>{gate.message}</p>
        </Html>
      ) : null}
    </group>
  );
}
