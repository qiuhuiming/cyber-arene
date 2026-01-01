import type { AgentProfile, ArenaPrompts } from "@/chat/types";

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

export function formatSystemProposition(
  proposition: string,
  prompts: ArenaPrompts,
) {
  return renderPromptTemplate(prompts.systemPropositionTemplate, {
    proposition,
  });
}

export function buildAgentSystemPrompt(agent: AgentProfile, prompts: ArenaPrompts) {
  return [
    prompts.agentSystemBase.trim(),
    renderPromptTemplate(prompts.agentPersonaTemplate, {
      name: agent.name,
      persona: agent.persona,
    }).trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatTimeStamp(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

