import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const GRAPH_EVENT_TYPES = {
  rebuildStarted: "graph_rebuild_started",
  rebuildCompleted: "graph_rebuild_completed",
  queryCompleted: "graph_query_completed",
  contextSelected: "graph_context_selected"
};

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const TEXT_EXTENSIONS = new Set([...CODE_EXTENSIONS, ".json", ".md", ".css", ".scss", ".html", ".yaml", ".yml", ".toml"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".agent_tasks", ".holocode", ".next", ".vite", "target"]);
const CALL_EXCLUDES = new Set([
  "if",
  "for",
  "while",
  "switch",
  "catch",
  "return",
  "typeof",
  "new",
  "await",
  "import",
  "console",
  "super"
]);
const EXTERNAL_NODE_TYPES = new Map([
  ["file", "file"],
  ["source_file", "file"],
  ["test_file", "test"],
  ["test", "test"],
  ["module", "module"],
  ["package", "module"],
  ["function", "function"],
  ["func", "function"],
  ["method", "function"],
  ["class", "class"],
  ["interface", "class"],
  ["type", "class"],
  ["symbol", "function"]
]);
const EXTERNAL_EDGE_TYPES = new Map([
  ["contains", "contains"],
  ["contains_symbol", "contains"],
  ["defines", "contains"],
  ["imports", "imports"],
  ["import", "imports"],
  ["calls", "calls"],
  ["call", "calls"],
  ["references", "references"],
  ["reference", "references"],
  ["uses", "references"],
  ["tests", "tests"],
  ["test", "tests"],
  ["depends_on", "depends_on"],
  ["depends", "depends_on"],
  ["dependency", "depends_on"]
]);

function now() {
  return new Date().toISOString();
}

function toPosix(value) {
  return String(value || "").split(path.sep).join("/");
}

function normalizePath(value) {
  return toPosix(value).replace(/^\/+/, "");
}

function safeRelativePath(value) {
  const normalized = normalizePath(value);
  if (!normalized || normalized.includes("\0")) return null;
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) return null;
  if (normalized.split("/").some((part) => part === "..")) return null;
  return normalized;
}

function fileId(filePath) {
  return `file:${normalizePath(filePath)}`;
}

function directoryId(directoryPath) {
  const normalized = normalizePath(directoryPath || ".");
  return `directory:${normalized || "."}`;
}

function moduleId(filePath) {
  return `module:${normalizePath(filePath)}`;
}

function symbolId(filePath, symbolName) {
  return `symbol:${normalizePath(filePath)}#${symbolName}`;
}

function methodId(filePath, className, methodName) {
  return `symbol:${normalizePath(filePath)}#${className}.${methodName}`;
}

function importId(filePath, line, specifier) {
  return `import:${normalizePath(filePath)}:${line}:${specifier}`;
}

function exportId(filePath, line, exportedName) {
  return `export:${normalizePath(filePath)}:${line}:${exportedName}`;
}

function packageId(packageName) {
  return `package:${packageName}`;
}

function scriptId(scriptName) {
  return `script:${scriptName}`;
}

function repoId(repoPath) {
  return `repository:${path.basename(repoPath) || "repo"}`;
}

function lineForIndex(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function countLoc(content) {
  return content.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("//")).length;
}

function detectLanguage(filePathValue) {
  const ext = path.extname(filePathValue).toLowerCase();
  if (ext === ".tsx" || ext === ".jsx") return "tsx";
  if (ext === ".ts" || ext === ".mts" || ext === ".cts") return "typescript";
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs" || ext === ".jsx") return "javascript";
  if (ext === ".json") return "json";
  if (ext === ".md") return "markdown";
  return "text";
}

function isCodeFile(filePathValue) {
  return CODE_EXTENSIONS.has(path.extname(filePathValue).toLowerCase());
}

function isTextFile(filePathValue) {
  return TEXT_EXTENSIONS.has(path.extname(filePathValue).toLowerCase());
}

function isTestPath(filePathValue) {
  const normalized = normalizePath(filePathValue).toLowerCase();
  return /(^|\/)(test|tests|__tests__)\//.test(normalized) || /\.(test|spec)\.[tj]sx?$/.test(normalized);
}

function edgeId(source, target, type, suffix = "") {
  return `${source}->${target}:${type}${suffix ? `:${suffix}` : ""}`;
}

function addNode(nodes, nodeMap, node) {
  if (nodeMap.has(node.id)) {
    Object.assign(nodeMap.get(node.id), node);
    return nodeMap.get(node.id);
  }
  nodeMap.set(node.id, node);
  nodes.push(node);
  return node;
}

function addEdge(edges, seenEdges, source, target, type, metadata = {}) {
  const id = metadata.id || edgeId(source, target, type, metadata.line || metadata.name || "");
  if (seenEdges.has(id)) return null;
  seenEdges.add(id);
  const edge = { id, source, target, type, ...metadata };
  edges.push(edge);
  return edge;
}

function packageNameFor(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return `${scope}/${name}`;
  }
  return specifier.split("/")[0];
}

function parseImports(content) {
  const imports = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const staticMatch = trimmed.match(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/);
    const sideEffectMatch = trimmed.match(/^import\s+["']([^"']+)["']/);
    const dynamicMatch = trimmed.match(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/);
    const specifier = staticMatch?.[2] || sideEffectMatch?.[1] || dynamicMatch?.[1];
    if (!specifier) return;

    const importedNames = [];
    const named = staticMatch?.[1]?.match(/\{\s*([^}]+)\s*\}/)?.[1];
    if (named) {
      importedNames.push(
        ...named
          .split(",")
          .map((part) => part.trim().split(/\s+as\s+/i)[0])
          .filter(Boolean)
      );
    }
    const defaultMatch = staticMatch?.[1]?.match(/^([A-Za-z_$][\w$]*)/);
    if (defaultMatch && defaultMatch[1] !== "type") importedNames.unshift(defaultMatch[1]);

    imports.push({
      specifier,
      line: index + 1,
      importedNames: [...new Set(importedNames)],
      dynamic: Boolean(dynamicMatch && !staticMatch && !sideEffectMatch)
    });
  });

  return imports;
}

function parseExports(content) {
  const exports = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("export")) return;

    const declaration = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([A-Za-z_$][\w$]*)/);
    if (declaration) {
      exports.push({ name: declaration[1], line: index + 1, specifier: null });
      return;
    }

    const named = trimmed.match(/^export\s+\{\s*([^}]+)\s*\}(?:\s+from\s+["']([^"']+)["'])?/);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/i).pop();
        if (name) exports.push({ name, line: index + 1, specifier: named[2] || null });
      }
    }
  });
  return exports;
}

function findMatchingBrace(content, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return index;
  }
  return content.length;
}

