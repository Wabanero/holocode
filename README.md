# HoloCode Cockpit

HoloCode Cockpit is a browser-first MVP for a VR-native programming environment. The app has been converted from a mostly flat dashboard into a 3D spatial code world: folders are districts, files are physical objects, functions orbit their parent files, imports become beams, external packages live in an outer ring, tests form a separate constellation, and agent/diff/error surfaces are spatial objects.

The real keyboard remains the precision tool for editing. Monaco is preserved inside a large floating spatial editor panel, while React Three Fiber and Three.js render the navigable project world around it.

The current loop is real file IO plus real git diff reading plus TypeScript language intelligence and debugger foundations: opening a 3D file node reads from disk, saving Monaco writes to disk, the 3D Diff Stack is generated from the repository's git state, diagnostics from the demo repo are projected into the 3D scene, and Debug Mode can model breakpoints, stack frames, variables, watches, and debug logs.

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

Open the printed local URL, usually `http://127.0.0.1:5173`.

## Useful Commands

```bash
npm run scan
npm run test
npm run lint
npm run build
```

Local LLM provider setup lives in [`docs/llm-providers.md`](docs/llm-providers.md).
The stateful local/API coding-agent workflow is documented in [`docs/langgraph-agent-orchestrator.md`](docs/langgraph-agent-orchestrator.md).
The dynamic codebase graph provider is documented in [`docs/codegraph-provider.md`](docs/codegraph-provider.md).
The planned Code Graph Observability Layer is documented in [`docs/code-graph-observability.md`](docs/code-graph-observability.md).

## Controls

- Mouse drag: orbit the camera.
- Mouse wheel: zoom.
- Click a file object: select and focus it.
- Double click a file object: open it in the floating Monaco editor.
- Click a function satellite: jump Monaco to that symbol.
- Double click a function satellite: pin it as a floating card and add a breakpoint at the symbol.
- WASD or arrow keys: move through the world.
- Q/E: move down/up.
- Top buttons: cockpit, architecture, dependency, agent, debug, diagnostics, error trace, reset.
- `Enter VR`: appears when the browser/headset supports WebXR.

## Command Examples

Use the command box or browser speech recognition when available:

```text
architecture view
cockpit view
dependency view
agent view
error trace view
show diagnostics
show errors
focus file SceneManager
open file SceneManager
open related tests
open callers
open imports
arrange source and test
compare with diff
close other panels
current file only
current module only
show changed files only
show diagnostics only
hide functions
show dependencies
hide dependencies
show callers
show tests
show functions
pin function initializeScene
create agent task
run agent
run task 001
show diff
go to definition
find references
debug current file
add breakpoint
remove breakpoint
step over
step into
continue
show variables
git status
save file
save workspace
restore workspace
reset workspace
reset layout
```

## Real File And Git Loop

The backend serves safe file and git endpoints rooted at the configured repository:

- `GET /api/files/read?path=src/SceneManager.ts` reads a file.
- `POST /api/files/save` writes `{ "path": "...", "content": "..." }`.
- `GET /api/git/status` returns parsed `git status --porcelain`.
- `GET /api/git/diff` returns the current git diff plus parsed changed files.
- `GET /api/git/diff-summary` returns changed files with status, additions, and deletions.
- `GET /api/graph/stats` returns provider graph metrics.
- `GET /api/graph/export` returns the VR-ready graph shape.
- `POST /api/graph/query` retrieves task-local graph context for agents.
- `POST /api/graph/blast-radius` returns reverse dependency and test impact.
- `POST /api/graph/rebuild` rebuilds the configured graph provider.
- `GET /api/graph/events` streams graph rebuild/query events.
- `POST /api/patch/validate` runs `git apply --check` for an agent result diff.
- `POST /api/patch/apply` creates a safe branch and applies a validated patch.
- `POST /api/patch/reject` marks an agent result patch as rejected without applying it.
- `POST /api/agent/run` starts a configured local agent command for `{ "taskId": "task_001" }`.
- `POST /api/agent/workflow/run` runs the stateful LangGraph-style coding workflow for a task.
- `GET /api/agent/workflow/runs` returns in-memory workflow run snapshots and graph edges.
- `POST /api/agent/workflow/cancel` cancels a running workflow task.
- `GET /api/agent/runs` returns current in-memory agent run snapshots.
- `GET /api/agent/events` streams agent run/log events to the browser through Server-Sent Events.
- `GET /api/session` reads `.holocode/session.json`.
- `POST /api/session` saves sanitized workspace session metadata.
- `POST /api/session/reset` deletes the saved workspace session.

