import { Html, Text } from "@react-three/drei";
import { useMemo, useState } from "react";
import {
  buildDiffTimeline,
  eventKindLabel,
  type DiffHunkSummary,
  type DiffValidationGateState,
  type DiffTimelineEvent
} from "../../../observability/diffTimeline";
import { useObservabilityStore } from "../../../state/observabilityStore";
import { useWorkspaceStore } from "../../../state/useWorkspaceStore";
import { DiffHunkRibbon3D } from "./DiffHunkRibbon3D";
import { DiffTimeSlice3D, colorForDiffEvent, type Vec3 } from "./DiffTimeSlice3D";
import { DiffValidationGate3D } from "./DiffValidationGate3D";

function slicePosition(index: number, total: number): Vec3 {
  const centered = index - (total - 1) / 2;
  return [0, 1.18 + Math.sin(index * 0.72) * 0.08, centered * 0.76];
}

function gatePosition(total: number): Vec3 {
  const z = total ? (total - 1) / 2 * 0.76 + 0.88 : 0.88;
  return [0, 1.18, z];
}

function hunkEndEvent(events: DiffTimelineEvent[], hunk: DiffHunkSummary) {
  const sameTask = hunk.taskId ? events.filter((event) => event.taskId === hunk.taskId) : events;
  return (
    sameTask.find((event) =>
      ["patch_applied", "patch_rejected", "patch_validated", "patch_validation_failed", "patch_apply_blocked"].includes(event.kind)
    ) ||
    sameTask.at(-1) ||
    events.at(-1) ||
    null
  );
}

function hunkStartEvent(events: DiffTimelineEvent[], hunk: DiffHunkSummary) {
  const sameTask = hunk.taskId ? events.filter((event) => event.taskId === hunk.taskId) : events;
  return sameTask.find((event) => event.kind === "patch_detected" || event.kind === "git_diff_changed") || sameTask[0] || events[0] || null;
}

function metadataLine(event: DiffTimelineEvent) {
  const parts = [eventKindLabel(event.kind), event.status || "info"];
  if (event.taskId) parts.push(event.taskId);
  if (event.filePath) parts.push(event.filePath);
  return parts.join(" | ");
}

function gateOutput(gate: DiffValidationGateState) {
  return "output" in gate ? gate.output || gate.message : gate.message;
}

