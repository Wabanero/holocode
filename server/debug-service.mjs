import { promises as fs } from "node:fs";
import path from "node:path";

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDebugService({ repoRoot, readGraph }) {
  const rootDir = path.resolve(repoRoot);
  const state = {
    sessionId: null,
    status: "idle",
    targetPath: null,
    breakpoints: [],
    callStack: [],
    activeFrame: null,
    variables: [],
    watches: [],
    console: [],
    updatedAt: null
  };

  function safeRepoPath(relativeFilePath) {
    if (!relativeFilePath || typeof relativeFilePath !== "string") {
      throw new Error("Missing file path.");
    }
    if (path.isAbsolute(relativeFilePath)) {
      throw new Error("Absolute paths are not allowed.");
    }
    const normalized = toPosix(relativeFilePath).replace(/^\/+/, "");
    const absolutePath = path.resolve(rootDir, normalized);
    const rootWithSeparator = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
    if (absolutePath !== rootDir && !absolutePath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
      throw new Error(`Path is outside configured repo root: ${normalized}`);
    }
    return absolutePath;
  }

  function normalizeRepoRelativePath(relativeFilePath) {
    return toPosix(path.relative(rootDir, safeRepoPath(relativeFilePath)));
  }

  function addConsole(level, message) {
    state.console = [
      ...state.console,
      {
        id: makeId("log"),
        level,
        message,
        timestamp: now()
      }
    ].slice(-120);
  }

  function cloneState() {
    return {
      repoRoot: rootDir,
      sessionId: state.sessionId,
      status: state.status,
      targetPath: state.targetPath,
      breakpoints: state.breakpoints,
      callStack: state.callStack,
      activeFrame: state.activeFrame,
      variables: state.variables,
      watches: state.watches,
      console: state.console,
      updatedAt: state.updatedAt
    };
  }

  async function symbolForLine(graph, filePath, line) {
    return graph.nodes.find(
      (node) =>
        (node.kind === "function" || node.kind === "class") &&
        node.path === filePath &&
        (node.line || 1) <= line &&
        (node.endLine || node.line || 1) >= line
    );
  }

  function frameForNode(node, depth, label = node.name) {
    return {
      id: `${node.id}:frame:${depth}`,
      name: label,
      path: node.path,
      line: node.line || 1,
      endLine: node.endLine,
      kind: node.kind,
      sourceId: node.id,
      depth
    };
  }

  function frameForFile(filePath, depth, label = "module") {
    return {
      id: `file:${filePath}:frame:${depth}`,
      name: label,
      path: filePath,
      line: 1,
      kind: "file",
      sourceId: `file:${filePath}`,
      depth
    };
  }

  function uniqueFrames(frames) {
    const seen = new Set();
    return frames.filter((frame) => {
      const key = `${frame.sourceId}:${frame.line}:${frame.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function buildCallStack(graph, targetPath) {
    const frames = [frameForFile(targetPath, 0, "debug target")];
    const symbols = graph.nodes
      .filter((node) => (node.kind === "function" || node.kind === "class") && node.path === targetPath)
      .sort((a, b) => (a.line || 1) - (b.line || 1));

    const localFrames = symbols.slice(0, 8).map((node, index) => frameForNode(node, index + 1));
    for (const breakpoint of state.breakpoints.filter((item) => item.enabled !== false && item.path === targetPath)) {
      const symbol = await symbolForLine(graph, breakpoint.path, breakpoint.line);
      localFrames.push({
        id: `${breakpoint.id}:frame:${localFrames.length + 1}`,
        name: symbol ? `breakpoint ${symbol.name}` : "breakpoint",
        path: breakpoint.path,
        line: breakpoint.line,
        endLine: symbol?.endLine,
        kind: "breakpoint",
        sourceId: breakpoint.sourceId || symbol?.id || `file:${breakpoint.path}`,
        depth: localFrames.length + 1
      });
    }

    localFrames
      .sort((a, b) => {
        if (a.line !== b.line) return a.line - b.line;
        if (a.kind === "breakpoint") return 1;
        if (b.kind === "breakpoint") return -1;
        return a.name.localeCompare(b.name);
      })
      .forEach((frame) => frames.push({ ...frame, depth: frames.length }));

    const symbolIds = new Set(symbols.map((symbol) => symbol.id));
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const relatedEdges = graph.edges.filter(
      (edge) =>
        (edge.type === "calls" || edge.type === "uses") &&
        (symbolIds.has(edge.source) || edge.source === `file:${targetPath}`)
    );
    for (const edge of relatedEdges.slice(0, 5)) {
      const target = nodesById.get(edge.target);
      if (target && (target.kind === "function" || target.kind === "class")) {
        frames.push(frameForNode(target, frames.length, `${target.name}() call`));
      }
    }

    const importEdges = graph.edges.filter((edge) => edge.type === "imports" && edge.source === `file:${targetPath}`);
    for (const edge of importEdges.slice(0, 4)) {
      const target = nodesById.get(edge.target);
      if (target?.kind === "file") {
        frames.push(frameForFile(target.path, frames.length, `import ${target.name}`));
      }
    }

    for (const breakpoint of state.breakpoints.filter((item) => item.enabled !== false && item.path !== targetPath)) {
      if (frames.length < 3) {
        const symbol = await symbolForLine(graph, breakpoint.path, breakpoint.line);
        frames.push(
          {
            id: `${breakpoint.id}:frame:${frames.length}`,
            name: symbol ? `breakpoint ${symbol.name}` : "breakpoint",
            path: breakpoint.path,
            line: breakpoint.line,
            endLine: symbol?.endLine,
            kind: "breakpoint",
            sourceId: breakpoint.sourceId || symbol?.id || `file:${breakpoint.path}`,
            depth: frames.length
          }
        );
      }
    }

    return uniqueFrames(frames).map((frame, index) => ({ ...frame, depth: index, id: `${frame.sourceId}:frame:${index}` }));
  }

  async function readSourceLine(filePath, line) {
    try {
      const content = await fs.readFile(safeRepoPath(filePath), "utf8");
      return content.split(/\r?\n/)[Math.max(0, line - 1)]?.trim() || "";
    } catch {
      return "";
    }
  }

  function evaluateWatches(frame, variables) {
    const values = new Map(variables.map((variable) => [variable.name, variable.value]));
    state.watches = state.watches.map((watch) => ({
      ...watch,
      value: values.get(watch.expression) || `not evaluated: ${watch.expression}`,
      status: values.has(watch.expression) ? "ok" : "unavailable",
      updatedAt: now()
    }));
  }

  async function refreshVariables(graph) {
    const frame = state.activeFrame;
    if (!frame) {
      state.variables = [];
      return;
    }
    const fileNode = graph.nodes.find((node) => node.kind === "file" && node.path === frame.path);
    const symbols = graph.nodes.filter((node) => (node.kind === "function" || node.kind === "class") && node.path === frame.path);
    const imports = graph.edges.filter((edge) => edge.type === "imports" && edge.source === `file:${frame.path}`);
    const breakpoints = state.breakpoints.filter((breakpoint) => breakpoint.path === frame.path);
    const sourceLine = await readSourceLine(frame.path, frame.line);
    state.variables = [
      { name: "file", value: frame.path, type: "string", scope: "frame" },
      { name: "line", value: String(frame.line), type: "number", scope: "frame" },
      { name: "frame", value: frame.name, type: frame.kind, scope: "frame" },
      { name: "source", value: sourceLine || "(empty line)", type: "string", scope: "locals" },
      { name: "symbols", value: String(symbols.length), type: "number", scope: "module" },
      { name: "imports", value: String(imports.length), type: "number", scope: "module" },
      { name: "breakpoints", value: String(breakpoints.length), type: "number", scope: "debug" },
      { name: "loc", value: String(fileNode?.loc || fileNode?.size || 0), type: "number", scope: "module" }
    ];
    evaluateWatches(frame, state.variables);
  }

  async function syncActiveFrame(graph, frameIndex) {
    state.activeFrame = state.callStack[frameIndex] || null;
    await refreshVariables(graph);
    state.updatedAt = now();
  }

  async function addBreakpoint({ path: filePath, line }) {
    const normalizedPath = normalizeRepoRelativePath(filePath);
    await fs.access(safeRepoPath(normalizedPath));
    const safeLine = Math.max(1, Number(line || 1));
    const graph = await readGraph();
    const symbol = await symbolForLine(graph, normalizedPath, safeLine);
    const existing = state.breakpoints.find((breakpoint) => breakpoint.path === normalizedPath && breakpoint.line === safeLine);
    if (existing) {
      addConsole("info", `Breakpoint already exists at ${normalizedPath}:${safeLine}`);
      return cloneState();
    }
    state.breakpoints = [
      ...state.breakpoints,
      {
        id: makeId("bp"),
        path: normalizedPath,
        line: safeLine,
        enabled: true,
        sourceId: symbol?.id || `file:${normalizedPath}`,
        createdAt: now()
      }
    ];
    addConsole("info", `Breakpoint added at ${normalizedPath}:${safeLine}`);
    state.updatedAt = now();
    return cloneState();
  }

  async function removeBreakpoint({ id, path: filePath, line }) {
    const normalizedPath = filePath ? normalizeRepoRelativePath(filePath) : null;
    const safeLine = line ? Math.max(1, Number(line)) : null;
    const before = state.breakpoints.length;
    state.breakpoints = state.breakpoints.filter((breakpoint) => {
      if (id) return breakpoint.id !== id;
      return !(breakpoint.path === normalizedPath && breakpoint.line === safeLine);
    });
    addConsole(before === state.breakpoints.length ? "warn" : "info", before === state.breakpoints.length ? "No matching breakpoint found." : "Breakpoint removed.");
    state.updatedAt = now();
    return cloneState();
  }

  async function start({ path: filePath, line }) {
    const normalizedPath = normalizeRepoRelativePath(filePath);
    await fs.access(safeRepoPath(normalizedPath));
    const graph = await readGraph();
    state.sessionId = makeId("debug");
    state.status = "paused";
    state.targetPath = normalizedPath;
    state.callStack = await buildCallStack(graph, normalizedPath);

    let activeIndex = 0;
    const requestedLine = Number(line || 0);
    const firstBreakpoint = state.breakpoints.find((breakpoint) => breakpoint.path === normalizedPath && breakpoint.enabled !== false);
    if (firstBreakpoint) {
      activeIndex = Math.max(
        0,
        state.callStack.findIndex((frame) => frame.path === firstBreakpoint.path && frame.line === firstBreakpoint.line)
      );
    } else if (requestedLine) {
      const index = state.callStack.findIndex((frame) => frame.path === normalizedPath && frame.line >= requestedLine);
      activeIndex = index >= 0 ? index : 0;
    }

    await syncActiveFrame(graph, activeIndex);
    addConsole("info", `Debug session started for ${normalizedPath}.`);
    return cloneState();
  }

  async function step(kind) {
    if (!state.sessionId || state.status === "idle") {
      throw new Error("No active debug session.");
    }
    const graph = await readGraph();
    const currentIndex = state.activeFrame ? state.callStack.findIndex((frame) => frame.id === state.activeFrame?.id) : -1;
    const nextIndex = Math.min(state.callStack.length - 1, currentIndex + 1);
    if (nextIndex <= currentIndex) {
      state.status = "stopped";
      state.activeFrame = null;
      state.variables = [];
      addConsole("info", "Debug session reached the end of the call stack.");
      return cloneState();
    }
    state.status = "paused";
    await syncActiveFrame(graph, nextIndex);
    addConsole("info", `${kind} -> ${state.activeFrame?.path}:${state.activeFrame?.line}`);
    return cloneState();
  }

  async function continueRun() {
    if (!state.sessionId || state.status === "idle") {
      throw new Error("No active debug session.");
    }
    const graph = await readGraph();
    const currentIndex = state.activeFrame ? state.callStack.findIndex((frame) => frame.id === state.activeFrame?.id) : -1;
    const nextBreakpoint = state.callStack.findIndex(
      (frame, index) =>
        index > currentIndex &&
        state.breakpoints.some((breakpoint) => breakpoint.path === frame.path && breakpoint.line === frame.line && breakpoint.enabled !== false)
    );
    if (nextBreakpoint >= 0) {
      state.status = "paused";
      await syncActiveFrame(graph, nextBreakpoint);
      addConsole("info", `Continued to breakpoint at ${state.activeFrame?.path}:${state.activeFrame?.line}`);
    } else {
      state.status = "stopped";
      state.activeFrame = null;
      state.variables = [];
      state.updatedAt = now();
      addConsole("info", "Continue completed. No later breakpoint was found.");
    }
    return cloneState();
  }

  async function addWatch(expression) {
    const trimmed = String(expression || "").trim();
    if (!trimmed) throw new Error("Missing watch expression.");
    state.watches = [
      ...state.watches,
      {
        id: makeId("watch"),
        expression: trimmed,
        value: "pending",
        status: "pending",
        updatedAt: now()
      }
    ];
    const graph = await readGraph();
    await refreshVariables(graph);
    addConsole("info", `Watch added: ${trimmed}`);
    return cloneState();
  }

  async function removeWatch(id) {
    state.watches = state.watches.filter((watch) => watch.id !== id);
    state.updatedAt = now();
    addConsole("info", "Watch removed.");
    return cloneState();
  }

  return {
    state: () => cloneState(),
    addBreakpoint,
    removeBreakpoint,
    start,
    stepOver: () => step("step over"),
    stepInto: () => step("step into"),
    continueRun,
    addWatch,
    removeWatch
  };
}