By default the target repo is `/demo-repo`. Set `HOLOCODE_REPO_ROOT` before starting the server to point at another repo.

Safety boundaries:

- Absolute paths are rejected.
- Path traversal outside the configured repo root is rejected.
- File paths are normalized before read/write.
- Git commands run with the configured repo root as their working directory.
- If git is missing, not initialized, or a command fails, the API returns a clear error and the terminal panel reports it.
- Agent patch paths must match `.agent_tasks/task_*_result.diff`.
- Patch apply blocks on a dirty working tree.
- Patch apply uses a new branch named `holocode/task-001` for `task_001_result.diff`.
- Patch application does not commit, push, or apply hunks selectively yet.
- Agent execution never auto-applies patches. Result diffs must still pass validation and an explicit apply click.

The 3D file nodes now show real state:

- dirty editor buffer: red marker
- modified git file: amber marker
- added git file: green marker
- deleted git file: red git state in the Diff Stack

The 3D Diff Stack is no longer based on mocked agent result files. It reads the current git diff, renders one card per changed file, and opens a readable diff panel when a card is clicked.

Agent-produced result diffs also appear as 3D patch cards. Each patch card can be validated, applied, or rejected. Validation and apply output is written to the terminal panel, and patch state is persisted next to the task as `.agent_tasks/task_001_patch.json`.

## Multi-File Spatial Editing

HoloCode supports multiple floating Monaco editor panels. Each file panel keeps its own buffer, dirty state, save action, and 3D position. The active panel still drives symbol actions such as hover, go to definition, references, diagnostics, and Debug Mode.

Spatial workflow commands:

- `open related tests` opens test files linked by the code graph.
- `open callers` opens files that import the active file.
- `open imports` opens imported/callee files from the active file.
- `arrange source and test` places source and test panels side by side.
- `compare with diff` opens a readable git diff review panel and focuses the Diff Stack.
- `close other panels` keeps only the active editor panel.
- `reset layout` resets editor panel positions along with the spatial camera/layout state.

Panel behavior:

- Drag an editor toolbar to move that panel in 3D space.
- Click inside a panel to make it the active programming context.
- Source/test/caller/import panels are editable and save through the same safe file API.
- Diff review panels are read-only and never write file content.
- Panels keep desktop-readable dimensions instead of shrinking into tiny thumbnails.

## Persistent Workspace Sessions

HoloCode stores the spatial workspace in `.holocode/session.json` so reloads can restore your working shape without persisting source file contents.

Persisted session state:

- opened editor panels: path, kind, position, rotation, target line, and read-only status
- pinned function cards
- selected file
- camera preset and visible scene/dependency modes
- agent dock, diff stack, diagnostics, tests, and error-path visibility
- active diff file, active diagnostic id, and current agent task id

Session commands:

- `save workspace` writes the current session immediately.
- `restore workspace` reloads `.holocode/session.json` and reopens files from disk.
- `reset workspace` deletes the saved session and clears local panels/pins/layout state.

Autosave runs after spatial layout changes, panel open/close/move, pin changes, mode changes, and visibility changes. Editor contents are not written to the session file; on restore, editable panels are repopulated through the safe file read API, and diff panels are rebuilt from the current git diff.

## Scalability And Large Repos

The 3D scene has progressive rendering controls for repositories with hundreds or thousands of files.

Level of detail:

- `module` shows folder/module districts first and hides file clutter until you focus.
- `file` shows files with capped dependency beams.
- `function` enables function satellites, but satellites are still lazy-rendered around the selected file or active debug/diagnostic context.

Filters:

- Scope can be `all`, `current-file`, or `current-module`.
- Toggle changed files only, diagnostic files only, functions, tests, external packages, and FPS overlay.
- Dependency beams are capped by default; focused/selected beams are preserved ahead of background beams.

