export interface CodeGraphSummary {
  entrypoints: string[];
  modules: string[];
  importedPackages: string[];
}

export function buildCodeGraph(files: string[]): CodeGraphSummary {
  const modules = files.map(resolveModulePath);
  const importedPackages = analyzeImports(files.join("\n"));

  return {
    entrypoints: files.filter((filePath) => filePath.endsWith("App.tsx")),
    modules,
    importedPackages
  };
}

export function resolveModulePath(filePath: string) {
  const parts = filePath.split("/");
  return parts.length > 2 ? parts[1] : "root";
}

export function analyzeImports(sourceText: string) {
  const matches = [...sourceText.matchAll(/from\s+["']([^"']+)["']/g)];
  return matches
    .map((match) => match[1])
    .filter((specifier) => !specifier.startsWith("."));
}
