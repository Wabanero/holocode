import { Html } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import {
  buildEpistemicScores,
  filterEpistemicScores,
  sortEpistemicScores,
  summarizeEpistemicScores,
  type EpistemicScore
} from "../../../observability/epistemicScoring";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import type { SceneFile, SceneLayout3D } from "../../layout/layout3d";
import { EpistemicFogVolume } from "./EpistemicFogVolume";
import { EpistemicLegend3D } from "./EpistemicLegend3D";
import { EpistemicRiskBadge } from "./EpistemicRiskBadge";

const VOLUMETRIC_CAP = 58;
const BADGE_CAP = 240;

function selectedFilePathFromId(selectedFileId: string | null) {
  return selectedFileId?.startsWith("file:") ? selectedFileId.slice("file:".length) : null;
}

function fileScoreVisible(score: EpistemicScore, visibleFileIds: Set<string>, focusedNodeIds: Set<string>) {
  return visibleFileIds.has(score.nodeId) || focusedNodeIds.has(score.nodeId);
}

function shouldRenderVolume(score: EpistemicScore, focusedNodeIds: Set<string>) {
  if (focusedNodeIds.has(score.nodeId)) return true;
  if (score.category === "validated") return false;
  if (score.category === "heuristic_only" || score.category === "stale_observability") return score.severity >= 38;
  return score.severity >= 46;
}

function explanationLine(score: EpistemicScore) {
  const reasons = score.reasons.slice(0, 3).map((reason) => reason.message).join(" | ");
  return `Epistemic Fog: ${score.path} -> ${score.category}. ${reasons}`;
}

export function EpistemicFog3D({ layout, visibleFileIds }: { layout: SceneLayout3D; visibleFileIds: Set<string> }) {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const observabilityGraph = useObservabilityStore((state) => state.observabilityGraph);
  const refreshObservabilityGraph = useObservabilityStore((state) => state.refreshObservabilityGraph);
  const isObservabilityLoading = useObservabilityStore((state) => state.isObservabilityLoading);
  const activeContextLens = useObservabilityStore((state) => state.activeContextLens);
  const activeTraceRiver = useObservabilityStore((state) => state.activeTraceRiver);
  const epistemicFogFilter = useObservabilityStore((state) => state.epistemicFogFilter);
  const setEpistemicFogFilter = useObservabilityStore((state) => state.setEpistemicFogFilter);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const lastRefreshAt = useObservabilityStore((state) => state.lastRefreshAt);
  const graph = useWorkspaceStore((state) => state.graph);
  const diagnostics = useWorkspaceStore((state) => state.diagnosticSummary);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const selectedFileId = useWorkspaceStore((state) => state.selectedFileId);
  const currentFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);

  const visible = activeObservabilityMode === "epistemic-fog";
  const filesByPath = useMemo(() => new Map(layout.files.map((file) => [file.path, file])), [layout.files]);
  const selectedFilePath = selectedFilePathFromId(selectedFileId);
  const focusedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedFileId) ids.add(selectedFileId);
    if (currentFilePath) ids.add(`file:${currentFilePath}`);
    if (selectedFilePath) ids.add(`file:${selectedFilePath}`);
    if (debugActiveFrame?.path) ids.add(`file:${debugActiveFrame.path}`);
    return ids;
  }, [currentFilePath, debugActiveFrame?.path, selectedFileId, selectedFilePath]);

  useEffect(() => {
    if (!visible || observabilityGraph || isObservabilityLoading) return;
    void refreshObservabilityGraph();
  }, [isObservabilityLoading, observabilityGraph, refreshObservabilityGraph, visible]);

  const allScores = useMemo(
    () =>
      buildEpistemicScores({
        files: layout.files,
        graph,
        observabilityGraph,
        diagnostics,
        diffSummary,
        agentRuns,
        activeContextLens,
        activeTraceRiver,
        debugActiveFrame,
        lastRefreshAt
      }),
    [
      activeContextLens,
      activeTraceRiver,
      agentRuns,
      debugActiveFrame,
      diagnostics,
      diffSummary,
      graph,
      lastRefreshAt,
      layout.files,
      observabilityGraph
    ]
  );

  const counts = useMemo(() => summarizeEpistemicScores(allScores), [allScores]);
  const filteredScores = useMemo(
    () => sortEpistemicScores(filterEpistemicScores(allScores, epistemicFogFilter)),
    [allScores, epistemicFogFilter]
  );
  const visibleScores = useMemo(() => {
    const visibleCandidates = filteredScores.filter((score) => fileScoreVisible(score, visibleFileIds, focusedNodeIds));
    return (visibleCandidates.length ? visibleCandidates : filteredScores).slice(0, BADGE_CAP);
  }, [filteredScores, focusedNodeIds, visibleFileIds]);
  const volumeScores = useMemo(
    () => visibleScores.filter((score) => shouldRenderVolume(score, focusedNodeIds)).slice(0, VOLUMETRIC_CAP),
    [focusedNodeIds, visibleScores]
  );
  const hiddenCount = Math.max(0, filteredScores.length - visibleScores.length);
  const runtimeObserved = Boolean(activeTraceRiver && !activeTraceRiver.isDemo);

  if (!visible) return null;

  function explain(score: EpistemicScore) {
    focusFile(score.path);
    appendTerminal(explanationLine(score));
  }

  function fileFor(score: EpistemicScore): SceneFile | null {
    return filesByPath.get(score.path) || null;
  }

  return (
    <group>
      {layout.files.length ? (
        <>
          {volumeScores.map((score) => {
            const file = fileFor(score);
            return file ? (
              <EpistemicFogVolume
                key={`fog-${score.nodeId}`}
                position={file.position}
                height={file.height}
                category={score.category}
                severity={score.severity}
                selected={focusedNodeIds.has(score.nodeId)}
              />
            ) : null;
          })}
          {visibleScores
            .filter((score) => score.category !== "validated")
            .map((score) => {
              const file = fileFor(score);
              return file ? (
                <EpistemicRiskBadge
                  key={`epistemic-badge-${score.nodeId}`}
                  score={score}
                  position={file.position}
                  height={file.height}
                  compact={!focusedNodeIds.has(score.nodeId) && score.severity < 60}
                  onExplain={explain}
                />
              ) : null;
            })}
        </>
      ) : (
        <Html center position={[0, 2.1, -2.35]} className="scene-html epistemic-empty">
          <strong>{isObservabilityLoading ? "Loading observability graph..." : "No code graph loaded."}</strong>
          <span>Epistemic Fog needs the existing scanner graph before it can score uncertainty.</span>
        </Html>
      )}

      <EpistemicLegend3D
        counts={counts}
        filter={epistemicFogFilter}
        visibleCount={visibleScores.length}
        hiddenCount={hiddenCount}
        runtimeObserved={runtimeObserved}
        onFilter={setEpistemicFogFilter}
        onHide={() => {
          appendTerminal("Epistemic Fog hidden.");
          clearObservabilityOverlays();
        }}
      />
    </group>
  );
}
