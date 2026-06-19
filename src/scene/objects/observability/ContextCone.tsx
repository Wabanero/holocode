import { Text } from "@react-three/drei";
import type { Vec3 } from "../../layout/layout3d";

type ContextConeKind = "touched" | "read" | "changed" | "warning" | "risk";

const STYLE: Record<ContextConeKind, { color: string; emissive: string; opacity: number; radius: number; height: number }> = {
  touched: { color: "#d8fff4", emissive: "#48e5c2", opacity: 0.82, radius: 0.55, height: 0.07 },
  read: { color: "#6db7ff", emissive: "#6db7ff", opacity: 0.28, radius: 0.72, height: 0.035 },
  changed: { color: "#f2be5c", emissive: "#f2be5c", opacity: 0.78, radius: 0.62, height: 0.06 },
  warning: { color: "#f2be5c", emissive: "#f2be5c", opacity: 0.74, radius: 0.2, height: 0.08 },
  risk: { color: "#f06f6f", emissive: "#f06f6f", opacity: 0.22, radius: 0.95, height: 0.04 }
};

export function ContextCone({
  position,
  height = 0.9,
  kind,
  label
}: {
  position: Vec3;
  height?: number;
  kind: ContextConeKind;
  label?: string;
}) {
  const style = STYLE[kind];
  const y = height + (kind === "risk" ? 0.26 : 0.18);

  return (
    <group position={[position[0], position[1] + y, position[2]]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[style.radius, style.height, 8, 72]} />
        <meshStandardMaterial
          color={style.color}
          emissive={style.emissive}
          emissiveIntensity={kind === "risk" ? 0.74 : 0.92}
          transparent
          opacity={style.opacity}
          depthWrite={false}
        />
      </mesh>
      {kind === "read" || kind === "risk" ? (
        <mesh position={[0, -0.18, 0]}>
          <sphereGeometry args={[style.radius * 0.82, 24, 16]} />
          <meshStandardMaterial color={style.color} emissive={style.emissive} emissiveIntensity={0.18} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      ) : null}
      {label ? (
        <Text position={[0, 0.16, 0]} fontSize={0.07} color={style.color} anchorX="center" maxWidth={1.2}>
          {label}
        </Text>
      ) : null}
    </group>
  );
}