export function DiffTimeTunnel3D() {
  const activeObservabilityMode = useObservabilityStore((state) => state.activeObservabilityMode);
  const diffTunnelView = useObservabilityStore((state) => state.diffTunnelView);
  const setDiffTunnelView = useObservabilityStore((state) => state.setDiffTunnelView);
  const clearObservabilityOverlays = useObservabilityStore((state) => state.clearObservabilityOverlays);
  const currentDiff = useWorkspaceStore((state) => state.currentDiff);
  const activeDiff = useWorkspaceStore((state) => state.activeDiff);
  const activeDiffFile = useWorkspaceStore((state) => state.activeDiffFile);
  const diffSummary = useWorkspaceStore((state) => state.diffSummary);
  const agentResults = useWorkspaceStore((state) => state.agentResults);
  const agentRuns = useWorkspaceStore((state) => state.agentRuns);
  const currentAgentTaskId = useWorkspaceStore((state) => state.currentAgentTaskId);
  const diagnostics = useWorkspaceStore((state) => state.diagnosticSummary);
  const terminalLines = useWorkspaceStore((state) => state.terminalLines);
  const openDiffForFile = useWorkspaceStore((state) => state.openDiffForFile);
  const openAgentDiff = useWorkspaceStore((state) => state.openAgentDiff);
  const focusFile = useWorkspaceStore((state) => state.focusFile);
  const appendTerminal = useWorkspaceStore((state) => state.appendTerminal);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const visible = activeObservabilityMode === "diff-time-tunnel";
  const timeline = useMemo(
    () =>
      buildDiffTimeline({
        view: diffTunnelView,
        currentDiff,
        activeDiff,
        activeDiffFile,
        diffSummary,
        agentResults,
        agentRuns,
        currentAgentTaskId,
        diagnostics,
        terminalLines
      }),
    [
      activeDiff,
      activeDiffFile,
      agentResults,
      agentRuns,
      currentAgentTaskId,
      currentDiff,
      diagnostics,
      diffSummary,
      diffTunnelView,
      terminalLines
    ]
  );
  const selectedEvent = timeline.events.find((event) => event.id === selectedEventId) || timeline.events.at(-1) || null;
  const positions = useMemo(
    () => new Map(timeline.events.map((event, index) => [event.id, slicePosition(index, timeline.events.length)])),
    [timeline.events]
  );

  if (!visible) return null;

  const handleSelectEvent = (event: DiffTimelineEvent) => {
    setSelectedEventId(event.id);
    appendTerminal(`Diff Time Tunnel: ${event.label}. ${event.message}`);
  };

  const handleOpenHunk = (hunk: DiffHunkSummary) => {
    if (hunk.source === "agent" && hunk.taskId) {
      openAgentDiff(hunk.taskId);
    } else {
      openDiffForFile(hunk.filePath);
    }
    appendTerminal(`Opened diff hunk ${hunk.filePath} ${hunk.header} (+${hunk.additions} -${hunk.deletions}).`);
  };

  return (
    <group position={[0, 2.24, -2.65]} rotation={[0, 0, 0]}>
      <Text position={[0, 1.35, -3.15]} fontSize={0.16} color="#f2be5c" anchorX="center" maxWidth={3.2}>
        Diff Time Tunnel
      </Text>
      <Text position={[0, 1.13, -3.15]} fontSize={0.07} color="#9aa6a2" anchorX="center" maxWidth={3.6}>
        git diff, agent patch lineage, validation, apply/reject state
      </Text>

      {timeline.mode === "empty" ? (
        <Html center position={[0, 1.0, -0.25]} className="scene-html diff-time-empty">
          <strong>No diff available.</strong>
          <span>Open a git diff or agent patch first.</span>
        </Html>
      ) : (
        <>
          {timeline.events.map((event, index) => (
            <DiffTimeSlice3D
              key={event.id}
              event={event}
              position={positions.get(event.id) || slicePosition(index, timeline.events.length)}
              selected={(selectedEvent?.id || selectedEventId) === event.id}
              onSelect={handleSelectEvent}
            />
          ))}
          {timeline.hunks.slice(0, 90).map((hunk, index) => {
            const startEvent = hunkStartEvent(timeline.events, hunk);
            const endEvent = hunkEndEvent(timeline.events, hunk);
            const start = startEvent ? positions.get(startEvent.id) : null;
            const end = endEvent ? positions.get(endEvent.id) : null;
            return start && end ? (
              <DiffHunkRibbon3D
                key={hunk.id}
                hunk={hunk}
                start={start}
                end={end}
                lane={index}
                onOpenHunk={handleOpenHunk}
                onFocusFile={(path) => {
                  focusFile(path);
                  appendTerminal(`Focused diff file: ${path}`);
                }}
              />
            ) : null;
          })}
          <DiffValidationGate3D
            gate={timeline.gate}
            position={gatePosition(timeline.events.length)}
            onShowOutput={(gate) => appendTerminal(`Patch validation gate: ${gate.label}\n${gateOutput(gate)}`)}
            onShowBranch={(branch) => appendTerminal(`Patch branch: ${branch}`)}
          />
        </>
      )}

      <Html transform position={[4.85, 2.28, -0.75]} rotation={[0, -0.58, 0]} className="scene-html diff-time-panel">
        <header>
          <div>
            <span>Spatial change history</span>
            <strong>{timeline.title}</strong>
          </div>
          <button
            onClick={() => {
              appendTerminal("Diff Time Tunnel hidden.");
              clearObservabilityOverlays();
            }}
          >
            Exit
          </button>
        </header>

        <div className="diff-time-actions">
          <button className={diffTunnelView === "current" ? "is-active" : ""} onClick={() => setDiffTunnelView("current")}>
            Current
          </button>
          <button className={diffTunnelView === "patch-lineage" ? "is-active" : ""} onClick={() => setDiffTunnelView("patch-lineage")}>
            Patch
          </button>
          <button className={diffTunnelView === "compare-attempts" ? "is-active" : ""} onClick={() => setDiffTunnelView("compare-attempts")}>
            Attempts
          </button>
        </div>

        <dl>
          <div>
            <dt>Events</dt>
            <dd>{timeline.events.length}</dd>
          </div>
          <div>
            <dt>Hunks</dt>
            <dd>{timeline.hunks.length}</dd>
          </div>
          <div>
            <dt>Files</dt>
            <dd>{timeline.files.length}</dd>
          </div>
          <div>
            <dt>Gate</dt>
            <dd>{timeline.gate.label}</dd>
          </div>
        </dl>

        {selectedEvent ? (
          <section className="diff-time-selected">
            <strong>{selectedEvent.label}</strong>
            <span>{metadataLine(selectedEvent)}</span>
            <p>{selectedEvent.message}</p>
          </section>
        ) : null}

        <div className="diff-time-files">
          {timeline.files.slice(0, 8).map((file) => (
            <button
              key={`${file.taskId || file.source}:${file.path}`}
              onClick={() => {
                focusFile(file.path);
                appendTerminal(`Focused diff file: ${file.path}`);
              }}
            >
              <i style={{ background: file.source === "agent" ? "#d5a8ff" : "#f2be5c" }} />
              <span>{file.path}</span>
              <b>{`+${file.additions} -${file.deletions}`}</b>
            </button>
          ))}
        </div>

        <ol>
          {timeline.events.slice(0, 7).map((event) => (
            <li key={event.id}>
              <i style={{ background: colorForDiffEvent(event) }} />
              <button onClick={() => handleSelectEvent(event)}>{event.label}</button>
            </li>
          ))}
        </ol>

        {timeline.warnings.length ? (
          <p className="diff-time-warning">{timeline.warnings[0]}</p>
        ) : (
          <p>Read-only timeline. Patch controls remain in the existing diff stack.</p>
        )}
      </Html>
    </group>
  );
}
