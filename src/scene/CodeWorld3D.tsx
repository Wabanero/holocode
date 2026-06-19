import { Html, Stars } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { FunctionPanel } from "../editor/FunctionPanel";
import { TerminalPanel } from "../workspace/TerminalPanel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import { CameraController } from "./CameraController";
import { buildSceneLayout3D, folderKeyForFile } from "./layout/layout3d";
import { AgentDock3D } from "./objects/AgentDock3D";
import { AgentOrchestrationPanel3D } from "./objects/AgentOrchestrationPanel3D";
import { Debugger3D } from "./objects/Debugger3D";
import { DependencyBeam3D } from "./objects/DependencyBeam3D";
import { Diagnostics3D } from "./objects/Diagnostics3D";
import { DiffStack3D } from "./objects/DiffStack3D";
import { ErrorPath3D } from "./objects/ErrorPath3D";
import { ExternalPackageRing3D } from "./objects/ExternalPackageRing3D";
import { FileNode3D } from "./objects/FileNode3D";
import { FloatingEditorPanel3D } from "./objects/FloatingEditorPanel3D";
import { FloatingInfoPanel3D } from "./objects/FloatingInfoPanel3D";
import { FolderDistrict3D } from "./objects/FolderDistrict3D";
import { FunctionSatellite3D } from "./objects/FunctionSatellite3D";
import { TestConstellation3D } from "./objects/TestConstellation3D";
import { AgentThoughtTopology3D } from "./objects/observability/AgentThoughtTopology3D";
import { BlastRadiusBubble3D } from "./objects/observability/BlastRadiusBubble3D";
import { ContextLens3D } from "./objects/observability/ContextLens3D";
import { DiffTimeTunnel3D } from "./objects/observability/DiffTimeTunnel3D";
import { EpistemicFog3D } from "./objects/observability/EpistemicFog3D";
import { TraceRiver3D } from "./objects/observability/TraceRiver3D";

function capBeams<T extends { id: string }>(beams: T[], highlightedIds: Set<string>, cap: number) {
  if (!cap || beams.length <= cap) return beams;
  const highlighted = beams.filter((beam) => highlightedIds.has(beam.id));
  const rest = beams.filter((beam) => !highlightedIds.has(beam.id));
  return [...highlighted, ...rest.slice(0, Math.max(0, cap - highlighted.length))];
}

function FpsOverlay3D({ files, beams, symbols }: { files: number; beams: number; symbols: number }) {
  const showFpsOverlay = useWorkspaceStore((state) => state.showFpsOverlay);
  const frames = useRef(0);
  const last = useRef(performance.now());
  const [fps, setFps] = useState(0);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (now - last.current >= 700) {
      setFps(Math.round((frames.current * 1000) / (now - last.current)));
      frames.current = 0;
      last.current = now;
    }
  });

  if (!showFpsOverlay) return null;

  return (
    <Html transform scale={0.82} position={[-5.95, 2.25, -3.0]} rotation={[0, 0.5, 0]} className="scene-html scene-fps-overlay">
      <strong>{fps} FPS</strong>
      <span>{files} files</span>
      <span>{symbols} symbols</span>
      <span>{beams} beams</span>
    </Html>
  );
}

function WebXRButtonPortal() {
  const { gl } = useThree();

  useEffect(() => {
    gl.xr.enabled = true;
    const slot = document.querySelector(".xr-button-slot");
    if (!slot) return;
    slot.innerHTML = "";
    const button = VRButton.createButton(gl);
    button.classList.add("spatial-xr-button");
    slot.appendChild(button);
    return () => {
      button.remove();
    };
  }, [gl]);

  return null;
}