Search and focus:

- The scalability toolbar includes fuzzy search for files, symbols, and packages.
- File results open and focus the file.
- Symbol results open the owning file and jump to the symbol line.
- Package results focus the external package ring entry.

## Planned Code Graph Observability Layer

HoloCode will add a Code Graph Observability Layer as an additive overlay on the existing static graph, git, LSP, agent workflow, and debug subsystems. The planned layer will keep `data/codegraph.json` as the stable VR layout foundation while attaching live or historical signals such as diagnostics, diffs, agent context, debug state, future runtime traces, and future test/lint events.

The initial implementation is documentation and typed contracts only. The contracts live in `src/observability/observabilityTypes.ts`, with a server-side re-export helper in `server/observability/observabilityTypes.ts`. No endpoint behavior or scene behavior changes in this step.

Performance safeguards:

- Large repos automatically start at module detail, hide function satellites, hide external packages, and reduce beam count.
- Layout generation is memoized from the scanned code graph.
- Function satellites render only when selected/focused, zoom-equivalent detail is enabled, or diagnostics/debug context needs them.
- Editor typing avoids changing scene-level dirty state arrays when the set of dirty files has not changed.
- The FPS/debug overlay reports FPS plus visible file, symbol, and beam counts.

## Configurable Local Agent Runner

HoloCode can launch an external coding agent through a local command. It does not call a cloud API directly; whatever command you configure is run locally from the backend.

The runner is configured by `holocode.config.json`:

```json
{
  "agent": {
    "command": "codex",
    "args": ["exec", "--input", "{taskFile}"],
    "workingDirectory": "."
  }
}
```

Supported placeholders:

- `{taskId}` -> `task_001`
- `{taskFile}` -> `.agent_tasks/task_001.md`
- `{taskPath}` -> `.agent_tasks/task_001.md`
- `{logFile}` -> `.agent_tasks/task_001_log.md`
- `{resultDiffFile}` -> `.agent_tasks/task_001_result.diff`
- `{workspaceRoot}` -> absolute workspace root

Flow:

1. Run `create agent task` or click `Create task` in `AgentDock3D`.
2. Run `run agent`, `run task 001`, or click `Run` / `Run latest`.
3. The backend spawns the configured command with the configured working directory.
4. stdout/stderr stream live into the spatial terminal and `.agent_tasks/task_001_log.md`.
5. If `.agent_tasks/task_001_result.diff` appears, the touched files are detected and the result appears in `DiffStack3D`.
6. Validate/apply/reject the diff through the existing patch controls.

Agent safety boundaries:

- `agent.workingDirectory` must be inside the workspace root.
- Task IDs must match `task_001` style IDs.
- The command and working directory are shown in the terminal/log panel before the process runs.
- The runner does not auto-apply, commit, push, or stash.
- A generated diff still goes through `git apply --check` and explicit patch apply.

## TypeScript LSP Layer

The backend has a TypeScript language-service layer rooted at the same configured repo as file IO. It exposes LSP-style endpoints:

- `GET /api/lsp/diagnostics` returns TypeScript syntactic, semantic, and suggestion diagnostics with per-file summary.
- `GET /api/lsp/document-symbols?path=src/App.tsx` returns TypeScript document symbols.
- `GET /api/lsp/hover?path=...&line=...&column=...` returns hover/quick-info text.
- `GET /api/lsp/definition?path=...&line=...&column=...` returns go-to-definition locations.
- `GET /api/lsp/references?path=...&line=...&column=...` returns references.
- `POST /api/lsp/rename-preview` returns rename locations as a preview only. It does not write files.

Diagnostics update after loading the graph and after saves. File nodes glow red for errors, yellow for warnings, and blue for hints/info. Function satellites with diagnostics inside their line range are marked. The Diagnostics3D object shows diagnostic cards; clicking a card opens Monaco at the exact line.

LSP safety boundaries:

- LSP file paths use the same repo-root validation as file read/save.
- Absolute paths and traversal outside the configured repo are rejected.
- Rename is preview-only in this milestone.
- External definition/reference locations can be reported, but the editor only opens repo-relative files.

## Spatial Debug Mode

