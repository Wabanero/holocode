import { Html, useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import type { Mesh } from "three";
import { EPISTEMIC_CATEGORY_META, type EpistemicScore } from "../../../observability/epistemicScoring";
import type { Vec3 } from "../../layout/layout3d";

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.at(-2)}/${parts.at(-1)}` : path;
}

function geometryFor(category: EpistemicScore["category"], radius: number) {
  if (category === "changed_unvalidated" || category === "agent_context_missing") {
    return <octahedronGeometry args={[radius, 0]} />;
  }
  if (category === "missing_tests") return <tetrahedronGeometry args={[radius, 0]} />;
  if (category === "heuristic_only") return <torusGeometry args={[radius * 1.1, radius * 0.16, 6, 28]} />;
  return <sphereGeometry args={[radius, 18, 12]} />;
}

export function EpistemicRiskBadge({
  score,
  position,
  height,
  compact,
  onExplain
}: {
  score: EpistemicScore;
  position: Vec3;
  height: number;
  compact?: boolean;
  onExplain: (score: EpistemicScore) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const mesh = useRef<Mesh>(null);
  const meta = EPISTEMIC_CATEGORY_META[score.category];
  const radius = compact ? 0.075 : 0.1 + Math.min(0.04, score.severity / 900);
  const yOffset = height + (compact ? 0.32 : 0.48);

  useCursor(hovered);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    if (score.category !== "diagnostic_error" && score.category !== "diagnostic_warning") {
      mesh.current.scale.setScalar(1);
      return;
    }
    mesh.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 5.4) * 0.1);
  });

  return (
    <group position={[position[0], position[1] + yOffset, position[2]]}>
      <mesh
        ref={mesh}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onExplain(score);
        }}
      >
        {geometryFor(score.category, radius)}
        <meshStandardMaterial
          color={meta.color}
          emissive={meta.color}
          emissiveIntensity={hovered ? 0.82 : score.category === "diagnostic_error" ? 0.58 : 0.3}
          roughness={0.38}
          transparent
          opacity={score.category === "runtime_unobserved" || score.category === "heuristic_only" ? 0.58 : 0.92}
        />
      </mesh>

      {hovered ? (
        <Html center position={[0, 0.38, 0]} className="scene-html epistemic-hover">
          <strong>{shortPath(score.path)}</strong>
          <span>
            {meta.label} | {score.confidence}
          </span>
          <p>{score.reasons[0]?.message || "No mapped explanation."}</p>
          <ul>
            {score.reasons.slice(1, 4).map((reason) => (
              <li key={`${score.path}-${reason.code}`}>{reason.message}</li>
            ))}
          </ul>
        </Html>
      ) : null}
    </group>
  );
}
