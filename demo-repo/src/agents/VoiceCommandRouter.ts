import type { CockpitMode } from "../App";

export type VoiceIntent =
  | { type: "open-file"; target: string }
  | { type: "show-dependencies" }
  | { type: "show-callers" }
  | { type: "create-agent-task" }
  | { type: "unknown"; transcript: string };

export interface VoiceRouter {
  route(intent: VoiceIntent): void;
}

export function normalizeTranscript(transcript: string) {
  return transcript.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseVoiceCommand(transcript: string): VoiceIntent {
  const normalized = normalizeTranscript(transcript);

  if (normalized.startsWith("open file ")) {
    return { type: "open-file", target: normalized.replace("open file ", "") };
  }

  if (normalized.includes("dependencies")) {
    return { type: "show-dependencies" };
  }

  if (normalized.includes("callers")) {
    return { type: "show-callers" };
  }

  if (normalized.includes("agent task")) {
    return { type: "create-agent-task" };
  }

  return { type: "unknown", transcript };
}

export function createDefaultVoiceRouter(setMode: (mode: CockpitMode) => void): VoiceRouter {
  return {
    route(intent) {
      if (intent.type === "show-dependencies") {
        setMode("architecture");
      }

      if (intent.type === "create-agent-task") {
        setMode("agent");
      }
    }
  };
}
