import { Line } from "@react-three/drei";
import { Vector3 } from "three";
import type { SceneBeam } from "../layout/layout3d";

function curvePoints(source: [number, number, number], target: [number, number, number]) {
  const start = new Vector3(...source).add(new Vector3(0, 0.55, 0));
  const end = new Vector3(...target).add(new Vector3(0, 0.55, 0));
  const mid = start.clone().lerp(end, 0.5);
  mid.y += 0.7 + start.distanceTo(end) * 0.04;
  return [start, mid, end];
}

export function DependencyBeam3D({
  beam,
  highlighted,
  dimmed
}: {
  beam: SceneBeam;
  highlighted: boolean;
  dimmed: boolean;
}) {
  const color = beam.beamKind === "external" ? "#f2be5c" : beam.beamKind === "test" ? "#c7a8ff" : "#48e5c2";
  return (
    <Line
      points={curvePoints(beam.sourcePosition, beam.targetPosition)}
      color={color}
      lineWidth={highlighted ? 3.2 : 1.15}
      transparent
      opacity={dimmed ? 0.08 : highlighted ? 0.88 : 0.34}
    />
  );
}
