import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Group } from "three";
import { EPISTEMIC_CATEGORY_META, type EpistemicCategory } from "../../../observability/epistemicScoring";
import type { Vec3 } from "../../layout/layout3d";

function opacityFor(category: EpistemicCategory) {
  if (category === "validated") return 0.08;
  if (category === "runtime_unobserved") return 0.1;
  if (category === "heuristic_only") return 0.18;
  if (category === "diagnostic_error" || category === "agent_context_missing") return 0.26;
  return 0.2;
}

function shouldPulse(category: EpistemicCategory) {
  return category === "diagnostic_error" || category === "diagnostic_warning" || category === "agent_context_missing";
}

function DashedHeuristicRing({ color, radius }: { color: string; radius: number }) {
  const segments = useMemo(() => Array.from({ length: 12 }, (_, index) => index), []);
  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {segments.map((index) => {
        const angle = (index / segments.length) * Math.PI * 2;
        return (
          <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.18, 0.018, 0.018]} />
            <meshBasicMaterial color={color} transparent opacity={0.58} />
          </mesh>
        );
      })}
    </group>
  );
}

export function EpistemicFogVolume({
  position,
  height,
  category,
  severity,
  selected
}: {
  position: Vec3;
  height: number;
  category: EpistemicCategory;
  severity: number;
  selected?: boolean;
}) {
  const group = useRef<Group>(null);
  const meta = EPISTEMIC_CATEGORY_META[category];
  const radius = 0.42 + Math.min(0.32, severity / 260);
  const y = height / 2 + 0.05;

  useFrame(({ clock }) => {
    if (!group.current) return;
    if (!shouldPulse(category)) {
      group.current.scale.setScalar(1);
      return;
    }
    const pulse = 1 + Math.sin(clock.elapsedTime * (category === "diagnostic_error" ? 5.8 : 3.8)) * 0.08;
    group.current.scale.setScalar(pulse);
  });

  if (category === "validated") {
    return (
      <group position={[position[0], position[1] + height + 0.16, position[2]]}>
        <mesh>
          <torusGeometry args={[0.32, 0.01, 6, 40]} />
          <meshBasicMaterial color={meta.color} transparent opacity={selected ? 0.82 : 0.36} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={group} position={[position[0], position[1] + y, position[2]]}>
      {category === "runtime_unobserved" ? (
        <mesh>
          <boxGeometry args={[0.76, Math.max(0.36, height + 0.22), 0.42]} />
          <meshStandardMaterial color={meta.color} transparent opacity={0.12} roughness={0.72} />
        </mesh>
      ) : (
        <mesh>
          <sphereGeometry args={[radius, 22, 14]} />
          <meshStandardMaterial
            color={meta.color}
            emissive={meta.color}
            emissiveIntensity={selected ? 0.34 : 0.18}
            transparent
            opacity={opacityFor(category)}
            depthWrite={false}
            roughness={0.72}
            side={DoubleSide}
          />
        </mesh>
      )}

      {category === "missing_tests" ? (
        <group position={[0, height / 2 + 0.22, 0]}>
          <mesh rotation={[0, 0, 0.7]}>
            <boxGeometry args={[0.42, 0.018, 0.018]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0.88} />
          </mesh>
          <mesh rotation={[0, 0, -0.7]}>
            <boxGeometry args={[0.36, 0.018, 0.018]} />
            <meshBasicMaterial color={meta.color} transparent opacity={0.7} />
          </mesh>
        </group>
      ) : null}

      {category === "heuristic_only" ? <DashedHeuristicRing color={meta.color} radius={radius + 0.1} /> : null}

      {selected || category === "diagnostic_error" ? (
        <Text position={[0, height / 2 + 0.5, 0]} fontSize={0.055} color={meta.color} anchorX="center" maxWidth={1.0}>
          {meta.shortLabel}
        </Text>
      ) : null}
    </group>
  );
}
