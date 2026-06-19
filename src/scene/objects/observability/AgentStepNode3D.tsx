import { Html, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { AgentTopologyStep } from "../../../observability/agentTopology";

type Vec3 = [number, number, number];

const KIND_COLORS: Record<AgentTopologyStep["kind"], string> = {
  planner: "#6db7ff",
  retriever: "#7fd9ff",
  coder: "#48e5c2",
  "patch-writer": "#f2be5c",
  validator: "#f2be5c",
  tester: "#a7d36f",
  critic: "#d5a8ff",
  debugger: "#ff8f70",
  finalizer: "#d8fff4",
  "apply-gate": "#f2be5c",
  generic: "#9aa6a2"
};

const STATUS_COLORS: Record<AgentTopologyStep["status"], string> = {
  queued: "#7c8783",
  running: "#6db7ff",
  completed: "#48e5c2",
  failed: "#f06f6f",
  skipped: "#5c6461",
  "needs-human-review": "#f2be5c",
  cancelled: "#9aa6a2",
  unknown: "#8a9692"
};

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.at(-2)}/${parts.at(-1)}` : path;
}

function stepShape(kind: AgentTopologyStep["kind"]) {
  if (kind === "apply-gate") return "gate";
  if (kind === "validator" || kind === "tester") return "tool";
  return "agent";
}

export function AgentStepNode3D({
  step,
  position,
  highlighted,
  dimmed,
  showTokenUsage,
  focusedFile,
  onStepClick,
  onFileClick
}: {
  step: AgentTopologyStep;
  position: Vec3;
  highlighted?: boolean;
  dimmed?: boolean;
  showTokenUsage?: boolean;
  focusedFile?: string | null;
  onStepClick: (step: AgentTopologyStep) => void;
  onFileClick: (path: string) => void;
}) {
  const kindColor = KIND_COLORS[step.kind];
  const statusColor = STATUS_COLORS[step.status];
  const tokenTotal = (step.inputTokens || 0) + (step.outputTokens || 0);
  const shape = stepShape(step.kind);
  const opacity = dimmed ? 0.28 : 0.88;

  return (
    <group position={position}>
      <mesh
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onStepClick(step);
        }}
      >
        {shape === "gate" ? <octahedronGeometry args={[0.25, 0]} /> : shape === "tool" ? <boxGeometry args={[0.58, 0.32, 0.18]} /> : <sphereGeometry args={[0.24, 24, 16]} />}
        <meshStandardMaterial
          color={highlighted ? statusColor : kindColor}
          emissive={statusColor}
          emissiveIntensity={step.status === "running" ? 0.62 : highlighted ? 0.42 : 0.18}
          roughness={0.42}
          transparent
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, -0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.015, 8, 42]} />
        <meshBasicMaterial color={statusColor} transparent opacity={dimmed ? 0.18 : 0.72} />
      </mesh>
      <Text position={[0, 0.38, 0]} fontSize={0.07} color={dimmed ? "#6f7a76" : "#e9eeee"} anchorX="center" maxWidth={0.92}>
        {step.label}
      </Text>
      <Text position={[0, 0.27, 0]} fontSize={0.05} color={dimmed ? "#6f7a76" : statusColor} anchorX="center" maxWidth={0.9}>
        {step.status}
      </Text>
      {showTokenUsage && tokenTotal ? (
        <Text position={[0, -0.43, 0]} fontSize={0.052} color="#f2d9a0" anchorX="center" maxWidth={0.9}>
          {tokenTotal} tokens
        </Text>
      ) : null}
      {step.filesTouched.length ? (
        <Html transform position={[0.02, -0.68, 0.08]} className="scene-html agent-topology-file-badges">
          {step.filesTouched.slice(0, 3).map((path) => (
            <button
              key={path}
              className={focusedFile === path ? "is-focused" : ""}
              title={path}
              onClick={() => onFileClick(path)}
            >
              {shortPath(path)}
            </button>
          ))}
          {step.filesTouched.length > 3 ? <span>+{step.filesTouched.length - 3}</span> : null}
        </Html>
      ) : null}
    </group>
  );
}
