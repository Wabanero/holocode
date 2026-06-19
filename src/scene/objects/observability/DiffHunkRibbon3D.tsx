import { Line, Text } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useState } from "react";
import type { DiffHunkSummary } from "../../../observability/diffTimeline";
import type { Vec3 } from "./DiffTimeSlice3D";

function hunkColor(hunk: DiffHunkSummary) {
  if (hunk.additions && hunk.deletions) return "#f2be5c";
  if (hunk.additions) return "#48e5c2";
  if (hunk.deletions) return "#f06f6f";
  return "#9aa6a2";
}

function shortPath(path: string) {
  const parts = path.split("/");
  return parts.length > 2 ? `${parts.at(-2)}/${parts.at(-1)}` : path;
}

export function DiffHunkRibbon3D({
  hunk,
  start,
  end,
  lane,
  onOpenHunk,
  onFocusFile
}: {
  hunk: DiffHunkSummary;
  start: Vec3;
  end: Vec3;
  lane: number;
  onOpenHunk: (hunk: DiffHunkSummary) => void;
  onFocusFile: (path: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = hunkColor(hunk);
  const width = 1.6 + Math.min(5, hunk.additions + hunk.deletions) * 0.28;
  const points = useMemo(() => {
    const xOffset = ((lane % 9) - 4) * 0.18;
    const yLift = 0.18 + (lane % 4) * 0.08;
    const midZ = (start[2] + end[2]) / 2;
    return [
      [start[0] + xOffset, start[1] + yLift, start[2]] as Vec3,
      [xOffset * 1.7, start[1] + 0.42 + yLift, midZ] as Vec3,
      [end[0] + xOffset, end[1] + yLift, end[2]] as Vec3
    ];
  }, [end, lane, start]);
  const labelPoint = points[1];

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={hovered ? width + 1.6 : width}
        transparent
        opacity={hovered ? 0.95 : 0.58}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onOpenHunk(hunk);
        }}
      />
      <group position={labelPoint}>
        <Text
          fontSize={0.045}
          color={hovered ? "#d8fff4" : color}
          anchorX="center"
          maxWidth={1.35}
          onClick={(event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            onFocusFile(hunk.filePath);
          }}
        >
          {shortPath(hunk.filePath)}
        </Text>
      </group>
    </group>
  );
}
