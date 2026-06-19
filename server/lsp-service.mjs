import fsSync from "node:fs";
import path from "node:path";
import ts from "typescript";

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".agent_tasks"]);

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function categoryToSeverity(category) {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  if (category === ts.DiagnosticCategory.Suggestion) return "hint";
  return "info";
}

function flattenMessage(messageText) {
  return ts.flattenDiagnosticMessageText(messageText, "\n");
}

function rangeFromTextSpan(sourceFile, textSpan) {
  const start = sourceFile.getLineAndCharacterOfPosition(textSpan.start);
  const end = sourceFile.getLineAndCharacterOfPosition(textSpan.start + textSpan.length);
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1
  };
}

function collectFallbackFiles(rootDir, currentDir = rootDir, output = []) {
  const dirents = fsSync.readdirSync(currentDir, { withFileTypes: true });
  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      if (!SKIP_DIRS.has(dirent.name)) {
        collectFallbackFiles(rootDir, path.join(currentDir, dirent.name), output);
      }
      continue;
    }

    if (dirent.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(dirent.name))) {
      output.push(path.join(currentDir, dirent.name));
    }
  }
  return output;
}

export function createLspService({ repoRoot }) {
  const rootDir = path.resolve(repoRoot);

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

  function repoRelativePath(fileName) {
    const absolutePath = path.resolve(fileName);
    const rootWithSeparator = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
    if (absolutePath === rootDir || absolutePath.toLowerCase().startsWith(rootWithSeparator.toLowerCase())) {
      return toPosix(path.relative(rootDir, absolutePath));
    }
    return toPosix(fileName);
  }

  function normalizeRepoRelativePath(relativeFilePath) {
    return repoRelativePath(safeRepoPath(relativeFilePath));
  }

  function readProjectConfig() {
    const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) {
      return {
        configPath: null,
        options: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          jsx: ts.JsxEmit.ReactJSX,
          strict: true,
          skipLibCheck: true
        },
        fileNames: collectFallbackFiles(rootDir)
      };
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
      throw new Error(flattenMessage(configFile.error.messageText));
    }

    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
    if (parsed.errors.length) {
      throw new Error(parsed.errors.map((error) => flattenMessage(error.messageText)).join("\n"));
    }
    return {
      configPath,
      options: parsed.options,
      fileNames: parsed.fileNames
    };
  }

  function createLanguageContext() {
    const project = readProjectConfig();
    const host = {
      getCompilationSettings: () => project.options,
      getCurrentDirectory: () => rootDir,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getDirectories: ts.sys.getDirectories,
      getNewLine: () => ts.sys.newLine,
      getScriptFileNames: () => project.fileNames,
      getScriptSnapshot: (fileName) => {
        if (!fsSync.existsSync(fileName)) return undefined;
        return ts.ScriptSnapshot.fromString(fsSync.readFileSync(fileName, "utf8"));
      },
      getScriptVersion: (fileName) => {
        try {
          return String(fsSync.statSync(fileName).mtimeMs);
        } catch {
          return "0";
        }
      },
      readDirectory: ts.sys.readDirectory,
      readFile: ts.sys.readFile,
      fileExists: ts.sys.fileExists,
      directoryExists: ts.sys.directoryExists,
      useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames
    };

    return {
      project,
      service: ts.createLanguageService(host, ts.createDocumentRegistry())
    };
  }

  function positionForRequest(service, absolutePath, line, column) {
    const sourceFile = service.getProgram()?.getSourceFile(absolutePath);
    if (!sourceFile) {
      throw new Error(`File is not part of the TypeScript project: ${repoRelativePath(absolutePath)}`);
    }
    const safeLine = Math.max(0, Number(line || 1) - 1);
    const safeColumn = Math.max(0, Number(column || 1) - 1);
    return {
      sourceFile,
      position: ts.getPositionOfLineAndCharacter(sourceFile, safeLine, safeColumn)
    };
  }

  function locationFromDefinition(definition, service) {
    const sourceFile = service.getProgram()?.getSourceFile(definition.fileName);
    if (!sourceFile) return null;
    return {
      path: repoRelativePath(definition.fileName),
      ...rangeFromTextSpan(sourceFile, definition.textSpan),
      name: definition.name,
      kind: definition.kind,
      containerName: definition.containerName
    };
  }

  function diagnosticToDto(diagnostic, fallbackPath = "tsconfig.json") {
    const file = diagnostic.file;
    const filePath = file ? repoRelativePath(file.fileName) : fallbackPath;
    const range =
      file && typeof diagnostic.start === "number" && typeof diagnostic.length === "number"
        ? rangeFromTextSpan(file, { start: diagnostic.start, length: diagnostic.length })
        : { startLine: 1, startColumn: 1, endLine: 1, endColumn: 1 };

    return {
      id: `${filePath}:${range.startLine}:${range.startColumn}:${diagnostic.code}`,
      path: filePath,
      severity: categoryToSeverity(diagnostic.category),
      code: diagnostic.code,
      source: "typescript",
      message: flattenMessage(diagnostic.messageText),
      ...range
    };
  }

  function summarizeDiagnostics(diagnostics) {
    const summary = new Map();
    for (const diagnostic of diagnostics) {
      const current = summary.get(diagnostic.path) || {
        path: diagnostic.path,
        errors: 0,
        warnings: 0,
        hints: 0,
        infos: 0,
        maxSeverity: "info"
      };
      if (diagnostic.severity === "error") current.errors += 1;
      if (diagnostic.severity === "warning") current.warnings += 1;
      if (diagnostic.severity === "hint") current.hints += 1;
      if (diagnostic.severity === "info") current.infos += 1;
      if (diagnostic.severity === "error") current.maxSeverity = "error";
      if (diagnostic.severity === "warning" && current.maxSeverity !== "error") current.maxSeverity = "warning";
      if (diagnostic.severity === "hint" && current.maxSeverity === "info") current.maxSeverity = "hint";
      summary.set(diagnostic.path, current);
    }
    return [...summary.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  function diagnostics() {
    const { project, service } = createLanguageContext();
    const files = project.fileNames.filter((fileName) => repoRelativePath(fileName) && SUPPORTED_EXTENSIONS.has(path.extname(fileName)));
    const allDiagnostics = [
      ...service.getCompilerOptionsDiagnostics(),
      ...files.flatMap((fileName) => [
        ...service.getSyntacticDiagnostics(fileName),
        ...service.getSemanticDiagnostics(fileName),
        ...service.getSuggestionDiagnostics(fileName)
      ])
    ].map((diagnostic) => diagnosticToDto(diagnostic, project.configPath ? repoRelativePath(project.configPath) : "tsconfig.json"));

    allDiagnostics.sort((a, b) => {
      const byPath = a.path.localeCompare(b.path);
      if (byPath) return byPath;
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      return a.startColumn - b.startColumn;
    });

    return {
      repoRoot: rootDir,
      generatedAt: new Date().toISOString(),
      diagnostics: allDiagnostics,
      summary: summarizeDiagnostics(allDiagnostics)
    };
  }

  function documentSymbols(relativeFilePath) {
    const normalizedPath = normalizeRepoRelativePath(relativeFilePath);
    const absolutePath = safeRepoPath(normalizedPath);
    const { service } = createLanguageContext();
    const tree = service.getNavigationTree(absolutePath);
    const sourceFile = service.getProgram()?.getSourceFile(absolutePath);
    if (!tree || !sourceFile) return { path: normalizedPath, symbols: [] };

    function visit(item, parentName = null) {
      const span = rangeFromTextSpan(sourceFile, item.spans[0] || { start: 0, length: 0 });
      const children = item.childItems?.flatMap((child) => visit(child, item.text)) || [];
      if (item.kind === "script") return children;
      return [
        {
          name: item.text,
          kind: item.kind,
          parentName,
          ...span
        },
        ...children
      ];
    }

    return {
      path: normalizedPath,
      symbols: visit(tree)
    };
  }

  function hover(relativeFilePath, line, column) {
    const normalizedPath = normalizeRepoRelativePath(relativeFilePath);
    const absolutePath = safeRepoPath(normalizedPath);
    const { service } = createLanguageContext();
    const { position } = positionForRequest(service, absolutePath, line, column);
    const info = service.getQuickInfoAtPosition(absolutePath, position);
    if (!info) {
      return { path: normalizedPath, line: Number(line || 1), column: Number(column || 1), contents: "", documentation: "" };
    }
    return {
      path: normalizedPath,
      line: Number(line || 1),
      column: Number(column || 1),
      kind: info.kind,
      kindModifiers: info.kindModifiers,
      contents: ts.displayPartsToString(info.displayParts),
      documentation: ts.displayPartsToString(info.documentation)
    };
  }

  function definition(relativeFilePath, line, column) {
    const normalizedPath = normalizeRepoRelativePath(relativeFilePath);
    const absolutePath = safeRepoPath(normalizedPath);
    const { service } = createLanguageContext();
    const { position } = positionForRequest(service, absolutePath, line, column);
    const definitions = service.getDefinitionAtPosition(absolutePath, position) || [];
    const locations = definitions.map((item) => locationFromDefinition(item, service)).filter(Boolean);
    return {
      path: normalizedPath,
      line: Number(line || 1),
      column: Number(column || 1),
      locations
    };
  }

  function references(relativeFilePath, line, column) {
    const normalizedPath = normalizeRepoRelativePath(relativeFilePath);
    const absolutePath = safeRepoPath(normalizedPath);
    const { service } = createLanguageContext();
    const { position } = positionForRequest(service, absolutePath, line, column);
    const referencedSymbols = service.findReferences(absolutePath, position) || [];
    const locations = referencedSymbols.flatMap((symbol) =>
      symbol.references
        .map((reference) => {
          const location = locationFromDefinition({ ...reference, name: symbol.definition?.name, kind: symbol.definition?.kind }, service);
          if (!location) return null;
          return {
            ...location,
            isDefinition: symbol.definition?.fileName === reference.fileName && symbol.definition?.textSpan.start === reference.textSpan.start
          };
        })
        .filter(Boolean)
    );
    return {
      path: normalizedPath,
      line: Number(line || 1),
      column: Number(column || 1),
      locations
    };
  }

  function renamePreview(relativeFilePath, line, column, newName = "renamedSymbol") {
    const normalizedPath = normalizeRepoRelativePath(relativeFilePath);
    const absolutePath = safeRepoPath(normalizedPath);
    const { service } = createLanguageContext();
    const { position } = positionForRequest(service, absolutePath, line, column);
    const info = service.getRenameInfo(absolutePath, position, { allowRenameOfImportPath: false });
    if (!info.canRename) {
      return {
        path: normalizedPath,
        canRename: false,
        message: info.localizedErrorMessage || "Symbol cannot be renamed here.",
        locations: []
      };
    }

    const locations = service.findRenameLocations(absolutePath, position, false, false, true) || [];
    const mapped = locations
      .map((location) => locationFromDefinition({ ...location, name: info.displayName, kind: info.kind }, service))
      .filter(Boolean);
    return {
      path: normalizedPath,
      canRename: true,
      displayName: info.displayName,
      fullDisplayName: info.fullDisplayName,
      kind: info.kind,
      newName,
      message: `Preview only: ${mapped.length} edit locations would be renamed to ${newName}.`,
      locations: mapped
    };
  }

  return {
    diagnostics,
    documentSymbols,
    hover,
    definition,
    references,
    renamePreview
  };
}
