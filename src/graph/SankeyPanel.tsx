import { GitBranch } from "lucide-react";
import { useMemo } from "react";
import { Panel } from "../components/Panel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

export function SankeyPanel() {
  const graph = useWorkspaceStore((state) => state.graph);

  const columns = useMemo(() => {
    if (!graph) {
      return [];
    }

    const fileNodes = graph.nodes.filter((node) => node.kind === "file");
    const importTargets = new Set(graph.edges.filter((edge) => edge.type === "imports").map((edge) => edge.target));
    const entrypoints = fileNodes.filter((node) => node.name === "App.tsx" || !importTargets.has(node.id)).slice(0, 4);
    const modules = [...new Set(fileNodes.map((node) => node.path.split("/")[1] || "root"))].slice(0, 6);
    const files = fileNodes.slice(0, 7);
    const packages = graph.nodes.filter((node) => node.kind === "external").slice(0, 5);

    return [
      { label: "Entrypoints", values: entrypoints.map((node) => node.name) },
      { label: "Modules", values: modules },
      { label: "Files", values: files.map((node) => node.path) },
      { label: "Packages", values: packages.map((node) => node.name) }
    ];
  }, [graph]);

  return (
    <Panel title="Sankey Flow" eyebrow="real graph summary" className="sankey-panel">
      {columns.length ? (
        <div className="sankey-flow">
          {columns.map((column, columnIndex) => (
            <div className="sankey-column" key={column.label}>
              <h3>{column.label}</h3>
              {column.values.length ? (
                column.values.map((value, index) => (
                  <div className="sankey-bar" key={value} style={{ width: `${Math.max(44, 100 - index * 8)}%` }}>
                    <span>{value}</span>
                  </div>
                ))
              ) : (
                <div className="sankey-empty">none</div>
              )}
              {columnIndex < columns.length - 1 ? <div className="sankey-connector" /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <GitBranch size={20} />
          <span>Run graph scan to populate flow.</span>
        </div>
      )}
    </Panel>
  );
}
