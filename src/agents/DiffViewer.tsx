import { CheckCheck, ListChecks, X } from "lucide-react";
import { Button } from "../components/Button";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

function classifyLine(line: string) {
  if (line.startsWith("+++ ") || line.startsWith("--- ")) return "diff-file";
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-added";
  if (line.startsWith("-")) return "diff-removed";
  return "diff-context";
}

export function DiffViewer({ diff }: { diff: string }) {
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);
  const lines = diff ? diff.split(/\r?\n/) : [];

  if (!diff) {
    return <div className="diff-empty">No result diff found yet.</div>;
  }

  return (
    <div className="diff-viewer">
      <div className="diff-actions">
        <Button
          title="Apply all placeholder"
          icon={<CheckCheck size={15} />}
          onClick={() => appendTerminal("Apply all requested. Placeholder only.")}
        />
        <Button
          title="Apply selected placeholder"
          icon={<ListChecks size={15} />}
          onClick={() => appendTerminal("Apply selected requested. Placeholder only.")}
        />
        <Button
          title="Reject placeholder"
          icon={<X size={15} />}
          variant="danger"
          onClick={() => appendTerminal("Reject diff requested. Placeholder only.")}
        />
      </div>
      <pre className="diff-lines">
        {lines.map((line, index) => (
          <code className={classifyLine(line)} key={`${line}-${index}`}>
            {line || " "}
          </code>
        ))}
      </pre>
    </div>
  );
}