The backend includes a minimal debug service with a Debug Adapter Protocol-shaped architecture, but without launching a real Node inspector yet. It stores breakpoints safely inside the configured repo, builds a call stack from the real code graph, tracks the active frame, exposes variables/watches, and writes debug console logs.

Debug API endpoints:

- `GET /api/debug/state` returns the current debug session snapshot.
- `POST /api/debug/breakpoints/add` writes `{ "path": "src/App.tsx", "line": 12 }`.
- `POST /api/debug/breakpoints/remove` removes by `{ "path": "...", "line": 12 }` or `{ "id": "..." }`.
- `POST /api/debug/start` starts Debug Mode for `{ "path": "...", "line": 12 }`.
- `POST /api/debug/step-over`, `POST /api/debug/step-into`, and `POST /api/debug/continue` move through the modeled stack.
- `POST /api/debug/watches/add` adds a watch expression to the variable model.

Debug visualization:

- Breakpoints appear as red markers on file nodes and function satellites.
- The active stack frame glows blue in the 3D world.
- The call stack is drawn as a blue route separate from `ErrorPath3D`.
- Variables and watches appear as floating cards near the active frame.
- Debug console output appears in the Debug Mode panel.

Debug safety boundaries:

- Debug paths use the same repo-root validation as file read/save.
- Absolute paths and traversal outside the configured repo are rejected.
- The current runner is semi-real: it does not execute user code, mutate files, or attach a Node inspector.

## Demo Script

1. Run `npm run scan`.
2. Start the app with `npm run dev`.
3. Use `architecture view`.
4. Run `focus file SceneManager`.
5. Run `show dependencies`.
6. Double click `SceneManager.ts` to open the spatial editor.
7. Click or double click a function satellite to jump/pin it.
8. Edit a line and run `save file`.
9. Run `git status` and inspect the terminal output.
10. Run `open related tests`, then `arrange source and test`.
11. Run `open callers` or `open imports` to build a caller/callee layout.
12. Drag a panel toolbar to adjust the spatial layout.
13. Run `compare with diff` and inspect the real 3D Diff Stack plus the readable diff panel.
14. Run `save workspace`, reload the browser, then run `restore workspace` if autosave has not already restored it.
15. Click a diff card to open the readable diff panel.
16. Run `create agent task` if you want to generate an external-agent task file.
17. Run `run agent` to execute the configured local command for the latest task.
18. Run `show diagnostics` or `show errors` to focus Diagnostics3D.
19. Click a diagnostic card to open Monaco at the reported line.
20. Place the cursor on a symbol and run `go to definition` or `find references`.
21. Run `add breakpoint`, then `debug current file`.
22. Use `step over`, `step into`, `continue`, and `show variables`.
23. Run `error trace view` to show the mocked test stack path, separate from live Debug Mode.

## Architecture

- `/src/scene/CodeWorld3D.tsx` is the full-screen Canvas scene.
- `/src/scene/layout/layout3d.ts` converts `codegraph.json` into deterministic 3D positions.
- `/src/scene/objects` contains folders, files, satellites, beams, packages, tests, agents, diffs, errors, and floating panels.
- `/src/scene/CameraController.tsx` owns OrbitControls, camera presets, and keyboard navigation.
- `/src/editor` keeps Monaco, multi-file editor buffers, and function context UI.
- `/src/voice` keeps transcript -> intent -> action dispatch.
- `/src/agents` keeps readable agent/diff panels.
- `/src/state` contains the Zustand store for file editing and 3D scene state.
- `/server` contains the Vite/Express dev server, code graph provider, TypeScript language-service layer, agent orchestrator, and debug service.
- `/demo-repo` is the local TypeScript project loaded by the MVP.
- `/data/codegraph.json` is generated by the configured CodeGraphProvider from the active repo.
- `/.agent_tasks` is the file bridge for Codex, Cursor, Claude Code, Cline, or other external agents.
- `/.holocode/session.json` stores local spatial workspace session metadata.

## Demo Flow For Real Diffs

1. Start with `npm run dev`.
2. Double click `SceneManager.ts` in the 3D world.
3. Edit a harmless line in Monaco.
4. Click `Save` or run `save file`.
5. Run `compare with diff`.
6. In Agent View, click the `SceneManager.ts` diff card.
7. Inspect the real git hunk in the spatial readable diff panel or the read-only diff editor panel.

