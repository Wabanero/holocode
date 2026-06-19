import { Html } from "@react-three/drei";
import { useMemo } from "react";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import type { SceneLayout3D, Vec3 } from "../../layout/layout3d";
import { ContextCone } from "./ContextCone";
import { ContextGhostNode } from "./ContextGhostNode";
import { ContextLegend3D } from "./ContextLegend3D";

function fileId(path: string) {
  return `file:${path}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function offsetPosition(position: Vec3, index: number): Vec3 {
  const angle = (index / 9) * Math.PI * 2;
  return [position[0] + Math.cos(angle) * 0.86, position[1] + 0.72 + (index % 3) * 0.12, position[2] + Math.sin(angle) * 0.86];
}

export function ContextLens3D({ layout }: { layout: SceneLayout3D }) {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const activeContextLens = useObservabilityStore((state) => state.activeContextLens);
  const contextLensExpansion = useObservabilityStore((state) => state.contextLensExpansion);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const graph = useWorkspaceStore((state) => state.graph);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const focusFile = useWorkspaceStore((state) => state.focusFile);

  const visible = activeObservabilityMode === "context-lens";
  const filesByPath = useMemo(() => new Map(layout.files.map((file) => [file.path, file])), [layout.files]);
  const graphNodesById = useMemo(() => new Map((graph?.nodes || []).map((node) => [node.id, node])), [graph]);

  const context = useMemo(() => {
    const readFiles = new Set(activeContextLens?.readFiles || []);
    const touchedFiles = new Set(activeContextLens?.touchedFiles || []);
    const changedFiles = new Set(activeContextLens?.changedFiles || []);
    const contextFiles = new Set([...readFiles, ...touchedFiles, ...changedFiles]);
    const missingTests = new Set<string>();
    const missingCallers = new Set<string>();
    const riskyFiles = new Set<string>();

    for (const path of contextFiles) {
      const node = graphNodesById.get(fileId(path));
      for (const testPath of node?.relatedTests || []) {
        if (!contextFiles.has(testPath)) missingTests.add(testPath);
      }
      const importers =
        graph?.edges
          .filter((edge) => edge.type === "imports" && edge.target === fileId(path))
          .map((edge) => graphNodesById.get(edge.source)?.path)
          .filter(Boolean) || [];
      for (const importer of importers) {
        if (importer && !contextFiles.has(importer)) missingCallers.add(importer);
      }
      if ((changedFiles.has(path) || touchedFiles.has(path)) && (node?.relatedTests || []).some((testPath) => !contextFiles.has(testPath))) {
        riskyFiles.add(path);
      }
      if ((changedFiles.has(path) || touchedFiles.has(path)) && importers.length > 2 && importers.some((importer) => importer && !contextFiles.has(importer))) {
        riskyFiles.add(path);
      }
    }

    return {
      readFiles: unique([...readFiles]),
      touchedFiles: unique([...touchedFiles]),
      changedFiles: unique([...changedFiles]),
      missingTests: unique([...missingTests]),
      missingCallers: unique([...missingCallers]),
      riskyFiles: unique([...riskyFiles])
    };
  }, [activeContextLens, graph?.edges, graphNodesById]);

  if (!visible) return null;

  const hasRun = Boolean(activeContextLens?.runId || activeContextLens?.taskId);
  const tokenBudget = activeContextLens?.promptBudgetTokens || null;
  const tokenEstimate = activeContextLens?.estimatedTokens || 0;
  const tokenUsagePercent = tokenBudget ? Math.max(0, Math.min(100, Math.round((tokenEstimate / tokenBudget) * 100))) : null;
  const tokenUsageLabel = tokenBudget ? `${tokenEstimate}/${tokenBudget} estimated tokens` : "token usage unavailable";
  const ghostPaths = [
    ...(contextLensExpansion.tests ? context.missingTests : context.missingTests.slice(0, 6)),
    ...(contextLensExpansion.callers ? context.missingCallers : context.missingCallers.slice(0, 4))
  ];

  return (
    <group>
      {hasRun ? (
        <>
          {context.readFiles.map((path) => {
            const file = filesByPath.get(path);
            return file ? <ContextCone key={`read-${path}`} position={file.position} height={file.height} kind="read" label="context" /> : null;
          })}
          {context.touchedFiles.map((path) => {
            const file = filesByPath.get(path);
            return file ? <ContextCone key={`touch-${path}`} position={file.position} height={file.height} kind="touched" label="touched" /> : null;
          })}
          {context.changedFiles.map((path) => {
            const file = filesByPath.get(path);
            return file ? <ContextCone key={`changed-${path}`} position={file.position} height={file.height} kind="changed" label="changed" /> : null;
          })}
          {context.riskyFiles.map((path) => {
            const file = filesByPath.get(path);
            return file ? <ContextCone key={`risk-${path}`} position={file.position} height={file.height} kind="risk" label="risk" /> : null;
          })}
          {context.missingTests.map((path) => {
            const file = filesByPath.get(path);
            return file ? <ContextCone key={`test-warning-${path}`} position={file.position} height={file.height} kind="warning" label="test missing" /> : null;
          })}
          {ghostPaths.map((path, index) => {
            const file = filesByPath.get(path);
            const nearestContextPath = context.touchedFiles[index % Math.max(1, context.touchedFiles.length)] || context.changedFiles[0] || context.readFiles[0];
            const anchor = (nearestContextPath && filesByPath.get(nearestContextPath)?.position) || ([0, 0.7, 0] as Vec3);
            const position = file ? offsetPosition(file.position, index) : offsetPosition(anchor, index);
            const kind = context.missingTests.includes(path) ? "test" : "caller";
            return (
              <ContextGhostNode
                key={`ghost-${path}`}
                position={position}
                path={path}
                kind={kind}
                onOpen={(targetPath) => {
                  if (filesByPath.has(targetPath)) {
                    focusFile(targetPath);
                    void openFile(targetPath);
                  }
                }}
              />
            );
          })}
          {tokenUsagePercent !== null ? (
            <group position={[6.0, 2.05, 1.78]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh>
                <torusGeometry args={[0.34, 0.025, 8, 64, (Math.PI * 2 * tokenUsagePercent) / 100]} />
                <meshBasicMaterial color={tokenUsagePercent > 80 ? "#f06f6f" : "#48e5c2"} />
              </mesh>
            </group>
          ) : null}
        </>
      ) : (
        <Html center position={[0, 2.25, -2.4]} className="scene-html context-lens-empty">
          <strong>No agent run available yet.</strong>
          <span>Create and run an agent task first.</span>
        </Html>
      )}
      <ContextLegend3D
        lens={activeContextLens}
        missingTests={context.missingTests.length}
        missingCallers={context.missingCallers.length}
        tokenUsageLabel={tokenUsageLabel}
        tokenUsagePercent={tokenUsagePercent}
        onHide={clearObservabilityOverlays}
      />
    </group>
  );
}
