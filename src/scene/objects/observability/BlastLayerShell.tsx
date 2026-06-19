import { Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { DoubleSide } from "three";
import type { Vec3 } from "../../layout/layout3d";

export function BlastLayerShell({
  center,
  radius,
  depth,
  label,
  color,
  active,
  cracked,
  heuristic,
  onClick
}: {
  center: Vec3;
  radius: number;
  depth: number;
  label: string;
  color: string;
  active: boolean;
  cracked?: boolean;
  heuristic?: boolean;
  onClick: (depth: number) => void;
}) {
  const opacity = active ? (heuristic ? 0.08 : 0.13) : 0.035;

  return (
    <group position={center}>
      <mesh
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onClick(depth);
        }}
      >
        <sphereGeometry args={[radius, 36, 18]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} wireframe={heuristic} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[radius, heuristic ? 0.008 : 0.014, 6, 96]} />
        <meshBasicMaterial color={color} transparent opacity={active ? 0.42 : 0.18} depthWrite={false} />
      </mesh>
      <Text position={[0, radius + 0.12, 0]} fontSize={0.07} color={active ? color : "#6f7a76"} anchorX="center" maxWidth={1.9}>
        {label}
      </Text>
      {cracked
        ? Array.from({ length: 6 }).map((_, index) => {
            const angle = (index / 6) * Math.PI * 2;
            return (
              <mesh key={index} position={[Math.cos(angle) * radius * 0.68, 0.04 + (index % 2) * 0.16, Math.sin(angle) * radius * 0.68]} rotation={[0.45, angle, 0.92]}>
                <boxGeometry args={[0.035, 0.34, 0.014]} />
                <meshBasicMaterial color="#f06f6f" transparent opacity={active ? 0.72 : 0.24} depthWrite={false} />
              </mesh>
            );
          })
        : null}
    </group>
  );
}
