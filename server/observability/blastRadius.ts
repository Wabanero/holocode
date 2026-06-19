import type { BlastRadiusResult, ObservabilityEdge } from "../../src/observability/observabilityTypes";
import { fileNodeId, safeRelativePath } from "./buildObservabilityGraph.ts";

type CodeGraphLike = {
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
};

function now() {
  return new Date().toISOString();
}

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort();
}

function edgeToObservability(edge: Record<string, any>): ObservabilityEdge {
  return {
    id: `obs:blast:${edge.id || `${edge.source}->${edge.target}:${edge.type}`}`,
    kind: edge.type || "correlates_with",
    sourceNodeId: String(edge.source || ""),
    targetNodeId: String(edge.target || ""),
    source: "codegraph",
    confidence: "verified",
    directed: true,
    observedAt: now(),
    weight: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : undefined
  };
}

export function buildBlastRadius(input: { graph?: CodeGraphLike | null; path: string; maxDepth?: number }) {
  const graph = input.graph || {};
  const selectedPath = safeRelativePath(input.path);
  if (!selectedPath) {
    throw new Error("Missing or unsafe path.");
  }

  const maxDepth = Math.max(1, Math.min(12, Math.floor(input.maxDepth || 8)));
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
  const seedId = fileNodeId(selectedPath);
  const seedNode = nodesById.get(seedId);
  const importEdges = edges.filter((edge) => edge.type === "imports");
  const outgoingImports = importEdges.filter((edge) => edge.source === seedId);
  const directImporters = importEdges.filter((edge) => edge.target === seedId);
  const affectedNodeIds = new Set<string>([seedId]);
  const depthByNodeId: Record<string, number> = { [seedId]: 0 };
  const queue: Array<{ id: string; depth: number }> = [{ id: seedId, depth: 0 }];
  const traversedEdges: Record<string, any>[] = [];

  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) continue;
    for (const edge of importEdges.filter((candidate) => candidate.target === current.id)) {
      const nextId = String(edge.source || "");
      if (!nextId || affectedNodeIds.has(nextId)) continue;
      affectedNodeIds.add(nextId);
      depthByNodeId[nextId] = current.depth + 1;
      traversedEdges.push(edge);
      queue.push({ id: nextId, depth: current.depth + 1 });
    }
  }

  for (const edge of [...outgoingImports, ...directImporters]) {
    traversedEdges.push(edge);
    if (edge.source) affectedNodeIds.add(String(edge.source));
    if (edge.target) affectedNodeIds.add(String(edge.target));
  }

  const affectedPaths = new Set<string>();
  const affectedSymbols = new Set<string>();
  const affectedTests = new Set<string>();
  const imports = new Set<string>();
  const importers = new Set<string>();

  for (const id of affectedNodeIds) {
    const node = nodesById.get(id);
    const path = safeRelativePath(node?.path);
    if (path && (node?.kind === "file" || node?.kind === "test")) affectedPaths.add(path);
    if (path && (node?.kind === "function" || node?.kind === "class" || node?.kind === "method")) affectedSymbols.add(String(node.id));
    for (const testPath of node?.relatedTests || []) {
      const normalized = safeRelativePath(testPath);
      if (normalized) affectedTests.add(normalized);
    }
  }

  for (const node of nodes) {
    const path = safeRelativePath(node.path);
    if (!path) continue;
    if (affectedPaths.has(path) && (node.kind === "function" || node.kind === "class" || node.kind === "method")) {
      affectedSymbols.add(String(node.id));
    }
  }

  for (const edge of outgoingImports) {
    const target = nodesById.get(String(edge.target));
    const path = safeRelativePath(target?.path);
    if (path) imports.add(path);
  }

  for (const edge of directImporters) {
    const source = nodesById.get(String(edge.source));
    const path = safeRelativePath(source?.path);
    if (path) importers.add(path);
  }

  for (const edge of edges.filter((edge) => edge.type === "tests" && (affectedNodeIds.has(edge.source) || affectedNodeIds.has(edge.target)))) {
    const source = nodesById.get(String(edge.source));
    const target = nodesById.get(String(edge.target));
    for (const path of [safeRelativePath(source?.path), safeRelativePath(target?.path)]) {
      if (path) affectedTests.add(path);
    }
    traversedEdges.push(edge);
  }

  const generatedAt = now();
  const result: BlastRadiusResult & {
    seedPath: string;
    affectedSymbols: string[];
    imports: string[];
    importers: string[];
    depthByNodeId: Record<string, number>;
  } = {
    id: `blast:${selectedPath}:${generatedAt}`,
    generatedAt,
    seedPath: selectedPath,
    seedNodeIds: [seedId],
    seedPaths: [selectedPath],
    affectedNodeIds: uniqueSorted(affectedNodeIds),
    affectedPaths: uniqueSorted(affectedPaths),
    affectedSymbols: uniqueSorted(affectedSymbols),
    affectedTestPaths: uniqueSorted(affectedTests),
    imports: uniqueSorted(imports),
    importers: uniqueSorted(importers),
    edges: traversedEdges.map(edgeToObservability),
    riskScores: [],
    maxDepth,
    confidence: seedNode ? "verified" : "inferred",
    missingSources: seedNode ? [] : ["codegraph"],
    depthByNodeId
  };

  return result;
}
