import { Mic, MicOff, SendHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import type { EpistemicFogFilter } from "../observability/epistemicScoring";
import { useObservabilityStore } from "../state/observabilityStore";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import type { CommandIntent } from "../types";
import { parseCommandIntent } from "./intentParser";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  const win = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function VoiceCommandBar() {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const speechRecognition = useMemo(getSpeechRecognition, []);
  const openFileByQuery = useWorkspaceStore((state) => state.openFileByQuery);
  const focusFileByQuery = useWorkspaceStore((state) => state.focusFileByQuery);
  const setGraphFocus = useWorkspaceStore((state) => state.setGraphFocus);
  const setSceneMode = useWorkspaceStore((state) => state.setSceneMode);
  const setVisibleDependencyMode = useWorkspaceStore((state) => state.setVisibleDependencyMode);
  const setGraphScopeFilter = useWorkspaceStore((state) => state.setGraphScopeFilter);
  const setShowChangedFilesOnly = useWorkspaceStore((state) => state.setShowChangedFilesOnly);
  const setShowDiagnosticsOnly = useWorkspaceStore((state) => state.setShowDiagnosticsOnly);
  const setShowExternalPackages = useWorkspaceStore((state) => state.setShowExternalPackages);
  const setShowFunctions = useWorkspaceStore((state) => state.setShowFunctions);
  const setShowTests = useWorkspaceStore((state) => state.setShowTests);
  const setShowErrorPath = useWorkspaceStore((state) => state.setShowErrorPath);
  const resetLayout = useWorkspaceStore((state) => state.resetLayout);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);
  const appendCommand = useWorkspaceStore((state) => state.appendCommand);
  const pinFunctionByQuery = useWorkspaceStore((state) => state.pinFunctionByQuery);
  const createAgentTask = useWorkspaceStore((state) => state.createAgentTask);
  const runAgentTask = useWorkspaceStore((state) => state.runAgentTask);
  const agentResults = useWorkspaceStore((state) => state.agentResults);
  const currentAgentTaskId = useWorkspaceStore((state) => state.currentAgentTaskId);
  const currentFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const activeDiffFile = useWorkspaceStore((state) => state.activeDiffFile);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const openRelatedTests = useWorkspaceStore((state) => state.openRelatedTests);
  const openCallerPanels = useWorkspaceStore((state) => state.openCallerPanels);
  const openImportPanels = useWorkspaceStore((state) => state.openImportPanels);
  const compareWithDiff = useWorkspaceStore((state) => state.compareWithDiff);
  const closeOtherPanels = useWorkspaceStore((state) => state.closeOtherPanels);
  const arrangeSourceAndTest = useWorkspaceStore((state) => state.arrangeSourceAndTest);
  const runCommand = useWorkspaceStore((state) => state.runCommand);
  const saveCurrentFile = useWorkspaceStore((state) => state.saveCurrentFile);
  const refreshAgentResults = useWorkspaceStore((state) => state.refreshAgentResults);
  const showFirstDiff = useWorkspaceStore((state) => state.showFirstDiff);
  const showDiagnostics = useWorkspaceStore((state) => state.showDiagnostics);
  const goToDefinitionAtCursor = useWorkspaceStore((state) => state.goToDefinitionAtCursor);
  const findReferencesAtCursor = useWorkspaceStore((state) => state.findReferencesAtCursor);
  const startDebugCurrentFile = useWorkspaceStore((state) => state.startDebugCurrentFile);
  const addBreakpointAtCursor = useWorkspaceStore((state) => state.addBreakpointAtCursor);
  const removeBreakpointAtCursor = useWorkspaceStore((state) => state.removeBreakpointAtCursor);
  const stepOver = useWorkspaceStore((state) => state.stepOver);
  const stepInto = useWorkspaceStore((state) => state.stepInto);
  const continueDebug = useWorkspaceStore((state) => state.continueDebug);
  const showVariables = useWorkspaceStore((state) => state.showVariables);
  const saveWorkspace = useWorkspaceStore((state) => state.saveWorkspace);
  const restoreWorkspace = useWorkspaceStore((state) => state.restoreWorkspace);
  const resetWorkspace = useWorkspaceStore((state) => state.resetWorkspace);
  const setObservabilityMode = useObservabilityStore((state) => state.setObservabilityMode);
  const refreshObservabilityGraph = useObservabilityStore((state) => state.refreshObservabilityGraph);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const loadBlastRadius = useObservabilityStore((state) => state.loadBlastRadius);
  const loadContextLens = useObservabilityStore((state) => state.loadContextLens);
  const loadAgentTopology = useObservabilityStore((state) => state.loadAgentTopology);
  const loadTraceRiver = useObservabilityStore((state) => state.loadTraceRiver);
  const loadFailingTraceRiver = useObservabilityStore((state) => state.loadFailingTraceRiver);
  const setShowUnmappedTraceSpans = useObservabilityStore((state) => state.setShowUnmappedTraceSpans);
  const compareLatestTraceRivers = useObservabilityStore((state) => state.compareLatestTraceRivers);
  const selectedAgentRunId = useObservabilityStore((state) => state.selectedAgentRunId);
  const expandContextLens = useObservabilityStore((state) => state.expandContextLens);
  const setAgentTopologyFilter = useObservabilityStore((state) => state.setAgentTopologyFilter);
  const setEpistemicFogFilter = useObservabilityStore((state) => state.setEpistemicFogFilter);
  const setDiffTunnelView = useObservabilityStore((state) => state.setDiffTunnelView);
  const activeContextLens = useObservabilityStore((state) => state.activeContextLens);

  const selectedFilePath = selectedFileId?.startsWith("file:") ? selectedFileId.slice("file:".length) : null;

  function currentBlastRadiusTarget(preferDiff = false) {
    if (preferDiff) return activeDiffFile || diffSummary[0]?.path || null;
    return currentFilePath || selectedFilePath || activeDiffFile || diffSummary[0]?.path || null;
  }

  async function showBlastRadiusFor(path: string | null, emptyMessage = "Select a file or diff card first.") {
    if (!path) {
      setObservabilityMode("blast-radius");
      appendTerminal(emptyMessage);
      return;
    }
    await loadBlastRadius(path);
    const state = useObservabilityStore.getState();
    appendTerminal(state.activeBlastRadius ? `Blast Radius Bubble loaded for ${path}.` : `Blast Radius Bubble failed: ${state.observabilityError || "unknown error"}`);
  }

  async function showEpistemicFog(filter: EpistemicFogFilter, message: string) {
    setEpistemicFogFilter(filter);
    await refreshObservabilityGraph();
    const error = useObservabilityStore.getState().observabilityError;
    appendTerminal(error ? `${message} Partial observability data: ${error}` : message);
  }

  async function showDiffTunnel(view: Parameters<typeof setDiffTunnelView>[0], message: string) {
    setDiffTunnelView(view);
    await useWorkspaceStore.getState().refreshGitState();
    await refreshAgentResults();
    const state = useWorkspaceStore.getState();
    const hasDiff = Boolean(state.currentDiff || state.activeDiff || state.diffSummary.length || state.agentResults.some((result) => result.diff));
    appendTerminal(hasDiff ? message : "No diff available.");
  }

  async function dispatch(intent: CommandIntent, raw: string) {
    appendCommand(raw);

    if (intent.type === "showTraceRivers" || intent.type === "showLatestTrace") {
      await loadTraceRiver();
      const trace = useObservabilityStore.getState().activeTraceRiver;
      appendTerminal(trace ? `Trace River loaded: ${trace.name}${trace.isDemo ? " (demo)" : ""}.` : "No real trace available. Import a trace or run tests/lint when connected.");
      return;
    }

    if (intent.type === "followFailingTrace") {
      await loadFailingTraceRiver();
      const trace = useObservabilityStore.getState().activeTraceRiver;
      appendTerminal(trace ? `Following trace: ${trace.name}.` : "No failing trace available.");
      return;
    }

    if (intent.type === "showUnmappedSpans") {
      setShowUnmappedTraceSpans(true);
      if (!useObservabilityStore.getState().activeTraceRiver) {
        await loadTraceRiver();
      }
      appendTerminal(
        useObservabilityStore.getState().activeTraceRiver
          ? "Trace Rivers showing unmapped spans."
          : "No real trace available. Import a trace or run tests/lint when connected."
      );
      return;
    }

    if (intent.type === "hideTraceRivers") {
      clearObservabilityOverlays();
      appendTerminal("Trace Rivers hidden.");
      return;
    }

    if (intent.type === "compareTracesBeforeAfter") {
      await compareLatestTraceRivers();
      const comparison = useObservabilityStore.getState().traceRiverComparison;
      appendTerminal(comparison ? `Trace comparison staged: ${comparison.beforeTraceId} -> ${comparison.afterTraceId}.` : "At least two traces are needed for comparison.");
      return;
    }

    if (intent.type === "showEpistemicFog") {
      await showEpistemicFog("all", "Epistemic Fog enabled.");
      return;
    }

    if (intent.type === "showUnknownAreas") {
      await showEpistemicFog("unknown", "Epistemic Fog filtered to unknown, stale, heuristic, and runtime-unobserved areas.");
      return;
    }

    if (intent.type === "showUntestedAreas") {
      await showEpistemicFog("untested", "Epistemic Fog filtered to files without related tests.");
      return;
    }

    if (intent.type === "showRiskyAreas") {
      await showEpistemicFog("risky", "Epistemic Fog filtered to risky uncertainty markers.");
      return;
    }

    if (intent.type === "hideEpistemicFog") {
      clearObservabilityOverlays();
      appendTerminal("Epistemic Fog hidden.");
      return;
    }

    if (intent.type === "enterDiffTunnel" || intent.type === "showDiffTimeline") {
      await showDiffTunnel("current", "Diff Time Tunnel opened for current diff state.");
      return;
    }

    if (intent.type === "showPatchLineage") {
      await showDiffTunnel("patch-lineage", "Diff Time Tunnel showing agent patch lineage.");
      return;
    }

    if (intent.type === "compareAgentAttempts") {
      await showDiffTunnel("compare-attempts", "Diff Time Tunnel comparing recorded agent patch attempts.");
      return;
    }

    if (intent.type === "rewindPatch") {
      await showDiffTunnel("patch-lineage", "Patch rewind is read-only here. Select earlier tunnel slices to inspect lineage; no patch is applied or reverted.");
      return;
    }

    if (intent.type === "exitDiffTunnel") {
      clearObservabilityOverlays();
      appendTerminal("Diff Time Tunnel closed.");
      return;
    }

    if (intent.type === "showBlastRadius") {
      await showBlastRadiusFor(currentBlastRadiusTarget(), "Select a file or diff card first.");
      return;
    }

    if (intent.type === "showBlastRadiusForCurrentFile") {
      await showBlastRadiusFor(currentFilePath || selectedFilePath, "Select a file first.");
      return;
    }

    if (intent.type === "showBlastRadiusForCurrentDiff") {
      await showBlastRadiusFor(currentBlastRadiusTarget(true), "Select a diff card first.");
      return;
    }

    if (intent.type === "hideBlastRadius") {
      clearObservabilityOverlays();
      appendTerminal("Blast Radius Bubble hidden.");
      return;
    }

    if (intent.type === "showAgentContext") {
      const latestResult = agentResults[agentResults.length - 1];
      const latestRun = agentRuns[0];
      const runId = selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "";
      setObservabilityMode("context-lens");
      await refreshObservabilityGraph();
      await loadContextLens(runId);
      appendTerminal(runId ? `Context Lens loaded for ${runId}.` : "No agent run available yet. Create and run an agent task first.");
      return;
    }

    if (intent.type === "showMissingContext") {
      const latestResult = agentResults[agentResults.length - 1];
      const latestRun = agentRuns[0];
      const runId = selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "";
      setObservabilityMode("context-lens");
      expandContextLens("callers");
      expandContextLens("tests");
      await refreshObservabilityGraph();
      await loadContextLens(runId);
      appendTerminal(runId ? `Missing context highlighted for ${runId}.` : "No agent run available yet. Create and run an agent task first.");
      return;
    }

    if (intent.type === "hideContextLens") {
      clearObservabilityOverlays();
      appendTerminal("Context Lens hidden.");
      return;
    }

    if (intent.type === "expandContextToCallers") {
      if (!activeContextLens) {
        const latestResult = agentResults[agentResults.length - 1];
        const latestRun = agentRuns[0];
        await loadContextLens(selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "");
      }
      expandContextLens("callers");
      appendTerminal("Context Lens expanded to callers/importers.");
      return;
    }

    if (intent.type === "expandContextToTests") {
      if (!activeContextLens) {
        const latestResult = agentResults[agentResults.length - 1];
        const latestRun = agentRuns[0];
        await loadContextLens(selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "");
      }
      expandContextLens("tests");
      appendTerminal("Context Lens expanded to related tests.");
      return;
    }

    if (intent.type === "showAgentTopology") {
      const latestResult = agentResults[agentResults.length - 1];
      const latestRun = agentRuns[0];
      const runId = selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "";
      setObservabilityMode("agent-topology");
      setAgentTopologyFilter("all");
      await loadAgentTopology(runId);
      appendTerminal(
        useObservabilityStore.getState().activeAgentTopology
          ? "Agent topology loaded from observable workflow snapshots."
          : "No workflow run available yet."
      );
      return;
    }

    if (intent.type === "hideAgentTopology") {
      clearObservabilityOverlays();
      appendTerminal("Agent topology hidden.");
      return;
    }

    if (intent.type === "showFailedAgentSteps") {
      setObservabilityMode("agent-topology");
      setAgentTopologyFilter("failed");
      await loadAgentTopology(selectedAgentRunId || currentAgentTaskId || "");
      appendTerminal(
        useObservabilityStore.getState().activeAgentTopology
          ? "Agent topology filtered to failed or review-needed steps."
          : "No workflow run available yet."
      );
      return;
    }

    if (intent.type === "showTokenUsage") {
      setObservabilityMode("agent-topology");
      setAgentTopologyFilter("token-usage");
      await loadAgentTopology(selectedAgentRunId || currentAgentTaskId || "");
      appendTerminal(
        useObservabilityStore.getState().activeAgentTopology
          ? "Agent topology showing token usage where available."
          : "No workflow run available yet."
      );
      return;
    }

    if (intent.type === "showWhyAgentChangedThisFile") {
      if (!currentFilePath) {
        appendTerminal("No current file selected for agent change trace.");
        return;
      }
      setObservabilityMode("agent-topology");
      setAgentTopologyFilter("file-focus", currentFilePath);
      await loadAgentTopology(selectedAgentRunId || currentAgentTaskId || "");
      appendTerminal(
        useObservabilityStore.getState().activeAgentTopology
          ? `Agent topology focused on workflow steps touching ${currentFilePath}.`
          : "No workflow run available yet."
      );
      return;
    }

    if (intent.type === "setObservabilityMode") {
      if (intent.mode === "off") {
        clearObservabilityOverlays();
        appendTerminal("Observability overlays off.");
        return;
      }
      setObservabilityMode(intent.mode);
      await refreshObservabilityGraph();
      if (intent.mode === "context-lens") {
        const latestResult = agentResults[agentResults.length - 1];
        const latestRun = agentRuns[0];
        await loadContextLens(selectedAgentRunId || currentAgentTaskId || latestRun?.taskId || latestResult?.taskId || "");
      }
      if (intent.mode === "blast-radius") {
        await showBlastRadiusFor(currentBlastRadiusTarget(), "Select a file or diff card first.");
        return;
      }
      if (intent.mode === "trace-rivers") {
        await loadTraceRiver();
        appendTerminal(
          useObservabilityStore.getState().activeTraceRiver
            ? `Observability mode: ${intent.mode}.`
            : "No real trace available. Import a trace or run tests/lint when connected."
        );
        return;
      }
      if (intent.mode === "epistemic-fog") {
        setEpistemicFogFilter("all");
        appendTerminal("Observability mode: epistemic-fog.");
        return;
      }
      if (intent.mode === "diff-time-tunnel") {
        setDiffTunnelView("current");
        appendTerminal("Observability mode: diff-time-tunnel.");
        return;
      }
      if (intent.mode === "agent-topology") {
        await loadAgentTopology(selectedAgentRunId || currentAgentTaskId || "");
      }
      appendTerminal(`Observability mode: ${intent.mode}.`);
      return;
    }

    if (intent.type === "openFile") {
      await openFileByQuery(intent.query);
      return;
    }

    if (intent.type === "focusFile") {
      await focusFileByQuery(intent.query);
      return;
    }

    if (intent.type === "architectureView") {
      setSceneMode("architecture");
      return;
    }

    if (intent.type === "cockpitView") {
      setSceneMode("cockpit");
      return;
    }

    if (intent.type === "dependencyView") {
      setSceneMode("dependency");
      setVisibleDependencyMode("all");
      return;
    }

    if (intent.type === "agentView") {
      setSceneMode("agent");
      return;
    }

    if (intent.type === "errorTraceView") {
      setShowErrorPath(true);
      return;
    }

    if (intent.type === "showDependencies") {
      setGraphFocus("dependencies");
      setVisibleDependencyMode("outgoing");
      return;
    }

    if (intent.type === "hideDependencies") {
      setVisibleDependencyMode("hidden");
      return;
    }

    if (intent.type === "showCallers") {
      setGraphFocus("callers");
      setVisibleDependencyMode("incoming");
      return;
    }

    if (intent.type === "showTests") {
      setShowTests(true);
      return;
    }

    if (intent.type === "showFunctions") {
      appendTerminal("Function panel is showing symbols for the current file.");
      return;
    }

    if (intent.type === "pinFunction") {
      pinFunctionByQuery(intent.query);
      return;
    }

    if (intent.type === "createAgentTask") {
      await createAgentTask();
      return;
    }

    if (intent.type === "openRelatedTests") {
      await openRelatedTests();
      return;
    }

    if (intent.type === "openCallers") {
      await openCallerPanels();
      return;
    }

    if (intent.type === "openImports") {
      await openImportPanels();
      return;
    }

    if (intent.type === "compareWithDiff") {
      await compareWithDiff();
      return;
    }

    if (intent.type === "closeOtherPanels") {
      closeOtherPanels();
      return;
    }

    if (intent.type === "arrangeSourceAndTest") {
      await arrangeSourceAndTest();
      return;
    }

    if (intent.type === "currentFileOnly") {
      setGraphScopeFilter("current-file");
      return;
    }

    if (intent.type === "currentModuleOnly") {
      setGraphScopeFilter("current-module");
      return;
    }

    if (intent.type === "showAllFiles") {
      setGraphScopeFilter("all");
      setShowChangedFilesOnly(false);
      setShowDiagnosticsOnly(false);
      return;
    }

    if (intent.type === "showChangedFilesOnly") {
      setShowChangedFilesOnly(true);
      return;
    }

    if (intent.type === "showDiagnosticsOnly") {
      setShowDiagnosticsOnly(true);
      return;
    }

    if (intent.type === "hideFunctions") {
      setShowFunctions(false);
      return;
    }

    if (intent.type === "showExternalPackages") {
      setShowExternalPackages(true);
      return;
    }

    if (intent.type === "hideExternalPackages") {
      setShowExternalPackages(false);
      return;
    }

    if (intent.type === "runAgentTask") {
      const latest = agentResults[agentResults.length - 1];
      const taskId = intent.taskId || currentAgentTaskId || latest?.taskId;
      if (!taskId) {
        appendTerminal("No agent task exists yet. Run create agent task first.");
        return;
      }
      await runAgentTask(taskId);
      return;
    }

    if (intent.type === "runTests") {
      await runCommand("test");
      return;
    }

    if (intent.type === "showDiff") {
      await useWorkspaceStore.getState().refreshGitState();
      await refreshAgentResults();
      showFirstDiff();
      return;
    }

    if (intent.type === "showDiagnostics") {
      await showDiagnostics();
      return;
    }

    if (intent.type === "goToDefinition") {
      await goToDefinitionAtCursor();
      return;
    }

    if (intent.type === "findReferences") {
      await findReferencesAtCursor();
      return;
    }

    if (intent.type === "debugCurrentFile") {
      await startDebugCurrentFile();
      return;
    }

    if (intent.type === "addBreakpoint") {
      await addBreakpointAtCursor();
      return;
    }

    if (intent.type === "removeBreakpoint") {
      await removeBreakpointAtCursor();
      return;
    }

    if (intent.type === "stepOver") {
      await stepOver();
      return;
    }

    if (intent.type === "stepInto") {
      await stepInto();
      return;
    }

    if (intent.type === "continueDebug") {
      await continueDebug();
      return;
    }

    if (intent.type === "showVariables") {
      showVariables();
      return;
    }

    if (intent.type === "gitStatus") {
      await useWorkspaceStore.getState().refreshGitStatus();
      return;
    }

    if (intent.type === "saveFile") {
      await saveCurrentFile();
      return;
    }

    if (intent.type === "saveWorkspace") {
      await saveWorkspace();
      return;
    }

    if (intent.type === "restoreWorkspace") {
      await restoreWorkspace();
      return;
    }

    if (intent.type === "resetWorkspace") {
      await resetWorkspace();
      return;
    }

    if (intent.type === "resetLayout") {
      resetLayout();
      return;
    }

    appendTerminal(`Unknown command: ${intent.transcript}`);
  }

  function submitCommand(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setInput("");
    void dispatch(parseCommandIntent(trimmed), trimmed);
  }

  function startListening() {
    if (!speechRecognition) {
      appendTerminal("SpeechRecognition is not available in this browser. Use text command input.");
      return;
    }

    const recognition = new speechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript || "";
      setInput(transcript);
      submitCommand(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  return (
    <form
      className="voice-command-bar"
      onSubmit={(event) => {
        event.preventDefault();
        submitCommand(input);
      }}
    >
      <Button
        type="button"
        title={speechRecognition ? "Start voice command" : "Voice unavailable"}
        icon={isListening ? <MicOff size={17} /> : <Mic size={17} />}
        variant={isListening ? "primary" : "ghost"}
        onClick={startListening}
      />
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder='Try "architecture view", "focus file SceneManager", "show dependencies"'
      />
      <Button type="submit" title="Dispatch command" icon={<SendHorizontal size={17} />} variant="primary" />
    </form>
  );
}
