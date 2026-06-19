import { create } from "zustand";
import {
  addDebugBreakpoint as addDebugBreakpointRequest,
  addDebugWatch as addDebugWatchRequest,
  createAgentTask as createAgentTaskRequest,
  applyPatch as applyPatchRequest,
  continueDebugSession,
  fetchAgentResults,
  fetchAgentRuns,
  fetchDebugState,
  fetchDefinition,
  fetchDocumentSymbols,
  fetchFile,
  fetchGitDiff,
  fetchGitStatus,
  fetchGraph,
  fetchHover,
  fetchLspDiagnostics,
  fetchReferences,
  fetchWorkspaceSession,
  fetchRenamePreview,
  removeDebugBreakpoint as removeDebugBreakpointRequest,
  rejectPatch as rejectPatchRequest,
  resetWorkspaceSession,
  runAgent as runAgentRequest,
  runCommand as runCommandRequest,
  saveFile,
  saveWorkspaceSession,
  startDebugSession,
  stepIntoDebug,
  stepOverDebug,
  validatePatch as validatePatchRequest
} from "../api/client";
import {
  fileNodeId,
  findFileByQuery,
  findSymbolByQuery,
  getCallersForFile,
  getCurrentFileNode,
  getImportsForFile,
  getSymbolsForFile,
  getTestFileNodes
} from "../graph/selectors";
import type {
  AgentResult,
  AgentRunEvent,
  AgentRunSnapshot,
  CameraPreset,
  CodeGraph,
  DebugBreakpoint,
  DebugConsoleEntry,
  DebugSessionSnapshot,
  DebugStackFrame,
  DebugVariable,
  DebugWatch,
  DiffChangedFile,
  FileTreeEntry,
  GraphFocus,
  GitDiffSnapshot,
  GitStatusSnapshot,
  GraphScopeFilter,
  LspDiagnostic,
  LspDocumentSymbol,
  LspFileSummary,
  LspHover,
  LspLocation,
  LspRenamePreview,
  PinnedCard,
  RunCommandName,
  SceneMode,
  SpatialEditorLayout,
  SpatialEditorPanel,
  SpatialEditorPanelKind,
  VisibleDependencyMode,
  WorldDetailLevel,
  WorkspaceSession
} from "../types";

type WorkspaceState = {
  graph: CodeGraph | null;
  fileTree: FileTreeEntry[];
  currentFilePath: string | null;
  currentFileContent: string;
  savedFileContent: string;
  isDirty: boolean;
  targetLine: number | null;
  editorPanels: SpatialEditorPanel[];
  activeEditorPanelId: string | null;
  editorLayout: SpatialEditorLayout;
  selectedFunctionIds: string[];
  pinnedCards: PinnedCard[];
  terminalLines: string[];
  commandHistory: string[];
  graphFocus: GraphFocus;
  agentResults: AgentResult[];
  agentRuns: AgentRunSnapshot[];
  activeDiff: string;
  isLoading: boolean;
  selectedFileId: string | null;
  selectedFunctionId: string | null;
  selectedFolderId: string | null;
  selectedPackageId: string | null;
  hoveredObjectId: string | null;
  openEditorFile: string | null;
  pinnedFunctions: string[];
  visibleDependencyMode: VisibleDependencyMode;
  visibleSceneMode: SceneMode;
  cameraPreset: CameraPreset;
  showExternalPackages: boolean;
  showTests: boolean;
  showAgentDock: boolean;
  showDiffStack: boolean;
  showErrorPath: boolean;
  worldDetail: WorldDetailLevel;
  graphScopeFilter: GraphScopeFilter;
  showFunctions: boolean;
  showChangedFilesOnly: boolean;
  showDiagnosticsOnly: boolean;
  maxVisibleBeams: number;
  showFpsOverlay: boolean;
  currentAgentTaskId: string | null;
  dirtyFiles: string[];
  modifiedFiles: string[];
  currentDiff: string;
  diffSummary: DiffChangedFile[];
  gitStatus: GitStatusSnapshot | null;
  lastSaveError: string | null;
  lastGitError: string | null;
  activeDiffFile: string | null;
  lastPatchError: string | null;
  lastAgentRunError: string | null;
  diagnostics: LspDiagnostic[];
  diagnosticSummary: LspFileSummary[];
  activeDiagnosticId: string | null;
  documentSymbols: LspDocumentSymbol[];
  hoverInfo: LspHover | null;
  definitionLocations: LspLocation[];
  referenceLocations: LspLocation[];
  renamePreview: LspRenamePreview | null;
  lastLspError: string | null;
  showDiagnosticsPanel: boolean;
  editorCursorLine: number;
  editorCursorColumn: number;
  debugStatus: DebugSessionSnapshot["status"];
  debugSessionId: string | null;
  debugTargetPath: string | null;
  debugBreakpoints: DebugBreakpoint[];
  debugCallStack: DebugStackFrame[];
  debugActiveFrame: DebugStackFrame | null;
  debugVariables: DebugVariable[];
  debugWatches: DebugWatch[];
  debugConsole: DebugConsoleEntry[];
  showDebugPanel: boolean;
  showDebugVariables: boolean;
  lastDebugError: string | null;
  lastSessionError: string | null;
  loadGraph: () => Promise<void>;
  openFile: (path: string, targetLine?: number) => Promise<void>;
  openEditorPanel: (path: string, options?: { kind?: SpatialEditorPanelKind; targetLine?: number; activate?: boolean }) => Promise<void>;
  setActiveEditorPanel: (panelId: string) => void;
  setEditorPanelContent: (panelId: string, content: string) => void;
  saveEditorPanel: (panelId: string) => Promise<void>;
  closeEditorPanel: (panelId: string) => void;
  closeOtherPanels: () => void;
  moveEditorPanel: (panelId: string, position: [number, number, number]) => void;
  resetEditorPanels: () => void;
  openRelatedTests: () => Promise<void>;
  openCallerPanels: () => Promise<void>;
  openImportPanels: () => Promise<void>;
  compareWithDiff: () => Promise<void>;
  arrangeSourceAndTest: () => Promise<void>;
  arrangeCallerCallee: () => void;
  arrangeDiffReview: () => void;
  arrangeDebuggingLayout: () => void;
  openFileByQuery: (query: string) => Promise<void>;
  focusFileByQuery: (query: string) => Promise<void>;
  focusFile: (path: string) => void;
  setCurrentFileContent: (content: string) => void;
  saveCurrentFile: () => Promise<void>;
  refreshGitState: () => Promise<void>;
  refreshGitStatus: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  showDiagnostics: () => Promise<void>;
  openDiagnostic: (diagnosticId: string) => Promise<void>;
  setEditorCursor: (line: number, column: number) => void;
  requestHoverAtCursor: () => Promise<void>;
  goToDefinitionAtCursor: () => Promise<void>;
  findReferencesAtCursor: () => Promise<void>;
  refreshDocumentSymbols: (path?: string) => Promise<void>;
  previewRenameAtCursor: (newName?: string) => Promise<void>;
  refreshDebugState: () => Promise<void>;
  startDebugCurrentFile: () => Promise<void>;
  addBreakpointAtCursor: () => Promise<void>;
  removeBreakpointAtCursor: () => Promise<void>;
  addBreakpointForSymbol: (path: string, line: number) => Promise<void>;
  stepOver: () => Promise<void>;
  stepInto: () => Promise<void>;
  continueDebug: () => Promise<void>;
  showVariables: () => void;
  addDebugWatchExpression: (expression: string) => Promise<void>;
  setGraphFocus: (focus: GraphFocus) => void;
  setSceneMode: (mode: SceneMode) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setVisibleDependencyMode: (mode: VisibleDependencyMode) => void;
  setWorldDetail: (detail: WorldDetailLevel) => void;
  setGraphScopeFilter: (scope: GraphScopeFilter) => void;
  setShowExternalPackages: (show: boolean) => void;
  setShowFunctions: (show: boolean) => void;
  setShowChangedFilesOnly: (show: boolean) => void;
  setShowDiagnosticsOnly: (show: boolean) => void;
  setMaxVisibleBeams: (maxVisibleBeams: number) => void;
  setShowFpsOverlay: (show: boolean) => void;
  setHoveredObjectId: (id: string | null) => void;
  selectFolder: (id: string | null) => void;
  selectPackage: (id: string | null) => void;
  selectFunction: (id: string) => void;
  toggleFunctionSelection: (id: string) => void;
  pinFunction: (id: string) => void;
  pinFunctionByQuery: (query: string) => void;
  unpinFunction: (id: string) => void;
  movePinnedCard: (id: string, x: number, y: number) => void;
  jumpToLine: (line: number) => void;
  appendTerminal: (line: string) => void;
  appendCommand: (line: string) => void;
  runCommand: (command: RunCommandName) => Promise<void>;
  createAgentTask: () => Promise<void>;
  refreshAgentResults: () => Promise<void>;
  refreshAgentRuns: () => Promise<void>;
  runAgentTask: (taskId: string) => Promise<void>;
  connectAgentEvents: () => () => void;
  showFirstDiff: () => void;
  openDiffForFile: (path: string | null) => void;
  openAgentDiff: (taskId: string) => void;
  validatePatch: (diffPath: string) => Promise<void>;
  applyPatch: (diffPath: string) => Promise<void>;
  rejectPatch: (diffPath: string) => Promise<void>;
  setShowTests: (show: boolean) => void;
  setShowAgentDock: (show: boolean) => void;
  setShowDiffStack: (show: boolean) => void;
  setShowErrorPath: (show: boolean) => void;
  resetLayout: () => void;
  saveWorkspace: (options?: { silent?: boolean }) => Promise<void>;
  autosaveWorkspace: () => Promise<void>;
  restoreWorkspace: () => Promise<void>;
  resetWorkspace: () => Promise<void>;
};

