import { Html, Line, Text } from "@react-three/drei";
import { useMemo } from "react";
import { Vector3 } from "three";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";
import type { LspDiagnostic, LspLocation } from "../../types";
import type { SceneLayout3D } from "../layout/layout3d";

function diagnosticColor(diagnostic: LspDiagnostic) {
  if (diagnostic.severity === "error") return "#f06f6f";
  if (diagnostic.severity === "warning") return "#f2be5c";
  return "#6db7ff";
}

function locationLabel(location: LspLocation) {
  return `${location.path}:${location.startLine}`;
}

export function Diagnostics3D({ layout }: { layout: SceneLayout3D }) {
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const showDiagnosticsPanel = useWorkspaceStore((state) => state.showDiagnosticsPanel);
  const diagnostics = useWorkspaceStore((state) => state.diagnostics);
  const diagnosticSummary = useWorkspaceStore((state) => state.diagnosticSummary);
  const activeDiagnosticId = useWorkspaceStore((state) => state.activeDiagnosticId);
  const hoverInfo = useWorkspaceStore((state) => state.hoverInfo);
  const definitionLocations = useWorkspaceStore((state) => state.definitionLocations);
  const referenceLocations = useWorkspaceStore((state) => state.referenceLocations);
  const renamePreview = useWorkspaceStore((state) => state.renamePreview);
  const lastLspError = useWorkspaceStore((state) => state.lastLspError);
  const openDiagnostic = useWorkspaceStore((state) => state.openDiagnostic);
  const refreshDiagnostics = useWorkspaceStore((state) => state.refreshDiagnostics);
  const findReferencesAtCursor = useWorkspaceStore((state) => state.findReferencesAtCursor);
  const goToDefinitionAtCursor = useWorkspaceStore((state) => state.goToDefinitionAtCursor);
  const previewRenameAtCursor = useWorkspaceStore((state) => state.previewRenameAtCursor);

  const visible = showDiagnosticsPanel || visibleSceneMode === "diagnostics";
  const topDiagnostics = diagnostics.slice(0, 8);
  const errorCount = diagnosticSummary.reduce((sum, file) => sum + file.errors, 0);
  const warningCount = diagnosticSummary.reduce((sum, file) => sum + file.warnings, 0);
  const guideLines = useMemo(
    () =>
      topDiagnostics
        .slice(0, 5)
        .map((diagnostic, index) => {
          const filePosition = layout.nodePositions[`file:${diagnostic.path}`];
          if (!filePosition) return null;
          const cardPoint = new Vector3(-5.25, 1.25 - index * 0.22, -2.1 + index * 0.04);
          const targetPoint = new Vector3(filePosition[0], filePosition[1] + 1.05, filePosition[2]);
          return { id: diagnostic.id, color: diagnosticColor(diagnostic), points: [cardPoint, targetPoint] };
        })
        .filter(Boolean),
    [layout.nodePositions, topDiagnostics]
  );

  if (!visible) return null;

  return (
    <group position={[-5.25, 1.35, -2.1]} rotation={[0, 0.52, 0]}>
      <Text position={[0, 0.86, 0]} fontSize={0.15} color="#f06f6f" anchorX="center">
        Diagnostics3D
      </Text>

      {topDiagnostics.length ? (
        topDiagnostics.map((diagnostic, index) => {
          const selected = activeDiagnosticId === diagnostic.id;
          const color = diagnosticColor(diagnostic);
          return (
            <group key={diagnostic.id} position={[0, 0.55 - index * 0.22, index * 0.04]}>
              <mesh
                onClick={(event) => {
                  event.stopPropagation();
                  void openDiagnostic(diagnostic.id);
                }}
              >
                <boxGeometry args={[2.15, 0.17, 0.82]} />
                <meshStandardMaterial color="#242626" emissive={color} emissiveIntensity={selected ? 0.34 : 0.13} />
              </mesh>
              <Text position={[0, 0.035, 0.43]} fontSize={0.048} color="#e9eeee" anchorX="center" maxWidth={1.72}>
                {`${diagnostic.path}:${diagnostic.startLine}`}
              </Text>
              <Text position={[0, -0.046, 0.43]} fontSize={0.038} color={color} anchorX="center" maxWidth={1.72}>
                {diagnostic.message}
              </Text>
            </group>
          );
        })
      ) : (
        <group position={[0, 0.28, 0.04]}>
          <mesh>
            <boxGeometry args={[2.05, 0.34, 0.82]} />
            <meshStandardMaterial color="#1c2725" emissive="#48e5c2" emissiveIntensity={0.08} />
          </mesh>
          <Text position={[0, 0.02, 0.43]} fontSize={0.055} color="#9ff5df" anchorX="center" maxWidth={1.55}>
            {lastLspError || "No TypeScript diagnostics"}
          </Text>
        </group>
      )}

      {guideLines.map((line) => (
        <Line key={line?.id} points={line?.points || []} color={line?.color || "#f06f6f"} lineWidth={2} transparent opacity={0.34} />
      ))}

      <Html transform position={[0, -1.38, 0.42]} className="scene-html diagnostics-controls">
        <button onClick={() => void refreshDiagnostics()}>Refresh</button>
        <button onClick={() => void goToDefinitionAtCursor()}>Definition</button>
        <button onClick={() => void findReferencesAtCursor()}>References</button>
        <button onClick={() => void previewRenameAtCursor()}>Rename preview</button>
        <span>
          {errorCount} errors / {warningCount} warnings
        </span>
      </Html>

      {(hoverInfo?.contents || definitionLocations.length || referenceLocations.length || renamePreview) && (
        <Html transform position={[2.05, -0.02, 0.36]} rotation={[0, -0.28, 0]} className="scene-html">
          <div className="diagnostics-detail-panel">
            {hoverInfo?.contents ? (
              <section>
                <strong>Hover</strong>
                <code>{hoverInfo.contents}</code>
                {hoverInfo.documentation ? <p>{hoverInfo.documentation}</p> : null}
              </section>
            ) : null}
            {definitionLocations.length ? (
              <section>
                <strong>Definitions</strong>
                {definitionLocations.slice(0, 4).map((location) => (
                  <span key={`${location.path}-${location.startLine}-${location.startColumn}`}>{locationLabel(location)}</span>
                ))}
              </section>
            ) : null}
            {referenceLocations.length ? (
              <section>
                <strong>References</strong>
                {referenceLocations.slice(0, 6).map((location) => (
                  <span key={`${location.path}-${location.startLine}-${location.startColumn}`}>{locationLabel(location)}</span>
                ))}
              </section>
            ) : null}
            {renamePreview ? (
              <section>
                <strong>Rename</strong>
                <p>{renamePreview.message}</p>
              </section>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}