function parseSymbols(content, filePathValue) {
  const patterns = [
    {
      kind: "function",
      regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm
    },
    {
      kind: "function",
      regex: /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm
    },
    {
      kind: "class",
      regex: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?(?:\s+implements\s+([^{]+))?/gm
    },
    {
      kind: "interface",
      regex: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([^{]+))?/gm
    },
    {
      kind: "type",
      regex: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/gm
    }
  ];

  const matches = [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern.regex)) {
      matches.push({
        name: match[1],
        kind: pattern.kind,
        index: match.index ?? 0,
        line: lineForIndex(content, match.index ?? 0),
        extendsName: match[2]?.trim() || null,
        implementsNames: match[3]
          ? match[3]
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : []
      });
    }
  }

  matches.sort((a, b) => a.index - b.index);
  const symbols = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const body = content.slice(match.index, next?.index ?? content.length);
    const bodyLines = body.split(/\r?\n/);
    const calls = [...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
      .map((call) => call[1])
      .filter((name) => !CALL_EXCLUDES.has(name) && name !== match.name);

    symbols.push({
      id: symbolId(filePathValue, match.name),
      name: match.name,
      path: filePathValue,
      kind: match.kind,
      type: match.kind,
      line: match.line,
      endLine: next ? lineForIndex(content, next.index) - 1 : content.split(/\r?\n/).length,
      size: Math.max(1, bodyLines.length),
      metrics: {
        loc: Math.max(1, bodyLines.filter((line) => line.trim()).length),
        complexity: 1 + (body.match(/\b(if|for|while|switch|catch|&&|\|\|)\b/g) || []).length
      },
      complexity: 1 + (body.match(/\b(if|for|while|switch|catch|&&|\|\|)\b/g) || []).length,
      calls: [...new Set(calls)],
      extendsName: match.extendsName,
      implementsNames: match.implementsNames
    });

    if (match.kind === "class") {
      const openBrace = content.indexOf("{", match.index);
      const closeBrace = openBrace >= 0 ? findMatchingBrace(content, openBrace) : match.index;
      const classBody = content.slice(openBrace + 1, closeBrace);
      const methodRegex = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm;
      for (const methodMatch of classBody.matchAll(methodRegex)) {
        const methodName = methodMatch[1];
        if (methodName === "constructor") continue;
        const methodLine = lineForIndex(content, openBrace + 1 + (methodMatch.index ?? 0));
        symbols.push({
          id: methodId(filePathValue, match.name, methodName),
          name: methodName,
          symbolName: `${match.name}.${methodName}`,
          path: filePathValue,
          kind: "method",
          type: "method",
          line: methodLine,
          endLine: methodLine,
          size: 1,
          metrics: { loc: 1, complexity: 1 },
          complexity: 1,
          calls: [],
          parentSymbolId: symbolId(filePathValue, match.name)
        });
      }
    }
  }

  return symbols.sort((a, b) => (a.line || 0) - (b.line || 0));
}

function resolveRelativeImport(rootDir, fromAbsolutePath, specifier, knownFiles) {
  const base = path.resolve(path.dirname(fromAbsolutePath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
    path.join(base, "index.mjs")
  ];
  const known = new Set(knownFiles.map((filePathCandidate) => path.normalize(filePathCandidate).toLowerCase()));
  const match = candidates.find((candidate) => known.has(path.normalize(candidate).toLowerCase()));
  return match ? toPosix(path.relative(rootDir, match)) : null;
}

async function collectEntries(rootDir, currentDir = rootDir) {
  const dirents = await fs.readdir(currentDir, { withFileTypes: true });
  const entries = [];

  for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
    if (dirent.isDirectory() && SKIP_DIRS.has(dirent.name)) continue;
    const absolutePath = path.join(currentDir, dirent.name);
    const relPath = toPosix(path.relative(rootDir, absolutePath));

    if (dirent.isDirectory()) {
      entries.push({
        name: dirent.name,
        path: relPath,
        kind: "folder",
        children: await collectEntries(rootDir, absolutePath)
      });
      continue;
    }

    if (dirent.isFile()) {
      entries.push({
        name: dirent.name,
        path: relPath,
        kind: "file",
        extension: path.extname(dirent.name)
      });
    }
  }

  return entries;
}

function flattenTree(entries, output = []) {
  for (const entry of entries) {
    output.push(entry);
    if (entry.children) flattenTree(entry.children, output);
  }
  return output;
}

function termsFrom(task, hints = {}) {
  const text = [
    task,
    hints.currentFile,
    hints.currentSymbol,
    ...(hints.selectedFiles || []),
    ...(hints.selectedSymbols || []),
    ...(hints.likelyFiles || [])
  ].join(" ");
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9_./-]{3,}/g) || [])];
}

function snippetFor(content, terms, maxChars = 1200) {
  if (!content) return "";
  const lower = content.toLowerCase();
  const hit = terms.map((term) => lower.indexOf(term.toLowerCase())).find((index) => index >= 0);
  if (hit === undefined || hit < 0 || content.length <= maxChars) return content.slice(0, maxChars);
  const start = Math.max(0, hit - Math.floor(maxChars / 3));
  return content.slice(start, start + maxChars);
}

function normalizeSourceTarget(graph, value) {
  const raw = String(value || "");
  if (graph.nodes.some((node) => node.id === raw)) return raw;
  const pathValue = safeRelativePath(raw);
  if (pathValue && graph.nodes.some((node) => node.id === fileId(pathValue))) return fileId(pathValue);
  const symbol = graph.nodes.find((node) => node.name === raw || node.symbolName === raw);
  return symbol?.id || raw;
}

export class CodeGraphProvider {
  constructor(config = {}) {
    this.config = config;
    this.repoPath = config.repoPath ? path.resolve(config.repoPath) : null;
    this.dataPath = config.dataPath ? path.resolve(config.dataPath) : null;
    this.graph = null;
    this.emitter = new EventEmitter();
  }

