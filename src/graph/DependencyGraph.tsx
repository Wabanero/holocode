import { Network } from "lucide-react";
import { useMemo } from "react";
import { Panel } from "../components/Panel";
import { fileNodeId } from "./selectors";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import type { CodeEdge, CodeNode } from "../types";

type PositionedNode = CodeNode & {
  x: number;
  y: number;
};

function layoutNodes(nodes: CodeNode[], focusId: string | null, edges: CodeEdge[], mode: string): PositionedNode[] {
  if (!focusId) {
    return nodes.map((node, index) => ({
      ...node,
      x: 75 + (index % 4) * 145,
      y: 55 + Math.floor(index / 4) * 68
    }));
  }

  const incoming = new Set(edges.filter((edge) => edge.target === focusId).map((edge) => edge.source));
  const outgoing = new Set(edges.filter((edge) => edge.source === focusId).map((edge) => edge.target));
  const callers = nodes.filter((node) => incoming.has(node.id));
  const targets = nodes.filter((node) => outgoing.has(node.id));
  const focus = nodes.find((node) => node.id === focusId);
  const positioned: PositionedNode[] = [];

  const focusNodes = focus ? [focus] : [];
  const leftNodes = mode === "callers" ? callers : focusNodes;
  const rightNodes = mode === "callers" ? focusNodes : targets;

  leftNodes.forEach((node, index) => {
    positioned.push({ ...node, x: 110, y: 75 + index * 62 });
  });

  rightNodes.forEach((node, index) => {
    positioned.push({ ...node, x: 430, y: 75 + index * 62 });
  });

  if (mode === "all") {
    const otherNodes = nodes.filter((node) => !positioned.some((item) => item.id === node.id));
    otherNodes.forEach((node, index) => {
      positioned.push({ ...node, x: 250, y: 48 + index * 46 });
    });
  }

  return positioned;
}

export function DependencyGraph() {
  const graph = useWorkspaceStore((state) => state.graph);
  const currentFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const graphFocus = useWorkspaceStore((state) => state.graphFocus);
  const openFile = useWorkspaceStore((state) => state.openFile);

  const data = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] };

    const currentId = currentFilePath ? fileNodeId(currentFilePath) : null;
    const importEdges = graph.edges.filter((edge) => edge.type === "imports");
    const visibleIds = new Set<string>();

    if (currentId && graphFocus === "dependencies") {
      visibleIds.add(currentId);
      importEdges.filter((edge) => edge.source === currentId).forEach((edge) => visibleIds.add(edge.target));
    } else if (currentId && graphFocus === "callers") {
      visibleIds.add(currentId);
      importEdges.filter((edge) => edge.target === currentId).forEach((edge) => visibleIds.add(edge.source));
    } else {
      importEdges.slice(0, 18).forEach((edge) => {
        visibleIds.add(edge.source);
        visibleIds.add(edge.target);
      });
    }

    const nodes = graph.nodes.filter((node) => visibleIds.has(node.id));
    const edges = importEdges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
    return { nodes, edges };
  }, [currentFilePath, graph, graphFocus]);

  const focusId = currentFilePath ? fileNodeId(currentFilePath) : null;
  const positioned = layoutNodes(data.nodes, focusId, data.edges, graphFocus);
  const nodesById = new Map(positioned.map((node) => [node.id, node]));

  return (
    <Panel title="Dependency Graph" eyebrow={graphFocus} className="graph-panel">
      {positioned.length ? (
        <svg className="dependency-svg" viewBox="0 0 620 300" role="img" aria-label="File dependency graph">
          <defs>
            <marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="#59d7be" />
            </marker>
          </defs>
          {data.edges.map((edge) => {
            const source = nodesById.get(edge.source);
            const target = nodesById.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={source.x + 56}
                y1={source.y}
                x2={target.x - 56}
                y2={target.y}
                className="graph-edge"
                markerEnd="url(#arrow)"
              />
            );
          })}
          {positioned.map((node) => {
            const isCurrent = node.id === focusId;
            return (
              <g
                key={node.id}
                className={`graph-node ${node.kind} ${isCurrent ? "is-current" : ""}`}
                transform={`translate(${node.x - 58}, ${node.y - 20})`}
                onClick={() => {
                  if (node.kind === "file") void openFile(node.path);
                }}
              >
                <rect width="116" height="40" rx="7" />
                <text x="58" y="18">
                  {node.name}
                </text>
                <text x="58" y="31" className="graph-node-kind">
                  {node.kind}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="empty-state">
          <Network size={20} />
          <span>No graph slice selected.</span>
        </div>
      )}
    </Panel>
  );
}
