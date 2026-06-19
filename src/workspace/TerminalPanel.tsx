import { Bug, FlaskConical, ListRestart } from "lucide-react";
import { Button } from "../components/Button";
import { Panel } from "../components/Panel";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

export function TerminalPanel() {
  const lines = useWorkspaceStore((state) => state.terminalLines);
  const runCommand = useWorkspaceStore((state) => state.runCommand);

  return (
    <Panel
      title="Terminal"
      eyebrow="local command boundary"
      className="terminal-panel"
      actions={
        <>
          <Button title="Run npm test" icon={<FlaskConical size={16} />} onClick={() => void runCommand("test")} />
          <Button title="Run npm lint" icon={<Bug size={16} />} onClick={() => void runCommand("lint")} />
          <Button title="Run graph scan" icon={<ListRestart size={16} />} onClick={() => void runCommand("scan")} />
        </>
      }
    >
      <pre className="terminal-output">
        {lines.map((line, index) => (
          <span key={`${line}-${index}`}>{line}</span>
        ))}
      </pre>
    </Panel>
  );
}