  emit(type, payload = {}) {
    const event = { type, timestamp: now(), provider: this.config.type || "internal", ...payload };
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener) {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  async buildGraph() {
    throw new Error("buildGraph(repoPath) is not implemented.");
  }

  async updateGraph(changedFiles = []) {
    return this.buildGraph(this.repoPath, { changedFiles });
  }

  async importGraphFromJson(raw, repoPath = this.repoPath, options = {}) {
    if (!repoPath) throw new Error("repoPath is required.");
    this.repoPath = path.resolve(repoPath);
    this.emit(GRAPH_EVENT_TYPES.rebuildStarted, { repoPath: this.repoPath, source: options.source || "external_json_import" });
    this.graph = normalizeExternalGraph(raw, this.repoPath, options.providerType || this.config.type || "external_json");
    await this.persistGraph(this.graph);
    this.emit(GRAPH_EVENT_TYPES.rebuildCompleted, {
      repoPath: this.repoPath,
      source: options.source || "external_json_import",
      stats: this.graph.stats,
      validation: this.graph.validation
    });
    return this.graph;
  }

  async persistGraph(graph) {
    if (!this.dataPath) return;
    await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
    await fs.writeFile(this.dataPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  }

  getGraphStats() {
    return this.graph?.stats || {
      nodeCount: 0,
      edgeCount: 0,
      fileCount: 0,
      symbolCount: 0,
      testCount: 0
    };
  }

  async queryRelevantContext() {
    throw new Error("queryRelevantContext(task, hints) is not implemented.");
  }

  async getFileSubgraph() {
    throw new Error("getFileSubgraph(filePath, depth) is not implemented.");
  }

  async getSymbolSubgraph() {
    throw new Error("getSymbolSubgraph(symbolId, depth) is not implemented.");
  }

  async getDependencyPath() {
    throw new Error("getDependencyPath(source, target) is not implemented.");
  }

  async getBlastRadius() {
    throw new Error("getBlastRadius(changedFiles) is not implemented.");
  }

  async exportGraphForVR() {
    throw new Error("exportGraphForVR(options) is not implemented.");
  }

  async searchSymbols() {
    throw new Error("searchSymbols(query) is not implemented.");
  }

  async getTestsForFiles() {
    throw new Error("getTestsForFiles(files) is not implemented.");
  }
}

export class InternalCodeGraphProvider extends CodeGraphProvider {
  constructor(config = {}) {
    super({ type: "internal", ...config });
    this.maxContextFiles = config.maxContextFiles || 8;
    this.maxSnippetChars = config.maxSnippetChars || 1400;
  }

  async readStoredGraph() {
    if (this.graph) return this.graph;
    if (!this.dataPath) return null;
    this.graph = await fs
      .readFile(this.dataPath, "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    return this.graph;
  }

  async getGraph() {
    const stored = await this.readStoredGraph();
    return stored || this.buildGraph(this.repoPath);
  }

  async buildGraph(repoPath = this.repoPath, options = {}) {
    if (!repoPath) throw new Error("repoPath is required.");
    const rootDir = path.resolve(repoPath);
    this.repoPath = rootDir;
    this.emit(GRAPH_EVENT_TYPES.rebuildStarted, { repoPath: rootDir, changedFiles: options.changedFiles || [] });

    const tree = await collectEntries(rootDir);
    const flatEntries = flattenTree(tree);
    const fileEntries = flatEntries.filter((entry) => entry.kind === "file");
    const codeFiles = fileEntries
      .filter((entry) => isCodeFile(entry.path))
      .map((entry) => ({ ...entry, absolutePath: path.join(rootDir, entry.path) }));
    const knownCodeFilePaths = codeFiles.map((entry) => entry.absolutePath);
    const nodes = [];
    const nodeMap = new Map();
    const edges = [];
    const seenEdges = new Set();
    const fileSymbols = new Map();
    const importsByFile = new Map();
    const repoNodeId = repoId(rootDir);

    addNode(nodes, nodeMap, {
      id: repoNodeId,
      name: path.basename(rootDir),
      label: path.basename(rootDir),
      path: ".",
      kind: "repository",
      type: "repository",
      metrics: {}
    });

    for (const entry of flatEntries) {
      if (entry.kind === "folder") {
        const id = directoryId(entry.path);
        addNode(nodes, nodeMap, {
          id,
          name: entry.name,
          label: entry.name,
          path: entry.path,
          kind: "directory",
          type: "directory",
          metrics: {}
        });
        const parentPath = toPosix(path.dirname(entry.path));
        const parentId = parentPath === "." ? repoNodeId : directoryId(parentPath);
        addEdge(edges, seenEdges, parentId, id, "contains");
        continue;
      }

      const parentPath = toPosix(path.dirname(entry.path));
      const isTest = isTestPath(entry.path);
      const id = fileId(entry.path);
      addNode(nodes, nodeMap, {
        id,
        name: entry.name,
        label: entry.name,
        path: entry.path,
        kind: "file",
        type: isTest ? "test" : "file",
        language: detectLanguage(entry.path),
        status: "unchanged",
        metrics: {
          loc: null,
          imports: 0,
          dependents: 0,
          changedLines: 0,
          errorCount: 0,
          testCoverageRelation: isTest ? "test_file" : null,
          agentAttentionScore: 0
        }
      });
      addEdge(edges, seenEdges, parentPath === "." ? repoNodeId : directoryId(parentPath), id, "contains");
    }

    for (const codeFile of codeFiles) {
      const content = await fs.readFile(codeFile.absolutePath, "utf8");
      const loc = countLoc(content);
      const imports = parseImports(content);
      const exports = parseExports(content);
      const symbols = parseSymbols(content, codeFile.path);
      const currentFileNode = nodeMap.get(fileId(codeFile.path));
      const currentModuleId = moduleId(codeFile.path);
      importsByFile.set(codeFile.path, imports);
      fileSymbols.set(codeFile.path, symbols);

      if (currentFileNode) {
        currentFileNode.loc = loc;
        currentFileNode.imports = [];
        currentFileNode.importedBy = [];
        currentFileNode.relatedTests = [];
        currentFileNode.metrics.loc = loc;
        currentFileNode.metrics.imports = imports.length;
      }

      addNode(nodes, nodeMap, {
        id: currentModuleId,
        name: path.basename(codeFile.path),
        label: path.basename(codeFile.path),
        path: codeFile.path,
        kind: "module",
        type: "module",
        metrics: { loc, imports: imports.length }
      });
      addEdge(edges, seenEdges, fileId(codeFile.path), currentModuleId, "contains");

      for (const symbol of symbols) {
        addNode(nodes, nodeMap, symbol);
        addEdge(edges, seenEdges, fileId(codeFile.path), symbol.id, "defines");
        addEdge(edges, seenEdges, currentModuleId, symbol.id, "contains");
        if (symbol.parentSymbolId) addEdge(edges, seenEdges, symbol.parentSymbolId, symbol.id, "contains");
      }

      for (const importItem of imports) {
        const currentImportId = importId(codeFile.path, importItem.line, importItem.specifier);
        addNode(nodes, nodeMap, {
          id: currentImportId,
          name: importItem.specifier,
          label: importItem.specifier,
          path: codeFile.path,
          kind: "import",
          type: "import",
          line: importItem.line,
          importedNames: importItem.importedNames,
          metrics: {}
        });
        addEdge(edges, seenEdges, currentModuleId, currentImportId, "contains");

        let targetId = null;
        if (importItem.specifier.startsWith(".")) {
          const targetPath = resolveRelativeImport(rootDir, codeFile.absolutePath, importItem.specifier, knownCodeFilePaths);
          if (targetPath) targetId = fileId(targetPath);
        } else {
          const packageName = packageNameFor(importItem.specifier);
          targetId = packageId(packageName);
          addNode(nodes, nodeMap, {
            id: targetId,
            name: packageName,
            label: packageName,
            path: packageName,
            kind: "package",
            type: "package",
            metrics: {}
          });
        }

        if (targetId) {
          addEdge(edges, seenEdges, fileId(codeFile.path), targetId, "imports", {
            line: importItem.line,
            importedNames: importItem.importedNames,
            weight: 1
          });
          addEdge(edges, seenEdges, currentImportId, targetId, "depends_on", {
            line: importItem.line,
            importedNames: importItem.importedNames,
            weight: 1
          });
        }
      }

      for (const exportItem of exports) {
        const currentExportId = exportId(codeFile.path, exportItem.line, exportItem.name);
        addNode(nodes, nodeMap, {
          id: currentExportId,
          name: exportItem.name,
          label: exportItem.name,
          path: codeFile.path,
          kind: "export",
          type: "export",
          line: exportItem.line,
          metrics: {}
        });
        addEdge(edges, seenEdges, currentModuleId, currentExportId, "contains");
        addEdge(edges, seenEdges, fileId(codeFile.path), currentExportId, "exports");
      }
    }

    const symbolByName = new Map();
    for (const symbols of fileSymbols.values()) {
      for (const symbol of symbols) {
        if (!symbolByName.has(symbol.name)) symbolByName.set(symbol.name, []);
        symbolByName.get(symbol.name).push(symbol);
        if (symbol.symbolName) {
          if (!symbolByName.has(symbol.symbolName)) symbolByName.set(symbol.symbolName, []);
          symbolByName.get(symbol.symbolName).push(symbol);
        }
      }
    }

    for (const [sourceFilePath, symbols] of fileSymbols.entries()) {
      const sameFileSymbols = new Map(symbols.map((symbol) => [symbol.name, symbol]));
      const importEdges = edges.filter((edge) => edge.source === fileId(sourceFilePath) && edge.type === "imports");
      for (const symbol of symbols) {
        for (const callName of symbol.calls || []) {
          const sameFileTarget = sameFileSymbols.get(callName);
          if (sameFileTarget) {
            addEdge(edges, seenEdges, symbol.id, sameFileTarget.id, "calls");
            continue;
          }
          const importedEdge = importEdges.find((edge) => (edge.importedNames || []).includes(callName));
          if (importedEdge) addEdge(edges, seenEdges, symbol.id, importedEdge.target, "references");
        }

        if (symbol.extendsName) {
          const target = symbolByName.get(symbol.extendsName)?.[0];
          if (target) addEdge(edges, seenEdges, symbol.id, target.id, "extends");
        }
        for (const implemented of symbol.implementsNames || []) {
          const target = symbolByName.get(implemented)?.[0];
          if (target) addEdge(edges, seenEdges, symbol.id, target.id, "implements");
        }
      }
    }

    for (const edge of edges.filter((candidate) => candidate.type === "imports")) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      if (sourceNode?.kind === "file") {
        sourceNode.imports = [...new Set([...(sourceNode.imports || []), targetNode?.path || edge.target])];
      }
      if (targetNode?.kind === "file") {
        targetNode.importedBy = [...new Set([...(targetNode.importedBy || []), sourceNode?.path || edge.source])];
        targetNode.metrics.dependents = (targetNode.metrics.dependents || 0) + 1;
      }
    }

    await this.addPackageScripts(rootDir, nodes, nodeMap, edges, seenEdges, repoNodeId);
    this.addTestRelations(nodes, nodeMap, edges, seenEdges);

    const graph = {
      schemaVersion: 2,
      generatedAt: now(),
      root: path.basename(rootDir),
      repoPath: rootDir,
      provider: {
        type: "internal",
        parser: "minimal-js-ts",
        note: "Tree-sitter is not required in this build; JS/TS parsing uses lightweight regex heuristics."
      },
      tree,
      nodes,
      edges,
      stats: this.computeStats(nodes, edges)
    };

    this.graph = graph;
    if (this.dataPath) {
      await fs.mkdir(path.dirname(this.dataPath), { recursive: true });
      await fs.writeFile(this.dataPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
    }
    this.emit(GRAPH_EVENT_TYPES.rebuildCompleted, { repoPath: rootDir, stats: graph.stats });
    return graph;
  }

  async addPackageScripts(rootDir, nodes, nodeMap, edges, seenEdges, repoNodeId) {
    const packageJson = await fs
      .readFile(path.join(rootDir, "package.json"), "utf8")
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (!packageJson?.scripts) return;
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      const id = scriptId(name);
      addNode(nodes, nodeMap, {
        id,
        name,
        label: name,
        path: "package.json",
        kind: "package_script",
        type: "package/script",
        command,
        metrics: {}
      });
      addEdge(edges, seenEdges, repoNodeId, id, "contains");
    }
  }

  addTestRelations(nodes, nodeMap, edges, seenEdges) {
    const fileNodes = nodes.filter((node) => node.kind === "file");
    const sourceFiles = fileNodes.filter((node) => node.type !== "test" && isCodeFile(node.path));
    const testFiles = fileNodes.filter((node) => node.type === "test");

    for (const source of sourceFiles) {
      const baseName = path.basename(source.name).replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, "").toLowerCase();
      const related = testFiles
        .filter((testNode) => {
          const lower = testNode.name.toLowerCase();
          return lower.includes(baseName) || (source.importedBy || []).some((importer) => importer === testNode.path);
        })
        .map((testNode) => testNode.path);
      source.relatedTests = related;
      source.metrics.testCoverageRelation = related.length ? "has_related_tests" : "none_detected";
      for (const testPath of related) {
        const testNode = nodeMap.get(fileId(testPath));
        if (testNode) addEdge(edges, seenEdges, testNode.id, source.id, "tests");
      }
    }
  }

  computeStats(nodes, edges) {
    const symbolCount = nodes.filter((node) => ["function", "method", "class", "interface", "type"].includes(node.kind)).length;
    const fileCount = nodes.filter((node) => node.kind === "file").length;
    const testCount = nodes.filter((node) => node.type === "test").length;
    return {
      folders: nodes.filter((node) => node.kind === "directory" || node.kind === "folder").length,
      files: fileCount,
      symbols: symbolCount,
      imports: edges.filter((edge) => edge.type === "imports").length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      fileCount,
      symbolCount,
      testCount
    };
  }

  async updateGraph(changedFiles = []) {
    return this.buildGraph(this.repoPath, { changedFiles });
  }

  async queryRelevantContext(task, hints = {}) {
    const graph = await this.getGraph();
    const terms = termsFrom(task, hints);
    const selectedFiles = new Set((hints.selectedFiles || []).map(normalizePath));
    if (hints.currentFile) selectedFiles.add(normalizePath(hints.currentFile));
    for (const file of hints.likelyFiles || []) selectedFiles.add(normalizePath(file));

    const rankedFiles = graph.nodes
      .filter((node) => node.kind === "file" && isTextFile(node.path))
      .map((node) => {
        const haystack = [node.path, node.name, node.imports?.join(" "), node.relatedTests?.join(" ")].join(" ").toLowerCase();
        let score = 0;
        if (selectedFiles.has(node.path)) score += 100;
        for (const term of terms) {
          const compact = term.replace(/^src\//, "");
          if (haystack.includes(compact)) score += compact.includes("/") ? 12 : 4;
        }
        if (node.type === "test") score -= 4;
        if (node.metrics?.dependents) score += Math.min(8, node.metrics.dependents);
        return { node, score };
      })
      .sort((a, b) => b.score - a.score || a.node.path.localeCompare(b.node.path))
      .slice(0, hints.maxFiles || this.maxContextFiles);

    const snippets = [];
    for (const item of rankedFiles) {
      const absolute = path.join(this.repoPath, item.node.path);
      const content = await fs.readFile(absolute, "utf8").catch(() => "");
      snippets.push({
        path: item.node.path,
        score: item.score,
        snippet: snippetFor(content, terms, hints.maxSnippetChars || this.maxSnippetChars)
      });
      item.node.metrics.agentAttentionScore = item.score;
    }

    const relevantFiles = rankedFiles.map((item) => item.node.path);
    const relevantFileIds = new Set(relevantFiles.map(fileId));
    const relevantSymbols = graph.nodes
      .filter((node) => ["function", "method", "class", "interface", "type"].includes(node.kind) && relevantFiles.includes(node.path))
      .slice(0, 40);
    const dependencyPaths = graph.edges
      .filter((edge) => ["imports", "depends_on", "references", "tests"].includes(edge.type))
      .filter((edge) => relevantFileIds.has(edge.source) || relevantFileIds.has(edge.target))
      .slice(0, 80);
    const blastRadius = await this.getBlastRadius(relevantFiles);
    const impactedTests = await this.getTestsForFiles(relevantFiles);
    const selectedSubgraph = await this.getFileSubgraph(relevantFiles[0] || hints.currentFile || "", 2).catch(() => ({ nodes: [], edges: [] }));
    const result = {
      topRelevantFiles: relevantFiles,
      relevantFiles,
      symbols: relevantSymbols,
      relevantSymbols,
      dependencyPaths,
      impactedTests,
      testsLikelyAffected: impactedTests,
      compactSnippets: snippets,
      snippets,
      blastRadius,
      selectedSubgraph,
      graphStats: graph.stats,
      graphExplanation: `Selected ${relevantFiles.length} file(s) using task terms, current selection, import/dependent links, and related test edges.`,
      contextBundle: snippets.map((item) => `# ${item.path}\n${item.snippet}`).join("\n\n---\n\n")
    };
    this.emit(GRAPH_EVENT_TYPES.queryCompleted, { task, hints, fileCount: relevantFiles.length, stats: graph.stats });
    this.emit(GRAPH_EVENT_TYPES.contextSelected, {
      relevantFiles,
      selectedSubgraph: {
        nodeCount: selectedSubgraph.nodes.length,
        edgeCount: selectedSubgraph.edges.length
      }
    });
    return result;
  }

  async getFileSubgraph(filePathValue, depth = 1) {
    const graph = await this.getGraph();
    const startId = normalizeSourceTarget(graph, filePathValue);
    return this.bfsSubgraph(graph, startId, depth);
  }

  async getSymbolSubgraph(symbolIdValue, depth = 1) {
    const graph = await this.getGraph();
    const startId = normalizeSourceTarget(graph, symbolIdValue);
    return this.bfsSubgraph(graph, startId, depth);
  }

  bfsSubgraph(graph, startId, depth) {
    if (!startId || !graph.nodes.some((node) => node.id === startId)) return { nodes: [], edges: [] };
    const visited = new Set([startId]);
    const frontier = [{ id: startId, depth: 0 }];
    const includedEdges = [];
    while (frontier.length) {
      const current = frontier.shift();
      if (current.depth >= depth) continue;
      const adjacent = graph.edges.filter((edge) => edge.source === current.id || edge.target === current.id);
      for (const edge of adjacent) {
        includedEdges.push(edge);
        const nextId = edge.source === current.id ? edge.target : edge.source;
        if (!visited.has(nextId)) {
          visited.add(nextId);
          frontier.push({ id: nextId, depth: current.depth + 1 });
        }
      }
    }
    return {
      nodes: graph.nodes.filter((node) => visited.has(node.id)),
      edges: [...new Map(includedEdges.map((edge) => [edge.id, edge])).values()]
    };
  }

  async getDependencyPath(source, target) {
    const graph = await this.getGraph();
    const sourceId = normalizeSourceTarget(graph, source);
    const targetId = normalizeSourceTarget(graph, target);
    const allowed = new Set(["imports", "depends_on", "references", "calls", "tests", "contains"]);
    const queue = [{ id: sourceId, path: [sourceId], edges: [] }];
    const visited = new Set([sourceId]);
    while (queue.length) {
      const current = queue.shift();
      if (current.id === targetId) {
        return {
          found: true,
          nodeIds: current.path,
          edges: current.edges,
          nodes: graph.nodes.filter((node) => current.path.includes(node.id))
        };
      }
      for (const edge of graph.edges.filter((candidate) => candidate.source === current.id && allowed.has(candidate.type))) {
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        queue.push({ id: edge.target, path: [...current.path, edge.target], edges: [...current.edges, edge] });
      }
    }
    return { found: false, nodeIds: [], edges: [], nodes: [] };
  }

  async getBlastRadius(changedFiles = []) {
    const graph = await this.getGraph();
    const changed = [...new Set(changedFiles.map((file) => (typeof file === "string" ? file : file.path)).filter(Boolean).map(normalizePath))];
    const changedIds = changed.map(fileId);
    const affected = new Set(changedIds);
    const affectedEdges = [];
    const queue = [...changedIds];
    const dependencyTypes = new Set(["imports", "references", "tests", "depends_on"]);

    while (queue.length) {
      const current = queue.shift();
      const incoming = graph.edges.filter((edge) => edge.target === current && dependencyTypes.has(edge.type));
      for (const edge of incoming) {
        affectedEdges.push(edge);
        if (!affected.has(edge.source)) {
          affected.add(edge.source);
          queue.push(edge.source);
        }
      }
    }

    const affectedNodes = graph.nodes.filter((node) => affected.has(node.id));
    const affectedFiles = affectedNodes.filter((node) => node.kind === "file").map((node) => node.path);
    const affectedSymbols = graph.nodes.filter((node) => affectedFiles.includes(node.path) && ["function", "method", "class", "interface", "type"].includes(node.kind));
    const affectedTests = await this.getTestsForFiles(affectedFiles);
    return {
      changedFiles: changed,
      affectedFiles,
      affectedSymbols,
      affectedTests,
      edges: [...new Map(affectedEdges.map((edge) => [edge.id, edge])).values()],
      explanation: `Found ${affectedFiles.length} file(s) affected by reverse dependency, reference, and test edges.`
    };
  }

  async exportGraphForVR(options = {}) {
    const graph = await this.getGraph();
    const changedFiles = new Map(
      (options.changedFiles || []).map((item) => [typeof item === "string" ? normalizePath(item) : normalizePath(item.path), item])
    );
    const errorCounts = new Map();
    for (const error of options.errors || []) {
      const key = normalizePath(error.path);
      errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
    }

    const nodes = graph.nodes.map((node) => {
      const changed = changedFiles.get(node.path);
      const errorCount = errorCounts.get(node.path) || node.metrics?.errorCount || 0;
      return {
        id: node.id,
        label: node.label || node.symbolName || node.name,
        type: node.type || node.kind,
        path: node.path,
        symbolName: node.symbolName || (node.kind !== "file" ? node.name : undefined),
        size: node.size || node.metrics?.loc || node.loc || 1,
        status: changed ? "changed" : errorCount ? "error" : node.status || "normal",
        metrics: {
          ...(node.metrics || {}),
          linesOfCode: node.metrics?.loc ?? node.loc ?? null,
          imports: node.metrics?.imports ?? node.imports?.length ?? 0,
          dependents: node.metrics?.dependents ?? node.importedBy?.length ?? 0,
          changedLines: typeof changed === "object" ? changed.changedLines || changed.additions || 0 : changed ? 1 : 0,
          errorCount,
          testCoverageRelation: node.metrics?.testCoverageRelation || null,
          agentAttentionScore: node.metrics?.agentAttentionScore || options.agentAttentionByNode?.[node.id] || 0
        }
      };
    });

    const edges = graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      weight: edge.weight || 1,
      status: edge.status || "normal"
    }));

