# Code Graph Observability Layer

The Code Graph Observability Layer is the planned live context layer for HoloCode Cockpit. It turns the existing structural code graph into a time-aware, evidence-aware model of what is happening around the code: diagnostics, diffs, agent runs, debug state, and future runtime/test/lint signals.

The goal is not to replace the current 3D code world. The layer should sit beside the existing CodeGraphProvider, Zustand state, safe file IO, git, LSP, agent, and debug endpoints, then provide typed derived views that VR-native objects can render when the UI is ready.

## Difference From The Static Code Graph

`data/codegraph.json` is a structural snapshot. It answers questions like "what files exist?", "what imports what?", "where are functions?", and "which tests are related?" That graph is generated from the repository and is intentionally stable enough to drive layout.

The observability layer is an overlay on top of that snapshot. It answers questions like "what changed?", "what is currently broken?", "what did the agent inspect?", "what code is executing?", "how confident are we?", and "what is the blast radius if this node moves?" It keeps links back to code graph node IDs, file paths, line ranges, and endpoint snapshots so static topology and live evidence remain separable.

This distinction matters for the MVP:

- The static graph remains the spatial foundation.
- Observability data is optional and can be stale, partial, or absent.
- Missing observability data must never break graph loading, file editing, git views, LSP views, debug mode, or agent execution.
- New observability endpoints should be additive when implemented later.

## Existing Subsystems To Merge

The layer should merge existing subsystem snapshots without changing their safety boundaries:

- `codegraph.json`: baseline nodes, edges, tree, stats, file paths, symbols, imports, callers, tests, packages, patches, and errors.
- LSP diagnostics: TypeScript errors, warnings, hints, info, document symbols, hover, definition, references, and rename preview evidence.
- Git diff/status: changed files, additions, deletions, working tree state, diff cards, patch validation, and patch apply state.
- Agent workflow runs: LangGraph-style step status, selected graph context, LLM telemetry, generated patches, test/debug/critic loops, cancellation, and final run state.
- Debug state: breakpoints, modeled stack frames, active frame, variables, watches, console entries, and semi-real execution status.
- Future runtime traces: spans, stack traces, async hops, request IDs, event timing, thrown errors, and log anchors.
- Future test/lint events: command output, test case results, lint findings, coverage hints, flaky markers, and parsed failure locations.

Each source should keep provenance metadata. A signal should know whether it came from static graph generation, LSP, git, agent telemetry, debug state, runtime tracing, tests, lint, or manual user watchpoints.

## Planned VR-Native Primitives

### LLM Context Lens

The LLM Context Lens shows what context a model or agent is actually seeing. It should highlight selected files, symbols, diffs, diagnostics, tests, and omitted-but-nearby nodes. It should expose token budget pressure and context truncation as visual state, not as hidden logs.

### Blast Radius Bubble

The Blast Radius Bubble starts from changed files, selected symbols, diagnostics, or patches and expands through imports, callers, tests, runtime traces, and agent attention. Radius should encode expected impact; color and opacity should encode confidence and severity.

### Agent Thought Topology

Agent Thought Topology maps agent workflow steps onto the code graph. Planner, GraphRetriever, Coder, PatchApply, Tester, Debugger, Critic, and Finalizer steps should be visible as paths of attention instead of opaque text logs. It should show which nodes were inspected, edited, tested, rejected, or approved.

### Trace Rivers

Trace Rivers are future runtime paths flowing through the code world. They should connect runtime spans to static files/functions when possible, preserve timestamps and durations, and degrade to file-level or package-level traces when symbol-level mapping is missing.

### Epistemic Fog

Epistemic Fog makes uncertainty spatial. Missing test data, stale graph data, unavailable git state, disconnected agent telemetry, or runtime traces without source mapping should render as lower-confidence regions. Fog is not an error state; it is an honest indicator of what the system does not know.

### Diff Time Tunnel

The Diff Time Tunnel is a temporal corridor through changes. It should combine git diffs, agent patches, diagnostic changes, test results, debug events, and future runtime trace events into an ordered timeline that can be scrubbed without mutating files.

### Spatial Watchpoints

Spatial Watchpoints let users pin questions to code objects: a file, symbol, expression, breakpoint, diff hunk, diagnostic, or runtime span. Watchpoints should observe future signals and surface state changes without taking write actions by themselves.

### Semantic Gravity

Semantic Gravity pulls attention toward important nodes without changing the underlying layout contract. Factors can include dependency centrality, active diagnostics, diff size, runtime heat, agent attention, failing tests, debugger focus, and watchpoints. Gravity should be capped so large repos remain navigable.

## Safety Constraints

The observability layer must inherit current HoloCode safety boundaries:

- Do not change existing safe file IO semantics.
- Do not allow absolute paths or path traversal outside the configured repo root.
- Do not expand git operations beyond current safe status, diff, validation, and explicit patch apply behavior.
- Do not auto-apply patches, commits, pushes, stashes, renames, or refactors.
- Do not make LSP rename more than preview-only until a separate safe edit flow exists.
- Do not let runtime traces or logs write source files.
- Do not persist raw prompts, secrets, environment variables, or full terminal logs in observability snapshots unless a later redaction policy explicitly allows it.
- Store provenance and confidence so inferred signals are not presented as verified facts.
- Treat agent output as untrusted until validated by existing patch and test flows.

## Performance Constraints For Large Repos

The layer should be designed for repositories much larger than the demo repo:

- Keep `codegraph.json` as the stable layout input and layer observability as incremental overlays.
- Use node IDs, file paths, line ranges, and compact summaries instead of embedding full file contents.
- Cap default visible signals by relevance, severity, selection, viewport, and current mode.
- Prefer lazy expansion for traces, agent context, diagnostics, and diff hunks.
- Keep derived metrics cacheable by source snapshot version and changed file list.
- Avoid recomputing blast radius across the full graph on every render frame.
- Use bounded histories for traces, agent events, and test/lint events.
- Keep server aggregation separate from React render loops.
- Provide file-level fallbacks before symbol-level enrichment is ready.

## Graceful Degradation

The layer should still be useful when parts of the data are missing:

- Without runtime traces, Trace Rivers stay hidden and risk scores rely on static topology, git, diagnostics, tests, debug state, and agent evidence.
- Without test/lint events, Blast Radius can still show impacted tests predicted by the code graph, but confidence should be lower.
- Without agent data, Agent Thought Topology is absent while LLM Context Lens can still work from selected graph context.
- Without git data, Diff Time Tunnel shows diagnostics/debug/runtime/agent events and marks diff evidence unavailable.
- Without LSP data, diagnostics disappear and symbol precision falls back to codegraph ranges.
- Without debug state, Spatial Watchpoints can still attach to files, symbols, diagnostics, and future runtime spans.
- Without codegraph data, observability should degrade to file-level endpoint snapshots and avoid VR graph primitives that require topology.

The user experience should be quiet when data is unavailable: no blocking modals, no broken scene objects, and no fake precision. The correct fallback is a smaller, clearly lower-confidence view.

## Initial Contract Surface

The first contract lives in `src/observability/observabilityTypes.ts`. It defines additive TypeScript types for:

- unified observability graph nodes, edges, and signals;
- runtime traces and spans;
- agent traces, steps, and context snapshots;
- risk scores, blast radius, and context lens results;
- diff time tunnel events;
- spatial watchpoints;
- epistemic state and observability modes.

The server helper in `server/observability/observabilityTypes.ts` re-exports those contracts for future server-side TypeScript. No existing endpoint imports these types yet.
