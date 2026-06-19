import type { CommandIntent } from "../types";
import type { ObservabilityViewMode } from "../observability/observabilityTypes";

export function normalizeTranscript(transcript: string) {
  return transcript.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseCommandIntent(transcript: string): CommandIntent {
  const normalized = normalizeTranscript(transcript);

  if (!normalized) {
    return { type: "unknown", transcript };
  }

  if (normalized === "show agent context" || normalized === "show context lens") {
    return { type: "showAgentContext" };
  }

  if (normalized === "show blast radius" || normalized === "show impact radius") {
    return { type: "showBlastRadius" };
  }

  if (normalized === "show trace rivers") {
    return { type: "showTraceRivers" };
  }

  if (normalized === "show latest trace") {
    return { type: "showLatestTrace" };
  }

  if (normalized === "follow failing trace") {
    return { type: "followFailingTrace" };
  }

  if (normalized === "show unmapped spans") {
    return { type: "showUnmappedSpans" };
  }

  if (normalized === "hide trace rivers") {
    return { type: "hideTraceRivers" };
  }

  if (normalized === "compare traces before after" || normalized === "compare traces before and after") {
    return { type: "compareTracesBeforeAfter" };
  }

  if (normalized === "show epistemic fog") {
    return { type: "showEpistemicFog" };
  }

  if (normalized === "show unknown areas") {
    return { type: "showUnknownAreas" };
  }

  if (normalized === "show untested areas") {
    return { type: "showUntestedAreas" };
  }

  if (normalized === "show risky areas") {
    return { type: "showRiskyAreas" };
  }

  if (normalized === "hide epistemic fog" || normalized === "hide unknown areas" || normalized === "hide risky areas") {
    return { type: "hideEpistemicFog" };
  }

  if (normalized === "enter diff tunnel") {
    return { type: "enterDiffTunnel" };
  }

  if (normalized === "show diff timeline") {
    return { type: "showDiffTimeline" };
  }

  if (normalized === "show patch lineage") {
    return { type: "showPatchLineage" };
  }

  if (normalized === "compare agent attempts") {
    return { type: "compareAgentAttempts" };
  }

  if (normalized === "rewind patch") {
    return { type: "rewindPatch" };
  }

  if (normalized === "exit diff tunnel" || normalized === "hide diff tunnel") {
    return { type: "exitDiffTunnel" };
  }

  if (normalized === "show blast radius for current file" || normalized === "show impact radius for current file") {
    return { type: "showBlastRadiusForCurrentFile" };
  }

  if (normalized === "show blast radius for current diff" || normalized === "show impact radius for current diff") {
    return { type: "showBlastRadiusForCurrentDiff" };
  }

  if (normalized === "hide blast radius" || normalized === "hide impact radius") {
    return { type: "hideBlastRadius" };
  }

  if (normalized === "show agent topology" || normalized === "show agent workflow") {
    return { type: "showAgentTopology" };
  }

  if (normalized === "hide agent topology" || normalized === "hide agent workflow") {
    return { type: "hideAgentTopology" };
  }

  if (normalized === "show failed agent steps" || normalized === "show failed workflow steps") {
    return { type: "showFailedAgentSteps" };
  }

  if (normalized === "show token usage" || normalized === "show agent token usage") {
    return { type: "showTokenUsage" };
  }

  if (normalized === "show why agent changed this file" || normalized === "why did agent change this file") {
    return { type: "showWhyAgentChangedThisFile" };
  }

  if (normalized === "show missing context") {
    return { type: "showMissingContext" };
  }

  if (normalized === "hide context lens" || normalized === "hide agent context") {
    return { type: "hideContextLens" };
  }

  if (normalized === "expand context to callers" || normalized === "expand context callers") {
    return { type: "expandContextToCallers" };
  }

  if (normalized === "expand context to tests" || normalized === "expand context tests") {
    return { type: "expandContextToTests" };
  }

  const observabilityMode = parseObservabilityMode(normalized);
  if (observabilityMode) {
    return { type: "setObservabilityMode", mode: observabilityMode };
  }

  if (normalized.startsWith("open file ")) {
    return { type: "openFile", query: normalized.replace("open file ", "") };
  }

  if (normalized.startsWith("focus file ")) {
    return { type: "focusFile", query: normalized.replace("focus file ", "") };
  }

  if (normalized === "architecture view" || normalized === "show architecture") {
    return { type: "architectureView" };
  }

  if (normalized === "cockpit view" || normalized === "focus mode") {
    return { type: "cockpitView" };
  }

  if (normalized === "dependency view") {
    return { type: "dependencyView" };
  }

  if (normalized === "agent view") {
    return { type: "agentView" };
  }

  if (normalized === "debug mode" || normalized === "debug view") {
    return { type: "debugCurrentFile" };
  }

  if (normalized === "error trace view" || normalized === "show error path") {
    return { type: "errorTraceView" };
  }

  if (normalized === "hide dependencies") {
    return { type: "hideDependencies" };
  }

  if (normalized === "show dependencies" || normalized.includes("dependencies")) {
    return { type: "showDependencies" };
  }

  if (normalized === "show callers" || normalized.includes("callers")) {
    return { type: "showCallers" };
  }

  if (normalized === "run tests" || normalized.includes("run test")) {
    return { type: "runTests" };
  }

  if (normalized === "show functions" || normalized.includes("functions")) {
    return { type: "showFunctions" };
  }

  if (normalized.startsWith("pin function ")) {
    return { type: "pinFunction", query: normalized.replace("pin function ", "") };
  }

  if (normalized === "open related tests" || normalized === "open test" || normalized === "open tests") {
    return { type: "openRelatedTests" };
  }

  if (normalized === "open callers" || normalized === "open caller files") {
    return { type: "openCallers" };
  }

  if (normalized === "open imports" || normalized === "open imported files" || normalized === "open callees") {
    return { type: "openImports" };
  }

  if (normalized === "compare with diff" || normalized === "diff review" || normalized === "open diff panel") {
    return { type: "compareWithDiff" };
  }

  if (normalized === "close other panels" || normalized === "close others") {
    return { type: "closeOtherPanels" };
  }

  if (normalized === "arrange source and test" || normalized === "source test layout") {
    return { type: "arrangeSourceAndTest" };
  }

  if (normalized === "current file only" || normalized === "show current file only") {
    return { type: "currentFileOnly" };
  }

  if (normalized === "current module only" || normalized === "show current module only") {
    return { type: "currentModuleOnly" };
  }

  if (normalized === "show all files" || normalized === "clear graph filters") {
    return { type: "showAllFiles" };
  }

  if (normalized === "show changed files only" || normalized === "changed files only") {
    return { type: "showChangedFilesOnly" };
  }

  if (normalized === "show diagnostics only" || normalized === "diagnostics only") {
    return { type: "showDiagnosticsOnly" };
  }

  if (normalized === "hide functions") {
    return { type: "hideFunctions" };
  }

  if (normalized === "show external packages" || normalized === "show packages") {
    return { type: "showExternalPackages" };
  }

  if (normalized === "hide external packages" || normalized === "hide packages") {
    return { type: "hideExternalPackages" };
  }

  if (normalized === "run agent" || normalized === "run latest agent" || normalized === "run agent task") {
    return { type: "runAgentTask" };
  }

  if (normalized.startsWith("run task ")) {
    const suffix = normalized.replace("run task ", "").trim().replace(/^task_?/, "");
    const digits = suffix.match(/\d+/)?.[0];
    return { type: "runAgentTask", taskId: digits ? `task_${digits.padStart(3, "0")}` : undefined };
  }

  if (normalized.includes("create agent task") || normalized === "agent task" || normalized === "new agent task") {
    return { type: "createAgentTask" };
  }

  if (normalized === "show tests" || normalized.includes("tests")) {
    return { type: "showTests" };
  }

  if (normalized === "show diff" || normalized.includes("diff")) {
    return { type: "showDiff" };
  }

  if (normalized === "show errors" || normalized === "show diagnostics" || normalized.includes("diagnostics")) {
    return { type: "showDiagnostics" };
  }

  if (normalized === "go to definition" || normalized === "definition") {
    return { type: "goToDefinition" };
  }

  if (normalized === "find references" || normalized === "show references" || normalized.includes("references")) {
    return { type: "findReferences" };
  }

  if (normalized === "debug current file" || normalized === "start debugging" || normalized === "debug") {
    return { type: "debugCurrentFile" };
  }

  if (normalized === "add breakpoint" || normalized === "set breakpoint") {
    return { type: "addBreakpoint" };
  }

  if (normalized === "remove breakpoint" || normalized === "clear breakpoint") {
    return { type: "removeBreakpoint" };
  }

  if (normalized === "step over") {
    return { type: "stepOver" };
  }

  if (normalized === "step into") {
    return { type: "stepInto" };
  }

  if (normalized === "continue" || normalized === "continue debugging") {
    return { type: "continueDebug" };
  }

  if (normalized === "show variables" || normalized === "debug variables") {
    return { type: "showVariables" };
  }

  if (normalized === "git status" || normalized === "status") {
    return { type: "gitStatus" };
  }

  if (normalized === "save file" || normalized === "save") {
    return { type: "saveFile" };
  }

  if (normalized === "save workspace") {
    return { type: "saveWorkspace" };
  }

  if (normalized === "restore workspace") {
    return { type: "restoreWorkspace" };
  }

  if (normalized === "reset workspace") {
    return { type: "resetWorkspace" };
  }

  if (normalized === "reset layout" || normalized === "reset camera") {
    return { type: "resetLayout" };
  }

  return { type: "unknown", transcript };
}

function parseObservabilityMode(normalized: string): ObservabilityViewMode | null {
  const compact = normalized.replace(/^show /, "").replace(/^set /, "").replace(/^enable /, "");
  const cleaned = compact.replace(/^observability\s+(mode\s+)?/, "").replace(/\s+mode$/, "");
  if (cleaned === "observability off" || cleaned === "clear observability" || cleaned === "hide observability") return "off";
  if (cleaned === "off") return normalized.includes("observability") ? "off" : null;
  if (cleaned === "overview" || cleaned === "observability") return "overview";
  if (cleaned === "blast radius" || cleaned === "blast-radius") return "blast-radius";
  if (cleaned === "context lens" || cleaned === "context-lens" || cleaned === "llm context lens") return "context-lens";
  if (cleaned === "agent topology" || cleaned === "agent thought topology" || cleaned === "agent-topology") return "agent-topology";
  if (cleaned === "trace rivers" || cleaned === "trace-rivers") return "trace-rivers";
  if (cleaned === "epistemic fog" || cleaned === "epistemic-fog") return "epistemic-fog";
  if (cleaned === "diff time tunnel" || cleaned === "diff-time-tunnel") return "diff-time-tunnel";
  if (cleaned === "watchpoints" || cleaned === "spatial watchpoints") return "watchpoints";
  return null;
}