    const clusters = this.buildClusters(graph);
    return {
      nodes,
      edges,
      clusters,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        fileCount: graph.stats.fileCount ?? graph.stats.files,
        symbolCount: graph.stats.symbolCount ?? graph.stats.symbols,
        testCount: graph.stats.testCount ?? 0
      }
    };
  }

  buildClusters(graph) {
    const byDirectory = new Map();
    for (const node of graph.nodes.filter((candidate) => candidate.kind === "file")) {
      const directory = toPosix(path.dirname(node.path));
      const key = directory === "." ? "root" : directory;
      if (!byDirectory.has(key)) byDirectory.set(key, []);
      byDirectory.get(key).push(node.id);
    }
    return [...byDirectory.entries()].map(([id, nodeIds]) => ({
      id: `cluster:${id}`,
      label: id,
      nodeIds,
      type: id.includes("test") ? "test" : "directory"
    }));
  }

  async searchSymbols(query) {
    const graph = await this.getGraph();
    const normalized = String(query || "").toLowerCase().trim();
    if (!normalized) return [];
    return graph.nodes
      .filter((node) => ["function", "method", "class", "interface", "type"].includes(node.kind))
      .filter((node) => `${node.name} ${node.symbolName || ""} ${node.path}`.toLowerCase().includes(normalized))
      .slice(0, 50);
  }

  async getTestsForFiles(files = []) {
    const graph = await this.getGraph();
    const fileSet = new Set(files.map(normalizePath));
    const tests = new Set();
    for (const filePathValue of fileSet) {
      const node = graph.nodes.find((candidate) => candidate.id === fileId(filePathValue));
      for (const testPath of node?.relatedTests || []) tests.add(testPath);
    }
    for (const edge of graph.edges.filter((candidate) => candidate.type === "tests")) {
      const target = graph.nodes.find((node) => node.id === edge.target);
      const source = graph.nodes.find((node) => node.id === edge.source);
      if (target && fileSet.has(target.path) && source?.path) tests.add(source.path);
    }
    return [...tests].sort();
  }
}

