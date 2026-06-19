import type { ObservabilityViewMode } from "./observability/observabilityTypes";

export type FileTreeEntry = {
  name: string;
  path: string;
  kind: "folder" | "file";
  extension?: string;
  children?: FileTreeEntry[];
};

export type CodeNodeKind =
  | "repository"
  | "directory"
  | "folder"
  | "file"
  | "module"
  | "class"
  | "function"
  | "method"
  | "interface"
  | "type"
  | "import"
  | "export"
  | "test"
  | "package"
  | "package_script"
  | "external"
  | "error"
  | "agent_task"
  | "patch"
  | "unknown";

export type CodeNode = {
  id: string;
  name: string;
  path: string;
  kind: CodeNodeKind;
  language?: string;
  line?: number;
  endLine?: number;
  size?: number;
  loc?: number;
  complexity?: number;
  imports?: string[];
  importedBy?: string[];
  relatedTests?: string[];
  calls?: string[];
  label?: string;
  type?: string;
  symbolName?: string;
  status?: string;
  metrics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type CodeEdge = {
  id: string;
  source: string;
  target: string;
  type:
    | "contains"
    | "imports"
    | "exports"
    | "defines"
    | "calls"
    | "uses"
    | "references"
    | "extends"
    | "implements"
    | "tests"
    | "depends_on"
    | "changed_by_patch"
    | "affected_by"
    | "error_at"
    | "related_to_task"
    | "unknown";
  line?: number;
  importedNames?: string[];
  weight?: number;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type CodeGraph = {
  generatedAt: string;
  root: string;
  tree: FileTreeEntry[];
  nodes: CodeNode[];
  edges: CodeEdge[];
  stats: {
    folders: number;
    files: number;
    symbols: number;
    imports: number;
    nodeCount?: number;
    edgeCount?: number;
    fileCount?: number;
    symbolCount?: number;
    testCount?: number;
  };
};

export type VRGraphExport = {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    path?: string;
    symbolName?: string;
    size?: number;
    status?: string;
    metrics?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    weight?: number;
    status?: string;
  }>;
  clusters: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    type: string;
  }>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    fileCount: number;
    symbolCount: number;
    testCount: number;
  };
};

export type PinnedCard = {
  id: string;
  name: string;
  path: string;
  line: number;
  size: number;
  kind: "function" | "class";
  x: number;
  y: number;
};

export type SpatialEditorPanelKind = "source" | "test" | "caller" | "callee" | "diff" | "debug";

export type SpatialEditorPanel = {
  id: string;
  path: string;
  title: string;
  kind: SpatialEditorPanelKind;
  content: string;
  savedContent: string;
  isDirty: boolean;
  readOnly: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  targetLine: number | null;
};

export type SpatialEditorLayout = "free" | "source-test" | "caller-callee" | "diff-review" | "debugging";

export type WorldDetailLevel = "module" | "file" | "function";

export type GraphScopeFilter = "all" | "current-file" | "current-module";

export type PersistedEditorPanel = Pick<
  SpatialEditorPanel,
  "id" | "path" | "title" | "kind" | "readOnly" | "position" | "rotation" | "targetLine"
>;

export type WorkspaceSession = {
  version: 1;
  savedAt: string;
  editorPanels: PersistedEditorPanel[];
  activeEditorPanelId: string | null;
  editorLayout: SpatialEditorLayout;
  pinnedCards: PinnedCard[];
  selectedFilePath: string | null;
  cameraPreset: CameraPreset;
  visibleSceneMode: SceneMode;
  visibleDependencyMode: VisibleDependencyMode;
  graphFocus: GraphFocus;
  showTests: boolean;
  showAgentDock: boolean;
  showDiffStack: boolean;
  showErrorPath: boolean;
  showDiagnosticsPanel: boolean;
  activeDiffFile: string | null;
  activeDiagnosticId: string | null;
  currentAgentTaskId: string | null;
  worldDetail: WorldDetailLevel;
  graphScopeFilter: GraphScopeFilter;
  showExternalPackages: boolean;
  showFunctions: boolean;
  showChangedFilesOnly: boolean;
  showDiagnosticsOnly: boolean;
  maxVisibleBeams: number;
  showFpsOverlay: boolean;
};

