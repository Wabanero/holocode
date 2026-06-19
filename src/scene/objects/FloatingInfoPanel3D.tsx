import { Html } from "@react-three/drei";
import type { ReactNode } from "react";

export function FloatingInfoPanel3D({
  position,
  rotation,
  className = "",
  children
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  className?: string;
  children: ReactNode;
}) {
  return (
    <Html transform position={position} rotation={rotation} distanceFactor={1.4} className={`scene-html ${className}`}>
      {children}
    </Html>
  );
}