function splitCommandLine(commandLine) {
  const parts = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < String(commandLine || "").length; index += 1) {
    const char = commandLine[index];
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("GRAPH_EXTERNAL_COMMAND has an unterminated quote.");
  if (current) parts.push(current);
  return parts;
}

function replaceCommandPlaceholders(value, replacements) {
  return String(value)
    .replace(/\{repoPath\}/g, replacements.repoPath)
    .replace(/\{outputPath\}/g, replacements.outputPath || "");
}

function metadataWithoutKnownKeys(value, knownKeys) {
  const metadata = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (!knownKeys.has(key)) metadata[key] = item;
  }
  return metadata;
}

function normalizedExternalNodeId(node, normalizedType) {
  const rawPath = safeRelativePath(node.path || node.file || node.filePath || node.filename || "");
  const rawId = String(node.id || "").trim();
  if ((normalizedType === "file" || normalizedType === "test") && rawPath) return fileId(rawPath);
  if (normalizedType === "module" && rawPath) return moduleId(rawPath);
  if ((normalizedType === "function" || normalizedType === "class") && rawPath) {
    const name = node.symbolName || node.name || node.label || rawId.split("#").pop();
    if (name) return symbolId(rawPath, name);
  }
  return rawId;
}

function normalizeExternalNode(rawNode, providerType, validation) {
  if (!rawNode || typeof rawNode !== "object") throw new Error("External graph node must be an object.");
  const rawId = String(rawNode.id || "").trim();
  if (!rawId && !rawNode.path) throw new Error("External graph node is missing id/path.");
  const externalType = String(rawNode.type || rawNode.kind || rawNode.nodeType || "unknown").toLowerCase();
  const normalizedType = EXTERNAL_NODE_TYPES.get(externalType) || "unknown";
  if (normalizedType === "unknown" && !validation.unsupportedNodeTypes.includes(externalType)) {
    validation.unsupportedNodeTypes.push(externalType);
  }
  const safePath = safeRelativePath(rawNode.path || rawNode.file || rawNode.filePath || rawNode.filename || "") || "";
  const normalizedId = normalizedExternalNodeId(rawNode, normalizedType) || rawId;
  if (!normalizedId) throw new Error("External graph node normalized to an empty id.");
  const label = String(rawNode.label || rawNode.name || rawNode.symbolName || (safePath ? path.basename(safePath) : normalizedId));
  const metadata = {
    ...metadataWithoutKnownKeys(
      rawNode,
      new Set(["id", "type", "kind", "nodeType", "label", "name", "symbolName", "path", "file", "filePath", "filename", "metrics", "metadata", "line", "endLine", "size"])
    ),
    ...(rawNode.metadata || {})
  };
  if (normalizedType === "unknown") metadata.externalType = externalType;
  metadata.externalProvider = providerType;
  metadata.externalId = rawId || normalizedId;

  const kind =
    normalizedType === "test"
      ? "file"
      : normalizedType === "unknown"
        ? "unknown"
        : normalizedType;

  return {
    id: normalizedId,
    name: String(rawNode.name || rawNode.symbolName || label),
    label,
    path: safePath,
    kind,
    type: normalizedType,
    symbolName: rawNode.symbolName || (["function", "class"].includes(normalizedType) ? String(rawNode.name || label) : undefined),
    line: Number.isFinite(Number(rawNode.line)) ? Number(rawNode.line) : undefined,
    endLine: Number.isFinite(Number(rawNode.endLine)) ? Number(rawNode.endLine) : undefined,
    size: Number.isFinite(Number(rawNode.size)) ? Number(rawNode.size) : undefined,
    metrics: rawNode.metrics || {},
    metadata
  };
}

