import { Agent } from "@/chat/agent";
import { formatTimeStamp } from "@/chat/prompt-utils";
import type { ChatCompletionRequester, Message } from "@/chat/types";

export { Agent } from "@/chat/agent";
export type { AgentAbility } from "@/chat/agent";
export { createAgentsFromRoster } from "@/chat/agent";
export {
  formatSystemProposition,
  formatTimeStamp,
  renderPromptTemplate,
} from "@/chat/prompt-utils";
export type {
  AgentProfile,
  AgentSnapshot,
  AgentStatus,
  ArenaPrompts,
  ChatCompletionRequester,
  Message,
  OpenAIChatCompletionRequest,
  OpenAIChatMessage,
} from "@/chat/types";

export type RunArenaRoundParams = {
  model: string;
  temperature: number;
  maxAgents: number;
  streaming: boolean;
  agents: Agent[];
  messages: Message[];
  now?: () => number;
  random?: () => number;
  shuffleAgents?: boolean;
  requestChatCompletion: ChatCompletionRequester;
};

export type RunArenaRoundHandlers = {
  onAgentStatus?: (agentId: string, status: Agent["status"]) => void;
  onMessageAdded?: (message: Message) => void;
  onMessageUpdated?: (messageId: string, content: string) => void;
  onMessageRemoved?: (messageId: string) => void;
  onAgentSpoke?: (message: Message) => void;
};

export type RunArenaRoundResult = {
  messages: Message[];
  responded: number;
  error: string | null;
};

export async function readOpenAIChatCompletionStream(
  response: Response,
  onChunk: (chunk: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.replace("data:", "").trim();
      if (payload === "[DONE]") {
        return;
      }
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          onChunk(delta);
        }
      } catch {
        continue;
      }
    }
  }
}

export async function runArenaRound(
  params: RunArenaRoundParams,
  handlers: RunArenaRoundHandlers = {},
): Promise<RunArenaRoundResult> {
  const now = params.now ?? Date.now;
  const random = params.random ?? Math.random;
  let responded = 0;
  let error: string | null = null;
  let currentMessages = [...params.messages];

  for (const agent of params.agents) {
    agent.syncContext(currentMessages);
  }

  const speakerPicker = createSpeakerPicker({
    agents: params.agents,
    shuffle: params.shuffleAgents !== false,
    random,
  });

  const pushMessage = (message: Message) => {
    currentMessages = [...currentMessages, message];
    handlers.onMessageAdded?.(message);
    for (const agent of params.agents) {
      agent.observeMessageAdded(message);
    }
  };

  const updateMessageContent = (id: string, content: string) => {
    currentMessages = currentMessages.map((message) =>
      message.id === id ? { ...message, content } : message,
    );
    handlers.onMessageUpdated?.(id, content);
  };

  const removeMessage = (id: string) => {
    currentMessages = currentMessages.filter((message) => message.id !== id);
    handlers.onMessageRemoved?.(id);
    for (const agent of params.agents) {
      agent.observeMessageRemoved(id);
    }
  };

  const maxResponses = Math.max(0, params.maxAgents);
  const maxAttempts = Math.max(maxResponses * Math.max(3, params.agents.length), maxResponses);
  let attempts = 0;

  while (responded < maxResponses && attempts < maxAttempts) {
    attempts += 1;
    const lastSpeakerId =
      [...currentMessages]
        .reverse()
        .find((message) => message.role === "agent" && message.agentId != null)?.agentId ?? null;
    const agent = speakerPicker.pickNext(lastSpeakerId);

    agent.status = "thinking";
    handlers.onAgentStatus?.(agent.id, "thinking");
    const payload = agent.buildChatCompletionRequest({
      model: params.model,
      temperature: params.temperature,
      streaming: params.streaming,
    });

    try {
      const response = await params.requestChatCompletion(payload);

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}).`);
      }

      let content = "";
      let placeholderId: string | null = null;

      if (params.streaming) {
        placeholderId = `${agent.id}-${now()}`;
        agent.status = "speaking";
        handlers.onAgentStatus?.(agent.id, "speaking");
        pushMessage({
          id: placeholderId,
          agentId: agent.id,
          role: "agent",
          content: "",
          time: formatTimeStamp(),
        });

        await readOpenAIChatCompletionStream(response, (chunk) => {
          content += chunk;
          updateMessageContent(placeholderId as string, content);
          agent.observeMessageUpdated(placeholderId as string, content);
        });
      } else {
        const data = await response.json();
        content = data?.choices?.[0]?.message?.content ?? "";
      }

      const parsed = agent.parseResponse(content);
      if (parsed.shouldRespond && parsed.content.trim()) {
        responded += 1;
        const finalContent = parsed.content.trim();
        if (placeholderId) {
          updateMessageContent(placeholderId, finalContent);
          for (const item of params.agents) {
            item.observeMessageUpdated(placeholderId, finalContent);
          }
          const updatedMessage = currentMessages.find((m) => m.id === placeholderId);
          if (updatedMessage) {
            handlers.onAgentSpoke?.(updatedMessage);
          }
        } else {
          agent.status = "speaking";
          handlers.onAgentStatus?.(agent.id, "speaking");
          const message: Message = {
            id: `${agent.id}-${now()}`,
            agentId: agent.id,
            role: "agent",
            content: finalContent,
            time: formatTimeStamp(),
          };
          pushMessage(message);
          handlers.onAgentSpoke?.(message);
        }
      } else if (placeholderId) {
        removeMessage(placeholderId);
      }

      agent.status = "idle";
      handlers.onAgentStatus?.(agent.id, "idle");
    } catch (requestError) {
      agent.status = "idle";
      handlers.onAgentStatus?.(agent.id, "idle");
      error =
        requestError instanceof Error ? requestError.message : "Request failed.";
      break;
    }
  }

  return { messages: currentMessages, responded, error };
}

function createSpeakerPicker(options: {
  agents: Agent[];
  shuffle: boolean;
  random: () => number;
}) {
  const order = [...options.agents];
  let cursor = 0;

  const shuffleInPlace = () => {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(options.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  };

  if (options.shuffle) {
    shuffleInPlace();
  }

  const pickNext = (avoidAgentId: string | null) => {
    if (order.length === 0) {
      throw new Error("No agents in roster.");
    }

    for (let tries = 0; tries < order.length; tries += 1) {
      if (cursor >= order.length) {
        cursor = 0;
        if (options.shuffle) {
          shuffleInPlace();
        }
      }
      const candidate = order[cursor] as Agent;
      cursor += 1;
      if (order.length === 1 || !avoidAgentId || candidate.id !== avoidAgentId) {
        return candidate;
      }
    }

    return order[0] as Agent;
  };

  return { pickNext };
}

export function createOpenAICompatibleRequester(options: {
  apiKey: string;
  baseUrl: string;
  fetchFn?: typeof fetch;
}): ChatCompletionRequester {
  const fetchFn = options.fetchFn ?? fetch;
  const endpoint = `${options.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return async (payload) =>
    fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(payload),
    });
}

export function createLocalProxyRequester(options: {
  providerKey: string;
  fetchFn?: typeof fetch;
  endpoint?: string;
}): ChatCompletionRequester {
  const fetchFn = options.fetchFn ?? fetch;
  const endpoint = options.endpoint ?? "/api/chat";

  return async (payload) =>
    fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ providerKey: options.providerKey, payload }),
    });
}
