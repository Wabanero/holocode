import type {
  DebugSessionSnapshot,
  DiffChangedFile,
  GitStatusSnapshot,
  LspDiagnostic,
  LspDiagnosticsSnapshot
} from "../../src/types";
import type {
  ObservabilityConfidence,
  ObservabilityEdge,
  ObservabilityGraphSources,
  ObservabilityNode,
  ObservabilitySignal,
  ObservabilitySource,
  ObservabilityStats
} from "../../src/observability/observabilityTypes";

type CodeGraphLike = {
  generatedAt?: string;
  nodes?: Array<Record<string, any>>;
  edges?: Array<Record<string, any>>;
  stats?: Record<string, any>;
};

export type ObservabilitySnapshot = {
  generatedAt?: string;
  graph?: CodeGraphLike | null;
  gitStatus?: Partial<GitStatusSnapshot> & { error?: string };
  gitDiff?: { changedFiles?: DiffChangedFile[]; error?: string };
  lspDiagnostics?: Partial<LspDiagnosticsSnapshot> & { error?: string };
  agentWorkflowRuns?: Array<Record<string, any>>;
  agentResults?: Array<Record<string, any>>;
  debugState?: Partial<DebugSessionSnapshot> & { error?: string };
  sources?: Partial<ObservabilityGraphSources>;
};

export type ObservabilityGraphResponse = {
  nodes: ObservabilityNode[];
  edges: ObservabilityEdge[];
  signals: ObservabilitySignal[];
  generatedAt: string;
  sources: ObservabilityGraphSources;
  stats: ObservabilityStats;
};

function now() {
  return new Date().toISOString();
}

export function normalizeSlash(value: unknown) {
  return String(value || "").replace(/\\/g, "/");
}

export function safeRelativePath(value: unknown) {
  const normalized = normalizeSlash(value).replace(/^\/+/, "").trim();
  if (!normalized || normalized.includes("\0")) return null;
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("..")) return null;
  if (normalized.split("/").some((part) => part === "..")) return null;
  return normalized;
}

export function fileNodeId(filePath: string) {
  return `file:${safeRelativePath(filePath) || filePath}`;
}