## Demo Flow For Source/Test Editing

1. Start with `npm run dev`.
2. Double click `SceneManager.ts` in the 3D world.
3. Run `open related tests`.
4. Run `arrange source and test`.
5. Edit either panel and save from that panel toolbar.
6. Run `open imports` or `open callers` to expand into a caller/callee layout.
7. Run `close other panels` to return to the active file.

## Demo Flow For Workspace Restore

1. Start with `npm run dev`.
2. Open `SceneManager.ts` and a related test/import panel.
3. Pin a function card.
4. Drag one editor panel to a different 3D position.
5. Run `save workspace`.
6. Reload the browser.
7. The workspace restores from `.holocode/session.json`; run `restore workspace` manually if needed.
8. Run `reset workspace` to clear the saved local session.

## Demo Flow For Agent Patch Apply

1. Run `create agent task`.
2. Run `run agent`, or put a patch file at `.agent_tasks/task_001_result.diff` manually.
3. Run `agent view`.
4. Inspect the streamed log panel and the command/cwd shown for the run.
5. Find the agent patch card in the Agent Dock or Diff Stack.
6. Click `Check` to run `git apply --check`.
7. Click `Apply` to create `holocode/task-001` and apply the patch.
8. Inspect terminal output and the refreshed git diff/status.
9. Click `Reject` to mark a patch as rejected without changing files.

## Demo Flow For Spatial Diagnostics

1. Start with `npm run dev`.
2. Open `App.tsx` in the floating Monaco editor.
3. Run `show diagnostics`.
4. Inspect the Diagnostics3D cards and the file-node glow state.
5. Click a diagnostic card to jump to its line.
6. Place the cursor on `SceneManager` or another symbol.
7. Run `go to definition`.
8. Run `find references` to populate the Diagnostics3D detail panel.

## Demo Flow For Debug Mode

1. Start with `npm run dev`.
2. Open `App.tsx` in the floating Monaco editor.
3. Place the cursor on a useful line and run `add breakpoint`.
4. Run `debug current file`.
5. Inspect the blue Debug Mode stack route in the 3D world.
6. Run `show variables` to inspect the active frame cards.
7. Run `step over` or `step into`.
8. Run `continue` to jump to the next modeled breakpoint or stop the session.

## Code Graph Data

The internal CodeGraphProvider extracts repository, directory, file, module, import/export, package script, function, method, class, interface/type, import/reference, reverse dependency, and related test relationships. It remains heuristic by design for this MVP, and the provider contract is intended to let richer graph backends replace it without changing agent or VR contracts.

## Current Limitations

- WebXR entry is available through Three's VR button, but headset interaction/ray input is not yet product-grade.
- Monaco is spatial through `drei` `Html`, not a native 3D text editor.
- Workspace sessions persist layout metadata only; unsaved editor contents are intentionally not stored.
- Patch application is real but intentionally conservative: clean tree only, new branch only, no partial hunk selection.
- Test and lint buttons are API placeholders; graph scanning is real.
- Error path visualization is currently mocked from demo repo objects.
- Debug Mode is a safe semi-real runner over the code graph, not a full Debug Adapter Protocol or Node inspector implementation yet.
- Agent execution is real process spawning, but only for the configured local command; installing and authenticating that tool is outside HoloCode.
- The internal code graph parser is still heuristic, but the provider interface is designed for tree-sitter, code-review-graph, Understand-Anything, CodeGraphContext, emerge, MCP graph servers, Neo4j/FalkorDB, or SQLite stores.
- Rename is a language-service preview only; applying rename edits is not implemented yet.

## Next Steps Toward True VR

- Add controller ray selection and hand-tracking interactions.
- Add seated XR layout presets and keyboard passthrough assumptions.
- Add autocomplete/code actions on top of the TypeScript language layer.
- Replace the semi-real debug runner with a real Debug Adapter Protocol / Node inspector bridge.
- Add patch hunk selection.
- Add richer local agent profiles and task templates around `.agent_tasks`.
- Stream real test/lint process output.
- Render runtime stack traces from real logs instead of mocked routes.
