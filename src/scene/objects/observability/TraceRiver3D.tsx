import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Mesh, Quaternion, Vector3 } from "three";
import {
  positionTraceSpans,
  spanDurationWeight,
  traceEdgesWithPositions,
  unmappedTraceSpans,
  type PositionedTraceSpan,
  type TraceRiverProjection
} from "../../../observability/traceSelectors";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import type { Vec3, SceneLayout3D } from "../../layout/layout3d";
import { TraceRiverLegend3D } from "./TraceRiverLegend3D";
import { TraceSpanNode3D } from "./TraceSpanNode3D";

const STATUS_COLOR = {
  ok: "#48e5c2",
  error: "#f06f6f",
  unknown: "#8a9692"
};

function midpoint(source: Vec3, target: Vec3): Vec3 {
  return [(source[0] + target[0]) / 2, (source[1] + target[1]) / 2, (source[2] + target[2]) / 2];
}

function segmentTransform(source: Vec3, target: Vec3) {
  const start = new Vector3(source[0], source[1] + 0.82, source[2]);
  const end = new Vector3(target[0], target[1] + 0.82, target[2]);
  const direction = end.clone().sub(start);
  const length = Math.max(0.01, direction.length());
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
  return {
    start,
    end,
    position: midpoint([start.x, start.y, start.z], [end.x, end.y, end.z]),
    quaternion,
    length
  };
}

function TraceFlowSegment({
  source,
  target,
  trace,
  status
}: {
  source: PositionedTraceSpan;
  target: PositionedTraceSpan;
  trace: TraceRiverProjection;
  status: keyof typeof STATUS_COLOR;
}) {
  const flow = useRef<Mesh>(null);
  const transform = useMemo(() => segmentTransform(source.position, target.position), [source.position, target.position]);
  const color = STATUS_COLOR[status];
  const thickness = 0.018 + spanDurationWeight(target, trace) * 0.04;

  useFrame(({ clock }) => {
    if (!flow.current) return;
    const t = (clock.elapsedTime * (status === "error" ? 0.55 : 0.38) + target.spanId.length * 0.03) % 1;
    const point = transform.start.clone().lerp(transform.end, t);
    flow.current.position.set(point.x, point.y, point.z);
  });

  return (
    <group>
      <mesh position={transform.position} quaternion={transform.quaternion}>
        <cylinderGeometry args={[thickness, thickness, transform.length, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.22} transparent opacity={status === "unknown" ? 0.25 : 0.54} />
      </mesh>
      <mesh ref={flow}>
        <sphereGeometry args={[thickness * 2.5, 14, 10]} />
        <meshBasicMaterial color={color} transparent opacity={status === "unknown" ? 0.34 : 0.9} />
      </mesh>
    </group>
  );
}

export function TraceRiver3D({ layout }: { layout: SceneLayout3D }) {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const activeTraceRiver = useObservabilityStore((state) => state.activeTraceRiver);
  const traceSummaries = useObservabilityStore((state) => state.traceSummaries);
  const selectedTraceSpanId = useObservabilityStore((state) => state.selectedTraceSpanId);
  const showUnmappedTraceSpans = useObservabilityStore((state) => state.showUnmappedTraceSpans);
  const traceRiverComparison = useObservabilityStore((state) => state.traceRiverComparison);
  const isObservabilityLoading = useObservabilityStore((state) => state.isObservabilityLoading);
  const observabilityError = useObservabilityStore((state) => state.observabilityError);
  const loadTraceRiver = useObservabilityStore((state) => state.loadTraceRiver);
  const selectTraceSpan = useObservabilityStore((state) => state.selectTraceSpan);
  const setShowUnmappedTraceSpans = useObservabilityStore((state) => state.setShowUnmappedTraceSpans);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const openFile = useWorkspaceStore((state) => state.openFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);

  const visible = activeObservabilityMode === "trace-rivers";
  const positionedSpans = useMemo(() => positionTraceSpans(activeTraceRiver, layout).slice(0, 160), [activeTraceRiver, layout]);
  const edges = useMemo(() => traceEdgesWithPositions(activeTraceRiver, positionedSpans).slice(0, 220), [activeTraceRiver, positionedSpans]);
  const selectedSpan = activeTraceRiver?.spans.find((span) => span.spanId === selectedTraceSpanId) || null;
  const unmapped = unmappedTraceSpans(activeTraceRiver);

  useEffect(() => {
    if (!visible) return;
    if (!activeTraceRiver && !isObservabilityLoading) void loadTraceRiver();
  }, [activeTraceRiver, isObservabilityLoading, loadTraceRiver, visible]);

  if (!visible) return null;

  return (
    <group>
      {activeTraceRiver ? (
        <>
          {edges.map((edge) => (
            <TraceFlowSegment key={edge.id} source={edge.source} target={edge.target} trace={activeTraceRiver} status={edge.status} />
          ))}
          {positionedSpans.map((span) => (
            <TraceSpanNode3D
              key={span.spanId}
              span={span}
              trace={activeTraceRiver}
              selected={span.spanId === selectedTraceSpanId}
              onSelect={(spanId) => {
                selectTraceSpan(spanId);
                appendTerminal(`Trace span selected: ${span.name} (${span.status}).`);
              }}
              onOpen={(targetSpan) => {
                const path = targetSpan.path || targetSpan.filePath;
                if (path) void openFile(path, targetSpan.line);
              }}
            />
          ))}
          {showUnmappedTraceSpans && unmapped.length ? (
            <Html transform position={[-5.35, 1.68, -2.0]} rotation={[0, 0.58, 0]} className="scene-html trace-unmapped-panel">
              <header>
                <strong>Unmapped spans</strong>
                <span>{unmapped.length} spans</span>
              </header>
              {unmapped.slice(0, 10).map((span) => (
                <button key={span.spanId} onClick={() => selectTraceSpan(span.spanId)}>
                  <strong>{span.name}</strong>
                  <span>{span.mappingReason}</span>
                </button>
              ))}
            </Html>
          ) : null}
        </>
      ) : (
        <Html center position={[0, 2.05, -2.15]} className="scene-html trace-river-empty">
          <strong>{isObservabilityLoading ? "Loading trace rivers..." : "No real trace available."}</strong>
          <span>{observabilityError || "Import a trace or run tests/lint when connected."}</span>
        </Html>
      )}
      <TraceRiverLegend3D
        trace={activeTraceRiver}
        traces={traceSummaries}
        selectedSpan={selectedSpan}
        showUnmapped={showUnmappedTraceSpans}
        comparison={traceRiverComparison}
        onSelectTrace={(traceId) => void loadTraceRiver(traceId)}
        onToggleUnmapped={() => setShowUnmappedTraceSpans(!showUnmappedTraceSpans)}
        onHide={() => {
          appendTerminal("Trace Rivers hidden.");
          clearObservabilityOverlays();
        }}
      />
    </group>
  );
}