export function safeIdPart(value: unknown) {
  return normalizeSlash(value).replace(/[^A-Za-z0-9_.:/#-]/g, "_");
}

export function parseDiffTouchedFiles(diff: unknown) {
  const files = new Set<string>();
  for (const line of String(diff || "").split(/\r?\n/)) {
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) {
      const normalized = safeRelativePath(gitMatch[2]);
      if (normalized && normalized !== "/dev/null") files.add(normalized);
      continue;
    }
    const newFileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (newFileMatch) {
      const normalized = safeRelativePath(newFileMatch[1]);
      if (normalized && normalized !== "/dev/null") files.add(normalized);
      continue;
    }
    const oldFileMatch = line.match(/^--- a\/(.+)$/);
    if (oldFileMatch) {
      const normalized = safeRelativePath(oldFileMatch[1]);
      if (normalized && normalized !== "/dev/null") files.add(normalized);
    }
  }
  return [...files].sort();
}

export function agentTouchedFiles(agentWorkflowRuns: Array<Record<string, any>> = [], agentResults: Array<Record<string, any>> = []) {
  const files = new Set<string>();
  const add = (value: unknown) => {
    const normalized = safeRelativePath(value);
    if (normalized) files.add(normalized);
  };

  for (const run of agentWorkflowRuns) {
    (run.selectedFiles || []).forEach(add);
    (run.currentPatch?.filesTouched || []).forEach(add);
    (run.graphContext?.relevantFiles || []).forEach(add);
    (run.graphContext?.topRelevantFiles || []).forEach((item: any) => add(item.path || item));
    (run.plan?.likelyFiles || []).forEach(add);
    (run.patches || []).forEach((patch: any) => (patch.filesTouched || []).forEach(add));
  }

  for (const result of agentResults) {
    parseDiffTouchedFiles(result.diff).forEach(add);
  }

  return [...files].sort();
}

function addNode(nodes: ObservabilityNode[], byId: Map<string, ObservabilityNode>, node: ObservabilityNode) {
  const existing = byId.get(node.id);
  if (existing) {
    Object.assign(existing, node);
    return existing;
  }
  byId.set(node.id, node);
  nodes.push(node);
  return node;
}

function addEdge(edges: ObservabilityEdge[], seen: Set<string>, edge: ObservabilityEdge) {
  if (seen.has(edge.id)) return;
  seen.add(edge.id);
  edges.push(edge);
}

function signalSeverityForDiagnostic(severity: string | undefined) {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

function signalSeverityForGit(status: string | undefined) {
  if (status === "deleted") return "error";
  if (status === "added") return "notice";
  return "warning";
}

function rangeFromLineRange(value: Record<string, any>) {
  const startLine = Number(value.startLine ?? value.line ?? 0);
  if (!Number.isFinite(startLine) || startLine <= 0) return undefined;
  return {
    startLine,
    startColumn: Number.isFinite(Number(value.startColumn)) ? Number(value.startColumn) : undefined,
    endLine: Number.isFinite(Number(value.endLine)) ? Number(value.endLine) : undefined,
    endColumn: Number.isFinite(Number(value.endColumn)) ? Number(value.endColumn) : undefined
  };
}

function graphNodeLabel(node: Record<string, any>) {
  return String(node.label || node.name || node.symbolName || node.path || node.id);
}

function confidenceForSource(source: ObservabilitySource, sources: ObservabilityGraphSources): ObservabilityConfidence {
  if (source === "runtime") return "missing";
  if (source === "agent") return sources.agents ? "verified" : "missing";
  return sources[source] ? "verified" : "missing";
}

export function buildObservabilityGraph(snapshot: ObservabilitySnapshot): ObservabilityGraphResponse {
  const generatedAt = snapshot.generatedAt || now();
  const graph = snapshot.graph || null;
  const sources: ObservabilityGraphSources = {
    codegraph: Boolean(snapshot.sources?.codegraph ?? graph?.nodes?.length),
    git: Boolean(snapshot.sources?.git ?? (snapshot.gitStatus || snapshot.gitDiff)),
    lsp: Boolean(snapshot.sources?.lsp ?? snapshot.lspDiagnostics),
    agents: Boolean(snapshot.sources?.agents ?? (snapshot.agentWorkflowRuns || snapshot.agentResults)),
    debug: Boolean(snapshot.sources?.debug ?? snapshot.debugState),
    runtime: false
  };
  const nodes: ObservabilityNode[] = [];
  const edges: ObservabilityEdge[] = [];
  const signals: ObservabilitySignal[] = [];
  const nodeById = new Map<string, ObservabilityNode>();
  const seenEdges = new Set<string>();
  const graphNodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const graphEdges = Array.isArray(graph?.edges) ? graph.edges : [];
  const graphNodeIds = new Set(graphNodes.map((node) => String(node.id)));
  const fileNodesByPath = new Map<string, Record<string, any>>();

  for (const node of graphNodes) {
    const path = safeRelativePath(node.path) || ".";
    if (node.kind === "file" || node.kind === "test") fileNodesByPath.set(path, node);
    addNode(nodes, nodeById, {
      id: String(node.id),
      kind: node.kind || "file",
      label: graphNodeLabel(node),
      source: "codegraph",
      confidence: confidenceForSource("codegraph", sources),
      codeGraphNodeId: String(node.id),
      path,
      symbolName: node.symbolName,
      range: rangeFromLineRange(node),
      metrics: {
        loc: Number.isFinite(Number(node.loc)) ? Number(node.loc) : null,
        size: Number.isFinite(Number(node.size)) ? Number(node.size) : null,
        complexity: Number.isFinite(Number(node.complexity)) ? Number(node.complexity) : null
      },
      updatedAt: graph?.generatedAt || generatedAt
    } as ObservabilityNode);
  }

  for (const edge of graphEdges) {
    const sourceNodeId = String(edge.source || "");
    const targetNodeId = String(edge.target || "");
    if (!sourceNodeId || !targetNodeId) continue;
    addEdge(edges, seenEdges, {
      id: `obs:${edge.id || `${sourceNodeId}->${targetNodeId}:${edge.type || "related"}`}`,
      kind: edge.type || "correlates_with",
      sourceNodeId,
      targetNodeId,
      source: "codegraph",
      confidence: confidenceForSource("codegraph", sources),
      weight: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : undefined,
      directed: true,
      observedAt: graph?.generatedAt || generatedAt,
      metadata: {
        line: Number.isFinite(Number(edge.line)) ? Number(edge.line) : null
      }
    });
  }

  for (const statusFile of snapshot.gitStatus?.files || []) {
    const path = safeRelativePath(statusFile.path);
    if (!path) continue;
    const nodeId = fileNodeId(path);
    signals.push({
      id: `signal:git:status:${safeIdPart(path)}`,
      source: "git",
      type: "status",
      observedAt: generatedAt,
      nodeId,
      path,
      severity: signalSeverityForGit(statusFile.status),
      confidence: confidenceForSource("git", sources),
      message: `Git status is ${statusFile.status}.`,
      fileStatus: statusFile.status
    } as ObservabilitySignal);
  }

  for (const changedFile of snapshot.gitDiff?.changedFiles || []) {
    const path = safeRelativePath(changedFile.path);
    if (!path) continue;
    const fileId = fileNodeId(path);
    const diffNodeId = `diff:${safeIdPart(path)}`;
    addNode(nodes, nodeById, {
      id: diffNodeId,
      kind: "diff_hunk",
      label: `Diff ${path}`,
      source: "git",
      confidence: confidenceForSource("git", sources),
      codeGraphNodeId: graphNodeIds.has(fileId) ? fileId : undefined,
      path,
      changeStatus: changedFile.status,
      additions: changedFile.additions,
      deletions: changedFile.deletions,
      metrics: {
        additions: changedFile.additions,
        deletions: changedFile.deletions
      },
      updatedAt: generatedAt
    } as ObservabilityNode);
    addEdge(edges, seenEdges, {
      id: `obs:${diffNodeId}->${fileId}:impacts`,
      kind: "impacts",
      sourceNodeId: diffNodeId,
      targetNodeId: fileId,
      source: "git",
      confidence: confidenceForSource("git", sources),
      directed: true,
      observedAt: generatedAt
    });
    signals.push({
      id: `signal:git:diff:${safeIdPart(path)}`,
      source: "git",
      type: "diff",
      observedAt: generatedAt,
      nodeId: fileId,
      path,
      severity: signalSeverityForGit(changedFile.status),
      confidence: confidenceForSource("git", sources),
      message: `${changedFile.status} with ${changedFile.additions} additions and ${changedFile.deletions} deletions.`,
      changedFile
    } as ObservabilitySignal);
  }

  for (const diagnostic of snapshot.lspDiagnostics?.diagnostics || []) {
    const typedDiagnostic = diagnostic as LspDiagnostic;
    const path = safeRelativePath(typedDiagnostic.path);
    if (!path) continue;
    const fileId = fileNodeId(path);
    const diagnosticNodeId = `diagnostic:${safeIdPart(typedDiagnostic.id || `${path}:${typedDiagnostic.startLine}:${typedDiagnostic.startColumn}`)}`;
    addNode(nodes, nodeById, {
      id: diagnosticNodeId,
      kind: "diagnostic",
      label: `${typedDiagnostic.severity}: ${typedDiagnostic.message}`,
      source: "lsp",
      confidence: confidenceForSource("lsp", sources),
      codeGraphNodeId: graphNodeIds.has(fileId) ? fileId : undefined,
      path,
      range: rangeFromLineRange(typedDiagnostic),
      diagnosticId: typedDiagnostic.id,
      severity: typedDiagnostic.severity,
      updatedAt: snapshot.lspDiagnostics?.generatedAt || generatedAt
    } as ObservabilityNode);
    addEdge(edges, seenEdges, {
      id: `obs:${diagnosticNodeId}->${fileId}:fails_at`,
      kind: "fails_at",
      sourceNodeId: diagnosticNodeId,
      targetNodeId: fileId,
      source: "lsp",
      confidence: confidenceForSource("lsp", sources),
      directed: true,
      observedAt: snapshot.lspDiagnostics?.generatedAt || generatedAt
    });
    signals.push({
      id: `signal:lsp:${safeIdPart(typedDiagnostic.id || diagnosticNodeId)}`,
      source: "lsp",
      type: "diagnostic",
      observedAt: snapshot.lspDiagnostics?.generatedAt || generatedAt,
      nodeId: fileId,
      path,
      range: rangeFromLineRange(typedDiagnostic),
      severity: signalSeverityForDiagnostic(typedDiagnostic.severity),
      confidence: confidenceForSource("lsp", sources),
      message: typedDiagnostic.message,
      diagnostic: {
        id: typedDiagnostic.id,
        path,
        severity: typedDiagnostic.severity,
        code: typedDiagnostic.code,
        source: typedDiagnostic.source,
        message: typedDiagnostic.message,
        startLine: typedDiagnostic.startLine,
        startColumn: typedDiagnostic.startColumn,
        endLine: typedDiagnostic.endLine,
        endColumn: typedDiagnostic.endColumn
      }
    } as ObservabilitySignal);
  }

  const agentFiles = new Set(agentTouchedFiles(snapshot.agentWorkflowRuns || [], snapshot.agentResults || []));
  for (const run of snapshot.agentWorkflowRuns || []) {
    const taskId = safeIdPart(run.taskId || run.runId || "agent_run");
    const visits = Array.isArray(run.telemetry?.nodeVisits) ? run.telemetry.nodeVisits : [];
    const visitNodes = visits.length ? visits : [{ node: "AgentRun", timestamp: run.timestamps?.updatedAt || generatedAt }];
    visitNodes.forEach((visit: any, index: number) => {
      const stepNodeId = `agent:${taskId}:step:${index}:${safeIdPart(visit.node || "step")}`;
      addNode(nodes, nodeById, {
        id: stepNodeId,
        kind: "agent_step",
        label: String(visit.node || "Agent step"),
        source: "agent",
        confidence: confidenceForSource("agent", sources),
        traceId: String(run.taskId || taskId),
        stepId: stepNodeId,
        status: run.status === "failed" ? "failed" : run.status === "completed" ? "completed" : "running",
        metrics: {
          iteration: Number.isFinite(Number(visit.iteration)) ? Number(visit.iteration) : null
        },
        updatedAt: visit.timestamp || run.timestamps?.updatedAt || generatedAt
      } as ObservabilityNode);
      if (index > 0) {
        const previous = `agent:${taskId}:step:${index - 1}:${safeIdPart(visitNodes[index - 1]?.node || "step")}`;
        addEdge(edges, seenEdges, {
          id: `obs:${previous}->${stepNodeId}:precedes`,
          kind: "precedes",
          sourceNodeId: previous,
          targetNodeId: stepNodeId,
          source: "agent",
          confidence: confidenceForSource("agent", sources),
          directed: true,
          observedAt: visit.timestamp || generatedAt
        });
      }
    });

    const lastStepNodeId = `agent:${taskId}:step:${Math.max(0, visitNodes.length - 1)}:${safeIdPart(visitNodes.at(-1)?.node || "step")}`;
    for (const path of agentFiles) {
      const fileId = fileNodeId(path);
      const editKind = (run.currentPatch?.filesTouched || []).includes(path) ? "edits" : "selects_context";
      addEdge(edges, seenEdges, {
        id: `obs:${lastStepNodeId}->${fileId}:${editKind}:${safeIdPart(path)}`,
        kind: editKind,
        sourceNodeId: lastStepNodeId,
        targetNodeId: fileId,
        source: "agent",
        confidence: editKind === "edits" ? "verified" : "inferred",
        directed: true,
        observedAt: run.timestamps?.updatedAt || generatedAt
      });
    }
  }

  for (const path of agentFiles) {
    signals.push({
      id: `signal:agent:touched:${safeIdPart(path)}`,
      source: "agent",
      type: "agent-patch",
      observedAt: generatedAt,
      nodeId: fileNodeId(path),
      path,
      severity: "notice",
      confidence: confidenceForSource("agent", sources),
      message: "File appears in agent-selected context or an agent patch.",
      taskId: "multiple"
    } as ObservabilitySignal);
  }

  const debugState = snapshot.debugState || {};
  for (const breakpoint of debugState.breakpoints || []) {
    const path = safeRelativePath(breakpoint.path);
    if (!path) continue;
    const breakpointNodeId = `debug:breakpoint:${safeIdPart(breakpoint.id || `${path}:${breakpoint.line}`)}`;
    addNode(nodes, nodeById, {
      id: breakpointNodeId,
      kind: "debug_breakpoint",
      label: `Breakpoint ${path}:${breakpoint.line}`,
      source: "debug",
      confidence: confidenceForSource("debug", sources),
      codeGraphNodeId: breakpoint.sourceId || fileNodeId(path),
      path,
      range: { startLine: breakpoint.line },
      debugSessionId: debugState.sessionId || undefined,
      breakpointId: breakpoint.id,
      updatedAt: breakpoint.createdAt || debugState.updatedAt || generatedAt
    } as ObservabilityNode);
    addEdge(edges, seenEdges, {
      id: `obs:${breakpointNodeId}->${fileNodeId(path)}:watches`,
      kind: "watches",
      sourceNodeId: breakpointNodeId,
      targetNodeId: fileNodeId(path),
      source: "debug",
      confidence: confidenceForSource("debug", sources),
      directed: true,
      observedAt: breakpoint.createdAt || debugState.updatedAt || generatedAt
    });
  }

  for (const frame of debugState.callStack || []) {
    const path = safeRelativePath(frame.path);
    if (!path) continue;
    const frameNodeId = `debug:frame:${safeIdPart(frame.id || `${path}:${frame.line}:${frame.depth}`)}`;
    addNode(nodes, nodeById, {
      id: frameNodeId,
      kind: "debug_frame",
      label: frame.name || `Frame ${path}:${frame.line}`,
      source: "debug",
      confidence: confidenceForSource("debug", sources),
      codeGraphNodeId: frame.sourceId || fileNodeId(path),
      path,
      range: { startLine: frame.line, endLine: frame.endLine },
      debugSessionId: debugState.sessionId || undefined,
      frameId: frame.id,
      metrics: {
        depth: Number.isFinite(Number(frame.depth)) ? Number(frame.depth) : null,
        active: debugState.activeFrame?.id === frame.id
      },
      updatedAt: debugState.updatedAt || generatedAt
    } as ObservabilityNode);
    addEdge(edges, seenEdges, {
      id: `obs:${frameNodeId}->${fileNodeId(path)}:executes`,
      kind: "executes",
      sourceNodeId: frameNodeId,
      targetNodeId: fileNodeId(path),
      source: "debug",
      confidence: confidenceForSource("debug", sources),
      directed: true,
      observedAt: debugState.updatedAt || generatedAt
    });
  }

  if (debugState.activeFrame?.path) {
    const path = safeRelativePath(debugState.activeFrame.path);
    if (path) {
      signals.push({
        id: `signal:debug:active-frame:${safeIdPart(path)}`,
        source: "debug",
        type: "stack-frame",
        observedAt: debugState.updatedAt || generatedAt,
        nodeId: fileNodeId(path),
        path,
        range: { startLine: debugState.activeFrame.line || 1 },
        severity: "notice",
        confidence: confidenceForSource("debug", sources),
        message: `Active debug frame is ${debugState.activeFrame.name || path}.`,
        status: debugState.status
      } as ObservabilitySignal);
    }
  }

  const stats: ObservabilityStats = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    signalCount: signals.length,
    runtimeTraceCount: 0,
    agentTraceCount: (snapshot.agentWorkflowRuns || []).length,
    watchpointCount: 0,
    staleSignalCount: signals.filter((signal) => signal.confidence === "stale").length,
    missingSourceCount: Object.values(sources).filter((available) => !available).length
  };

  return {
    nodes,
    edges,
    signals,
    generatedAt,
    sources,
    stats
  };
}
