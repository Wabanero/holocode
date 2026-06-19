# Codebase Graph Provider

HoloCode uses a dynamic codebase graph as its main context engine. Static rules can still exist, but they are no longer the primary way agents learn the repo. The cockpit now asks a structural graph for context, impact, dependency paths, tests, and VR-ready topology.

The philosophy is:

> Graph context replaces static rules. Rules can still exist, but the main context engine is structural and dynamic.

This matters because rules are broad and easy to forget, while graph context is local to the task: selected file, imported files, callers, symbols, related tests, patch impact, and current errors.

## Provider Interface

The provider contract lives in `server/codegraph-provider.mjs`:

```js
buildGraph(repoPath)
updateGraph(changedFiles)
getGraphStats()
queryRelevantContext(task, hints)
getFileSubgraph(filePath, depth)
getSymbolSubgraph(symbolId, depth)
getDependencyPath(source, target)
getBlastRadius(changedFiles)
exportGraphForVR(options)
searchSymbols(query)
getTestsForFiles(files)
```

The internal provider is `InternalCodeGraphProvider`. It currently uses a minimal JS/TS/TSX parser over file-tree, import/export, symbol, method, package-script, and test heuristics. Tree-sitter is not required in this build; the parser is intentionally replaceable.

Graph JSON is stored at `data/codegraph.json` by default, matching the existing backend flow.

`updateGraph(changedFiles)` currently performs a conservative rebuild through the provider. The method exists as the incremental-update entry point for a future tree-sitter, SQLite, Neo4j, FalkorDB, or MCP-backed implementation.

## Graph Schema

Supported node types include:

- `repository`
- `directory`
- `file`
- `module`
- `class`
- `function`
- `method`
- `interface`
- `type`
- `import`
- `export`
- `test`
- `package/script`
- `package`
- `error`
- `agent_task`
- `patch`

Supported edge types include:

- `contains`
- `imports`
- `exports`
- `calls`
- `references`
- `extends`
- `implements`
- `tests`
- `depends_on`
- `changed_by_patch`
- `affected_by`
- `error_at`
- `related_to_task`

The backend keeps backward-compatible `file`, `function`, `class`, and `imports` shapes so the existing 3D scene still works.

## Context Retrieval

`queryRelevantContext(task, hints)` returns:

- top relevant files;
- relevant symbols;
- dependency paths;
- impacted tests;
- compact snippets;
- blast radius;
- selected subgraph;
- graph stats;
- graph explanation.

The LangGraph `GraphRetrieverAgent` consumes this object directly and stores graph stats plus selected subgraph telemetry on the orchestrator state.

## VR Export

`GET /api/graph/export` returns:

```json
{
  "nodes": [
    { "id": "file:src/App.tsx", "label": "App.tsx", "type": "file", "path": "src/App.tsx", "metrics": {} }
  ],
  "edges": [
    { "id": "file:src/App.tsx->file:src/SceneManager.ts:imports", "source": "file:src/App.tsx", "target": "file:src/SceneManager.ts", "type": "imports", "weight": 1 }
  ],
  "clusters": [
    { "id": "cluster:src", "label": "src", "nodeIds": ["file:src/App.tsx"], "type": "directory" }
  ],
  "stats": {
    "nodeCount": 1,
    "edgeCount": 1,
    "fileCount": 1,
    "symbolCount": 0,
    "testCount": 0
  }
}
```

Per-node metrics include lines of code, import count, dependent count, changed lines, error count, test relation, and agent attention score when available.

## API

- `GET /api/graph/stats`
- `GET /api/graph/export`
- `POST /api/graph/query`
- `POST /api/graph/blast-radius`
- `POST /api/graph/rebuild`
- `GET /api/graph/events`

Graph events also flow through the existing agent SSE stream:

- `graph_rebuild_started`
- `graph_rebuild_completed`
- `graph_query_completed`
- `graph_context_selected`

## Provider Switching

Configure the provider in `holocode.config.json`:

```json
{
  "graph": {
    "type": "internal"
  }
}
```

Environment overrides:

```powershell
$env:GRAPH_PROVIDER = "internal"
$env:GRAPH_EXTERNAL_COMMAND = "my-graph-tool --repo {repoPath} --out {outputPath}"
$env:GRAPH_EXTERNAL_OUTPUT_PATH = "C:\\path\\to\\graph.json"
$env:GRAPH_MCP_SERVER_URL = "http://127.0.0.1:8765"
```

Older `HOLOCODE_GRAPH_PROVIDER`, `HOLOCODE_GRAPH_PATH`, `HOLOCODE_GRAPH_EXPORT_PATH`, and `HOLOCODE_GRAPH_ENDPOINT` names still work as compatibility aliases.

Available providers:

- `internal`: scans the local repo with the built-in JS/TS graph builder.
- `external_json`: reads a configured JSON export or runs a configured command, then normalizes the result.
- `mcp`: posts `{ repoPath }` to `<GRAPH_MCP_SERVER_URL>/graph` and normalizes the response.
- `code-review-graph`: alias over `external_json` for a future code-review-graph export.
- `emerge`: alias over `external_json` for a future glato/emerge-style export.

No external repository is vendored or hard-required. External tools live behind adapters.

## External Graph Contract

External adapters accept this stable import shape:

```json
{
  "nodes": [
    {
      "id": "string",
      "type": "file|function|class|module|test|unknown",
      "label": "string",
      "path": "optional/repo-relative/path.ts",
      "metadata": {}
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "node id",
      "target": "node id",
      "type": "imports|calls|contains|tests|depends_on|references|unknown",
      "weight": 1,
      "metadata": {}
    }
  ]
}
```

The adapter also accepts common variants from external tools:

- node `kind` or `nodeType` is treated like `type`;
- edge `kind` or `edgeType` is treated like `type`;
- edge `from`/`to` is treated like `source`/`target`;
- `source_file`, `test_file`, `func`, `method`, and `symbol` are normalized to internal concepts;
- `import`, `call`, `reference`, `uses`, `depends`, and `dependency` are normalized to internal edge types.

The normalized internal graph keeps cockpit compatibility:

```json
{
  "nodes": [
    {
      "id": "file:src/App.tsx",
      "kind": "file",
      "type": "file",
      "label": "App.tsx",
      "path": "src/App.tsx",
      "metadata": {
        "externalProvider": "external_json",
        "externalId": "tool-specific-id"
      }
    }
  ],
  "edges": [
    {
      "id": "file:src/App.tsx->file:src/SceneManager.ts:imports",
      "source": "file:src/App.tsx",
      "target": "file:src/SceneManager.ts",
      "type": "imports",
      "weight": 1,
      "metadata": {}
    }
  ]
}
```

Malformed graphs are rejected. Unknown but well-formed node or edge types are accepted as `unknown`, logged in `graph.validation.warnings`, and preserve original fields under `metadata`.

## External Command Mode

`ExternalJsonCodeGraphProvider` can run a configured local command without using a shell:

```powershell
$env:GRAPH_PROVIDER = "external_json"
$env:GRAPH_EXTERNAL_COMMAND = "code-review-graph --repo {repoPath} --json {outputPath}"
$env:GRAPH_EXTERNAL_OUTPUT_PATH = "C:\\tmp\\code-review-graph.json"
```

Placeholders:

- `{repoPath}` resolves to the repository root the cockpit is indexing.
- `{outputPath}` resolves to `GRAPH_EXTERNAL_OUTPUT_PATH`.

The command may either write JSON to the output path or print the JSON object to stdout. The app never executes shell commands generated by the LLM; only the configured command is used.

## External Graph API

Import JSON directly:

```http
POST /api/graph/import
```

Body:

```json
{
  "providerType": "external_json",
  "graph": {
    "nodes": [],
    "edges": []
  }
}
```

Trigger the configured external command or MCP provider:

```http
POST /api/graph/rebuild-external
```

Export the normalized graph for VR:

```http
GET /api/graph/export
```

Future integrations can plug in tree-sitter, code-review-graph, Understand-Anything, CodeGraphContext, emerge, Axon, MCP graph servers, Neo4j, FalkorDB, or SQLite without changing the LangGraph agent contract. Their only responsibility is to produce a graph that the adapter can normalize.