function normalizeExternalEdge(rawEdge, idMap, nodeIds, providerType, validation, index) {
  if (!rawEdge || typeof rawEdge !== "object") throw new Error("External graph edge must be an object.");
  const rawSource = String(rawEdge.source || rawEdge.from || "").trim();
  const rawTarget = String(rawEdge.target || rawEdge.to || "").trim();
  if (!rawSource || !rawTarget) throw new Error("External graph edge is missing source/target.");
  const source = idMap.get(rawSource) || rawSource;
  const target = idMap.get(rawTarget) || rawTarget;
  if (!nodeIds.has(source) || !nodeIds.has(target)) {
    throw new Error(`External graph edge references unknown node: ${rawSource} -> ${rawTarget}.`);
  }
  const externalType = String(rawEdge.type || rawEdge.kind || rawEdge.edgeType || "unknown").toLowerCase();
  const normalizedType = EXTERNAL_EDGE_TYPES.get(externalType) || "unknown";
  if (normalizedType === "unknown" && !validation.unsupportedEdgeTypes.includes(externalType)) {
    validation.unsupportedEdgeTypes.push(externalType);
  }
  const metadata = {
    ...metadataWithoutKnownKeys(rawEdge, new Set(["id", "source", "target", "from", "to", "type", "kind", "edgeType", "weight", "status", "metadata"])),
    ...(rawEdge.metadata || {})
  };
  if (normalizedType === "unknown") metadata.externalType = externalType;
  metadata.externalProvider = providerType;
  metadata.externalId = rawEdge.id || null;

  return {
    id: rawEdge.id || edgeId(source, target, normalizedType, index),
    source,
    target,
    type: normalizedType,
    weight: Number.isFinite(Number(rawEdge.weight)) ? Number(rawEdge.weight) : 1,
    status: rawEdge.status || "normal",
    metadata
  };
}

