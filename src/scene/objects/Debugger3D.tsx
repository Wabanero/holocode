import { Html, Line, Text } from "@react-three/drei";
import { useMemo } from "react";
import { Vector3 } from "three";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";
import type { DebugStackFrame } from "../../types";
import type { SceneLayout3D, Vec3 } from "../layout/layout3d";

function pointForFrame(layout: SceneLayout3D, frame: DebugStackFrame): Vec3 | null {
  return layout.nodePositions[frame.sourceId] || layout.nodePositions[`file:${frame.path}`] || null;
}

export function Debugger3D({ layout }: { layout: SceneLayout3D }) {
  const visibleSceneMode = useWorkspaceStore((state) => state.visibleSceneMode);
  const showDebugPanel = useWorkspaceStore((state) => state.showDebugPanel);
  const showDebugVariables = useWorkspaceStore((state) => state.showDebugVariables);
  const debugStatus = useWorkspaceStore((state) => state.debugStatus);
  const debugBreakpoints = useWorkspaceStore((state) => state.debugBreakpoints);
  const debugCallStack = useWorkspaceStore((state) => state.debugCallStack);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const debugVariables = useWorkspaceStore((state) => state.debugVariables);
  const debugWatches = useWorkspaceStore((state) => state.debugWatches);
  const debugConsole = useWorkspaceStore((state) => state.debugConsole);
  const lastDebugError = useWorkspaceStore((state) => state.lastDebugError);
  const startDebugCurrentFile = useWorkspaceStore((state) => state.startDebugCurrentFile);
  const stepOver = useWorkspaceStore((state) => state.stepOver);
  const stepInto = useWorkspaceStore((state) => state.stepInto);
  const continueDebug = useWorkspaceStore((state) => state.continueDebug);
  const showVariables = useWorkspaceStore((state) => state.showVariables);
  const openFile = useWorkspaceStore((state) => state.openFile);

  const visible = showDebugPanel || visibleSceneMode === "debug" || debugStatus !== "idle";
  const stackPoints = useMemo(
    () =>
      debugCallStack
        .map((frame) => pointForFrame(layout, frame))
        .filter(Boolean)
        .map((point) => new Vector3(point![0], point![1] + 1.35, point![2])),
    [debugCallStack, layout]
  );
  const activePoint = debugActiveFrame ? pointForFrame(layout, debugActiveFrame) : null;

  if (!visible) return null;

  return (
    <group>
      {stackPoints.length > 1 && <Line points={stackPoints} color="#6db7ff" lineWidth={4} transparent opacity={0.72} />}
      {debugCallStack.slice(0, 9).map((frame, index) => {
        const point = pointForFrame(layout, frame);
        if (!point) return null;
        const active = debugActiveFrame?.id === frame.id;
        return (
          <group key={frame.id} position={[point[0], point[1] + 1.35, point[2]]}>
            <mesh
              onClick={(event) => {
                event.stopPropagation();
                void openFile(frame.path, frame.line);
              }}
            >
              <sphereGeometry args={[active ? 0.16 : 0.1, 20, 20]} />
              <meshStandardMaterial
                color={active ? "#6db7ff" : "#24435a"}
                emissive={active ? "#6db7ff" : "#48e5c2"}
                emissiveIntensity={active ? 0.85 : 0.28}
              />
            </mesh>
            <Text position={[0, 0.27, 0]} fontSize={0.07} color={active ? "#d7ecff" : "#9bc7df"} anchorX="center" maxWidth={1.2}>
              {index + 1}. {frame.name}
            </Text>
          </group>
        );
      })}

      <group position={[3.5, 1.12, -4.35]} rotation={[0, -0.36, 0]}>
        <Text position={[0, 1.14, 0]} fontSize={0.15} color="#6db7ff" anchorX="center">
          Debug Mode
        </Text>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[2.15, 1.75, 0.12]} />
          <meshStandardMaterial color="#14202a" emissive="#6db7ff" emissiveIntensity={0.08} roughness={0.55} />
        </mesh>

        {debugCallStack.slice(0, 5).map((frame, index) => {
          const active = debugActiveFrame?.id === frame.id;
          return (
            <group key={frame.id} position={[0, 0.88 - index * 0.25, 0.12]}>
              <mesh
                onClick={(event) => {
                  event.stopPropagation();
                  void openFile(frame.path, frame.line);
                }}
              >
                <boxGeometry args={[1.82, 0.16, 0.08]} />
                <meshStandardMaterial color={active ? "#1d4564" : "#1c2c34"} emissive="#6db7ff" emissiveIntensity={active ? 0.28 : 0.08} />
              </mesh>
              <Text position={[0, 0.035, 0.06]} fontSize={0.052} color="#e9eeee" anchorX="center" maxWidth={1.52}>
                {frame.name}
              </Text>
              <Text position={[0, -0.045, 0.06]} fontSize={0.039} color="#9bc7df" anchorX="center" maxWidth={1.52}>
                {`${frame.path}:${frame.line}`}
              </Text>
            </group>
          );
        })}

        {!debugCallStack.length && (
          <Text position={[0, 0.48, 0.12]} fontSize={0.055} color="#9bc7df" anchorX="center" maxWidth={1.5}>
            {lastDebugError || "No active debug session"}
          </Text>
        )}

        <Html transform position={[0, -0.58, 0.18]} className="scene-html debugger-controls">
          <button onClick={() => void startDebugCurrentFile()}>Debug</button>
          <button onClick={() => void stepOver()}>Over</button>
          <button onClick={() => void stepInto()}>Into</button>
          <button onClick={() => void continueDebug()}>Continue</button>
          <button onClick={showVariables}>Vars</button>
          <span>{debugStatus}</span>
          <span>{debugBreakpoints.length} bp</span>
        </Html>

        <Html transform position={[1.48, 0.4, 0.18]} rotation={[0, -0.24, 0]} className="scene-html">
          <div className="debug-console-panel">
            <strong>Debug console</strong>
            {debugConsole.slice(-4).map((entry) => (
              <span key={entry.id} className={`debug-log-${entry.level}`}>
                {entry.message}
              </span>
            ))}
          </div>
        </Html>
      </group>

      {activePoint && showDebugVariables && (
        <Html
          transform
          position={[activePoint[0] + 1.05, activePoint[1] + 1.45, activePoint[2] + 0.28]}
          rotation={[0, -0.22, 0]}
          className="scene-html"
        >
          <div className="debug-variable-panel">
            <strong>{debugActiveFrame?.name || "Variables"}</strong>
            {debugVariables.slice(0, 8).map((variable) => (
              <span key={`${variable.scope}-${variable.name}`}>
                <code>{variable.name}</code>
                {variable.value}
              </span>
            ))}
            {debugWatches.length ? (
              <>
                <strong>Watches</strong>
                {debugWatches.map((watch) => (
                  <span key={watch.id}>
                    <code>{watch.expression}</code>
                    {watch.value}
                  </span>
                ))}
              </>
            ) : null}
          </div>
        </Html>
      )}
    </group>
  );
}
