import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

function FloatingPanel({
  position,
  scale,
  color
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  const ref = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(clock.elapsedTime * 0.22 + position[0]) * 0.035;
  });

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <boxGeometry args={[1, 1, 0.025]} />
      <meshStandardMaterial color={color} transparent opacity={0.38} roughness={0.7} metalness={0.1} />
    </mesh>
  );
}

export function SceneBackdrop() {
  return (
    <div className="scene-backdrop" aria-hidden="true">
      <Canvas camera={{ position: [0, 1.4, 6.4], fov: 48 }}>
        <color attach="background" args={["#090a0a"]} />
        <ambientLight intensity={0.65} />
        <pointLight position={[2.5, 3, 4]} intensity={1.25} color="#7df5d7" />
        <pointLight position={[-4, -1.5, 3]} intensity={0.75} color="#f2be5c" />
        <FloatingPanel position={[0, 0.25, -1.2]} scale={[4.4, 2.55, 1]} color="#1d3530" />
        <FloatingPanel position={[-3.15, 0.35, -1.65]} scale={[1.25, 2.15, 1]} color="#263735" />
        <FloatingPanel position={[3.15, 0.32, -1.65]} scale={[1.25, 2.15, 1]} color="#3a3328" />
        <FloatingPanel position={[0, 2.05, -2.15]} scale={[3.4, 0.75, 1]} color="#253638" />
        <FloatingPanel position={[0, -1.65, -1.85]} scale={[3.6, 0.9, 1]} color="#332c27" />
        <mesh position={[0, -2.25, -1.6]} rotation={[-Math.PI / 2, 0, 0]} scale={[7, 7, 1]}>
          <planeGeometry args={[1, 1, 18, 18]} />
          <meshStandardMaterial color="#101313" wireframe transparent opacity={0.35} />
        </mesh>
      </Canvas>
    </div>
  );
}
