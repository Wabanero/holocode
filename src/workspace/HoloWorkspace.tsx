import { Activity, AlertTriangle, Bot, Bug, Cpu, GitBranch, Network, RotateCcw, Route, ScanLine, View } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../components/Button";
import { CodeWorld3D } from "../scene/CodeWorld3D";
import { useObservabilityStore } from "../state/observabilityStore";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import { VoiceCommandBar } from "../voice/VoiceCommandBar";
import { PinnedCards } from "./PinnedCards";
import { ScalabilityToolbar } from "./ScalabilityToolbar";

export function HoloWorkspace() {
  const graph = useWorkspaceStore((state) => state.graph);
  const isLoading = useWorkspaceStore((state) => state.isLoading);
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const visibleDependencyMode = useWorkspaceStore((state) => state.visibleDependencyMode);
  const diagnosticSummary = useWorkspaceStore((state) => state.diagnosticSummary);
  const debugBreakpoints = useWorkspaceStore((state) => state.debugBreakpoints);
  const loadGraph = useWorkspaceStore((state) => state.loadGraph);
  const refreshAgentResults = useWorkspaceStore((state) => state.refreshAgentResults);
  const refreshObservabilityGraph = useObservabilityStore((state) => state.refreshObservabilityGraph);
  const connectAgentEvents = useWorkspaceStore((state) => state.connectAgentEvents);
  const restoreWorkspace = useWorkspaceStore((state) => state.restoreWorkspace);
  const runCommand = useWorkspaceStore((state) => state.runCommand);
  const setSceneMode = useWorkspaceStore((state) => state.setSceneMode);
  const startDebugCurrentFile = useWorkspaceStore((state) => state.startDebugCurrentFile);
  const showDiagnostics = useWorkspaceStore((state) => state.showDiagnostics);
  const setVisibleDependencyMode = useWorkspaceStore((state) => state.setVisibleDependencyMode);
  const setShowErrorPath = useWorkspaceStore((state) => state.setShowErrorPath);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const diagnosticErrors = diagnosticSummary.reduce((total, file) => total + file.errors, 0);
  const diagnosticWarnings = diagnosticSummary.reduce((total, file) => total + file.warnings, 0);

  useEffect(() => {
    void (async () => {
      await loadGraph();
      void refreshObservabilityGraph();
      await restoreWorkspace();
      void refreshAgentResults();
    })();
    const timer = window.setInterval(() => {
      void refreshAgentResults();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [loadGraph, refreshAgentResults, refreshObservabilityGraph, restoreWorkspace]);

  useEffect(() => connectAgentEvents(), [connectAgentEvents]);

  useEffect(() => {
    let saveTimer: number | null = null;
    const unsubscribe = useWorkspaceStore.subscribe((state, previous) => {
      const sessionChanged =
        state.editorPanels !== previous.editorPanels ||
        state.activeEditorPanelId !== previous.activeEditorPanelId ||
        state.editorLayout !== previous.editorLayout ||
        state.pinnedCards !== previous.pinnedCards ||
        state.selectedFileId !== previous.selectedFileId ||
        state.cameraPreset !== previous.cameraPreset ||
        state.visibleSceneMode !== previous.visibleSceneMode ||
        state.visibleDependencyMode !== previous.visibleDependencyMode ||
        state.graphFocus !== previous.graphFocus ||
        state.showTests !== previous.showTests ||
        state.showAgentDock !== previous.showAgentDock ||
        state.showDiffStack !== previous.showDiffStack ||
        state.showErrorPath !== previous.showErrorPath ||
        state.showDiagnosticsPanel !== previous.showDiagnosticsPanel ||
        state.activeDiffFile !== previous.activeDiffFile ||
        state.activeDiagnosticId !== previous.activeDiagnosticId ||
        state.currentAgentTaskId !== previous.currentAgentTaskId ||
        state.worldDetail !== previous.worldDetail ||
        state.graphScopeFilter !== previous.graphScopeFilter ||
        state.showExternalPackages !== previous.showExternalPackages ||
        state.showFunctions !== previous.showFunctions ||
        state.showChangedFilesOnly !== previous.showChangedFilesOnly ||
        state.showDiagnosticsOnly !== previous.showDiagnosticsOnly ||
        state.maxVisibleBeams !== previous.maxVisibleBeams ||
        state.showFpsOverlay !== previous.showFpsOverlay;

      if (!sessionChanged) return;
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        void useWorkspaceStore.getState().autosaveWorkspace();
      }, 900);
    });
    return () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      unsubscribe();
    };
  }, []);

  return (
    <div className="app-shell spatial-app-shell">
      <CodeWorld3D />
      <div className="spatial-overlay">
        <header className="spatial-topbar">
          <div className="brand-block">
            <Cpu size={22} />
            <div>
              <strong>HoloCode Cockpit</strong>
              <span>VR-native IDE MVP</span>
            </div>
          </div>
          <VoiceCommandBar />
          <nav className="scene-mode-strip" aria-label="Camera modes">
            <Button title="Cockpit view" icon={<View size={15} />} variant={visibleSceneMode === "cockpit" ? "primary" : "ghost"} onClick={() => setSceneMode("cockpit")} />
            <Button title="Architecture view" icon={<Network size={15} />} variant={visibleSceneMode === "architecture" ? "primary" : "ghost"} onClick={() => setSceneMode("architecture")} />
            <Button title="Dependency view" icon={<GitBranch size={15} />} variant={visibleSceneMode === "dependency" ? "primary" : "ghost"} onClick={() => setSceneMode("dependency")} />
            <Button title="Agent view" icon={<Bot size={15} />} variant={visibleSceneMode === "agent" ? "primary" : "ghost"} onClick={() => setSceneMode("agent")} />
            <Button title="Debug current file" icon={<Bug size={15} />} variant={visibleSceneMode === "debug" ? "primary" : "ghost"} onClick={() => void startDebugCurrentFile()} />
            <Button title="Diagnostics view" icon={<AlertTriangle size={15} />} variant={visibleSceneMode === "diagnostics" ? "danger" : "ghost"} onClick={() => void showDiagnostics()} />
            <Button title="Error trace view" icon={<Route size={15} />} variant={visibleSceneMode === "error-trace" ? "danger" : "ghost"} onClick={() => setShowErrorPath(true)} />
            <Button title="Reset camera and layout" icon={<RotateCcw size={15} />} onClick={resetLayout} />
          </nav>
          <div className="stats-strip">
            <span title="Files">
              <Network size={14} />
              {graph?.stats.files ?? 0}
            </span>
            <span title="Symbols">
              <Activity size={14} />
              {graph?.stats.symbols ?? 0}
            </span>
            <span title="Imports">
              <GitBranch size={14} />
              {graph?.stats.imports ?? 0}
            </span>
            <span title="TypeScript diagnostics">
              <AlertTriangle size={14} />
              {diagnosticErrors}/{diagnosticWarnings}
            </span>
            <span title="Breakpoints">
              <Bug size={14} />
              {debugBreakpoints.length}
            </span>
            {isLoading ? <span>loading</span> : null}
          </div>
        </header>

        <div className="spatial-status-ribbon">
          <span>Mode: {visibleSceneMode}</span>
          <span>Beams: {visibleDependencyMode}</span>
          <ScalabilityToolbar />
          <button onClick={() => setVisibleDependencyMode(visibleDependencyMode === "hidden" ? "outgoing" : "hidden")}>
            {visibleDependencyMode === "hidden" ? "Show dependencies" : "Hide dependencies"}
          </button>
          <button onClick={() => void runCommand("scan")}>
            <ScanLine size={14} />
            Scan repo
          </button>
          <span className="xr-button-slot" />
        </div>
      </div>
      <PinnedCards />
    </div>
  );
}
