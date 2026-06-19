import Editor, { type OnMount } from "@monaco-editor/react";
import { AlertTriangle, Braces, Bug, CircleDot, CircleOff, Crosshair, FileSearch, Info, Network, Save, Wand2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

function languageFor(path: string | null) {
  if (!path) return "typescript";
  if (path === "git diff") return "diff";
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "typescript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".js")) return "javascript";
  return "typescript";
}

export function CodeEditor({ panelId }: { panelId?: string }) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const panel = useWorkspaceStore((state) => (panelId ? state.editorPanels.find((item) => item.id === panelId) : null));
  const globalFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const globalContent = useWorkspaceStore((state) => state.currentFileContent);
  const globalDirty = useWorkspaceStore((state) => state.isDirty);
  const globalTargetLine = useWorkspaceStore((state) => state.targetLine);
  const currentFilePath = panel ? (panel.readOnly ? null : panel.path) : globalFilePath;
  const displayPath = panel?.path || globalFilePath;
  const content = panel?.content ?? globalContent;
  const isDirty = panel?.isDirty ?? globalDirty;
  const targetLine = panel?.targetLine ?? globalTargetLine;
  const readOnly = Boolean(panel?.readOnly);
  const diagnostics = useWorkspaceStore((state) => state.diagnostics);
  const setContent = useWorkspaceStore((state) => state.setCurrentFileContent);
  const setPanelContent = useWorkspaceStore((state) => state.setEditorPanelContent);
  const setActiveEditorPanel = useWorkspaceStore((state) => state.setActiveEditorPanel);
  const saveEditorPanel = useWorkspaceStore((state) => state.saveEditorPanel);
  const saveCurrentFile = useWorkspaceStore((state) => state.saveCurrentFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);
  const setGraphFocus = useWorkspaceStore((state) => state.setGraphFocus);
  const setEditorCursor = useWorkspaceStore((state) => state.setEditorCursor);
  const requestHoverAtCursor = useWorkspaceStore((state) => state.requestHoverAtCursor);
  const goToDefinitionAtCursor = useWorkspaceStore((state) => state.goToDefinitionAtCursor);
  const findReferencesAtCursor = useWorkspaceStore((state) => state.findReferencesAtCursor);
  const showDiagnostics = useWorkspaceStore((state) => state.showDiagnostics);
  const startDebugCurrentFile = useWorkspaceStore((state) => state.startDebugCurrentFile);
  const addBreakpointAtCursor = useWorkspaceStore((state) => state.addBreakpointAtCursor);
  const removeBreakpointAtCursor = useWorkspaceStore((state) => state.removeBreakpointAtCursor);

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    monaco.editor.defineTheme("holocode", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "8f9b9b" },
        { token: "keyword", foreground: "7dd3fc" },
        { token: "string", foreground: "f0c674" }
      ],
      colors: {
        "editor.background": "#101112",
        "editor.foreground": "#e8eeee",
        "editorLineNumber.foreground": "#6d7474",
        "editorCursor.foreground": "#48e5c2",
        "editor.selectionBackground": "#285f55"
      }
    });
    monaco.editor.setTheme("holocode");
    const position = editorInstance.getPosition();
    setEditorCursor(position?.lineNumber || 1, position?.column || 1);
    if (panelId) {
      setActiveEditorPanel(panelId);
    }
    editorInstance.onDidFocusEditorText(() => {
      if (panelId) setActiveEditorPanel(panelId);
    });
    editorInstance.onDidChangeCursorPosition((event) => {
      if (panelId) setActiveEditorPanel(panelId);
      setEditorCursor(event.position.lineNumber, event.position.column);
    });
  };

  useEffect(() => {
    if (!editorRef.current || !targetLine) return;
    editorRef.current.revealLineInCenter(targetLine);
    editorRef.current.setPosition({ lineNumber: targetLine, column: 1 });
    editorRef.current.focus();
  }, [targetLine]);

  useEffect(() => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model || !currentFilePath) return;

    const markers = diagnostics
      .filter((diagnostic) => diagnostic.path === currentFilePath)
      .map((diagnostic) => ({
        startLineNumber: diagnostic.startLine,
        startColumn: diagnostic.startColumn,
        endLineNumber: diagnostic.endLine,
        endColumn: diagnostic.endColumn,
        message: diagnostic.message,
        code: String(diagnostic.code),
        source: diagnostic.source,
        severity:
          diagnostic.severity === "error"
            ? monaco.MarkerSeverity.Error
            : diagnostic.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : diagnostic.severity === "hint"
                ? monaco.MarkerSeverity.Hint
                : monaco.MarkerSeverity.Info
      }));
    monaco.editor.setModelMarkers(model, "holocode-lsp", markers);
  }, [currentFilePath, diagnostics]);

  const save = () => {
    if (readOnly) return;
    if (panelId) {
      void saveEditorPanel(panelId);
      return;
    }
    void saveCurrentFile();
  };

  return (
    <Panel
      title={panel?.title || currentFilePath || "No file open"}
      eyebrow={readOnly ? "Read only review" : isDirty ? "Unsaved changes" : "Focus editor"}
      className="editor-panel"
      actions={
        <>
          <Button
            title="Save file"
            icon={<Save size={16} />}
            variant={isDirty ? "primary" : "ghost"}
            disabled={readOnly}
            onClick={save}
          />
          <Button
            title="Search in file"
            icon={<FileSearch size={16} />}
            onClick={() => void editorRef.current?.getAction("actions.find")?.run()}
          />
          <Button title="Hover info" icon={<Info size={16} />} disabled={readOnly} onClick={() => void requestHoverAtCursor()} />
          <Button title="Go to definition" icon={<Crosshair size={16} />} disabled={readOnly} onClick={() => void goToDefinitionAtCursor()} />
          <Button title="Find references" icon={<Network size={16} />} disabled={readOnly} onClick={() => void findReferencesAtCursor()} />
          <Button title="Show diagnostics" icon={<AlertTriangle size={16} />} onClick={() => void showDiagnostics()} />
          <Button title="Debug current file" icon={<Bug size={16} />} disabled={readOnly} onClick={() => void startDebugCurrentFile()} />
          <Button title="Add breakpoint at cursor" icon={<CircleDot size={16} />} disabled={readOnly} onClick={() => void addBreakpointAtCursor()} />
          <Button title="Remove breakpoint at cursor" icon={<CircleOff size={16} />} disabled={readOnly} onClick={() => void removeBreakpointAtCursor()} />
          <Button
            title="Format placeholder"
            icon={<Wand2 size={16} />}
            onClick={() => {
              void editorRef.current?.getAction("editor.action.formatDocument")?.run();
              appendTerminal("Format requested. Monaco action invoked when available.");
            }}
          />
          <Button
            title="Show related files"
            icon={<Network size={16} />}
            onClick={() => setGraphFocus("dependencies")}
          />
        </>
      }
    >
      {displayPath ? (
        <Editor
          height="100%"
          language={languageFor(displayPath)}
          value={content}
          onChange={(value) => {
            if (readOnly) return;
            if (panelId) {
              setPanelContent(panelId, value ?? "");
              return;
            }
            setContent(value ?? "");
          }}
          onMount={handleMount}
          options={{
            fontSize: 16,
            fontFamily: "JetBrains Mono, Consolas, monospace",
            fontLigatures: false,
            minimap: { enabled: true },
            lineNumbersMinChars: 3,
            wordWrap: "on",
            smoothScrolling: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            readOnly,
            padding: { top: 18, bottom: 18 },
            renderLineHighlight: "all"
          }}
        />
      ) : (
        <div className="empty-state">
          <Braces size={24} />
          <span>Select a file from the tree.</span>
        </div>
      )}
    </Panel>
  );
}
