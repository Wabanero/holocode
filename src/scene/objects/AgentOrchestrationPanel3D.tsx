import { Html, Text } from "@react-three/drei";
import { AgentOrchestrationPanel } from "../../agents/AgentOrchestrationPanel";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export function AgentOrchestrationPanel3D() {
  const showAgentDock = useWorkspaceStore((state) => state.showAgentDock);
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);

  if (!showAgentDock || visibleSceneMode !== "agent") return null;

  return (
    <group position={[3.6, 0.05, -1.45]} rotation={[0, 0.62, 0]}>
      <Text position={[0, 1.38, 0]} fontSize={0.14} color="#6db7ff" anchorX="center">
        Agent Orchestration
      </Text>
      <mesh position={[0, 0.1, -0.08]}>
        <boxGeometry args={[2.15, 2.42, 0.1]} />
        <meshStandardMaterial color="#111819" emissive="#6db7ff" emissiveIntensity={0.06} roughness={0.6} />
      </mesh>
      <Html transform position={[0, 0.05, 0.08]} distanceFactor={1.35} className="scene-html scene-orchestration-panel">
        <AgentOrchestrationPanel embedded />
      </Html>
    </group>
  );
}
