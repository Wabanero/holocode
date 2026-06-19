import { Html, Text, useCursor } from "@react-three/drei";
import { useState } from "react";
import type { SceneExternalPackage } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function ExternalPackageRing3D({ packages }: { packages: SceneExternalPackage[] }) {
  const showExternalPackages = useWorkspaceStore((state) => state.showExternalPackages);
  const selectedPackageId = useWorkspaceStore((state) => state.selectedPackageId);
  const selectPackage = useWorkspaceStore((state) => state.selectPackage);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useCursor(Boolean(hoveredId));

  if (!showExternalPackages) return null;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={[8.35, 8.42, 96]} />
        <meshBasicMaterial color="#f2be5c" transparent opacity={0.2} />
      </mesh>
      {packages.map((pkg) => {
        const selected = selectedPackageId === pkg.id;
        const hovered = hoveredId === pkg.id;
        return (
          <group key={pkg.id} position={pkg.position}>
            <mesh
              onPointerOver={(event) => {
                event.stopPropagation();
                setHoveredId(pkg.id);
              }}
              onPointerOut={() => setHoveredId(null)}
              onClick={(event) => {
                event.stopPropagation();
                selectPackage(pkg.id);
              }}
            >
              <dodecahedronGeometry args={[selected || hovered ? 0.22 : 0.16, 0]} />
              <meshStandardMaterial
                color="#f2be5c"
                emissive="#f2be5c"
                emissiveIntensity={selected ? 0.38 : hovered ? 0.22 : 0.08}
                roughness={0.35}
              />
            </mesh>
            {(selected || hovered) && (
              <Text position={[0, 0.35, 0]} fontSize={0.11} color="#e9eeee" anchorX="center">
                {pkg.name}
              </Text>
            )}
            <Html center distanceFactor={10} position={[0, -0.22, 0]} className="scene-object-label">
              <span>pkg</span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}
