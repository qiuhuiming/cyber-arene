export type AgentStatus = "idle" | "thinking" | "speaking";

export type AgentProfile = {
  id: string;
  name: string;
  persona: string;
  accent: string;
};

export type AgentSnapshot = AgentProfile & {
  status: AgentStatus;
};

export type ArenaPrompts = {
  systemName: string;
  unknownAgentName: string;
  systemPropositionTemplate: string;
  agentSystemBase: string;
  agentPersonaTemplate: string;
  userChatLogTemplate: string;
};

export type Message = {
  id: string;
  agentId: string | null;
  role: "system" | "agent";
  content: string;
  time: string;
};

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenAIChatCompletionRequest = {
  model: string;
  temperature?: number;
  messages: OpenAIChatMessage[];
  stream?: boolean;
};

export type ChatCompletionRequester = (payload: OpenAIChatCompletionRequest) => Promise<Response>;
