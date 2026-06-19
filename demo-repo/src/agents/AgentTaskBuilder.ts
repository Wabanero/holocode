export interface AgentTaskInput {
  goal: string;
  selectedFiles: string[];
  selectedFunctions: string[];
  constraints: string[];
}

export function buildAgentTask(input: AgentTaskInput) {
  return [
    "# Task",
    "",
    input.goal,
    "",
    "## Files",
    ...input.selectedFiles.map((filePath) => `- ${filePath}`),
    "",
    "## Functions",
    ...input.selectedFunctions.map((name) => `- ${name}`),
    "",
    "## Constraints",
    ...input.constraints.map((constraint) => `- ${constraint}`),
    "",
    "## Output",
    "",
    "Return patch only."
  ].join("\n");
}

export function summarizeSelection(files: string[], functions: string[]) {
  return {
    fileCount: files.length,
    functionCount: functions.length,
    risk: functions.length > 4 ? "medium" : "low"
  };
}