function append(lines: string[], next: string) {
  return [...lines, next].slice(-200);
}

function isRepoRelativeLocation(pathValue: string | undefined) {
  return Boolean(pathValue) && !/^[A-Za-z]:/.test(pathValue || "") && !(pathValue || "").startsWith("/") && !(pathValue || "").includes("node_modules");
}

function debugStateFromSnapshot(snapshot: DebugSessionSnapshot) {
  return {
    debugStatus: snapshot.status,
    debugSessionId: snapshot.sessionId,
    debugTargetPath: snapshot.targetPath,
    debugBreakpoints: snapshot.breakpoints,
    debugCallStack: snapshot.callStack,
    debugActiveFrame: snapshot.activeFrame,
    debugVariables: snapshot.variables,
    debugWatches: snapshot.watches,
    debugConsole: snapshot.console,
    lastDebugError: snapshot.error || null
  };
}

function mergeAgentRun(runs: AgentRunSnapshot[], run: AgentRunSnapshot) {
  const next = [run, ...runs.filter((item) => item.taskId !== run.taskId)];
  return next.sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")));
}

function terminalLinesFromAgentText(text: string | undefined, stream: string | undefined) {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `[agent:${stream || "log"}] ${line}`);
}

function editorPanelId(path: string, kind: SpatialEditorPanelKind = "source") {
  if (kind === "diff") return "diff:git";
  return `file:${path}`;
}

function panelTransform(
  position: [number, number, number],
  rotation: [number, number, number]
): Pick<SpatialEditorPanel, "position" | "rotation"> {
  return { position, rotation };
}

function defaultPanelTransform(kind: SpatialEditorPanelKind, index = 0): Pick<SpatialEditorPanel, "position" | "rotation"> {
  const row = Math.floor(index / 3);
  const column = index % 3;
  if (kind === "test") return panelTransform([2.55, 1.9 - row * 0.16, 2.1 + column * 0.06], [-0.04, -0.12, 0]);
  if (kind === "caller") return panelTransform([-3.15, 1.84 - row * 0.2, 2.0 + column * 0.08], [-0.04, 0.22, 0]);
  if (kind === "callee") return panelTransform([3.15, 1.84 - row * 0.2, 2.0 + column * 0.08], [-0.04, -0.22, 0]);
  if (kind === "diff") return panelTransform([2.75, 1.82, 1.95], [-0.04, -0.18, 0]);
  if (kind === "debug") return panelTransform([0, 2.05, 2.05], [-0.04, 0, 0]);
  return panelTransform([0, 1.95, 2.25], [-0.04, 0, 0]);
}

function applyPanelLayout(panels: SpatialEditorPanel[], layout: SpatialEditorLayout) {
  if (layout === "source-test") {
    let testIndex = 0;
    return panels.map((panel) => {
      if (panel.kind === "test") {
        const transform = defaultPanelTransform("test", testIndex++);
        return { ...panel, ...transform };
      }
      if (panel.kind === "source") {
        return { ...panel, ...panelTransform([-2.45, 1.95, 2.12], [-0.04, 0.14, 0]) };
      }
      return panel;
    });
  }

  if (layout === "caller-callee") {
    let callerIndex = 0;
    let calleeIndex = 0;
    return panels.map((panel) => {
      if (panel.kind === "caller") return { ...panel, ...defaultPanelTransform("caller", callerIndex++) };
      if (panel.kind === "callee") return { ...panel, ...defaultPanelTransform("callee", calleeIndex++) };
      if (panel.kind === "source") return { ...panel, ...panelTransform([0, 2.0, 2.2], [-0.04, 0, 0]) };
      return panel;
    });
  }

  if (layout === "diff-review") {
    return panels.map((panel) => {
      if (panel.kind === "diff") return { ...panel, ...defaultPanelTransform("diff") };
      if (panel.kind === "source") return { ...panel, ...panelTransform([-2.65, 1.9, 2.05], [-0.04, 0.16, 0]) };
      return panel;
    });
  }

  if (layout === "debugging") {
    return panels.map((panel) =>
      panel.id === panels[0]?.id || panel.kind === "source" ? { ...panel, ...defaultPanelTransform("debug") } : panel
    );
  }

  return panels;
}

function dirtyPathsFromPanels(panels: SpatialEditorPanel[]) {
  return [...new Set(panels.filter((panel) => panel.isDirty && !panel.readOnly).map((panel) => panel.path))];
}

function stableStringList(previous: string[], next: string[]) {
  if (previous.length === next.length && previous.every((value, index) => value === next[index])) return previous;
  return next;
}

function activatePanelState(panel: SpatialEditorPanel) {
  return {
    activeEditorPanelId: panel.id,
    currentFilePath: panel.readOnly ? null : panel.path,
    openEditorFile: panel.readOnly ? null : panel.path,
    selectedFileId: panel.readOnly ? null : fileNodeId(panel.path),
    currentFileContent: panel.content,
    savedFileContent: panel.savedContent,
    isDirty: panel.isDirty,
    targetLine: panel.targetLine
  };
}

function selectedPathFromState(state: WorkspaceState) {
  if (state.currentFilePath) return state.currentFilePath;
  if (state.selectedFileId?.startsWith("file:")) return state.selectedFileId.slice("file:".length);
  return null;
}

function workspaceSessionFromState(state: WorkspaceState): WorkspaceSession {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    editorPanels: state.editorPanels.map((panel) => ({
      id: panel.id,
      path: panel.path,
      title: panel.title,
      kind: panel.kind,
      readOnly: panel.readOnly,
      position: panel.position,
      rotation: panel.rotation,
      targetLine: panel.targetLine
    })),
    activeEditorPanelId: state.activeEditorPanelId,
    editorLayout: state.editorLayout,
    pinnedCards: state.pinnedCards,
    selectedFilePath: selectedPathFromState(state),
    cameraPreset: state.cameraPreset,
    visibleSceneMode: state.visibleSceneMode,
    visibleDependencyMode: state.visibleDependencyMode,
    graphFocus: state.graphFocus,
    showTests: state.showTests,
    showAgentDock: state.showAgentDock,
    showDiffStack: state.showDiffStack,
    showErrorPath: state.showErrorPath,
    showDiagnosticsPanel: state.showDiagnosticsPanel,
    activeDiffFile: state.activeDiffFile,
    activeDiagnosticId: state.activeDiagnosticId,
    currentAgentTaskId: state.currentAgentTaskId,
    worldDetail: state.worldDetail,
    graphScopeFilter: state.graphScopeFilter,
    showExternalPackages: state.showExternalPackages,
    showFunctions: state.showFunctions,
    showChangedFilesOnly: state.showChangedFilesOnly,
    showDiagnosticsOnly: state.showDiagnosticsOnly,
    maxVisibleBeams: state.maxVisibleBeams,
    showFpsOverlay: state.showFpsOverlay
  };
}

function isVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function panelFromSession(panel: WorkspaceSession["editorPanels"][number], content: string): SpatialEditorPanel {
  const fallback = defaultPanelTransform(panel.kind);
  return {
    id: panel.id,
    path: panel.path,
    title: panel.title,
    kind: panel.kind,
    content,
    savedContent: content,
    isDirty: false,
    readOnly: panel.readOnly,
    position: isVector3(panel.position) ? panel.position : fallback.position,
    rotation: isVector3(panel.rotation) ? panel.rotation : fallback.rotation,
    targetLine: panel.targetLine
  };
}

let suppressWorkspaceAutosaveUntil = 0;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  graph: null,
  fileTree: [],
  currentFilePath: null,
  currentFileContent: "",
  savedFileContent: "",
  isDirty: false,
  targetLine: null,
  editorPanels: [],
  activeEditorPanelId: null,
  editorLayout: "free",
  selectedFunctionIds: [],
  pinnedCards: [],
  terminalLines: ["HoloCode terminal ready."],
  commandHistory: [],
  graphFocus: "dependencies",
  agentResults: [],
  agentRuns: [],
  activeDiff: "",
  isLoading: false,
  selectedFileId: null,
  selectedFunctionId: null,
  selectedFolderId: null,
  selectedPackageId: null,
  hoveredObjectId: null,
  openEditorFile: null,
  pinnedFunctions: [],
  visibleDependencyMode: "outgoing",
  visibleSceneMode: "cockpit",
  cameraPreset: "cockpit",
  showExternalPackages: true,
  showTests: true,
  showAgentDock: true,
  showDiffStack: true,
  showErrorPath: false,
  worldDetail: "file",
  graphScopeFilter: "all",
  currentAgentTaskId: null,
  showFunctions: true,
  showChangedFilesOnly: false,
  showDiagnosticsOnly: false,
  maxVisibleBeams: 180,
  showFpsOverlay: true,
  dirtyFiles: [],
  modifiedFiles: [],
  currentDiff: "",
  diffSummary: [],
  gitStatus: null,
  lastSaveError: null,
  lastGitError: null,
  activeDiffFile: null,
  lastPatchError: null,
  lastAgentRunError: null,
  diagnostics: [],
  diagnosticSummary: [],
  activeDiagnosticId: null,
  documentSymbols: [],
  hoverInfo: null,
  definitionLocations: [],
  referenceLocations: [],
  renamePreview: null,
  lastLspError: null,
  showDiagnosticsPanel: false,
  editorCursorLine: 1,
  editorCursorColumn: 1,
  debugStatus: "idle",
  debugSessionId: null,
  debugTargetPath: null,
  debugBreakpoints: [],
  debugCallStack: [],
  debugActiveFrame: null,
  debugVariables: [],
  debugWatches: [],
  debugConsole: [],
  showDebugPanel: false,
  showDebugVariables: true,
  lastDebugError: null,
  lastSessionError: null,

  async loadGraph() {
    set({ isLoading: true });
    try {
      const graph = await fetchGraph();
      const largeRepo = graph.stats.files >= 300;
      set((state) => ({
        graph,
        fileTree: graph.tree,
        isLoading: false,
        worldDetail: largeRepo && state.worldDetail === "file" ? "module" : state.worldDetail,
        showFunctions: largeRepo ? false : state.showFunctions,
        showExternalPackages: largeRepo ? false : state.showExternalPackages,
        visibleDependencyMode: largeRepo && state.visibleDependencyMode === "outgoing" ? "hidden" : state.visibleDependencyMode,
        maxVisibleBeams: largeRepo ? Math.min(state.maxVisibleBeams, 160) : state.maxVisibleBeams
      }));
      void get().refreshGitState();
      void get().refreshDiagnostics();
      void get().refreshDebugState();
      void get().refreshAgentRuns();

      const current = get().currentFilePath;
      if (!current) {
        const appFile = graph.nodes.find((node) => node.kind === "file" && node.path === "src/App.tsx");
        const firstCodeFile = graph.nodes.find((node) => node.kind === "file" && node.language === "tsx");
        const target = appFile || firstCodeFile;
        if (target) {
          await get().openFile(target.path);
        }
      }
    } catch (error) {
      set((state) => ({
        isLoading: false,
        terminalLines: append(state.terminalLines, `Graph load failed: ${(error as Error).message}`)
      }));
    }
  },

  async openFile(path, targetLine) {
    await get().openEditorPanel(path, { kind: "source", targetLine, activate: true });
  },

  async openEditorPanel(path, options = {}) {
    const kind = options.kind || "source";
    const panelId = editorPanelId(path, kind);
    set({ isLoading: true });
    try {
      const file = await fetchFile(path);
      set((state) => {
        const existing = state.editorPanels.find((panel) => panel.id === panelId);
        const transform = existing ? { position: existing.position, rotation: existing.rotation } : defaultPanelTransform(kind, state.editorPanels.length);
        const panel: SpatialEditorPanel = {
          id: panelId,
          path: file.path,
          title: file.path,
          kind,
          content: existing?.isDirty ? existing.content : file.content,
          savedContent: file.content,
          isDirty: existing?.isDirty ? existing.content !== file.content : false,
          readOnly: false,
          targetLine: options.targetLine ?? existing?.targetLine ?? null,
          ...transform
        };
        const panels = [...state.editorPanels.filter((item) => item.id !== panelId), panel];
        return {
          editorPanels: panels,
          dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
          ...(options.activate === false ? {} : activatePanelState(panel)),
          selectedFunctionIds: [],
          isLoading: false,
          lastSaveError: null,
          terminalLines: append(state.terminalLines, `Opened panel ${file.path}`)
        };
      });
      if (options.activate !== false) {
        void get().refreshDocumentSymbols(file.path);
      }
    } catch (error) {
      set((state) => ({
        isLoading: false,
        terminalLines: append(state.terminalLines, `Open panel failed: ${(error as Error).message}`)
      }));
    }
  },

  setActiveEditorPanel(panelId) {
    const panel = get().editorPanels.find((candidate) => candidate.id === panelId);
    if (!panel) return;
    const alreadyActive = get().activeEditorPanelId === panelId;
    set((state) => ({
      ...activatePanelState(panel),
      terminalLines: alreadyActive ? state.terminalLines : append(state.terminalLines, `Active panel: ${panel.title}`)
    }));
    if (!panel.readOnly) {
      void get().refreshDocumentSymbols(panel.path);
    }
  },

  setEditorPanelContent(panelId, content) {
    set((state) => {
      const panels = state.editorPanels.map((panel) =>
        panel.id === panelId ? { ...panel, content, isDirty: !panel.readOnly && content !== panel.savedContent } : panel
      );
      const active = panels.find((panel) => panel.id === state.activeEditorPanelId);
      return {
        editorPanels: panels,
        dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
        ...(active ? activatePanelState(active) : {})
      };
    });
  },

  async saveEditorPanel(panelId) {
    const panel = get().editorPanels.find((candidate) => candidate.id === panelId);
    if (!panel || panel.readOnly) return;

    try {
      const result = await saveFile(panel.path, panel.content);
      const gitResult = result.git as GitDiffSnapshot | { error?: string; diff: string; changedFiles: DiffChangedFile[] } | undefined;
      set((state) => {
        const panels = state.editorPanels.map((item) =>
          item.id === panelId
            ? {
                ...item,
                savedContent: panel.content,
                isDirty: false
              }
            : item
        );
        const active = panels.find((item) => item.id === state.activeEditorPanelId);
        return {
          graph: result.graph,
          fileTree: result.graph.tree,
          editorPanels: panels,
          dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
          ...(active ? activatePanelState(active) : {}),
          currentDiff: gitResult?.diff ?? state.currentDiff,
          diffSummary: gitResult?.changedFiles ?? state.diffSummary,
          modifiedFiles: gitResult?.changedFiles?.map((file) => file.path) ?? state.modifiedFiles,
          lastSaveError: null,
          lastGitError: gitResult && "error" in gitResult ? gitResult.error || null : null,
          terminalLines: append(state.terminalLines, `Saved ${panel.path}`)
        };
      });
      await get().refreshGitState();
      await get().refreshDiagnostics();
      await get().refreshDocumentSymbols(panel.path);
    } catch (error) {
      set((state) => ({
        lastSaveError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Save failed: ${(error as Error).message}`)
      }));
    }
  },

  closeEditorPanel(panelId) {
    set((state) => {
      const panels = state.editorPanels.filter((panel) => panel.id !== panelId);
      const active = state.activeEditorPanelId === panelId ? panels[panels.length - 1] : panels.find((panel) => panel.id === state.activeEditorPanelId);
      return {
        editorPanels: panels,
        dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
        ...(active
          ? activatePanelState(active)
          : {
              activeEditorPanelId: null,
              currentFilePath: null,
              openEditorFile: null,
              currentFileContent: "",
              savedFileContent: "",
              isDirty: false,
              targetLine: null
            }),
        terminalLines: append(state.terminalLines, "Closed editor panel.")
      };
    });
  },

  closeOtherPanels() {
    set((state) => {
      const active = state.editorPanels.find((panel) => panel.id === state.activeEditorPanelId) || state.editorPanels[state.editorPanels.length - 1];
      const panels = active ? [active] : [];
      return {
        editorPanels: panels,
        dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
        ...(active ? activatePanelState(active) : {}),
        terminalLines: append(state.terminalLines, "Closed other editor panels.")
      };
    });
  },

  moveEditorPanel(panelId, position) {
    set((state) => ({
      editorLayout: "free",
      editorPanels: state.editorPanels.map((panel) => (panel.id === panelId ? { ...panel, position } : panel))
    }));
  },

  resetEditorPanels() {
    set((state) => ({
      editorLayout: "free",
      editorPanels: state.editorPanels.map((panel, index) => ({ ...panel, ...defaultPanelTransform(panel.kind, index) })),
      terminalLines: append(state.terminalLines, "Editor panels reset.")
    }));
  },

  async openRelatedTests() {
    const { graph, currentFilePath } = get();
    if (!graph || !currentFilePath) return;
    const current = getCurrentFileNode(graph, currentFilePath);
    const related = current?.relatedTests?.length
      ? current.relatedTests
      : getTestFileNodes(graph)
          .filter((node) => node.name.toLowerCase().includes(currentFilePath.split("/").pop()?.split(".")[0].toLowerCase() || ""))
          .map((node) => node.path);
    if (!related.length) {
      set((state) => ({ terminalLines: append(state.terminalLines, `No related tests found for ${currentFilePath}.`) }));
      return;
    }
    for (const testPath of related.slice(0, 3)) {
      await get().openEditorPanel(testPath, { kind: "test", activate: false });
    }
    await get().arrangeSourceAndTest();
  },

  async openCallerPanels() {
    const { graph, currentFilePath } = get();
    const callers = getCallersForFile(graph, currentFilePath).filter((node) => node.kind === "file");
    if (!callers.length) {
      set((state) => ({ terminalLines: append(state.terminalLines, `No caller files found for ${currentFilePath || "current file"}.`) }));
      return;
    }
    for (const caller of callers.slice(0, 4)) {
      await get().openEditorPanel(caller.path, { kind: "caller", activate: false });
    }
    get().arrangeCallerCallee();
  },

  async openImportPanels() {
    const { graph, currentFilePath } = get();
    const imports = getImportsForFile(graph, currentFilePath).filter((node) => node.kind === "file");
    if (!imports.length) {
      set((state) => ({ terminalLines: append(state.terminalLines, `No imported files found for ${currentFilePath || "current file"}.`) }));
      return;
    }
    for (const imported of imports.slice(0, 4)) {
      await get().openEditorPanel(imported.path, { kind: "callee", activate: false });
    }
    get().arrangeCallerCallee();
  },

  async compareWithDiff() {
    await get().refreshGitState();
    const diff = get().currentDiff || get().activeDiff || "No git diff.";
    const transform = defaultPanelTransform("diff");
    const panel: SpatialEditorPanel = {
      id: editorPanelId("git diff", "diff"),
      path: "git diff",
      title: "Git diff",
      kind: "diff",
      content: diff,
      savedContent: diff,
      isDirty: false,
      readOnly: true,
      targetLine: null,
      ...transform
    };
    set((state) => {
      const panels = [...state.editorPanels.filter((item) => item.id !== panel.id), panel];
      return {
        editorPanels: applyPanelLayout(panels, "diff-review"),
        activeEditorPanelId: panel.id,
        editorLayout: "diff-review",
        activeDiff: diff,
        showDiffStack: true,
        visibleSceneMode: "agent",
        cameraPreset: "agent",
        terminalLines: append(state.terminalLines, "Opened spatial diff review panel.")
      };
    });
  },

  async arrangeSourceAndTest() {
    const state = get();
    const hasTest = state.editorPanels.some((panel) => panel.kind === "test");
    if (!hasTest && state.currentFilePath) {
      const { graph, currentFilePath } = state;
      const current = getCurrentFileNode(graph, currentFilePath);
      const related = current?.relatedTests || [];
      for (const testPath of related.slice(0, 2)) {
        await get().openEditorPanel(testPath, { kind: "test", activate: false });
      }
    }
    set((nextState) => ({
      editorLayout: "source-test",
      editorPanels: applyPanelLayout(nextState.editorPanels, "source-test"),
      cameraPreset: "current-file",
      visibleSceneMode: "current-file",
      terminalLines: append(nextState.terminalLines, "Arranged source and test panels.")
    }));
  },

  arrangeCallerCallee() {
    set((state) => ({
      editorLayout: "caller-callee",
      editorPanels: applyPanelLayout(state.editorPanels, "caller-callee"),
      visibleDependencyMode: "all",
      visibleSceneMode: "dependency",
      cameraPreset: "dependency",
      terminalLines: append(state.terminalLines, "Arranged caller/callee panels.")
    }));
  },

  arrangeDiffReview() {
    set((state) => ({
      editorLayout: "diff-review",
      editorPanels: applyPanelLayout(state.editorPanels, "diff-review"),
      showDiffStack: true,
      visibleSceneMode: "agent",
      cameraPreset: "agent",
      terminalLines: append(state.terminalLines, "Arranged diff review layout.")
    }));
  },

  arrangeDebuggingLayout() {
    set((state) => ({
      editorLayout: "debugging",
      editorPanels: applyPanelLayout(state.editorPanels, "debugging"),
      showDebugPanel: true,
      visibleSceneMode: "debug",
      cameraPreset: "debug",
      terminalLines: append(state.terminalLines, "Arranged debugging layout.")
    }));
  },

  async openFileByQuery(query) {
    const match = findFileByQuery(get().graph, query);
    if (!match) {
      set((state) => ({
        terminalLines: append(state.terminalLines, `No file matched "${query}".`)
      }));
      return;
    }
    await get().openFile(match.path);
  },

  async focusFileByQuery(query) {
    const match = findFileByQuery(get().graph, query);
    if (!match) {
      set((state) => ({
        terminalLines: append(state.terminalLines, `No file matched "${query}".`)
      }));
      return;
    }
    get().focusFile(match.path);
  },

  focusFile(path) {
    set((state) => ({
      selectedFileId: fileNodeId(path),
      selectedFunctionId: null,
      selectedPackageId: null,
      cameraPreset: "current-file",
      visibleSceneMode: "current-file",
      visibleDependencyMode: state.visibleDependencyMode === "hidden" ? "outgoing" : state.visibleDependencyMode,
      terminalLines: append(state.terminalLines, `Focused ${path}`)
    }));
  },

  setCurrentFileContent(content) {
    const activePanelId = get().activeEditorPanelId;
    if (activePanelId) {
      get().setEditorPanelContent(activePanelId, content);
      return;
    }
    set((state) => {
      const nextDirty =
        content !== state.savedFileContent && state.currentFilePath
          ? [...new Set([...state.dirtyFiles, state.currentFilePath])]
          : state.dirtyFiles.filter((filePath) => filePath !== state.currentFilePath);
      return {
        currentFileContent: content,
        isDirty: content !== state.savedFileContent,
        dirtyFiles: stableStringList(state.dirtyFiles, nextDirty)
      };
    });
  },

  async saveCurrentFile() {
    const { activeEditorPanelId, currentFilePath, currentFileContent } = get();
    if (activeEditorPanelId) {
      await get().saveEditorPanel(activeEditorPanelId);
      return;
    }
    if (!currentFilePath) return;

    try {
      const result = await saveFile(currentFilePath, currentFileContent);
      const gitResult = result.git as GitDiffSnapshot | { error?: string; diff: string; changedFiles: DiffChangedFile[] } | undefined;
      set((state) => ({
        graph: result.graph,
        fileTree: result.graph.tree,
        savedFileContent: currentFileContent,
        isDirty: false,
        dirtyFiles: state.dirtyFiles.filter((filePath) => filePath !== currentFilePath),
        currentDiff: gitResult?.diff ?? state.currentDiff,
        diffSummary: gitResult?.changedFiles ?? state.diffSummary,
        modifiedFiles: gitResult?.changedFiles?.map((file) => file.path) ?? state.modifiedFiles,
        lastSaveError: null,
        lastGitError: gitResult && "error" in gitResult ? gitResult.error || null : null,
        terminalLines: append(state.terminalLines, `Saved ${currentFilePath}`)
      }));
      await get().refreshGitState();
      await get().refreshDiagnostics();
      await get().refreshDocumentSymbols(currentFilePath);
    } catch (error) {
      set((state) => ({
        lastSaveError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Save failed: ${(error as Error).message}`)
      }));
    }
  },

  async refreshGitState() {
    try {
      const [status, diff] = await Promise.all([fetchGitStatus(), fetchGitDiff()]);
      set({
        gitStatus: status,
        currentDiff: diff.diff,
        diffSummary: diff.changedFiles,
        modifiedFiles: diff.changedFiles.map((file) => file.path),
        lastGitError: null
      });
    } catch (error) {
      set((state) => ({
        gitStatus: null,
        currentDiff: "",
        diffSummary: [],
        modifiedFiles: [],
        lastGitError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Git unavailable: ${(error as Error).message}`)
      }));
    }
  },

  async refreshGitStatus() {
    try {
      const status = await fetchGitStatus();
      set((state) => ({
        gitStatus: status,
        lastGitError: null,
        terminalLines: append(
          state.terminalLines,
          status.files.length
            ? status.files.map((file) => `${file.status.padEnd(8)} ${file.path}`).join("\n")
            : "Git status clean."
        )
      }));
    } catch (error) {
      set((state) => ({
        lastGitError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Git status failed: ${(error as Error).message}`)
      }));
    }
  },

  async refreshDiagnostics() {
    try {
      const snapshot = await fetchLspDiagnostics();
      set((state) => ({
        diagnostics: snapshot.diagnostics,
        diagnosticSummary: snapshot.summary,
        lastLspError: null,
        terminalLines: append(
          state.terminalLines,
          snapshot.diagnostics.length
            ? `TypeScript diagnostics: ${snapshot.summary.reduce((sum, file) => sum + file.errors, 0)} errors, ${snapshot.summary.reduce(
                (sum, file) => sum + file.warnings,
                0
              )} warnings.`
            : "TypeScript diagnostics clean."
        )
      }));
    } catch (error) {
      set((state) => ({
        diagnostics: [],
        diagnosticSummary: [],
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `LSP diagnostics failed: ${(error as Error).message}`)
      }));
    }
  },

  async showDiagnostics() {
    await get().refreshDiagnostics();
    set((state) => ({
      showDiagnosticsPanel: true,
      visibleSceneMode: "diagnostics",
      cameraPreset: "diagnostics",
      terminalLines: append(state.terminalLines, `Diagnostics view: ${state.diagnostics.length} items.`)
    }));
  },

  async openDiagnostic(diagnosticId) {
    const diagnostic = get().diagnostics.find((item) => item.id === diagnosticId);
    if (!diagnostic) {
      set((state) => ({
        terminalLines: append(state.terminalLines, `Diagnostic not found: ${diagnosticId}`)
      }));
      return;
    }
    set({ activeDiagnosticId: diagnostic.id, showDiagnosticsPanel: true });
    await get().openFile(diagnostic.path, diagnostic.startLine);
  },

  setEditorCursor(line, column) {
    set({ editorCursorLine: Math.max(1, line), editorCursorColumn: Math.max(1, column) });
  },

  async requestHoverAtCursor() {
    const { currentFilePath, editorCursorLine, editorCursorColumn } = get();
    if (!currentFilePath) return;
    try {
      const hoverInfo = await fetchHover(currentFilePath, editorCursorLine, editorCursorColumn);
      set((state) => ({
        hoverInfo,
        lastLspError: null,
        terminalLines: append(state.terminalLines, hoverInfo.contents ? `Hover: ${hoverInfo.contents}` : "No hover info at cursor.")
      }));
    } catch (error) {
      set((state) => ({
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Hover failed: ${(error as Error).message}`)
      }));
    }
  },

  async goToDefinitionAtCursor() {
    const { currentFilePath, editorCursorLine, editorCursorColumn } = get();
    if (!currentFilePath) return;
    try {
      const result = await fetchDefinition(currentFilePath, editorCursorLine, editorCursorColumn);
      const locations = result.locations;
      const target = locations.find((location) => isRepoRelativeLocation(location.path));
      set((state) => ({
        definitionLocations: locations,
        lastLspError: null,
        terminalLines: append(
          state.terminalLines,
          target ? `Definition: ${target.path}:${target.startLine}` : `No local definition at ${currentFilePath}:${editorCursorLine}.`
        )
      }));
      if (target) {
        await get().openFile(target.path, target.startLine);
      }
    } catch (error) {
      set((state) => ({
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Definition failed: ${(error as Error).message}`)
      }));
    }
  },

  async findReferencesAtCursor() {
    const { currentFilePath, editorCursorLine, editorCursorColumn } = get();
    if (!currentFilePath) return;
    try {
      const result = await fetchReferences(currentFilePath, editorCursorLine, editorCursorColumn);
      set((state) => ({
        referenceLocations: result.locations,
        lastLspError: null,
        showDiagnosticsPanel: true,
        visibleSceneMode: "diagnostics",
        cameraPreset: "diagnostics",
        terminalLines: append(state.terminalLines, `References found: ${result.locations.length}.`)
      }));
    } catch (error) {
      set((state) => ({
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `References failed: ${(error as Error).message}`)
      }));
    }
  },

  async refreshDocumentSymbols(path) {
    const targetPath = path || get().currentFilePath;
    if (!targetPath) return;
    try {
      const result = await fetchDocumentSymbols(targetPath);
      set({ documentSymbols: result.symbols, lastLspError: null });
    } catch (error) {
      set((state) => ({
        documentSymbols: [],
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Document symbols failed: ${(error as Error).message}`)
      }));
    }
  },

  async previewRenameAtCursor(newName = "renamedSymbol") {
    const { currentFilePath, editorCursorLine, editorCursorColumn } = get();
    if (!currentFilePath) return;
    try {
      const renamePreview = await fetchRenamePreview(currentFilePath, editorCursorLine, editorCursorColumn, newName);
      set((state) => ({
        renamePreview,
        lastLspError: renamePreview.canRename ? null : renamePreview.message,
        showDiagnosticsPanel: true,
        visibleSceneMode: "diagnostics",
        cameraPreset: "diagnostics",
        terminalLines: append(state.terminalLines, renamePreview.message)
      }));
    } catch (error) {
      set((state) => ({
        lastLspError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Rename preview failed: ${(error as Error).message}`)
      }));
    }
  },

  async refreshDebugState() {
    try {
      const snapshot = await fetchDebugState();
      set(debugStateFromSnapshot(snapshot));
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Debug state failed: ${(error as Error).message}`)
      }));
    }
  },

  async startDebugCurrentFile() {
    const { currentFilePath, editorCursorLine } = get();
    if (!currentFilePath) {
      set((state) => ({ terminalLines: append(state.terminalLines, "Open a file before starting Debug Mode.") }));
      return;
    }
    try {
      const snapshot = await startDebugSession(currentFilePath, editorCursorLine);
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        showDebugVariables: true,
        visibleSceneMode: "debug",
        cameraPreset: "debug",
        terminalLines: append(state.terminalLines, `Debug started: ${currentFilePath}`)
      }));
      const frame = snapshot.activeFrame;
      if (frame) {
        await get().openFile(frame.path, frame.line);
      }
      get().arrangeDebuggingLayout();
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Debug start failed: ${(error as Error).message}`)
      }));
    }
  },

  async addBreakpointAtCursor() {
    const { currentFilePath, editorCursorLine } = get();
    if (!currentFilePath) return;
    try {
      const snapshot = await addDebugBreakpointRequest(currentFilePath, editorCursorLine);
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        terminalLines: append(state.terminalLines, `Breakpoint added at ${currentFilePath}:${editorCursorLine}`)
      }));
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Add breakpoint failed: ${(error as Error).message}`)
      }));
    }
  },

  async removeBreakpointAtCursor() {
    const { currentFilePath, editorCursorLine } = get();
    if (!currentFilePath) return;
    try {
      const snapshot = await removeDebugBreakpointRequest(currentFilePath, editorCursorLine);
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        terminalLines: append(state.terminalLines, `Breakpoint removed at ${currentFilePath}:${editorCursorLine}`)
      }));
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Remove breakpoint failed: ${(error as Error).message}`)
      }));
    }
  },

  async addBreakpointForSymbol(path, line) {
    try {
      const snapshot = await addDebugBreakpointRequest(path, line);
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        visibleSceneMode: state.visibleSceneMode === "cockpit" ? "debug" : state.visibleSceneMode,
        cameraPreset: state.cameraPreset === "cockpit" ? "debug" : state.cameraPreset,
        terminalLines: append(state.terminalLines, `Breakpoint added at ${path}:${line}`)
      }));
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Symbol breakpoint failed: ${(error as Error).message}`)
      }));
    }
  },

  async stepOver() {
    try {
      const snapshot = await stepOverDebug();
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        visibleSceneMode: "debug",
        cameraPreset: "debug",
        terminalLines: append(state.terminalLines, `Step over: ${snapshot.activeFrame?.path || snapshot.status}`)
      }));
      if (snapshot.activeFrame) {
        await get().openFile(snapshot.activeFrame.path, snapshot.activeFrame.line);
      }
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Step over failed: ${(error as Error).message}`)
      }));
    }
  },

  async stepInto() {
    try {
      const snapshot = await stepIntoDebug();
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        visibleSceneMode: "debug",
        cameraPreset: "debug",
        terminalLines: append(state.terminalLines, `Step into: ${snapshot.activeFrame?.path || snapshot.status}`)
      }));
      if (snapshot.activeFrame) {
        await get().openFile(snapshot.activeFrame.path, snapshot.activeFrame.line);
      }
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Step into failed: ${(error as Error).message}`)
      }));
    }
  },

  async continueDebug() {
    try {
      const snapshot = await continueDebugSession();
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        visibleSceneMode: "debug",
        cameraPreset: "debug",
        terminalLines: append(state.terminalLines, `Continue: ${snapshot.activeFrame?.path || snapshot.status}`)
      }));
      if (snapshot.activeFrame) {
        await get().openFile(snapshot.activeFrame.path, snapshot.activeFrame.line);
      }
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Continue failed: ${(error as Error).message}`)
      }));
    }
  },

  showVariables() {
    set((state) => ({
      showDebugPanel: true,
      showDebugVariables: true,
      visibleSceneMode: "debug",
      cameraPreset: "debug",
      terminalLines: append(state.terminalLines, `Debug variables: ${state.debugVariables.length}.`)
    }));
  },

  async addDebugWatchExpression(expression) {
    try {
      const snapshot = await addDebugWatchRequest(expression);
      set((state) => ({
        ...debugStateFromSnapshot(snapshot),
        showDebugPanel: true,
        showDebugVariables: true,
        terminalLines: append(state.terminalLines, `Watch added: ${expression}`)
      }));
    } catch (error) {
      set((state) => ({
        lastDebugError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Watch failed: ${(error as Error).message}`)
      }));
    }
  },

  setGraphFocus(focus) {
    set((state) => ({
      graphFocus: focus,
      terminalLines: append(state.terminalLines, `Graph focus: ${focus}`)
    }));
  },

  setSceneMode(mode) {
    set((state) => ({
      visibleSceneMode: mode,
      cameraPreset: mode,
      showAgentDock: mode === "agent" ? true : state.showAgentDock,
      showDiffStack: mode === "agent" ? true : state.showDiffStack,
      showErrorPath: mode === "error-trace" ? true : state.showErrorPath,
      showDiagnosticsPanel: mode === "diagnostics" ? true : state.showDiagnosticsPanel,
      showDebugPanel: mode === "debug" ? true : state.showDebugPanel,
      visibleDependencyMode: mode === "dependency" ? "all" : state.visibleDependencyMode,
      terminalLines: append(state.terminalLines, `Scene mode: ${mode}`)
    }));
  },

  setCameraPreset(preset) {
    set({ cameraPreset: preset });
  },

  setVisibleDependencyMode(mode) {
    set((state) => ({
      visibleDependencyMode: mode,
      graphFocus: mode === "incoming" ? "callers" : "dependencies",
      terminalLines: append(state.terminalLines, `Dependency beams: ${mode}`)
    }));
  },

  setWorldDetail(detail) {
    set((state) => ({
      worldDetail: detail,
      showFunctions: detail === "function" ? true : state.showFunctions,
      terminalLines: append(state.terminalLines, `World detail: ${detail}`)
    }));
  },

  setGraphScopeFilter(scope) {
    set((state) => ({
      graphScopeFilter: scope,
      visibleSceneMode: scope === "all" ? state.visibleSceneMode : "dependency",
      cameraPreset: scope === "all" ? state.cameraPreset : "dependency",
      terminalLines: append(state.terminalLines, `Graph scope: ${scope}`)
    }));
  },

  setShowExternalPackages(show) {
    set((state) => ({
      showExternalPackages: show,
      terminalLines: append(state.terminalLines, `${show ? "Showing" : "Hiding"} external packages.`)
    }));
  },

  setShowFunctions(show) {
    set((state) => ({
      showFunctions: show,
      worldDetail: show ? "function" : state.worldDetail,
      terminalLines: append(state.terminalLines, `${show ? "Showing" : "Hiding"} function satellites.`)
    }));
  },

  setShowChangedFilesOnly(show) {
    set((state) => ({
      showChangedFilesOnly: show,
      terminalLines: append(state.terminalLines, `${show ? "Showing changed files only." : "Showing all git states."}`)
    }));
  },

  setShowDiagnosticsOnly(show) {
    set((state) => ({
      showDiagnosticsOnly: show,
      showDiagnosticsPanel: show ? true : state.showDiagnosticsPanel,
      visibleSceneMode: show ? "diagnostics" : state.visibleSceneMode,
      cameraPreset: show ? "diagnostics" : state.cameraPreset,
      terminalLines: append(state.terminalLines, `${show ? "Showing diagnostic files only." : "Showing all diagnostic states."}`)
    }));
  },

  setMaxVisibleBeams(maxVisibleBeams) {
    set((state) => ({
      maxVisibleBeams: Math.max(0, Math.min(2000, Math.floor(maxVisibleBeams))),
      terminalLines: append(state.terminalLines, `Beam cap: ${Math.max(0, Math.min(2000, Math.floor(maxVisibleBeams)))}`)
    }));
  },

  setShowFpsOverlay(show) {
    set({ showFpsOverlay: show });
  },

  setHoveredObjectId(id) {
    set({ hoveredObjectId: id });
  },

  selectFolder(id) {
    set({ selectedFolderId: id, selectedFileId: null, selectedFunctionId: null, selectedPackageId: null });
  },

  selectPackage(id) {
    set({ selectedPackageId: id, selectedFileId: null, selectedFunctionId: null });
  },

  selectFunction(id) {
    set({ selectedFunctionIds: [id], selectedFunctionId: id });
  },

  toggleFunctionSelection(id) {
    set((state) => ({
      selectedFunctionIds: state.selectedFunctionIds.includes(id)
        ? state.selectedFunctionIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedFunctionIds, id]
    }));
  },

  pinFunction(id) {
    const { graph, pinnedCards } = get();
    const node = graph?.nodes.find((candidate) => candidate.id === id);
    if (!node || (node.kind !== "function" && node.kind !== "class")) return;
    if (pinnedCards.some((card) => card.id === id)) return;
    const cardKind: "function" | "class" = node.kind;

    const offset = pinnedCards.length * 26;
    set((state) => ({
      pinnedCards: [
        ...state.pinnedCards,
        {
          id: node.id,
          name: node.name,
          path: node.path,
          line: node.line ?? 1,
          size: node.size ?? 1,
          kind: cardKind,
          x: 72 + offset,
          y: 118 + offset
        }
      ],
      pinnedFunctions: [...new Set([...state.pinnedFunctions, id])],
      terminalLines: append(state.terminalLines, `Pinned ${node.name}`)
    }));
  },

  pinFunctionByQuery(query) {
    const { graph, currentFilePath } = get();
    const symbols = getSymbolsForFile(graph, currentFilePath);
    const match = findSymbolByQuery(symbols, query);
    if (match) {
      get().pinFunction(match.id);
      return;
    }
    set((state) => ({
      terminalLines: append(state.terminalLines, `No function matched "${query}".`)
    }));
  },

  unpinFunction(id) {
    set((state) => ({
      pinnedCards: state.pinnedCards.filter((card) => card.id !== id),
      pinnedFunctions: state.pinnedFunctions.filter((functionId) => functionId !== id)
    }));
  },

  movePinnedCard(id, x, y) {
    set((state) => ({
      pinnedCards: state.pinnedCards.map((card) => (card.id === id ? { ...card, x, y } : card))
    }));
  },

  jumpToLine(line) {
    set({ targetLine: line });
  },

  appendTerminal(line) {
    set((state) => ({
      terminalLines: append(state.terminalLines, line)
    }));
  },

  appendCommand(line) {
    set((state) => ({
      commandHistory: append(state.commandHistory, line),
      terminalLines: append(state.terminalLines, `> ${line}`)
    }));
  },

  async runCommand(command) {
    const result = await runCommandRequest(command);
    set((state) => ({
      graph: result.graph || state.graph,
      fileTree: result.graph?.tree || state.fileTree,
      gitStatus: result.gitStatus || state.gitStatus,
      terminalLines: append(state.terminalLines, result.output)
    }));
    if (command === "scan" || command === "git-status") {
      await get().refreshGitState();
    }
  },

  async createAgentTask() {
    const { graph, currentFilePath, selectedFunctionIds } = get();
    if (!graph || !currentFilePath) return;

    const selectedFunctions = graph.nodes
      .filter((node) => selectedFunctionIds.includes(node.id))
      .map((node) => ({
        name: node.name,
        path: node.path,
        line: node.line ?? 1
      }));

    const currentSymbols = getSymbolsForFile(graph, currentFilePath);
    const fallbackFunctions = selectedFunctions.length
      ? selectedFunctions
      : currentSymbols.slice(0, 2).map((node) => ({
          name: node.name,
          path: node.path,
          line: node.line ?? 1
        }));

    const result = await createAgentTaskRequest({
      goal: `Improve ${currentFilePath} while preserving behavior.`,
      selectedFiles: [currentFilePath],
      selectedFunctions: fallbackFunctions
    });

    set((state) => ({
      agentResults: result.results,
      currentAgentTaskId: result.taskId,
      showAgentDock: true,
      terminalLines: append(state.terminalLines, `Created ${result.taskFile}`)
    }));
  },

  async refreshAgentResults() {
    const { results } = await fetchAgentResults();
    set({ agentResults: results });
  },

  async refreshAgentRuns() {
    try {
      const { runs } = await fetchAgentRuns();
      set({ agentRuns: runs, lastAgentRunError: null });
    } catch (error) {
      set((state) => ({
        lastAgentRunError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Agent runs failed: ${(error as Error).message}`)
      }));
    }
  },

  async runAgentTask(taskId) {
    try {
      const result = await runAgentRequest(taskId);
      set((state) => ({
        agentRuns: result.runs,
        agentResults: result.results,
        showAgentDock: true,
        visibleSceneMode: "agent",
        cameraPreset: "agent",
        lastAgentRunError: null,
        terminalLines: append(
          append(state.terminalLines, `Agent run started: ${result.run.displayCommand}`),
          `Agent cwd: ${result.run.workingDirectory}`
        )
      }));
    } catch (error) {
      set((state) => ({
        lastAgentRunError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Agent run failed: ${(error as Error).message}`)
      }));
    }
  },

  connectAgentEvents() {
    const source = new EventSource("/api/agent/events");
    const handleEvent = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as AgentRunEvent;
      if (payload.runs) {
        set({ agentRuns: payload.runs });
      }
      if (payload.run) {
        set((state) => ({ agentRuns: mergeAgentRun(state.agentRuns, payload.run as AgentRunSnapshot) }));
      }
      if (payload.type === "agent-log") {
        const lines = terminalLinesFromAgentText(payload.text, payload.stream);
        if (lines.length) {
          set((state) => ({
            terminalLines: lines.reduce((acc, line) => append(acc, line), state.terminalLines)
          }));
        }
      }
      if (payload.type === "agent-started" && payload.run) {
        set((state) => ({
          showAgentDock: true,
          terminalLines: append(state.terminalLines, `Agent started: ${payload.run?.taskId} -> ${payload.run?.displayCommand}`)
        }));
      }
      if (payload.type === "agent-finished" && payload.run) {
        set((state) => ({
          terminalLines: append(
            state.terminalLines,
            `Agent ${payload.run?.status}: ${payload.run?.taskId}${payload.diffDetected ? " (diff detected)" : ""}`
          )
        }));
        void get().refreshAgentResults();
        void get().refreshGitState();
      }
    };
    source.addEventListener("agent-snapshot", handleEvent);
    source.addEventListener("agent-started", handleEvent);
    source.addEventListener("agent-log", handleEvent);
    source.addEventListener("agent-finished", handleEvent);
    source.onerror = () => {
      set({ lastAgentRunError: "Agent event stream disconnected." });
    };
    return () => {
      source.close();
    };
  },

  showFirstDiff() {
    const { currentDiff } = get();
    if (currentDiff) {
      set((state) => ({
        activeDiff: currentDiff,
        activeDiffFile: state.diffSummary[0]?.path || null,
        showDiffStack: true,
        visibleSceneMode: "agent",
        cameraPreset: "agent",
        terminalLines: append(state.terminalLines, `Showing git diff: ${state.diffSummary.length} changed files.`)
      }));
      return;
    }

    const result = get().agentResults.find((candidate) => candidate.diff);
    set((state) => ({
      activeDiff: result?.diff || "",
      showDiffStack: true,
      visibleSceneMode: "agent",
      cameraPreset: "agent",
      terminalLines: append(state.terminalLines, result?.diff ? `Showing ${result.taskId} diff.` : "No diff result found.")
    }));
  },

  openDiffForFile(path) {
    set((state) => ({
      activeDiff: state.currentDiff,
      activeDiffFile: path,
      showDiffStack: true,
      visibleSceneMode: "agent",
      cameraPreset: "agent",
      terminalLines: append(state.terminalLines, path ? `Opened diff card: ${path}` : "Opened git diff.")
    }));
  },

  openAgentDiff(taskId) {
    const result = get().agentResults.find((candidate) => candidate.taskId === taskId);
    set((state) => ({
      activeDiff: result?.diff || "",
      activeDiffFile: null,
      showDiffStack: true,
      visibleSceneMode: "agent",
      cameraPreset: "agent",
      terminalLines: append(state.terminalLines, result?.diff ? `Opened agent diff: ${taskId}` : `No diff for ${taskId}.`)
    }));
  },

  async validatePatch(diffPath) {
    try {
      const result = await validatePatchRequest(diffPath);
      set((state) => ({
        agentResults: result.results,
        lastPatchError: result.ok ? null : result.output || result.error || "Patch validation failed.",
        terminalLines: append(
          state.terminalLines,
          `${result.ok ? "Patch validation passed" : "Patch validation failed"}: ${diffPath}\n${result.output || result.error || ""}`.trim()
        )
      }));
    } catch (error) {
      set((state) => ({
        lastPatchError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Patch validation failed: ${(error as Error).message}`)
      }));
    }
  },

  async applyPatch(diffPath) {
    try {
      const result = await applyPatchRequest(diffPath, "new-branch");
      set((state) => ({
        agentResults: result.results,
        graph: result.graph || state.graph,
        fileTree: result.graph?.tree || state.fileTree,
        currentDiff: result.git && "diff" in result.git ? result.git.diff : state.currentDiff,
        diffSummary: result.git && "changedFiles" in result.git ? result.git.changedFiles : state.diffSummary,
        modifiedFiles:
          result.git && "changedFiles" in result.git ? result.git.changedFiles.map((file) => file.path) : state.modifiedFiles,
        lastPatchError: result.ok ? null : result.output || result.error || "Patch apply failed.",
        showDiffStack: true,
        visibleSceneMode: "agent",
        cameraPreset: "agent",
        terminalLines: append(
          state.terminalLines,
          `${result.ok ? `Patch applied on ${result.branch}` : "Patch apply failed"}: ${diffPath}\n${result.output || result.error || ""}`.trim()
        )
      }));
      await get().refreshGitState();
    } catch (error) {
      set((state) => ({
        lastPatchError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Patch apply failed: ${(error as Error).message}`)
      }));
    }
  },

  async rejectPatch(diffPath) {
    try {
      const result = await rejectPatchRequest(diffPath);
      set((state) => ({
        agentResults: result.results,
        lastPatchError: null,
        terminalLines: append(state.terminalLines, result.output || `Rejected ${diffPath}`)
      }));
    } catch (error) {
      set((state) => ({
        lastPatchError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Patch reject failed: ${(error as Error).message}`)
      }));
    }
  },

  setShowTests(show) {
    set({ showTests: show });
  },

  setShowAgentDock(show) {
    set({ showAgentDock: show });
  },

  setShowDiffStack(show) {
    set({ showDiffStack: show });
  },

  setShowErrorPath(show) {
    set((state) => ({
      showErrorPath: show,
      visibleSceneMode: show ? "error-trace" : state.visibleSceneMode,
      cameraPreset: show ? "error-trace" : state.cameraPreset
    }));
  },

  async saveWorkspace(options = {}) {
    try {
      const result = await saveWorkspaceSession(workspaceSessionFromState(get()));
      if (!options.silent) {
        set((state) => ({
          lastSessionError: null,
          terminalLines: append(state.terminalLines, `Workspace saved to ${result.path}.`)
        }));
      } else {
        set({ lastSessionError: null });
      }
    } catch (error) {
      set((state) => ({
        lastSessionError: (error as Error).message,
        terminalLines: options.silent
          ? state.terminalLines
          : append(state.terminalLines, `Workspace save failed: ${(error as Error).message}`)
      }));
    }
  },

  async autosaveWorkspace() {
    if (Date.now() < suppressWorkspaceAutosaveUntil) return;
    await get().saveWorkspace({ silent: true });
  },

  async restoreWorkspace() {
    try {
      const { session } = await fetchWorkspaceSession();
      if (!session) {
        set((state) => ({
          lastSessionError: null,
          terminalLines: append(state.terminalLines, "No saved workspace session found.")
        }));
        return;
      }

      suppressWorkspaceAutosaveUntil = Date.now() + 1000;
      const hasDiffPanel = session.editorPanels.some((panel) => panel.kind === "diff");
      if (hasDiffPanel) {
        await get().refreshGitState();
      }

      const panels: SpatialEditorPanel[] = [];
      for (const persistedPanel of session.editorPanels) {
        if (persistedPanel.kind === "diff") {
          panels.push(panelFromSession(persistedPanel, get().currentDiff || get().activeDiff || "No git diff."));
          continue;
        }
        try {
          const file = await fetchFile(persistedPanel.path);
          panels.push(panelFromSession({ ...persistedPanel, path: file.path, title: persistedPanel.title || file.path }, file.content));
        } catch (error) {
          set((state) => ({
            terminalLines: append(state.terminalLines, `Skipped session panel ${persistedPanel.path}: ${(error as Error).message}`)
          }));
        }
      }

      const activePanel = panels.find((panel) => panel.id === session.activeEditorPanelId) || panels.find((panel) => !panel.readOnly) || panels[0];
      const contextPanel =
        activePanel && !activePanel.readOnly
          ? activePanel
          : panels.find((panel) => !panel.readOnly && panel.path === session.selectedFilePath) || panels.find((panel) => !panel.readOnly);
      const contextState = contextPanel
        ? activatePanelState(contextPanel)
        : {
            currentFilePath: null,
            openEditorFile: null,
            currentFileContent: "",
            savedFileContent: "",
            isDirty: false,
            targetLine: null
          };
      const selectedFilePath = session.selectedFilePath || contextPanel?.path || null;

      set((state) => ({
        ...contextState,
        activeEditorPanelId: activePanel?.id || null,
        editorPanels: panels,
        editorLayout: session.editorLayout,
        pinnedCards: session.pinnedCards,
        pinnedFunctions: session.pinnedCards.map((card) => card.id),
        dirtyFiles: stableStringList(state.dirtyFiles, dirtyPathsFromPanels(panels)),
        selectedFileId: selectedFilePath ? fileNodeId(selectedFilePath) : contextPanel ? fileNodeId(contextPanel.path) : null,
        selectedFunctionId: null,
        selectedFolderId: null,
        selectedPackageId: null,
        graphFocus: session.graphFocus,
        visibleSceneMode: session.visibleSceneMode,
        visibleDependencyMode: session.visibleDependencyMode,
        cameraPreset: session.cameraPreset,
        showTests: session.showTests,
        showAgentDock: session.showAgentDock,
        showDiffStack: session.showDiffStack,
        showErrorPath: session.showErrorPath,
        showDiagnosticsPanel: session.showDiagnosticsPanel,
        activeDiffFile: session.activeDiffFile,
        activeDiagnosticId: session.activeDiagnosticId,
        currentAgentTaskId: session.currentAgentTaskId,
        worldDetail: session.worldDetail,
        graphScopeFilter: session.graphScopeFilter,
        showExternalPackages: session.showExternalPackages,
        showFunctions: session.showFunctions,
        showChangedFilesOnly: session.showChangedFilesOnly,
        showDiagnosticsOnly: session.showDiagnosticsOnly,
        maxVisibleBeams: session.maxVisibleBeams,
        showFpsOverlay: session.showFpsOverlay,
        lastSessionError: null,
        terminalLines: append(state.terminalLines, `Workspace restored from .holocode/session.json.`)
      }));

      const restoredPath = contextPanel?.path || selectedFilePath;
      if (restoredPath) {
        void get().refreshDocumentSymbols(restoredPath);
      }
      if (session.showDiagnosticsPanel) {
        void get().refreshDiagnostics();
      }
    } catch (error) {
      set((state) => ({
        lastSessionError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Workspace restore failed: ${(error as Error).message}`)
      }));
    }
  },

  async resetWorkspace() {
    suppressWorkspaceAutosaveUntil = Date.now() + 3000;
    try {
      await resetWorkspaceSession();
      set((state) => ({
        currentFilePath: null,
        currentFileContent: "",
        savedFileContent: "",
        isDirty: false,
        targetLine: null,
        editorPanels: [],
        activeEditorPanelId: null,
        editorLayout: "free",
        selectedFunctionIds: [],
        pinnedCards: [],
        pinnedFunctions: [],
        selectedFileId: null,
        selectedFunctionId: null,
        selectedFolderId: null,
        selectedPackageId: null,
        hoveredObjectId: null,
        openEditorFile: null,
        visibleDependencyMode: "outgoing",
        visibleSceneMode: "cockpit",
        cameraPreset: "cockpit",
        showExternalPackages: true,
        worldDetail: "file",
        graphScopeFilter: "all",
        showFunctions: true,
        showChangedFilesOnly: false,
        showDiagnosticsOnly: false,
        maxVisibleBeams: 180,
        showFpsOverlay: true,
        showTests: true,
        showAgentDock: true,
        showDiffStack: true,
        showErrorPath: false,
        showDiagnosticsPanel: false,
        activeDiffFile: null,
        activeDiagnosticId: null,
        currentAgentTaskId: null,
        dirtyFiles: [],
        lastSessionError: null,
        terminalLines: append(state.terminalLines, "Workspace session reset.")
      }));
    } catch (error) {
      set((state) => ({
        lastSessionError: (error as Error).message,
        terminalLines: append(state.terminalLines, `Workspace reset failed: ${(error as Error).message}`)
      }));
    }
  },

  resetLayout() {
    set((state) => ({
      selectedFileId: state.currentFilePath ? fileNodeId(state.currentFilePath) : null,
      selectedFunctionId: null,
      selectedFolderId: null,
      selectedPackageId: null,
      hoveredObjectId: null,
      editorLayout: "free",
      editorPanels: state.editorPanels.map((panel, index) => ({ ...panel, ...defaultPanelTransform(panel.kind, index) })),
      visibleDependencyMode: "outgoing",
      visibleSceneMode: "cockpit",
      cameraPreset: "cockpit",
      showExternalPackages: true,
      worldDetail: "file",
      graphScopeFilter: "all",
      showFunctions: true,
      showChangedFilesOnly: false,
      showDiagnosticsOnly: false,
      maxVisibleBeams: 180,
      showTests: true,
      showAgentDock: true,
      showDiffStack: true,
      showErrorPath: false,
      showDiagnosticsPanel: false,
      showDebugPanel: false,
      terminalLines: append(state.terminalLines, "Spatial layout reset.")
    }));
  }
}));
