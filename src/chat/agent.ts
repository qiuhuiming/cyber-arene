import { parseAgentResponse, type ParsedAgentResponse } from "@/chat/agent-response";
import { buildAgentSystemPrompt, renderPromptTemplate } from "@/chat/prompt-utils";
import type {
  AgentProfile,
  AgentSnapshot,
  AgentStatus,
  ArenaPrompts,
  Message,
  OpenAIChatCompletionRequest,
} from "@/chat/types";

export type AgentAbility = {
  key: string;
  transformSystemPrompt?: (prompt: string, agent: Agent) => string;
  transformChatLog?: (chatLog: string, agent: Agent) => string;
  transformUserPrompt?: (userPrompt: string, agent: Agent) => string;
  transformParsedResponse?: (
    response: ParsedAgentResponse,
    agent: Agent,
    raw: string,
  ) => ParsedAgentResponse;
};

export class Agent {
  public readonly id: string;
  public readonly name: string;
  public readonly persona: string;
  public readonly accent: string;

  public status: AgentStatus = "idle";

  private readonly prompts: ArenaPrompts;
  private readonly abilities: AgentAbility[];
  private readonly nameByAgentId: Map<string, string>;
  private readonly context: Message[] = [];
  private systemPrompt: string;

  public constructor(options: {
    profile: AgentProfile;
    roster: AgentProfile[];
    prompts: ArenaPrompts;
    abilities?: AgentAbility[];
    initialContext?: Message[];
  }) {
    this.id = options.profile.id;
    this.name = options.profile.name;
    this.persona = options.profile.persona;
    this.accent = options.profile.accent;
    this.prompts = options.prompts;
    this.abilities = options.abilities ?? [];
    this.nameByAgentId = new Map(options.roster.map((agent) => [agent.id, agent.name]));

    const baseSystemPrompt = buildAgentSystemPrompt(options.profile, options.prompts);
    this.systemPrompt = this.abilities.reduce(
      (prompt, ability) => ability.transformSystemPrompt?.(prompt, this) ?? prompt,
      baseSystemPrompt,
    );

    if (options.initialContext) {
      this.resetContext(options.initialContext);
    }
  }

  public snapshot(): AgentSnapshot {
    return {
      id: this.id,
      name: this.name,
      persona: this.persona,
      accent: this.accent,
      status: this.status,
    };
  }

  public getSystemPrompt() {
    return this.systemPrompt;
  }

  public resetContext(messages: Message[]) {
    this.context.length = 0;
    for (const message of messages) {
      this.context.push({ ...message });
    }
  }

  public syncContext(messages: Message[]) {
    const hasSameIds =
      this.context.length === messages.length &&
      this.context.every((message, index) => message.id === messages[index]?.id);

    if (!hasSameIds) {
      this.resetContext(messages);
      return;
    }

    for (let i = 0; i < messages.length; i += 1) {
      const next = messages[i] as Message;
      const existing = this.context[i] as Message;
      if (existing.content !== next.content || existing.time !== next.time) {
        this.context[i] = { ...existing, content: next.content, time: next.time };
      }
    }
  }

  public observeMessageAdded(message: Message) {
    this.context.push({ ...message });
  }

  public observeMessageUpdated(messageId: string, content: string) {
    const index = this.context.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return;
    }
    const current = this.context[index] as Message;
    this.context[index] = { ...current, content };
  }

  public observeMessageRemoved(messageId: string) {
    const index = this.context.findIndex((message) => message.id === messageId);
    if (index === -1) {
      return;
    }
    this.context.splice(index, 1);
  }

  public buildChatCompletionRequest(options: {
    model: string;
    temperature: number;
    streaming: boolean;
  }): OpenAIChatCompletionRequest {
    let chatLog = this.buildChatLog();
    for (const ability of this.abilities) {
      chatLog = ability.transformChatLog?.(chatLog, this) ?? chatLog;
    }

    let userPrompt = renderPromptTemplate(this.prompts.userChatLogTemplate, {
      chat_log: chatLog,
    });
    for (const ability of this.abilities) {
      userPrompt = ability.transformUserPrompt?.(userPrompt, this) ?? userPrompt;
    }

    return {
      model: options.model,
      temperature: options.temperature,
      stream: options.streaming,
      messages: [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    };
  }

  public parseResponse(content: string): ParsedAgentResponse {
    let parsed = parseAgentResponse(content);
    for (const ability of this.abilities) {
      parsed = ability.transformParsedResponse?.(parsed, this, content) ?? parsed;
    }
    return parsed;
  }

  private buildChatLog() {
    return this.context
      .map((message) => {
        const name =
          message.agentId == null
            ? this.prompts.systemName
            : this.nameByAgentId.get(message.agentId) ?? this.prompts.unknownAgentName;
        return `${name}: ${message.content}`;
      })
      .join("\n");
  }
}

export function createAgentsFromRoster(options: {
  roster: AgentProfile[];
  prompts: ArenaPrompts;
  abilities?: AgentAbility[];
  initialContext?: Message[];
}) {
  return options.roster.map(
    (profile) =>
      new Agent({
        profile,
        roster: options.roster,
        prompts: options.prompts,
        abilities: options.abilities,
        initialContext: options.initialContext,
      }),
  );
}