function SceneContents() {
  const graph = useWorkspaceStore((state) => state.graph);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const selectedPackageId = useWorkspaceStore((state) => state.selectedPackageId);
  const visibleDependencyMode = useWorkspaceStore((state) => state.visibleDependencyMode);
  const showTests = useWorkspaceStore((state) => state.showTests);
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const worldDetail = useWorkspaceStore((state) => state.worldDetail);
  const graphScopeFilter = useWorkspaceStore((state) => state.graphScopeFilter);
  const showExternalPackages = useWorkspaceStore((state) => state.showExternalPackages);
  const showFunctions = useWorkspaceStore((state) => state.showFunctions);
  const showChangedFilesOnly = useWorkspaceStore((state) => state.showChangedFilesOnly);
  const showDiagnosticsOnly = useWorkspaceStore((state) => state.showDiagnosticsOnly);
  const maxVisibleBeams = useWorkspaceStore((state) => state.maxVisibleBeams);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const diagnosticSummary = useWorkspaceStore((state) => state.diagnosticSummary);
  const pinnedFunctions = useWorkspaceStore((state) => state.pinnedFunctions);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const layout = useMemo(() => buildSceneLayout3D(graph), [graph]);
  const selectedFilePath = selectedFileId?.startsWith("file:") ? selectedFileId.slice("file:".length) : null;
  const currentModule = selectedFilePath ? folderKeyForFile(selectedFilePath) : null;
  const changedPaths = useMemo(() => new Set(diffSummary.map((file) => file.path)), [diffSummary]);
  const diagnosticPaths = useMemo(() => new Set(diagnosticSummary.map((file) => file.path)), [diagnosticSummary]);
  const visibleFiles = useMemo(() => {
    let files = layout.files.filter((file) => showTests || !(file.path.startsWith("tests/") || file.name.includes(".test.")));
    if (graphScopeFilter === "current-file" && selectedFileId) {
      files = files.filter((file) => file.id === selectedFileId);
    }
    if (graphScopeFilter === "current-module" && currentModule) {
      files = files.filter((file) => folderKeyForFile(file.path) === currentModule);
    }
    if (showChangedFilesOnly) {
      files = files.filter((file) => changedPaths.has(file.path));
    }
    if (showDiagnosticsOnly) {
      files = files.filter((file) => diagnosticPaths.has(file.path));
    }
    if (worldDetail === "module" && !selectedFileId && !showChangedFilesOnly && !showDiagnosticsOnly) {
      return [];
    }
    return files.slice(0, graph?.stats.files && graph.stats.files > 800 ? 800 : files.length);
  }, [
    changedPaths,
    currentModule,
    diagnosticPaths,
    graph?.stats.files,
    graphScopeFilter,
    layout.files,
    selectedFileId,
    showChangedFilesOnly,
    showDiagnosticsOnly,
    showTests,
    worldDetail
  ]);
  const visibleFileIds = useMemo(() => new Set(visibleFiles.map((file) => file.id)), [visibleFiles]);
  const visibleImportBeams = useMemo(
    () =>
      visibleDependencyMode === "hidden"
        ? []
        : layout.beams.filter((beam) => {
          const sourceVisible = visibleFileIds.has(beam.source);
          const targetVisible = visibleFileIds.has(beam.target) || (showExternalPackages && beam.target.startsWith("external:"));
          if (!sourceVisible || !targetVisible) return false;
          if (!showExternalPackages && beam.beamKind === "external") return false;
          if (!selectedFileId && visibleSceneMode !== "architecture" && visibleSceneMode !== "dependency") return true;
          if (visibleSceneMode === "architecture" || visibleDependencyMode === "all") return true;
          if (visibleDependencyMode === "incoming") return beam.target === selectedFileId;
          if (visibleDependencyMode === "outgoing") return beam.source === selectedFileId;
          return true;
        }),
    [
      layout.beams,
      selectedFileId,
      showExternalPackages,
      visibleDependencyMode,
      visibleFileIds,
      visibleSceneMode
    ]
  );
  const selectedBeamIds = useMemo(
    () =>
      new Set(
        [...layout.beams, ...layout.testBeams]
          .filter((beam) => beam.source === selectedFileId || beam.target === selectedFileId || beam.target === selectedPackageId)
          .map((beam) => beam.id)
      ),
    [layout.beams, layout.testBeams, selectedFileId, selectedPackageId]
  );
  const cappedImportBeams = useMemo(
    () => capBeams(visibleImportBeams, selectedBeamIds, maxVisibleBeams),
    [maxVisibleBeams, selectedBeamIds, visibleImportBeams]
  );
  const visibleTestBeams = useMemo(
    () =>
      showTests
        ? capBeams(
            layout.testBeams.filter((beam) => visibleFileIds.has(beam.source) || visibleFileIds.has(beam.target)),
            selectedBeamIds,
            Math.min(80, maxVisibleBeams)
          )
        : [],
    [layout.testBeams, maxVisibleBeams, selectedBeamIds, showTests, visibleFileIds]
  );
  const visibleSymbols = useMemo(() => {
    if (!showFunctions) return [];
    const shouldShowFunctionLevel =
      worldDetail === "function" ||
      Boolean(selectedFileId) ||
      visibleSceneMode === "current-file" ||
      visibleSceneMode === "debug" ||
      visibleSceneMode === "diagnostics";
    if (!shouldShowFunctionLevel) return [];
    return layout.symbols
      .filter((symbol) => {
        if (selectedFileId) return symbol.parentFileId === selectedFileId || pinnedFunctions.includes(symbol.id);
        if (debugActiveFrame) return symbol.id === debugActiveFrame.sourceId || symbol.path === debugActiveFrame.path;
        if (showDiagnosticsOnly) return diagnosticPaths.has(symbol.path);
        return visibleFileIds.has(symbol.parentFileId);
      })
      .slice(0, 260);
  }, [
    debugActiveFrame,
    diagnosticPaths,
    layout.symbols,
    pinnedFunctions,
    selectedFileId,
    showDiagnosticsOnly,
    showFunctions,
    visibleFileIds,
    visibleSceneMode,
    worldDetail
  ]);

  return (
    <>
      <color attach="background" args={["#070808"]} />
      <fog attach="fog" args={["#070808", 7, 18]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 8, 5]} intensity={1.2} color="#d8fff4" />
      <pointLight position={[-5, 3, 2]} intensity={2.0} color="#48e5c2" />
      <pointLight position={[6, 2, -3]} intensity={1.4} color="#f2be5c" />
      <Stars radius={40} depth={18} count={900} factor={2.4} saturation={0} fade speed={0.24} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
        <planeGeometry args={[22, 22, 22, 22]} />
        <meshStandardMaterial color="#101313" wireframe transparent opacity={0.2} />
      </mesh>

      {layout.folders.map((folder) => (
        <FolderDistrict3D key={folder.id} folder={folder} />
      ))}

      {visibleFiles
        .filter((file) => !(file.path.startsWith("tests/") || file.name.includes(".test.")))
        .map((file) => (
          <FileNode3D key={file.id} file={file} />
        ))}

      {visibleSymbols.map((symbol) => (
        <FunctionSatellite3D key={symbol.id} symbol={symbol} />
      ))}

      <ContextLens3D layout={layout} />
      <AgentThoughtTopology3D />
      <BlastRadiusBubble3D layout={layout} />
      <TraceRiver3D layout={layout} />
      <EpistemicFog3D layout={layout} visibleFileIds={visibleFileIds} />
      <DiffTimeTunnel3D />

      {cappedImportBeams.map((beam) => {
        const highlighted = selectedBeamIds.has(beam.id);
        const dimmed = Boolean(selectedFileId || selectedPackageId) && !highlighted && visibleSceneMode !== "architecture";
        return <DependencyBeam3D key={beam.id} beam={beam} highlighted={highlighted} dimmed={dimmed} />;
      })}

      {visibleTestBeams.map((beam) => (
          <DependencyBeam3D
            key={beam.id}
            beam={beam}
            highlighted={selectedBeamIds.has(beam.id)}
            dimmed={Boolean(selectedFileId) && !selectedBeamIds.has(beam.id)}
          />
        ))}

      {showExternalPackages && worldDetail !== "module" && <ExternalPackageRing3D packages={layout.externalPackages.slice(0, 180)} />}
      {showTests && worldDetail !== "module" && (
        <TestConstellation3D tests={layout.tests.filter((test) => visibleFileIds.has(test.id)).slice(0, 160)} />
      )}
      <AgentDock3D />
      <AgentOrchestrationPanel3D />
      <DiffStack3D />
      <Diagnostics3D layout={layout} />
      <Debugger3D layout={layout} />
      <ErrorPath3D layout={layout} />
      <FloatingEditorPanel3D />

      <FloatingInfoPanel3D position={[-5.7, 1.55, 1.7]} rotation={[0, 0.72, 0]} className="spatial-side-panel">
        <FunctionPanel />
      </FloatingInfoPanel3D>
      <FloatingInfoPanel3D position={[0, 0.52, 3.72]} rotation={[-0.12, 0, 0]} className="spatial-terminal-panel">
        <TerminalPanel />
      </FloatingInfoPanel3D>

      <Html center position={[0, 2.92, -4.8]} className="scene-title-label">
        <strong>{visibleSceneMode.replace("-", " ")} view</strong>
        <span>{worldDetail} detail | {visibleFiles.length} visible files | {cappedImportBeams.length} beams</span>
      </Html>

      <FpsOverlay3D files={visibleFiles.length} beams={cappedImportBeams.length + visibleTestBeams.length} symbols={visibleSymbols.length} />
      <CameraController layout={layout} />
      <WebXRButtonPortal />
    </>
  );
}

export function CodeWorld3D() {
  return (
    <Canvas
      className="code-world-canvas"
      camera={{ position: [0.35, 3.35, 9.1], fov: 48, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.xr.enabled = true;
      }}
    >
      <Suspense fallback={null}>
        <SceneContents />
      </Suspense>
    </Canvas>
  );
}