function buildTreeFromExternalNodes(nodes) {
  const root = [];
  const directories = new Map();
  for (const node of nodes.filter((candidate) => candidate.kind === "file" && candidate.path)) {
    const parts = normalizePath(node.path).split("/");
    let current = root;
    let prefix = "";
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const isFile = index === parts.length - 1;
      if (isFile) {
        current.push({ name: part, path: node.path, kind: "file", extension: path.extname(part) });
        continue;
      }
      prefix = prefix ? `${prefix}/${part}` : part;
      if (!directories.has(prefix)) {
        const directory = { name: part, path: prefix, kind: "folder", children: [] };
        directories.set(prefix, directory);
        current.push(directory);
      }
      current = directories.get(prefix).children;
    }
  }
  return root;
}

function computeExternalStats(nodes, edges) {
  const fileCount = nodes.filter((node) => node.kind === "file").length;
  const symbolCount = nodes.filter((node) => ["function", "class"].includes(node.kind)).length;
  const testCount = nodes.filter((node) => node.type === "test").length;
  return {
    folders: 0,
    files: fileCount,
    symbols: symbolCount,
    imports: edges.filter((edge) => edge.type === "imports").length,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    fileCount,
    symbolCount,
    testCount
  };
}

function validateExternalGraphShape(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("External graph must be a JSON object.");
  }
  if (!Array.isArray(raw.nodes)) throw new Error("External graph must include a nodes array.");
  if (!Array.isArray(raw.edges)) throw new Error("External graph must include an edges array.");
}

export function normalizeExternalGraph(raw, repoPath, providerType = "external_json") {
  validateExternalGraphShape(raw);
  const validation = {
    ok: true,
    unsupportedNodeTypes: [],
    unsupportedEdgeTypes: [],
    warnings: []
  };
  const idMap = new Map();
  const normalizedNodes = raw.nodes.map((node) => {
    const normalized = normalizeExternalNode(node, providerType, validation);
    if (node.id) idMap.set(String(node.id), normalized.id);
    if (node.path) idMap.set(String(node.path), normalized.id);
    return normalized;
  });
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  if (nodeIds.size !== normalizedNodes.length) throw new Error("External graph contains duplicate normalized node ids.");

  const normalizedEdges = raw.edges.map((edge, index) => normalizeExternalEdge(edge, idMap, nodeIds, providerType, validation, index));
  if (validation.unsupportedNodeTypes.length) {
    validation.warnings.push(`Unsupported external node types preserved as unknown: ${validation.unsupportedNodeTypes.join(", ")}.`);
  }
  if (validation.unsupportedEdgeTypes.length) {
    validation.warnings.push(`Unsupported external edge types preserved as unknown: ${validation.unsupportedEdgeTypes.join(", ")}.`);
  }
  for (const warning of validation.warnings) {
    console.warn(`[codegraph:${providerType}] ${warning}`);
  }

  return {
    schemaVersion: raw.schemaVersion || 2,
    generatedAt: raw.generatedAt || now(),
    root: raw.root || path.basename(repoPath || ""),
    repoPath,
    provider: {
      type: providerType,
      contract: "holocode.external_graph.v1"
    },
    tree: Array.isArray(raw.tree) ? raw.tree : buildTreeFromExternalNodes(normalizedNodes),
    nodes: normalizedNodes,
    edges: normalizedEdges,
    stats: {
      ...computeExternalStats(normalizedNodes, normalizedEdges),
      ...(raw.stats || {})
    },
    validation
  };
}

