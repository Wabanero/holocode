import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "../components/Panel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";
import type { FileTreeEntry } from "../types";

function filterTree(entries: FileTreeEntry[], query: string): FileTreeEntry[] {
  if (!query.trim()) return entries;
  const normalized = query.toLowerCase();

  return entries
    .map((entry) => {
      if (entry.kind === "file") {
        return entry.path.toLowerCase().includes(normalized) ? entry : null;
      }

      const children = filterTree(entry.children || [], query);
      if (entry.path.toLowerCase().includes(normalized) || children.length) {
        return { ...entry, children };
      }

      return null;
    })
    .filter(Boolean) as FileTreeEntry[];
}

function TreeNode({
  entry,
  depth,
  openFolders,
  toggleFolder,
  openFile,
  currentFilePath
}: {
  entry: FileTreeEntry;
  depth: number;
  openFolders: Set<string>;
  toggleFolder: (path: string) => void;
  openFile: (path: string) => void;
  currentFilePath: string | null;
}) {
  const isFolder = entry.kind === "folder";
  const isOpen = openFolders.has(entry.path);
  const isCurrent = currentFilePath === entry.path;

  return (
    <li>
      <button
        className={`tree-row ${isCurrent ? "is-current" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => (isFolder ? toggleFolder(entry.path) : openFile(entry.path))}
        title={entry.path}
      >
        {isFolder ? (
          isOpen ? (
            <ChevronDown size={14} />
          ) : (
            <ChevronRight size={14} />
          )
        ) : (
          <span className="tree-spacer" />
        )}
        {isFolder ? isOpen ? <FolderOpen size={15} /> : <Folder size={15} /> : <FileCode2 size={15} />}
        <span>{entry.name}</span>
      </button>
      {isFolder && isOpen ? (
        <ul>
          {(entry.children || []).map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              openFolders={openFolders}
              toggleFolder={toggleFolder}
              openFile={openFile}
              currentFilePath={currentFilePath}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree() {
  const tree = useWorkspaceStore((state) => state.fileTree);
  const currentFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(
    () => new Set(["src", "src/agents", "src/xr", "src/utils", "tests"])
  );

  const filteredTree = useMemo(() => filterTree(tree, query), [tree, query]);

  function toggleFolder(path: string) {
    setOpenFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <Panel title="Files" eyebrow="demo-repo" className="file-panel">
      <input
        className="panel-input"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter files"
      />
      <ul className="file-tree">
        {filteredTree.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            openFolders={openFolders}
            toggleFolder={toggleFolder}
            openFile={(path) => void openFile(path)}
            currentFilePath={currentFilePath}
          />
        ))}
      </ul>
    </Panel>
  );
}
