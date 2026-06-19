import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRepository } from "./scan-codegraph.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const graph = await scanRepository({
  rootDir: path.join(workspaceRoot, "demo-repo"),
  dataPath: path.join(workspaceRoot, "data", "codegraph.json")
});

assert.ok(graph.nodes.some((node) => node.path === "src/App.tsx"), "App.tsx should be present");
assert.ok(graph.nodes.some((node) => node.kind === "function"), "Functions should be extracted");
assert.ok(graph.edges.some((edge) => edge.type === "imports"), "Imports should be extracted");

const graphJson = await fs.readFile(path.join(workspaceRoot, "data", "codegraph.json"), "utf8");
assert.ok(graphJson.includes("src/SceneManager.ts"), "Generated graph should be written");

console.log("Smoke test passed: graph generation and demo symbols are available.");
