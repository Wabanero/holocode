import { parseVoiceCommand } from "../src/agents/VoiceCommandRouter";

export function voiceRouterTestPlaceholder() {
  const intent = parseVoiceCommand("open file SceneManager");
  return intent.type === "open-file";
}
