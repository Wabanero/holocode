import { Html } from "@react-three/drei";
import { useMemo } from "react";
import type { BlastRadiusResult } from "../../../observability/observabilityTypes";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import type { CodeNode, LspFileSummary } from "../../../types";
import type { SceneLayout3D, Vec3 } from "../../layout/layout3d";
import { BlastLayerShell } from "./BlastLayerShell";
import { BlastRadiusLegend3D, type BlastRadiusLegendCounts } from "./BlastRadiusLegend3D";
import { BlastRiskMarker, type BlastMarkerKind } from "./BlastRiskMarker";

type ExtendedBlastRadius = BlastRadiusResult & {
  seedPath?: string;
  affectedSymbols?: string[];
  imports?: string[];
  importers?: string[];
  depthByNodeId?: Record<string, number>;
};

type BlastMarker = {
  id: string;
  path: string;
  position: Vec3;
  kind: BlastMarkerKind;
  layer: number;
  reason: string;
};

const INDIRECT_NODE_CAP = 70;
const SIGNAL_MARKER_CAP = 80;

function fileId(path: string) {
  return `file:${path}`;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function distance(a: Vec3, b: Vec3) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function clampRadius(value: number) {
  return Math.max(0.72, Math.min(9.2, value));
}

function isTestPath(path: string) {
  return path.startsWith("tests/") || path.includes(".test.") || path.includes(".spec.");
}

function severityLabel(summary: LspFileSummary | undefined) {
  if (!summary) return "diagnostic";
  if (summary.errors) return `${summary.errors} TypeScript error${summary.errors === 1 ? "" : "s"}`;
  if (summary.warnings) return `${summary.warnings} TypeScript warning${summary.warnings === 1 ? "" : "s"}`;
  return "TypeScript diagnostic";
}

function nodeForPath(nodesByPath: Map<string, CodeNode>, path: string) {
  return nodesByPath.get(path) || null;
}

function positionForPath(layout: SceneLayout3D, path: string): Vec3 | null {
  return layout.files.find((file) => file.path === path)?.position || layout.tests.find((file) => file.path === path)?.position || null;
}

function positionForSymbol(layout: SceneLayout3D, symbolId: string): Vec3 | null {
  return layout.symbols.find((symbol) => symbol.id === symbolId)?.position || null;
}

function maxDistanceFrom(center: Vec3, markers: BlastMarker[]) {
  return markers.reduce((max, marker) => Math.max(max, distance(center, marker.position)), 0);
}

function applyDepthFilter(markers: BlastMarker[], depthLimit: number | null) {
  const limit = depthLimit || 4;
  return markers.filter((marker) => marker.layer <= limit);
}

function makeDirectReason(path: string, imports: Set<string>, importers: Set<string>) {
  if (imports.has(path) && importers.has(path)) return "Direct import and importer of the selected target.";
  if (imports.has(path)) return "Direct import used by the selected target.";
  if (importers.has(path)) return "Direct importer that depends on the selected target.";
  return "Direct graph neighbor of the selected target.";
}

export function BlastRadiusBubble3D({ layout }: { layout: SceneLayout3D }) {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const activeBlastRadius = useObservabilityStore((state) => state.activeBlastRadius as ExtendedBlastRadius | null);
  const blastRadiusDepthLimit = useObservabilityStore((state) => state.blastRadiusDepthLimit);
  const setBlastRadiusDepthLimit = useObservabilityStore((state) => state.setBlastRadiusDepthLimit);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const isObservabilityLoading = useObservabilityStore((state) => state.isObservabilityLoading);
  const observabilityError = useObservabilityStore((state) => state.observabilityError);
  const graph = useWorkspaceStore((state) => state.graph);
  const diagnostics = useWorkspaceStore((state) => state.diagnosticSummary);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);
  const selectedFunctionId = useWorkspaceStore((state) => state.selectedFunctionId);

  const visible = activeObservabilityMode === "blast-radius";
  const nodesById = useMemo(() => new Map((graph?.nodes || []).map((node) => [node.id, node])), [graph]);
  const nodesByPath = useMemo(() => new Map((graph?.nodes || []).filter((node) => node.path).map((node) => [node.path, node])), [graph]);

  const bubble = useMemo(() => {
    if (!activeBlastRadius) return null;

    const seedPaths = unique([...(activeBlastRadius.seedPaths || []), activeBlastRadius.seedPath || ""].filter(Boolean));
    const seedPath = seedPaths[0] || null;
    const seedPosition = seedPath ? positionForPath(layout, seedPath) : null;
    const selectedSymbolPosition = selectedFunctionId ? positionForSymbol(layout, selectedFunctionId) : null;
    const center = selectedSymbolPosition || seedPosition || ([0, 1.05, -2.2] as Vec3);
    const imports = new Set(activeBlastRadius.imports || []);
    const importers = new Set(activeBlastRadius.importers || []);
    const seedSet = new Set(seedPaths);
    const testSet = new Set(activeBlastRadius.affectedTestPaths || []);
    const affectedSet = new Set(activeBlastRadius.affectedPaths || []);
    const directSet = new Set([...imports, ...importers].filter((path) => !seedSet.has(path)));

    if (!directSet.size && seedPath) {
      for (const edge of graph?.edges || []) {
        if (edge.type !== "imports") continue;
        if (edge.source === fileId(seedPath)) {
          const target = nodesById.get(edge.target);
          if (target?.path) directSet.add(target.path);
        }
        if (edge.target === fileId(seedPath)) {
          const source = nodesById.get(edge.source);
          if (source?.path) directSet.add(source.path);
        }
      }
    }

    const depthByPath = new Map<string, number>();
    for (const [nodeId, depth] of Object.entries(activeBlastRadius.depthByNodeId || {})) {
      const node = nodesById.get(nodeId);
      if (node?.path) depthByPath.set(node.path, depth);
    }

    const indirectPaths = [...affectedSet]
      .filter((path) => !seedSet.has(path) && !directSet.has(path) && !testSet.has(path))
      .sort((a, b) => (depthByPath.get(a) || 9) - (depthByPath.get(b) || 9))
      .slice(0, INDIRECT_NODE_CAP);
    const hiddenIndirect = Math.max(0, affectedSet.size - seedSet.size - directSet.size - testSet.size - indirectPaths.length);

    const markers: BlastMarker[] = [];
    for (const path of seedPaths) {
      const position = positionForPath(layout, path);
      if (position) {
        markers.push({ id: `core:${path}`, path, position, kind: "core", layer: 1, reason: "Selected blast radius target." });
      }
    }
    if (selectedFunctionId && seedPath) {
      const position = selectedSymbolPosition;
      if (position) {
        markers.push({ id: `core-symbol:${selectedFunctionId}`, path: seedPath, position, kind: "core", layer: 1, reason: "Selected symbol inside the target file." });
      }
    }
    for (const path of [...directSet].slice(0, 80)) {
      const position = positionForPath(layout, path);
      if (position) {
        markers.push({ id: `direct:${path}`, path, position, kind: "direct", layer: 2, reason: makeDirectReason(path, imports, importers) });
      }
    }
    for (const path of [...testSet].slice(0, 36)) {
      const position = positionForPath(layout, path);
      if (position) {
        markers.push({ id: `test:${path}`, path, position, kind: "test", layer: 3, reason: "Related test from scanner metadata." });
      }
    }
    for (const path of indirectPaths) {
      const position = positionForPath(layout, path);
      if (position) {
        markers.push({
          id: `indirect:${path}`,
          path,
          position,
          kind: "indirect",
          layer: 3,
          reason: `Reverse dependency chain depth ${depthByPath.get(path) || "unknown"}.`
        });
      }
    }

    const candidatePaths = new Set([...seedSet, ...directSet, ...testSet, ...indirectPaths]);
    const diagnosticByPath = new Map(diagnostics.map((summary) => [summary.path, summary]));
    const changedByPath = new Map(diffSummary.map((file) => [file.path, file]));
    const agentTouched = new Set(agentRuns.flatMap((run) => run.touchedFiles));
    const debugPath = debugActiveFrame?.path || null;
    const signalMarkers: BlastMarker[] = [];

    for (const path of candidatePaths) {
      const position = positionForPath(layout, path);
      if (!position) continue;
      const diagnostic = diagnosticByPath.get(path);
      const changed = changedByPath.get(path);
      const node = nodeForPath(nodesByPath, path);
      const missingTests = node && node.kind === "file" && !isTestPath(path) && !(node.relatedTests || []).length;
      if (diagnostic) {
        signalMarkers.push({ id: `diagnostic:${path}`, path, position, kind: "diagnostic", layer: 4, reason: severityLabel(diagnostic) });
      }
      if (changed) {
        signalMarkers.push({
          id: `changed:${path}`,
          path,
          position,
          kind: "changed",
          layer: 4,
          reason: `Git ${changed.status}: +${changed.additions} -${changed.deletions}.`
        });
      }
      if (agentTouched.has(path)) {
        signalMarkers.push({ id: `agent:${path}`, path, position, kind: "agent", layer: 4, reason: "Touched by an agent run snapshot." });
      }
      if (debugPath === path) {
        signalMarkers.push({ id: `debug:${path}`, path, position, kind: "debug", layer: 4, reason: "Currently active debug/error frame overlaps this file." });
      }
      if (missingTests) {
        signalMarkers.push({ id: `missing-test:${path}`, path, position, kind: "missing-test", layer: 4, reason: "No related tests are recorded for this impacted file." });
      }
    }

    const cappedSignalMarkers = signalMarkers.slice(0, SIGNAL_MARKER_CAP);
    const allMarkers = [...markers, ...cappedSignalMarkers];
    const layer1 = markers.filter((marker) => marker.layer === 1);
    const layer2 = markers.filter((marker) => marker.layer === 2);
    const layer3 = markers.filter((marker) => marker.layer === 3);
    const layer4 = cappedSignalMarkers;
    const r1 = clampRadius(Math.max(0.72, maxDistanceFrom(center, layer1) + 0.72));
    const r2 = clampRadius(Math.max(r1 + 0.48, maxDistanceFrom(center, layer2) + 0.62));
    const r3 = clampRadius(Math.max(r2 + 0.48, maxDistanceFrom(center, layer3) + 0.72));
    const r4 = clampRadius(Math.max(r3 + 0.4, maxDistanceFrom(center, layer4) + 0.9));

    return {
      targetPath: seedPath,
      center,
      markers: allMarkers,
      radii: [r1, r2, r3, r4] as const,
      heuristic: activeBlastRadius.confidence !== "verified" || Boolean(activeBlastRadius.missingSources.length),
      counts: {
        core: layer1.length,
        direct: layer2.length,
        indirect: indirectPaths.length,
        tests: layer3.filter((marker) => marker.kind === "test").length,
        signals: cappedSignalMarkers.filter((marker) => marker.kind !== "missing-test").length,
        missingTests: cappedSignalMarkers.filter((marker) => marker.kind === "missing-test").length,
        hidden: hiddenIndirect + Math.max(0, signalMarkers.length - cappedSignalMarkers.length)
      } satisfies BlastRadiusLegendCounts
    };
  }, [activeBlastRadius, agentRuns, debugActiveFrame?.path, diagnostics, diffSummary, graph?.edges, layout, nodesById, nodesByPath, selectedFunctionId]);

  if (!visible) return null;

  const visibleMarkers = bubble ? applyDepthFilter(bubble.markers, blastRadiusDepthLimit) : [];
  const layerActive = (depth: number) => !blastRadiusDepthLimit || depth <= blastRadiusDepthLimit;

  return (
    <group>
      {bubble ? (
        <group>
          <BlastLayerShell
            center={bubble.center}
            radius={bubble.radii[0]}
            depth={1}
            label="L1 target"
            color="#d8fff4"
            active={layerActive(1)}
            onClick={setBlastRadiusDepthLimit}
          />
          <BlastLayerShell
            center={bubble.center}
            radius={bubble.radii[1]}
            depth={2}
            label="L2 imports/importers"
            color="#6db7ff"
            active={layerActive(2)}
            heuristic={bubble.heuristic}
            onClick={setBlastRadiusDepthLimit}
          />
          <BlastLayerShell
            center={bubble.center}
            radius={bubble.radii[2]}
            depth={3}
            label="L3 tests/reverse chain"
            color="#a7d36f"
            active={layerActive(3)}
            cracked={bubble.counts.missingTests > 0}
            heuristic={bubble.heuristic}
            onClick={setBlastRadiusDepthLimit}
          />
          <BlastLayerShell
            center={bubble.center}
            radius={bubble.radii[3]}
            depth={4}
            label="L4 live signals"
            color="#f2be5c"
            active={layerActive(4)}
            cracked={bubble.counts.missingTests > 0}
            heuristic={bubble.heuristic}
            onClick={setBlastRadiusDepthLimit}
          />
          {visibleMarkers.map((marker) => (
            <BlastRiskMarker
              key={marker.id}
              position={marker.position}
              path={marker.path}
              kind={marker.kind}
              reason={marker.reason}
              layer={marker.layer}
              onOpen={(path) => {
                focusFile(path);
                void openFile(path);
              }}
            />
          ))}
        </group>
      ) : (
        <Html center position={[0, 2.05, -2.35]} className="scene-html blast-radius-empty">
          <strong>{isObservabilityLoading ? "Loading blast radius..." : "Select a file or diff card first."}</strong>
          <span>{observabilityError || "Use a selected file or active diff card as the target."}</span>
        </Html>
      )}

      <BlastRadiusLegend3D
        targetPath={bubble?.targetPath || null}
        counts={
          bubble?.counts || {
            core: 0,
            direct: 0,
            indirect: 0,
            tests: 0,
            signals: 0,
            missingTests: 0,
            hidden: 0
          }
        }
        depthLimit={blastRadiusDepthLimit}
        heuristic={Boolean(bubble?.heuristic)}
        onDepth={setBlastRadiusDepthLimit}
        onReset={() => setBlastRadiusDepthLimit(null)}
        onHide={() => {
          appendTerminal("Blast Radius Bubble hidden.");
          clearObservabilityOverlays();
        }}
      />
    </group>
  );
}
