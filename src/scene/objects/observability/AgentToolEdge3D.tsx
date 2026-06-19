import { Text } from "@react-three/drei";
import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type { AgentTopologyEdge } from "../../../observability/agentTopology";

type Vec3 = [number, number, number];

const EDGE_COLORS: Record<AgentTopologyEdge["status"], string> = {
  pending: "#5c6461",
  running: "#6db7ff",
  completed: "#48e5c2",
  failed: "#f06f6f",
  retry: "#f2be5c",
  unknown: "#8a9692"
};

function midpoint(source: Vec3, target: Vec3): Vec3 {
  return [(source[0] + target[0]) / 2, (source[1] + target[1]) / 2, (source[2] + target[2]) / 2];
}

export function AgentToolEdge3D({
  edge,
  source,
  target,
  dimmed
}: {
  edge: AgentTopologyEdge;
  source: Vec3;
  target: Vec3;
  dimmed?: boolean;
}) {
  const color = EDGE_COLORS[edge.status];
  const transform = useMemo(() => {
    const start = new Vector3(...source);
    const end = new Vector3(...target);
    const direction = end.clone().sub(start);
    const length = Math.max(0.01, direction.length());
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
    return {
      position: midpoint(source, target),
      quaternion,
      length
    };
  }, [source, target]);

  const badge = edge.retry
    ? "retry"
    : edge.tokenTotal
      ? `${edge.tokenTotal} tokens`
      : edge.latencyMs
        ? `${Math.round(edge.latencyMs)} ms`
        : edge.filesTouched[0] || edge.label;

  return (
    <group>
      <mesh position={transform.position} quaternion={transform.quaternion}>
        <cylinderGeometry args={[0.012, 0.012, transform.length, 10]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} transparent opacity={dimmed ? 0.16 : 0.68} />
      </mesh>
      {badge ? (
        <Text position={[transform.position[0], transform.position[1] + 0.14, transform.position[2]]} fontSize={0.055} color={dimmed ? "#7d8783" : color} anchorX="center" maxWidth={0.92}>
          {badge}
        </Text>
      ) : null}
    </group>
  );
}
