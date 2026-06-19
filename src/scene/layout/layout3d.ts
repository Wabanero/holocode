import type { CodeEdge, CodeGraph, CodeNode } from "../../types";

export type Vec3 = [number, number, number];

export type SceneFolder = CodeNode & {
  position: Vec3;
  radius: number;
};

export type SceneFile = CodeNode & {
  position: Vec3;
  folderId: string;
  height: number;
  color: string;
};

export type SceneSymbol = CodeNode & {
  position: Vec3;
  parentFileId: string;
  orbitIndex: number;
  color: string;
};

export type SceneExternalPackage = CodeNode & {
  position: Vec3;
};

export type SceneBeam = CodeEdge & {
  sourcePosition: Vec3;
  targetPosition: Vec3;
  beamKind: "import" | "external" | "test";
};

export type SceneLayout3D = {
  folders: SceneFolder[];
  files: SceneFile[];
  symbols: SceneSymbol[];
  externalPackages: SceneExternalPackage[];
  tests: SceneFile[];
  beams: SceneBeam[];
  testBeams: SceneBeam[];
  nodePositions: Record<string, Vec3>;
};

const LANGUAGE_COLORS: Record<string, string> = {
  tsx: "#48e5c2",
  typescript: "#6db7ff",
  javascript: "#f2d16b",
  json: "#c7a8ff",
  markdown: "#f2be5c",
  text: "#9aa6a2"
};

export function folderKeyForFile(filePath: string) {
  if (filePath.startsWith("tests/")) return "tests";
  const parts = filePath.split("/");
  if (parts.length >= 3 && parts[0] === "src") return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "src") return "src";
  return "root";
}

function districtLabel(folderPath: string) {
  return folderPath === "." ? "root" : folderPath;
}

function circlePosition(index: number, total: number, radius: number, y = 0): Vec3 {
  const angle = total <= 1 ? 0 : (index / total) * Math.PI * 2 - Math.PI / 2;
  return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
}

function gridOffset(index: number, columns: number, spacing: number): Vec3 {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const centeredCol = col - (columns - 1) / 2;
  return [centeredCol * spacing, 0, row * spacing - 0.7];
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function isTestFile(node: CodeNode) {
  return node.kind === "file" && (node.type === "test" || node.path.startsWith("tests/") || node.name.includes(".test."));
}

export function buildSceneLayout3D(graph: CodeGraph | null): SceneLayout3D {
  if (!graph) {
    return {
      folders: [],
      files: [],
      symbols: [],
      externalPackages: [],
      tests: [],
      beams: [],
      testBeams: [],
      nodePositions: {}
    };
  }

  const fileNodes = graph.nodes.filter((node) => node.kind === "file");
  const packageNodes = graph.nodes.filter((node) => node.kind === "external");
  const definesEdges = graph.edges.filter((edge) => edge.type === "defines");
  const importEdges = graph.edges.filter((edge) => edge.type === "imports");
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodePositions: Record<string, Vec3> = {};

  const districtKeys = [...new Set(fileNodes.map((file) => folderKeyForFile(file.path)))].sort((a, b) => {
    if (a === "src") return -1;
    if (b === "src") return 1;
    if (a === "tests") return 1;
    if (b === "tests") return -1;
    return a.localeCompare(b);
  });

  const folders: SceneFolder[] = districtKeys.map((key, index) => {
    const position = key === "tests" ? ([0, 0, -7.1] as Vec3) : circlePosition(index, districtKeys.length, 5.2, -0.08);
    const folderNode = graph.nodes.find((node) => (node.kind === "folder" || node.kind === "directory") && node.path === key);
    const folder = {
      id: folderNode?.id || `folder:${key}`,
      name: districtLabel(key),
      path: key,
      kind: "folder" as const,
      position,
      radius: key === "tests" ? 1.7 : 1.95
    };
    nodePositions[folder.id] = position;
    return folder;
  });

  const foldersByPath = new Map(folders.map((folder) => [folder.path, folder]));
  const files: SceneFile[] = [];

  for (const district of folders) {
    const districtFiles = fileNodes.filter((file) => folderKeyForFile(file.path) === district.path);
    const columns = Math.max(2, Math.ceil(Math.sqrt(districtFiles.length)));
    districtFiles.forEach((file, index) => {
      const offset = gridOffset(index, columns, district.path === "tests" ? 1.15 : 1.0);
      const position = addVec(district.position, [offset[0], 0.32, offset[2]]);
      const loc = file.loc || file.size || 24;
      const sceneFile = {
        ...file,
        position,
        folderId: district.id,
        height: Math.min(1.45, Math.max(0.36, loc * 0.025)),
        color: LANGUAGE_COLORS[file.language || "text"] || LANGUAGE_COLORS.text
      };
      files.push(sceneFile);
      nodePositions[file.id] = position;
    });
  }

  const filesById = new Map(files.map((file) => [file.id, file]));
  const symbols: SceneSymbol[] = [];
  const symbolNodesById = new Map(
    graph.nodes.filter((node) => node.kind === "function" || node.kind === "class").map((node) => [node.id, node])
  );

  for (const file of files) {
    const symbolIds = definesEdges.filter((edge) => edge.source === file.id).map((edge) => edge.target);
    symbolIds.forEach((symbolId, index) => {
      const symbol = symbolNodesById.get(symbolId);
      if (!symbol) return;
      const angle = (index / Math.max(1, symbolIds.length)) * Math.PI * 2;
      const radius = 0.8 + Math.min(0.45, (symbol.size || 4) * 0.01);
      const position: Vec3 = [
        file.position[0] + Math.cos(angle) * radius,
        file.position[1] + 0.85 + (index % 3) * 0.16,
        file.position[2] + Math.sin(angle) * radius
      ];
      symbols.push({
        ...symbol,
        position,
        parentFileId: file.id,
        orbitIndex: index,
        color: symbol.kind === "class" ? "#f2be5c" : "#9ff5df"
      });
      nodePositions[symbol.id] = position;
    });
  }

  const externalPackages: SceneExternalPackage[] = packageNodes.map((node, index) => {
    const position = circlePosition(index, packageNodes.length, 8.5, 0.95);
    nodePositions[node.id] = position;
    return { ...node, position };
  });

  const tests = files.filter(isTestFile);
  const beams: SceneBeam[] = importEdges
    .map((edge) => {
      const sourcePosition = nodePositions[edge.source];
      const targetPosition = nodePositions[edge.target];
      const targetNode = nodesById.get(edge.target);
      if (!sourcePosition || !targetPosition) return null;
      return {
        ...edge,
        sourcePosition,
        targetPosition,
        beamKind: targetNode?.kind === "external" ? ("external" as const) : ("import" as const)
      };
    })
    .filter(Boolean) as SceneBeam[];

  const testBeams: SceneBeam[] = [];
  for (const file of files.filter((candidate) => !isTestFile(candidate))) {
    const related = file.relatedTests || [];
    for (const testPath of related) {
      const testFile = tests.find((candidate) => candidate.path === testPath);
      if (!testFile) continue;
      testBeams.push({
        id: `${file.id}->${testFile.id}:test`,
        source: file.id,
        target: testFile.id,
        type: "uses",
        sourcePosition: file.position,
        targetPosition: testFile.position,
        beamKind: "test"
      });
    }
  }

  return {
    folders,
    files,
    symbols,
    externalPackages,
    tests,
    beams,
    testBeams,
    nodePositions
  };
}
