import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCodeGraphProvider } from "./codegraph-provider.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultRepoRoot = path.join(workspaceRoot, "demo-repo");
const defaultDataPath = path.join(workspaceRoot, "data", "codegraph.json");

export async function scanRepository(options = {}) {
  const provider = createCodeGraphProvider({
    type: options.providerType || "internal",
    repoPath: path.resolve(options.rootDir || defaultRepoRoot),
    dataPath: path.resolve(options.dataPath || defaultDataPath),
    ...options.providerConfig
  });
  return provider.buildGraph(path.resolve(options.rootDir || defaultRepoRoot));
}

async function main() {
  const graph = await scanRepository();
  console.log(
    `Generated data/codegraph.json with ${graph.stats.files} files, ${graph.stats.symbols} symbols, and ${graph.stats.imports} imports.`
  );
}

if (typeof process !== "undefined" && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
