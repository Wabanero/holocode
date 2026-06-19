import { Html, Text, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useRef, useState } from "react";
import type { Mesh } from "three";
import type { SceneSymbol } from "../layout/layout3d";
import { useWorkspaceStore } from "../../state/useWorkspaceStore";

export const FunctionSatellite3D = memo(function FunctionSatellite3D({ symbol }: { symbol: SceneSymbol }) {
  const ref = useRef<Mesh>(null);
  const selectedFunctionId = useWorkspaceStore((state) => state.selectedFunctionId);
  const diagnostics = useWorkspaceStore((state) => state.diagnostics);
  const debugBreakpoints = useWorkspaceStore((state) => state.debugBreakpoints);
  const debugActiveFrame = useWorkspaceStore((state) => state.debugActiveFrame);
  const selectFunction = useWorkspaceStore((state) => state.selectFunction);
  const pinFunction = useWorkspaceStore((state) => state.pinFunction);
  const jumpToLine = useWorkspaceStore((state) => state.jumpToLine);
  const addBreakpointForSymbol = useWorkspaceStore((state) => state.addBreakpointForSymbol);
  const [hovered, setHovered] = useState(false);
  const selected = selectedFunctionId === symbol.id;
  const symbolDiagnostics = diagnostics.filter(
    (diagnostic) =>
      diagnostic.path === symbol.path &&
      diagnostic.startLine >= (symbol.line || 1) &&
      diagnostic.startLine <= (symbol.endLine || symbol.line || 1)
  );
  const diagnosticSeverity = symbolDiagnostics.some((diagnostic) => diagnostic.severity === "error")
    ? "error"
    : symbolDiagnostics.some((diagnostic) => diagnostic.severity === "warning")
      ? "warning"
      : symbolDiagnostics.length
        ? "info"
        : null;
  const diagnosticColor = diagnosticSeverity === "error" ? "#f06f6f" : diagnosticSeverity === "warning" ? "#f2be5c" : "#6db7ff";
  const hasBreakpoint = debugBreakpoints.some(
    (breakpoint) =>
      breakpoint.sourceId === symbol.id ||
      (breakpoint.path === symbol.path &&
        breakpoint.line >= (symbol.line || 1) &&
        breakpoint.line <= (symbol.endLine || symbol.line || 1))
  );
  const activeDebugFrame = debugActiveFrame?.sourceId === symbol.id;
  useCursor(hovered);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.position.y = Math.sin(clock.elapsedTime * 1.4 + symbol.orbitIndex) * 0.035;
    ref.current.rotation.y += 0.01;
  });

  return (
    <group position={symbol.position}>
      <mesh
        ref={ref}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation();
          selectFunction(symbol.id);
          jumpToLine(symbol.line || 1);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          pinFunction(symbol.id);
          void addBreakpointForSymbol(symbol.path, symbol.line || 1);
        }}
      >
        <sphereGeometry args={[Math.min(0.18, 0.08 + (symbol.size || 4) * 0.004), 18, 18]} />
        <meshStandardMaterial
          color={symbol.color}
          emissive={selected || hovered ? symbol.color : activeDebugFrame ? "#6db7ff" : diagnosticSeverity ? diagnosticColor : "#000000"}
          emissiveIntensity={selected ? 0.55 : hovered ? 0.28 : activeDebugFrame ? 0.72 : diagnosticSeverity ? 0.48 : 0}
          roughness={0.42}
        />
      </mesh>
      {hasBreakpoint && (
        <mesh position={[-0.19, 0.13, 0]}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial color="#f06f6f" emissive="#f06f6f" emissiveIntensity={0.85} />
        </mesh>
      )}
      {activeDebugFrame && (
        <mesh position={[0, 0, 0]}>
          <torusGeometry args={[0.23, 0.014, 8, 30]} />
          <meshStandardMaterial color="#6db7ff" emissive="#6db7ff" emissiveIntensity={0.9} />
        </mesh>
      )}
      {diagnosticSeverity && (
        <mesh position={[0.2, 0.14, 0]}>
          <torusGeometry args={[0.08, 0.012, 8, 22]} />
          <meshStandardMaterial color={diagnosticColor} emissive={diagnosticColor} emissiveIntensity={0.75} />
        </mesh>
      )}
      {(selected || hovered) && (
        <Text position={[0, 0.25, 0]} fontSize={0.085} color="#e9eeee" anchorX="center" maxWidth={1.2}>
          {symbol.name}
        </Text>
      )}
      {(selected || hovered) && (
        <Html center distanceFactor={7} position={[0, -0.24, 0]} className="scene-html function-debug-action">
          <button title="Add breakpoint" onClick={() => void addBreakpointForSymbol(symbol.path, symbol.line || 1)}>
            ●
          </button>
        </Html>
      )}
    </group>
  );
});
