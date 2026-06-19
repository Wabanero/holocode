import { Boxes, LocateFixed, Pin, SquareFunction, Users } from "lucide-react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { getCallersForFile, getImportsForFile, getSymbolsForFile } from "../graph/selectors";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

export function FunctionPanel() {
  const graph = useWorkspaceStore((state) => state.graph);
  const currentFilePath = useWorkspaceStore((state) => state.currentFilePath);
  const selectedFunctionIds = useWorkspaceStore((state) => state.selectedFunctionIds);
  const toggleFunctionSelection = useWorkspaceStore((state) => state.toggleFunctionSelection);
  const pinFunction = useWorkspaceStore((state) => state.pinFunction);
  const jumpToLine = useWorkspaceStore((state) => state.jumpToLine);
  const setGraphFocus = useWorkspaceStore((state) => state.setGraphFocus);

  const symbols = getSymbolsForFile(graph, currentFilePath);
  const imports = getImportsForFile(graph, currentFilePath);
  const callers = getCallersForFile(graph, currentFilePath);

  return (
    <Panel
      title="Function Context"
      eyebrow={currentFilePath || "No file"}
      className="function-panel"
      actions={
        <>
          <Button title="Show dependencies" icon={<Boxes size={16} />} onClick={() => setGraphFocus("dependencies")} />
          <Button title="Show callers" icon={<Users size={16} />} onClick={() => setGraphFocus("callers")} />
        </>
      }
    >
      <div className="context-metrics">
        <span>{symbols.length} symbols</span>
        <span>{imports.length} imports</span>
        <span>{callers.length} callers</span>
      </div>

      <div className="function-list">
        {symbols.map((symbol) => {
          const isSelected = selectedFunctionIds.includes(symbol.id);
          return (
            <article className={`function-card ${isSelected ? "is-selected" : ""}`} key={symbol.id}>
              <button className="function-title" onClick={() => toggleFunctionSelection(symbol.id)}>
                <SquareFunction size={16} />
                <span>{symbol.name}</span>
              </button>
              <div className="function-meta">
                <span>line {symbol.line ?? 1}</span>
                <span>{symbol.size ?? 1} lines</span>
                <span>{symbol.kind}</span>
              </div>
              <div className="function-calls">
                {(symbol.calls || []).slice(0, 5).map((call) => (
                  <span key={call}>{call}</span>
                ))}
                {!symbol.calls?.length ? <span>calls: none detected</span> : null}
              </div>
              <div className="function-actions">
                <Button title="Jump to line" icon={<LocateFixed size={15} />} onClick={() => jumpToLine(symbol.line ?? 1)} />
                <Button title="Pin as floating card" icon={<Pin size={15} />} onClick={() => pinFunction(symbol.id)} />
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