export class ExternalJsonCodeGraphProvider extends InternalCodeGraphProvider {
  constructor(config = {}) {
    super({ type: "external_json", ...config });
    this.externalCommand = config.externalCommand || config.command || "";
    this.outputPath = config.externalOutputPath || config.outputPath || config.graphPath || config.exportPath || null;
    this.execFileImpl = config.execFileImpl || execFileAsync;
    this.commandTimeoutMs = config.commandTimeoutMs || 120000;
    this.providerType = config.providerType || config.type || "external_json";
  }

  async runExternalCommand(repoPath) {
    if (!this.externalCommand) return null;
    const outputPath = this.outputPath ? path.resolve(this.outputPath) : this.dataPath;
    const parts = splitCommandLine(this.externalCommand);
    if (!parts.length) throw new Error("GRAPH_EXTERNAL_COMMAND is empty.");
    const replacements = { repoPath: path.resolve(repoPath), outputPath: outputPath || "" };
    const command = replaceCommandPlaceholders(parts[0], replacements);
    const args = parts.slice(1).map((part) => replaceCommandPlaceholders(part, replacements));
    return this.execFileImpl(command, args, {
      cwd: repoPath,
      windowsHide: true,
      timeout: this.commandTimeoutMs,
      maxBuffer: 50 * 1024 * 1024
    });
  }

  async readExternalJson(commandResult) {
    const stdout = String(commandResult?.stdout || "").trim();
    if (stdout.startsWith("{")) return JSON.parse(stdout);
    if (!this.outputPath && this.dataPath && commandResult) {
      this.outputPath = this.dataPath;
    }
    if (!this.outputPath) throw new Error("ExternalJsonCodeGraphProvider requires GRAPH_EXTERNAL_OUTPUT_PATH or JSON stdout from GRAPH_EXTERNAL_COMMAND.");
    return JSON.parse(await fs.readFile(this.outputPath, "utf8"));
  }

  async buildGraph(repoPath = this.repoPath, options = {}) {
    if (!repoPath) throw new Error("repoPath is required.");
    const rootDir = path.resolve(repoPath);
    this.repoPath = rootDir;
    this.emit(GRAPH_EVENT_TYPES.rebuildStarted, { repoPath: rootDir, source: this.externalCommand ? "external_command" : "external_json" });
    const commandResult = this.externalCommand ? await this.runExternalCommand(rootDir) : null;
    const raw = await this.readExternalJson(commandResult);
    this.graph = normalizeExternalGraph(raw, rootDir, this.providerType);
    await this.persistGraph(this.graph);
    this.emit(GRAPH_EVENT_TYPES.rebuildCompleted, {
      repoPath: rootDir,
      changedFiles: options.changedFiles || [],
      source: this.externalCommand ? "external_command" : "external_json",
      stats: this.graph.stats,
      validation: this.graph.validation
    });
    return this.graph;
  }
}

export class CodeReviewGraphProvider extends ExternalJsonCodeGraphProvider {
  constructor(config = {}) {
    super({ providerType: "code-review-graph", type: "code-review-graph", ...config });
  }
}

export class EmergeImportProvider extends ExternalJsonCodeGraphProvider {
  constructor(config = {}) {
    super({ providerType: "emerge", type: "emerge", ...config });
  }
}

export class McpCodeGraphProvider extends InternalCodeGraphProvider {
  constructor(config = {}) {
    super({ type: "mcp", ...config });
    this.endpoint = config.mcpServerUrl || config.endpoint || "";
    this.fetchImpl = config.fetchImpl || globalThis.fetch;
  }

  async buildGraph(repoPath = this.repoPath) {
    if (!this.endpoint) {
      throw new Error("McpCodeGraphProvider requires GRAPH_MCP_SERVER_URL or graph.endpoint.");
    }
    const response = await this.fetchImpl(`${this.endpoint.replace(/\/+$/, "")}/graph`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoPath })
    });
    if (!response.ok) throw new Error(`MCP graph server failed (${response.status}).`);
    this.graph = normalizeExternalGraph(await response.json(), repoPath, "mcp");
    await this.persistGraph(this.graph);
    return this.graph;
  }
}

export class ExternalMCPGraphProvider extends McpCodeGraphProvider {
  constructor(config = {}) {
    super(config);
  }
}

export async function readGraphProviderConfig({ workspaceRoot, env = process.env } = {}) {
  const configPath = workspaceRoot ? path.join(workspaceRoot, "holocode.config.json") : null;
  const fileConfig = configPath
    ? await fs
        .readFile(configPath, "utf8")
        .then((raw) => JSON.parse(raw).graph || {})
        .catch((error) => {
          if (error.code === "ENOENT") return {};
          throw new Error(`Invalid holocode.config.json graph config: ${error.message}`);
        })
    : {};
  return {
    ...fileConfig,
    type: env.GRAPH_PROVIDER || env.HOLOCODE_GRAPH_PROVIDER || fileConfig.type || "internal",
    graphPath: env.GRAPH_EXTERNAL_OUTPUT_PATH || env.HOLOCODE_GRAPH_PATH || fileConfig.graphPath,
    exportPath: env.GRAPH_EXTERNAL_OUTPUT_PATH || env.HOLOCODE_GRAPH_EXPORT_PATH || fileConfig.exportPath,
    outputPath: env.GRAPH_EXTERNAL_OUTPUT_PATH || fileConfig.outputPath,
    externalOutputPath: env.GRAPH_EXTERNAL_OUTPUT_PATH || fileConfig.externalOutputPath,
    externalCommand: env.GRAPH_EXTERNAL_COMMAND || fileConfig.externalCommand || fileConfig.command,
    command: env.GRAPH_EXTERNAL_COMMAND || fileConfig.command,
    mcpServerUrl: env.GRAPH_MCP_SERVER_URL || fileConfig.mcpServerUrl,
    endpoint: env.GRAPH_MCP_SERVER_URL || env.HOLOCODE_GRAPH_ENDPOINT || fileConfig.endpoint
  };
}

export function createCodeGraphProvider(config = {}) {
  const type = String(config.type || "internal").toLowerCase();
  if (type === "external_json" || type === "external-json" || type === "json") return new ExternalJsonCodeGraphProvider(config);
  if (type === "code-review-graph" || type === "codereviewgraph") return new CodeReviewGraphProvider(config);
  if (type === "mcp" || type === "external-mcp") return new McpCodeGraphProvider(config);
  if (type === "emerge" || type === "glato-emerge") return new EmergeImportProvider(config);
  return new InternalCodeGraphProvider(config);
}
