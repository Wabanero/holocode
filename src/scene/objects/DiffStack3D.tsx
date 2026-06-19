import { Html, Text } from "@react-three/drei";
import { useMemo } from "react";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";
import type { DiffChangedFile } from "../../types";

function diffSectionForFile(diff: string, path: string | null) {
  if (!diff || !path) return diff;
  const lines = diff.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("diff --git ") && line.includes(` b/${path}`));
  if (start < 0) return diff;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("diff --git "));
  return lines.slice(start, end < 0 ? lines.length : end).join("\n");
}

function cardColor(file: DiffChangedFile) {
  if (file.status === "added") return "#193b32";
  if (file.status === "deleted") return "#402423";
  if (file.status === "renamed") return "#2d2940";
  return "#373321";
}

export function DiffStack3D() {
  const showDiffStack = useWorkspaceStore((state) => state.showDiffStack);
  const currentDiff = useWorkspaceStore((state) => state.currentDiff);
  const activeDiff = useWorkspaceStore((state) => state.activeDiff);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const activeDiffFile = useWorkspaceStore((state) => state.activeDiffFile);
  const lastGitError = useWorkspaceStore((state) => state.lastGitError);
  const agentResults = useWorkspaceStore((state) => state.agentResults);
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const openDiffForFile = useWorkspaceStore((state) => state.openDiffForFile);
  const openAgentDiff = useWorkspaceStore((state) => state.openAgentDiff);
  const refreshGitState = useWorkspaceStore((state) => state.refreshGitState);
  const showFirstDiff = useWorkspaceStore((state) => state.showFirstDiff);
  const validatePatch = useWorkspaceStore((state) => state.validatePatch);
  const applyPatch = useWorkspaceStore((state) => state.applyPatch);
  const rejectPatch = useWorkspaceStore((state) => state.rejectPatch);
  const selectedDiffSource = activeDiff || currentDiff;
  const selectedDiff = useMemo(() => diffSectionForFile(selectedDiffSource, activeDiffFile), [activeDiffFile, selectedDiffSource]);
  const agentDiffs = agentResults.filter((task) => task.diff && task.resultDiffFile);
  const isAgentView = visibleSceneMode === "agent";
  const visibleDiffs = diffSummary.slice(0, isAgentView ? 7 : 4);
  const visibleAgentDiffs = isAgentView ? agentDiffs.slice(-4) : [];

  if (!showDiffStack) return null;

  return (
    <group position={isAgentView ? [5.7, 0.72, -2.55] : [6.82, 1.48, -2.42]} rotation={[0, isAgentView ? -0.55 : -0.92, 0]}>
      <Text position={[0, isAgentView ? 0.92 : 1.18, 0]} fontSize={isAgentView ? 0.15 : 0.12} color="#f2be5c" anchorX="center">
        Git Diff Stack
      </Text>
      {diffSummary.length ? (
        visibleDiffs.map((file, index) => (
          <group key={file.path} position={[0, (isAgentView ? 0.55 : 0.88) - index * (isAgentView ? 0.2 : 0.23), index * 0.06]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                openDiffForFile(file.path);
              }}
            >
              <boxGeometry args={[isAgentView ? 1.9 : 1.28, isAgentView ? 0.16 : 0.15, isAgentView ? 0.94 : 0.7]} />
              <meshStandardMaterial color={cardColor(file)} emissive="#f2be5c" emissiveIntensity={0.08} />
            </mesh>
            <Text
              position={[0, 0.025, isAgentView ? 0.49 : 0.37]}
              fontSize={isAgentView ? 0.052 : 0.043}
              color="#e9eeee"
              anchorX="center"
              maxWidth={isAgentView ? 1.55 : 1.02}
            >
              {file.path}
            </Text>
            <Text
              position={[0, -0.055, isAgentView ? 0.49 : 0.37]}
              fontSize={isAgentView ? 0.043 : 0.036}
              color="#f2d9a0"
              anchorX="center"
              maxWidth={isAgentView ? 1.55 : 1.02}
            >
              {`${file.status}  +${file.additions}  -${file.deletions}`}
            </Text>
          </group>
        ))
      ) : (
        <group position={[0, isAgentView ? 0.34 : 0.66, 0.08]}>
          <mesh>
            <boxGeometry args={[isAgentView ? 1.75 : 1.24, 0.28, isAgentView ? 0.9 : 0.7]} />
            <meshStandardMaterial color="#242626" emissive="#48e5c2" emissiveIntensity={0.04} />
          </mesh>
          <Text position={[0, 0.02, isAgentView ? 0.47 : 0.37]} fontSize={isAgentView ? 0.055 : 0.044} color="#a5b0ad" anchorX="center" maxWidth={isAgentView ? 1.4 : 1.0}>
            {lastGitError || "No git diff"}
          </Text>
        </group>
      )}
      {visibleAgentDiffs.map((task, index) => {
        const status = task.patchState?.status || "pending";
        const y = -0.98 - index * 0.24;
        const color =
          status === "applied"
            ? "#193b32"
            : status === "validated"
              ? "#373321"
              : status === "failed" || status === "rejected"
                ? "#402423"
                : "#242626";
        return (
          <group key={task.taskId} position={[0, y, 0.14 + index * 0.06]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                openAgentDiff(task.taskId);
              }}
            >
              <boxGeometry args={[1.9, 0.16, 0.94]} />
              <meshStandardMaterial color={color} emissive="#48e5c2" emissiveIntensity={0.07} />
            </mesh>
            <Text position={[0, 0.025, 0.49]} fontSize={0.052} color="#e9eeee" anchorX="center" maxWidth={1.55}>
              {task.resultDiffFile}
            </Text>
            <Text position={[0, -0.055, 0.49]} fontSize={0.043} color="#9ff5df" anchorX="center" maxWidth={1.55}>
              {`agent patch: ${status}`}
            </Text>
            <Html transform scale={0.82} position={[1.18, 0, 0.12]} className="scene-html scene-patch-card-actions">
              <button onClick={() => void validatePatch(task.resultDiffFile || "")}>Check</button>
              <button onClick={() => void applyPatch(task.resultDiffFile || "")}>Apply</button>
              <button onClick={() => void rejectPatch(task.resultDiffFile || "")}>Reject</button>
            </Html>
          </group>
        );
      })}
      <Html
        transform
        scale={isAgentView ? 0.9 : 0.68}
        position={[0, isAgentView ? -0.48 : -0.18, isAgentView ? 0.45 : 0.34]}
        className="scene-html scene-agent-controls scene-diff-controls"
      >
        <button onClick={() => void refreshGitState()}>Refresh git</button>
        <button onClick={showFirstDiff}>Open readable diff</button>
      </Html>
      {selectedDiff && (
        <Html
          transform
          scale={isAgentView ? 0.92 : 0.72}
          position={isAgentView ? [-2.35, 0.2, 0.3] : [-1.46, 0.58, 0.32]}
          rotation={[0, isAgentView ? 0.35 : 0.2, 0]}
          className="scene-html"
        >
          <div className="spatial-readable-diff">
            <header>
              <strong>{activeDiffFile || "git diff"}</strong>
              <span>{diffSummary.length} changed files</span>
            </header>
            <pre>
              {selectedDiff
                .split(/\r?\n/)
                .slice(0, 220)
                .map((line, index) => (
                  <code
                    key={`${line}-${index}`}
                    className={
                      line.startsWith("+") && !line.startsWith("+++")
                        ? "diff-added"
                        : line.startsWith("-") && !line.startsWith("---")
                          ? "diff-removed"
                          : line.startsWith("@@")
                            ? "diff-hunk"
                            : "diff-context"
                    }
                  >
                    {line || " "}
                  </code>
                ))}
            </pre>
          </div>
        </Html>
      )}
    </group>
  );
}
