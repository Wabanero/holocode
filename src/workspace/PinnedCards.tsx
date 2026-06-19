import { Grip, LocateFixed, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { useWorkspaceStore } from "../state/useWorkspaceStore";

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
};

export function PinnedCards() {
  const cards = useWorkspaceStore((state) => state.pinnedCards);
  const movePinnedCard = useWorkspaceStore((state) => state.movePinnedCard);
  const unpinFunction = useWorkspaceStore((state) => state.unpinFunction);
  const jumpToLine = useWorkspaceStore((state) => state.jumpToLine);
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!drag) return;
      movePinnedCard(drag.id, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    }

    function handleUp() {
      setDrag(null);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, movePinnedCard]);

  return (
    <div className="pinned-layer">
      {cards.map((card) => (
        <article className="pinned-card" key={card.id} style={{ left: card.x, top: card.y }}>
          <header
            onPointerDown={(event) => {
              setDrag({
                id: card.id,
                offsetX: event.clientX - card.x,
                offsetY: event.clientY - card.y
              });
            }}
          >
            <Grip size={14} />
            <strong>{card.name}</strong>
            <Button title="Unpin" icon={<X size={13} />} onClick={() => unpinFunction(card.id)} />
          </header>
          <div className="pinned-meta">
            <span>{card.path}</span>
            <span>
              line {card.line} / {card.size} lines
            </span>
          </div>
          <Button title="Jump to function" icon={<LocateFixed size={14} />} onClick={() => jumpToLine(card.line)}>
            Jump
          </Button>
        </article>
      ))}
    </div>
  );
}
