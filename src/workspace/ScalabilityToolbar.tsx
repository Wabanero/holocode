import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { fileNodeId } from "../graph/selectors";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import type { CodeNode, GraphScopeFilter, WorldDetailLevel } from "../types";

type SearchScope = "files" | "symbols" | "packages";

function fuzzyScore(query: string, value: string) {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const v = value.toLowerCase();
  if (!q) return 0;
  if (v.includes(q)) return 1000 - v.indexOf(q);
  let qi = 0;
  let score = 0;
  for (let vi = 0; vi < v.length && qi < q.length; vi += 1) {
    if (v[vi] === q[qi]) {
      score += 12 - Math.min(10, vi);
      qi += 1;
    }
  }
  return qi === q.length ? score : -1;
}

function searchNodes(nodes: CodeNode[], query: string, scope: SearchScope) {
  const filtered = nodes.filter((node) => {
    if (scope === "files") return node.kind === "file";
    if (scope === "symbols") return node.kind === "function" || node.kind === "class";
    return node.kind === "external";
  });
  return filtered
    .map((node) => ({ node, score: fuzzyScore(query, `${node.path} ${node.name}`) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => item.node);
}

export function ScalabilityToolbar() {
  const graph = useWorkspaceStore((state) => state.graph);
  const worldDetail = useWorkspaceStore((state) => state.worldDetail);
  const graphScopeFilter = useWorkspaceStore((state) => state.graphScopeFilter);
  const showExternalPackages = useWorkspaceStore((state) => state.showExternalPackages);
  const showTests = useWorkspaceStore((state) => state.showTests);
  const showFunctions = useWorkspaceStore((state) => state.showFunctions);
  const showChangedFilesOnly = useWorkspaceStore((state) => state.showChangedFilesOnly);
  const showDiagnosticsOnly = useWorkspaceStore((state) => state.showDiagnosticsOnly);
  const maxVisibleBeams = useWorkspaceStore((state) => state.maxVisibleBeams);
  const showFpsOverlay = useWorkspaceStore((state) => state.showFpsOverlay);
  const setWorldDetail = useWorkspaceStore((state) => state.setWorldDetail);
  const setGraphScopeFilter = useWorkspaceStore((state) => state.setGraphScopeFilter);
  const setShowExternalPackages = useWorkspaceStore((state) => state.setShowExternalPackages);
  const setShowTests = useWorkspaceStore((state) => state.setShowTests);
  const setShowFunctions = useWorkspaceStore((state) => state.setShowFunctions);
  const setShowChangedFilesOnly = useWorkspaceStore((state) => state.setShowChangedFilesOnly);
  const setShowDiagnosticsOnly = useWorkspaceStore((state) => state.setShowDiagnosticsOnly);
  const setMaxVisibleBeams = useWorkspaceStore((state) => state.setMaxVisibleBeams);
  const setShowFpsOverlay = useWorkspaceStore((state) => state.setShowFpsOverlay);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const selectFunction = useWorkspaceStore((state) => state.selectFunction);
  const jumpToLine = useWorkspaceStore((state) => state.jumpToLine);
  const selectPackage = useWorkspaceStore((state) => state.selectPackage);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("files");
  const results = useMemo(() => searchNodes(graph?.nodes || [], query, scope), [graph?.nodes, query, scope]);

  function focusResult(node: CodeNode) {
    if (node.kind === "file") {
      focusFile(node.path);
      void openFile(node.path);
      return;
    }
    if (node.kind === "function" || node.kind === "class") {
      focusFile(node.path);
      selectFunction(node.id);
      jumpToLine(node.line || 1);
      void openFile(node.path, node.line || 1);
      return;
    }
    selectPackage(node.id);
  }

  return (
    <div className="scalability-toolbar">
      <label>
        LOD
        <select value={worldDetail} onChange={(event) => setWorldDetail(event.target.value as WorldDetailLevel)}>
          <option value="module">module</option>
          <option value="file">file</option>
          <option value="function">function</option>
        </select>
      </label>
      <label>
        Scope
        <select value={graphScopeFilter} onChange={(event) => setGraphScopeFilter(event.target.value as GraphScopeFilter)}>
          <option value="all">all</option>
          <option value="current-file">file</option>
          <option value="current-module">module</option>
        </select>
      </label>
      <button className={showChangedFilesOnly ? "is-active" : ""} onClick={() => setShowChangedFilesOnly(!showChangedFilesOnly)}>
        changed
      </button>
      <button className={showDiagnosticsOnly ? "is-active" : ""} onClick={() => setShowDiagnosticsOnly(!showDiagnosticsOnly)}>
        diagnostics
      </button>
      <button className={showFunctions ? "is-active" : ""} onClick={() => setShowFunctions(!showFunctions)}>
        functions
      </button>
      <button className={showTests ? "is-active" : ""} onClick={() => setShowTests(!showTests)}>
        tests
      </button>
      <button className={showExternalPackages ? "is-active" : ""} onClick={() => setShowExternalPackages(!showExternalPackages)}>
        packages
      </button>
      <button className={showFpsOverlay ? "is-active" : ""} onClick={() => setShowFpsOverlay(!showFpsOverlay)}>
        fps
      </button>
      <label>
        beams
        <input
          type="number"
          min={0}
          max={2000}
          step={20}
          value={maxVisibleBeams}
          onChange={(event) => setMaxVisibleBeams(Number(event.target.value))}
        />
      </label>
      <div className="scale-search">
        <Search size={13} />
        <select value={scope} onChange={(event) => setScope(event.target.value as SearchScope)}>
          <option value="files">file</option>
          <option value="symbols">symbol</option>
          <option value="packages">package</option>
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="fuzzy search" />
        {query && (
          <div className="scale-search-results">
            {results.map((node) => (
              <button key={node.id} onClick={() => focusResult(node)}>
                <span>{node.name}</span>
                <small>{node.kind === "external" ? node.name : node.path.replace(fileNodeId(""), "")}</small>
              </button>
            ))}
            {!results.length && <span>No matches</span>}
          </div>
        )}
      </div>
    </div>
  );
}