export type AgentResult = {
  taskId: string;
  taskFile: string;
  resultDiffFile: string | null;
  logFile: string | null;
  task: string;
  diff: string;
  log: string;
  patchState: PatchState | null;
};

export type AgentRunStatus = "queued" | "running" | "completed" | "failed";

export type AgentRunSnapshot = {
  taskId: string;
  status: AgentRunStatus;
  command: string;
  args: string[];
  displayCommand: string;
  workingDirectory: string;
  taskFile: string;
  logFile: string;
  resultDiffFile: string;
  touchedFiles: string[];
  startedAt: string | null;
  endedAt: string | null;
  exitCode: number | null;
  error: string | null;
  lastLogLines: string[];
};

export type AgentRunEvent = {
  type: "agent-snapshot" | "agent-started" | "agent-log" | "agent-finished";
  run?: AgentRunSnapshot;
  runs?: AgentRunSnapshot[];
  stream?: "stdout" | "stderr";
  text?: string;
  diffDetected?: boolean;
};

export type PatchState = {
  taskId: string;
  status: "pending" | "validated" | "applied" | "rejected" | "failed";
  diffPath?: string;
  branch?: string;
  message?: string;
  output?: string;
  updatedAt: string | null;
};

export type PatchActionResponse = {
  ok: boolean;
  taskId?: string;
  diffPath?: string;
  branch?: string;
  patchState?: PatchState;
  output?: string;
  error?: string;
  graph?: CodeGraph;
  git?: GitDiffSnapshot | { error: string; diff: ""; changedFiles: [] };
  results: AgentResult[];
};

export type GitFileStatus = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  index?: string;
  workingTree?: string;
  raw?: string;
};

export type DiffChangedFile = {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed";
  additions: number;
  deletions: number;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  gitRoot: string;
  files: GitFileStatus[];
};

export type GitDiffSnapshot = {
  repoRoot?: string;
  gitRoot?: string;
  diff: string;
  changedFiles: DiffChangedFile[];
};

export type LspDiagnosticSeverity = "error" | "warning" | "info" | "hint";

export type LspRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type LspDiagnostic = LspRange & {
  id: string;
  path: string;
  severity: LspDiagnosticSeverity;
  code: number;
  source: string;
  message: string;
};

export type LspFileSummary = {
  path: string;
  errors: number;
  warnings: number;
  hints: number;
  infos: number;
  maxSeverity: LspDiagnosticSeverity;
};

export type LspDiagnosticsSnapshot = {
  repoRoot: string;
  generatedAt: string;
  diagnostics: LspDiagnostic[];
  summary: LspFileSummary[];
};

export type LspLocation = LspRange & {
  path: string;
  name?: string;
  kind?: string;
  containerName?: string;
  isDefinition?: boolean;
};

export type LspHover = {
  path: string;
  line: number;
  column: number;
  kind?: string;
  kindModifiers?: string;
  contents: string;
  documentation: string;
};

export type LspDocumentSymbol = LspRange & {
  name: string;
  kind: string;
  parentName: string | null;
};

export type LspRenamePreview = {
  path: string;
  canRename: boolean;
  displayName?: string;
  fullDisplayName?: string;
  kind?: string;
  newName?: string;
  message: string;
  locations: LspLocation[];
};

export type DebugStatus = "idle" | "running" | "paused" | "stopped";

export type DebugBreakpoint = {
  id: string;
  path: string;
  line: number;
  enabled: boolean;
  sourceId: string;
  createdAt: string;
};

export type DebugStackFrame = {
  id: string;
  name: string;
  path: string;
  line: number;
  endLine?: number;
  kind: string;
  sourceId: string;
  depth: number;
};

export type DebugVariable = {
  name: string;
  value: string;
  type: string;
  scope: string;
};

export type DebugWatch = {
  id: string;
  expression: string;
  value: string;
  status: "pending" | "ok" | "unavailable";
  updatedAt: string;
};

export type DebugConsoleEntry = {
  id: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
};

