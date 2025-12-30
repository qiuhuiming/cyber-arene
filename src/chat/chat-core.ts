export type Agent = {
  id: string;
  name: string;
  persona: string;
  status: "idle" | "thinking" | "speaking";
  accent: string;
};

export type Message = {
  id: string;
  agentId: string | null;
  role: "system" | "agent";
  content: string;
  time: string;
};

export type RunArenaRoundParams = {
  model: string;
  temperature: number;
  maxAgents: number;
  streaming: boolean;
  agentList: Agent[];
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

const systemPromptBase = [
  "You are an extreme persona in a multi-agent debate arena.",
  "Stay in character at all times.",
  "You see the full chat log and must decide if you should respond.",
  "If you add nothing new, stay silent.",
  "Return ONLY valid JSON with keys: should_respond (boolean), content (string).",
  "If should_respond is false, content must be an empty string.",
].join(" ");

export function buildAgentPrompt(agent: Agent) {
  return [systemPromptBase, `Persona: ${agent.name}. ${agent.persona}`].join(" ");
}

export function formatTimeStamp(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function stripJsonCodeFence(content: string) {
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

function safeParseAgentResponse(content: string) {
  const cleaned = stripJsonCodeFence(content);
  try {
    const parsed = JSON.parse(cleaned) as { should_respond?: boolean; content?: string };
    return {
      should_respond: Boolean(parsed?.should_respond),
      content: typeof parsed?.content === "string" ? parsed.content : "",
    };
  } catch {
    return { should_respond: true, content: content.trim() };
  }
}

function buildChatLog(messages: Message[], agentList: Agent[]) {
  return messages
    .map((message) => {
      const name =
        message.agentId == null
          ? "System"
          : agentList.find((item) => item.id === message.agentId)?.name ?? "Agent";
      return `${name}: ${message.content}`;
    })
    .join("\n");
}

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

  const speakerPicker = createSpeakerPicker({
    agents: params.agentList,
    shuffle: params.shuffleAgents !== false,
    random,
  });

  const pushMessage = (message: Message) => {
    currentMessages = [...currentMessages, message];
    handlers.onMessageAdded?.(message);
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
  };

  const maxResponses = Math.max(0, params.maxAgents);
  const maxAttempts = Math.max(maxResponses * Math.max(3, params.agentList.length), maxResponses);
  let attempts = 0;

  while (responded < maxResponses && attempts < maxAttempts) {
    attempts += 1;
    const lastSpeakerId =
      [...currentMessages]
        .reverse()
        .find((message) => message.role === "agent" && message.agentId != null)?.agentId ?? null;
    const agent = speakerPicker.pickNext(lastSpeakerId);

    handlers.onAgentStatus?.(agent.id, "thinking");

    const chatLog = buildChatLog(currentMessages, params.agentList);
    const payload: OpenAIChatCompletionRequest = {
      model: params.model,
      temperature: params.temperature,
      stream: params.streaming,
      messages: [
        {
          role: "system",
          content: buildAgentPrompt(agent),
        },
        {
          role: "user",
          content: `Chat log:\n${chatLog}\nRespond as JSON.`,
        },
      ],
    };

    try {
      const response = await params.requestChatCompletion(payload);

      if (!response.ok) {
        throw new Error(`Request failed (${response.status}).`);
      }

      let content = "";
      let placeholderId: string | null = null;

      if (params.streaming) {
        placeholderId = `${agent.id}-${now()}`;
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
        });
      } else {
        const data = await response.json();
        content = data?.choices?.[0]?.message?.content ?? "";
      }

      const parsed = safeParseAgentResponse(content);
      if (parsed.should_respond && parsed.content.trim()) {
        responded += 1;
        const finalContent = parsed.content.trim();
        if (placeholderId) {
          updateMessageContent(placeholderId, finalContent);
          const updatedMessage = currentMessages.find((m) => m.id === placeholderId);
          if (updatedMessage) {
            handlers.onAgentSpoke?.(updatedMessage);
          }
        } else {
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

      handlers.onAgentStatus?.(agent.id, "idle");
    } catch (requestError) {
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
