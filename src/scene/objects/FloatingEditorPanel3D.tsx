import { Html } from "@react-three/drei";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { CodeEditor } from "../../editor/CodeEditor";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";
import type { SpatialEditorPanel } from "../../types";

type DragState = {
  panelId: string;
  startX: number;
  startY: number;
  startPosition: [number, number, number];
};

function SpatialEditorPanel3D({ panel }: { panel: SpatialEditorPanel }) {
  const activeEditorPanelId = useWorkspaceStore((state) => state.activeEditorPanelId);
  const saveEditorPanel = useWorkspaceStore((state) => state.saveEditorPanel);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const closeEditorPanel = useWorkspaceStore((state) => state.closeEditorPanel);
  const setActiveEditorPanel = useWorkspaceStore((state) => state.setActiveEditorPanel);
  const moveEditorPanel = useWorkspaceStore((state) => state.moveEditorPanel);
  const [drag, setDrag] = useState<DragState | null>(null);
  const active = activeEditorPanelId === panel.id;

  useEffect(() => {
    if (!drag) return undefined;
    const handleMove = (event: PointerEvent) => {
      const dx = (event.clientX - drag.startX) / 150;
      const dy = (event.clientY - drag.startY) / 150;
      moveEditorPanel(drag.panelId, [drag.startPosition[0] + dx, drag.startPosition[1] - dy, drag.startPosition[2]]);
    };
    const handleUp = () => setDrag(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, moveEditorPanel]);

  return (
    <Html transform position={panel.position} rotation={panel.rotation} distanceFactor={1.25} className="scene-html">
      <div className={`spatial-editor-shell ${active ? "is-active" : ""}`}>
        <div
          className="spatial-editor-toolbar"
          onPointerDown={(event) => {
            event.stopPropagation();
            if ((event.target as HTMLElement).closest("button")) return;
            setActiveEditorPanel(panel.id);
            setDrag({
              panelId: panel.id,
              startX: event.clientX,
              startY: event.clientY,
              startPosition: panel.position
            });
          }}
        >
          <strong>{panel.title}</strong>
          <span>{panel.readOnly ? "review" : panel.isDirty ? "dirty" : "saved"}</span>
          <Button title="Save" disabled={panel.readOnly} onClick={() => void saveEditorPanel(panel.id)}>
            Save
          </Button>
          <Button title="Focus in world" disabled={panel.readOnly} onClick={() => focusFile(panel.path)}>
            Focus
          </Button>
          <Button title="Close panel" icon={<X size={14} />} onClick={() => closeEditorPanel(panel.id)} />
        </div>
        <div className="spatial-editor-body" onPointerDown={() => setActiveEditorPanel(panel.id)}>
          <CodeEditor panelId={panel.id} />
        </div>
      </div>
    </Html>
  );
}

export function FloatingEditorPanel3D() {
  const editorPanels = useWorkspaceStore((state) => state.editorPanels);

  if (!editorPanels.length) return null;

  return (
    <>
      {editorPanels.map((panel) => (
        <SpatialEditorPanel3D key={panel.id} panel={panel} />
      ))}
    </>
  );
}
