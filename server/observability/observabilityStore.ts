import { buildBlastRadius } from "./blastRadius.ts";
import { buildContextLens } from "./contextLens.ts";
import { buildObservabilityGraph, type ObservabilitySnapshot } from "./buildObservabilityGraph.ts";
import { scoreFileRisk } from "./riskScoring.ts";

type Collector<T> = () => T | Promise<T>;

export type ObservabilityStoreDependencies = {
  readGraph: Collector<Record<string, any>>;
  getGitStatusSnapshot: Collector<Record<string, any>>;
  getGitDiffSnapshot: Collector<Record<string, any>>;
  getLspDiagnostics: Collector<Record<string, any>>;
  getAgentWorkflowRuns: Collector<Array<Record<string, any>>>;
  getAgentResults: Collector<Array<Record<string, any>>>;
  getDebugState: Collector<Record<string, any>>;
};

async function collectOptional<T>(collector: Collector<T>, fallback: T) {
  try {
    return { value: await collector(), available: true, error: null };
  } catch (error: any) {
    return { value: fallback, available: false, error: error?.message || "Unavailable." };
  }
}

export function createObservabilityStore(dependencies: ObservabilityStoreDependencies, options: { cacheTtlMs?: number } = {}) {
  const cacheTtlMs = Math.max(0, options.cacheTtlMs ?? 750);
  let cachedGraph: { storedAt: number; value: ReturnType<typeof buildObservabilityGraph> } | null = null;

  async function collectSnapshot(): Promise<ObservabilitySnapshot> {
    const generatedAt = new Date().toISOString();
    const [graph, gitStatus, gitDiff, lspDiagnostics, agentWorkflowRuns, agentResults, debugState] = await Promise.all([
      collectOptional(dependencies.readGraph, null),
      collectOptional(dependencies.getGitStatusSnapshot, { files: [] }),
      collectOptional(dependencies.getGitDiffSnapshot, { changedFiles: [] }),
      collectOptional(dependencies.getLspDiagnostics, { diagnostics: [], summary: [] }),
      collectOptional(dependencies.getAgentWorkflowRuns, []),
      collectOptional(dependencies.getAgentResults, []),
      collectOptional(dependencies.getDebugState, null)
    ]);

    return {
      generatedAt,
      graph: graph.value,
      gitStatus: { ...(gitStatus.value || {}), error: gitStatus.error || undefined },
      gitDiff: { ...(gitDiff.value || {}), error: gitDiff.error || undefined },
      lspDiagnostics: { ...(lspDiagnostics.value || {}), error: lspDiagnostics.error || undefined },
      agentWorkflowRuns: agentWorkflowRuns.value || [],
      agentResults: agentResults.value || [],
      debugState: debugState.value ? { ...debugState.value, error: debugState.error || undefined } : null,
      sources: {
        codegraph: graph.available,
        git: gitStatus.available || gitDiff.available,
        lsp: lspDiagnostics.available,
        agents: agentWorkflowRuns.available || agentResults.available,
        debug: debugState.available,
        runtime: false
      }
    };
  }

  async function getGraph(options: { force?: boolean } = {}) {
    const age = cachedGraph ? Date.now() - cachedGraph.storedAt : Infinity;
    if (!options.force && cachedGraph && age <= cacheTtlMs) return cachedGraph.value;
    const snapshot = await collectSnapshot();
    const value = buildObservabilityGraph(snapshot);
    cachedGraph = { storedAt: Date.now(), value };
    return value;
  }

  async function getBlastRadius(path: string) {
    const snapshot = await collectSnapshot();
    return buildBlastRadius({ graph: snapshot.graph, path });
  }

  async function getContextLens(runId: string) {
    const snapshot = await collectSnapshot();
    return buildContextLens({
      graph: snapshot.graph,
      runId,
      agentWorkflowRuns: snapshot.agentWorkflowRuns,
      agentResults: snapshot.agentResults
    });
  }

  async function getRisk(path: string) {
    const snapshot = await collectSnapshot();
    return scoreFileRisk({
      graph: snapshot.graph,
      path,
      lspDiagnostics: snapshot.lspDiagnostics,
      gitStatus: snapshot.gitStatus,
      gitDiff: snapshot.gitDiff,
      agentWorkflowRuns: snapshot.agentWorkflowRuns,
      agentResults: snapshot.agentResults,
      debugState: snapshot.debugState || undefined
    });
  }

  function invalidate() {
    cachedGraph = null;
  }

  return {
    collectSnapshot,
    getGraph,
    getBlastRadius,
    getContextLens,
    getRisk,
    invalidate
  };
}