export type DebugSessionSnapshot = {
  repoRoot: string;
  sessionId: string | null;
  status: DebugStatus;
  targetPath: string | null;
  breakpoints: DebugBreakpoint[];
  callStack: DebugStackFrame[];
  activeFrame: DebugStackFrame | null;
  variables: DebugVariable[];
  watches: DebugWatch[];
  console: DebugConsoleEntry[];
  updatedAt: string | null;
  error?: string;
};

export type GraphFocus = "dependencies" | "callers" | "sankey" | "all";

export type VisibleDependencyMode = "hidden" | "incoming" | "outgoing" | "all";

export type SceneMode = "cockpit" | "architecture" | "current-file" | "dependency" | "agent" | "error-trace" | "diagnostics" | "debug";

export type CameraPreset = SceneMode;

export type RunCommandName = "test" | "lint" | "scan" | "git-status";

export type CommandIntent =
  | { type: "openFile"; query: string }
  | { type: "focusFile"; query: string }
  | { type: "architectureView" }
  | { type: "cockpitView" }
  | { type: "dependencyView" }
  | { type: "agentView" }
  | { type: "errorTraceView" }
  | { type: "showDependencies" }
  | { type: "hideDependencies" }
  | { type: "showCallers" }
  | { type: "showTests" }
  | { type: "showFunctions" }
  | { type: "pinFunction"; query: string }
  | { type: "createAgentTask" }
  | { type: "runAgentTask"; taskId?: string }
  | { type: "openRelatedTests" }
  | { type: "openCallers" }
  | { type: "openImports" }
  | { type: "compareWithDiff" }
  | { type: "closeOtherPanels" }
  | { type: "arrangeSourceAndTest" }
  | { type: "currentFileOnly" }
  | { type: "currentModuleOnly" }
  | { type: "showAllFiles" }
  | { type: "showChangedFilesOnly" }
  | { type: "showDiagnosticsOnly" }
  | { type: "hideFunctions" }
  | { type: "showExternalPackages" }
  | { type: "hideExternalPackages" }
  | { type: "runTests" }
  | { type: "showDiff" }
  | { type: "showDiagnostics" }
  | { type: "goToDefinition" }
  | { type: "findReferences" }
  | { type: "debugCurrentFile" }
  | { type: "addBreakpoint" }
  | { type: "removeBreakpoint" }
  | { type: "stepOver" }
  | { type: "stepInto" }
  | { type: "continueDebug" }
  | { type: "showVariables" }
  | { type: "gitStatus" }
  | { type: "saveFile" }
  | { type: "saveWorkspace" }
  | { type: "restoreWorkspace" }
  | { type: "resetWorkspace" }
  | { type: "resetLayout" }
  | { type: "setObservabilityMode"; mode: ObservabilityViewMode }
  | { type: "showAgentContext" }
  | { type: "showMissingContext" }
  | { type: "hideContextLens" }
  | { type: "expandContextToCallers" }
  | { type: "expandContextToTests" }
  | { type: "showBlastRadius" }
  | { type: "showBlastRadiusForCurrentFile" }
  | { type: "showBlastRadiusForCurrentDiff" }
  | { type: "hideBlastRadius" }
  | { type: "showTraceRivers" }
  | { type: "showLatestTrace" }
  | { type: "followFailingTrace" }
  | { type: "showUnmappedSpans" }
  | { type: "hideTraceRivers" }
  | { type: "compareTracesBeforeAfter" }
  | { type: "showAgentTopology" }
  | { type: "hideAgentTopology" }
  | { type: "showFailedAgentSteps" }
  | { type: "showTokenUsage" }
  | { type: "showWhyAgentChangedThisFile" }
  | { type: "showEpistemicFog" }
  | { type: "showUnknownAreas" }
  | { type: "showUntestedAreas" }
  | { type: "showRiskyAreas" }
  | { type: "hideEpistemicFog" }
  | { type: "enterDiffTunnel" }
  | { type: "showDiffTimeline" }
  | { type: "showPatchLineage" }
  | { type: "compareAgentAttempts" }
  | { type: "rewindPatch" }
  | { type: "exitDiffTunnel" }
  | { type: "unknown"; transcript: string };
