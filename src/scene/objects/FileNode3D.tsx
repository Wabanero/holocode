import { Html, Text, useCursor } from "@react-three/drei";
import { memo, useState } from "react";
import type { SceneFile } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export const FileNode3D = memo(function FileNode3D({ file }: { file: SceneFile }) {
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const hoveredObjectId = useWorkspaceStore((state) => state.hoveredObjectId);
  const dirtyFiles = useWorkspaceStore((state) => state.dirtyFiles);
  const modifiedFiles = useWorkspaceStore((state) => state.modifiedFiles);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const diagnosticSummary = useWorkspaceStore((state) => state.diagnosticSummary);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const debugBreakpoints = useWorkspaceStore((state) => state.debugBreakpoints);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const setHoveredObjectId = useWorkspaceStore((state) => state.setHoveredObjectId);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const [localHover, setLocalHover] = useState(false);
  const selected = selectedFileId === file.id;
  const hovered = hoveredObjectId === file.id || localHover;
  const dirty = dirtyFiles.includes(file.path);
  const diffEntry = diffSummary.find((entry) => entry.path === file.path);
  const diagnosticEntry = diagnosticSummary.find((entry) => entry.path === file.path);
  const breakpointCount = debugBreakpoints.filter((breakpoint) => breakpoint.path === file.path).length;
  const activeDebugFrame = debugActiveFrame?.path === file.path;
  const activeAgentRun = agentRuns.find(
    (run) => (run.status === "queued" || run.status === "running") && run.touchedFiles.includes(file.path)
  );
  const touchedByAgent = agentRuns.some((run) => run.touchedFiles.includes(file.path));
  const modified = modifiedFiles.includes(file.path);
  const agentColor = activeAgentRun ? "#c7a8ff" : touchedByAgent ? "#6db7ff" : null;
  const diagnosticColor =
    diagnosticEntry?.maxSeverity === "error"
      ? "#f06f6f"
      : diagnosticEntry?.maxSeverity === "warning"
        ? "#f2be5c"
        : diagnosticEntry
          ? "#6db7ff"
          : null;
  const statusColor =
    diagnosticColor ||
    (activeDebugFrame
      ? "#6db7ff"
      : agentColor
        ? agentColor
      : null) ||
    (diffEntry?.status === "added"
      ? "#48e5c2"
      : diffEntry?.status === "deleted"
        ? "#f06f6f"
        : modified
          ? "#f2be5c"
          : "#101313");
  useCursor(hovered);

  return (
    <group
      position={file.position}
      onPointerOver={(event) => {
        event.stopPropagation();
        setLocalHover(true);
        setHoveredObjectId(file.id);
      }}
      onPointerOut={() => {
        setLocalHover(false);
        setHoveredObjectId(null);
      }}
      onClick={(event) => {
        event.stopPropagation();
        focusFile(file.path);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        void openFile(file.path);
      }}
    >
      <mesh position={[0, file.height / 2, 0]}>
        <boxGeometry args={[0.62, file.height, 0.28]} />
        <meshStandardMaterial
          color={file.color}
          emissive={selected || hovered ? file.color : activeDebugFrame ? "#6db7ff" : agentColor || diagnosticColor || "#000000"}
          emissiveIntensity={
            selected ? 0.42 : hovered ? 0.2 : activeDebugFrame ? 0.58 : activeAgentRun ? 0.52 : agentColor ? 0.34 : diagnosticColor ? 0.46 : 0
          }
          roughness={0.48}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[0, file.height + 0.08, 0]}>
        <boxGeometry args={[0.72, 0.035, 0.34]} />
        <meshBasicMaterial color={dirty ? "#f06f6f" : selected ? "#48e5c2" : statusColor} />
      </mesh>
      {(dirty || modified || diagnosticEntry) && (
        <mesh position={[0.42, file.height + 0.22, 0]}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshStandardMaterial
            color={dirty ? "#f06f6f" : statusColor}
            emissive={dirty ? "#f06f6f" : statusColor}
            emissiveIntensity={diagnosticEntry ? 0.65 : 0.35}
          />
        </mesh>
      )}
      {breakpointCount > 0 && (
        <mesh position={[-0.42, file.height + 0.22, 0]}>
          <sphereGeometry args={[0.075, 18, 18]} />
          <meshStandardMaterial color="#f06f6f" emissive="#f06f6f" emissiveIntensity={0.72} />
        </mesh>
      )}
      {activeDebugFrame && (
        <mesh position={[0, file.height / 2, 0.21]}>
          <torusGeometry args={[0.46, 0.018, 8, 36]} />
          <meshStandardMaterial color="#6db7ff" emissive="#6db7ff" emissiveIntensity={0.9} />
        </mesh>
      )}
      {agentColor && (
        <mesh position={[0, file.height + 0.36, 0]}>
          <torusGeometry args={[0.28, 0.014, 8, 32]} />
          <meshStandardMaterial color={agentColor} emissive={agentColor} emissiveIntensity={activeAgentRun ? 0.86 : 0.42} />
        </mesh>
      )}
      <Text position={[0, file.height + 0.26, 0]} fontSize={0.095} color="#e9eeee" anchorX="center" maxWidth={1.15}>
        {file.name}
      </Text>
      <Html center distanceFactor={8} position={[0, -0.1, 0.05]} className="scene-object-label">
        <span>
          {dirty
            ? "dirty"
            : diagnosticEntry
              ? `${diagnosticEntry.maxSeverity} ${diagnosticEntry.errors || diagnosticEntry.warnings || diagnosticEntry.infos}`
              : breakpointCount
                ? `${breakpointCount} bp`
                : activeAgentRun
                  ? "agent running"
                  : agentColor
                    ? "agent touched"
                    : diffEntry?.status || file.language || "file"}
        </span>
      </Html>
    </group>
  );
});
