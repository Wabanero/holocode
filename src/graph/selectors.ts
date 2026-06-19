import type { CodeGraph, CodeNode } from "../types";

export function fileNodeId(filePath: string) {
  return `file:${filePath}`;
}

export function getFileNodes(graph: CodeGraph | null) {
  return graph?.nodes.filter((node) => node.kind === "file") ?? [];
}

export function getCurrentFileNode(graph: CodeGraph | null, currentFilePath: string | null) {
  if (!graph || !currentFilePath) return null;
  return graph.nodes.find((node) => node.id === fileNodeId(currentFilePath)) ?? null;
}

export function getSymbolsForFile(graph: CodeGraph | null, currentFilePath: string | null) {
  if (!graph || !currentFilePath) return [];
  const currentId = fileNodeId(currentFilePath);
  const symbolIds = new Set(
    graph.edges.filter((edge) => edge.source === currentId && edge.type === "defines").map((edge) => edge.target)
  );
  return graph.nodes
    .filter((node) => symbolIds.has(node.id) && (node.kind === "function" || node.kind === "class"))
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

export function getImportsForFile(graph: CodeGraph | null, currentFilePath: string | null) {
  if (!graph || !currentFilePath) return [];
  const currentId = fileNodeId(currentFilePath);
  const targets = new Set(
    graph.edges.filter((edge) => edge.source === currentId && edge.type === "imports").map((edge) => edge.target)
  );
  return graph.nodes.filter((node) => targets.has(node.id));
}

export function getCallersForFile(graph: CodeGraph | null, currentFilePath: string | null) {
  if (!graph || !currentFilePath) return [];
  const currentId = fileNodeId(currentFilePath);
  const sources = new Set(
    graph.edges.filter((edge) => edge.target === currentId && edge.type === "imports").map((edge) => edge.source)
  );
  return graph.nodes.filter((node) => sources.has(node.id));
}

export function findFileByQuery(graph: CodeGraph | null, query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  return getFileNodes(graph).find((node) => {
    const compactPath = node.path.toLowerCase().replace(/\s+/g, "");
    return compactPath.includes(normalized) || node.name.toLowerCase().includes(normalized);
  });
}

export function findSymbolByQuery(symbols: CodeNode[], query: string) {
  const normalized = query.toLowerCase().replace(/\s+/g, "");
  return symbols.find((symbol) => symbol.name.toLowerCase().includes(normalized));
}

export function getNodeById(graph: CodeGraph | null, id: string | null) {
  if (!graph || !id) return null;
  return graph.nodes.find((node) => node.id === id) ?? null;
}

export function getFolderNodes(graph: CodeGraph | null) {
  return graph?.nodes.filter((node) => (node.kind === "folder" || node.kind === "directory") && node.path !== ".") ?? [];
}

export function getExternalPackageNodes(graph: CodeGraph | null) {
  return graph?.nodes.filter((node) => node.kind === "external") ?? [];
}

export function getTestFileNodes(graph: CodeGraph | null) {
  return getFileNodes(graph).filter((node) => node.type === "test" || node.path.startsWith("tests/") || node.name.includes(".test."));
}

export function getImportEdgesForScene(graph: CodeGraph | null) {
  return graph?.edges.filter((edge) => edge.type === "imports") ?? [];
}
