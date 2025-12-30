"use client";

import { useCallback, useEffect, useState } from "react";

type Agent = {
  id: string;
  name: string;
  persona: string;
  status: "idle" | "thinking" | "speaking";
  accent: string;
};

type Message = {
  id: string;
  agentId: string | null;
  role: "system" | "agent";
  content: string;
  time: string;
};

const defaultAgents: Agent[] = [
  {
    id: "socrates",
    name: "Socrates",
    persona: "Relentless questioner. Pulls hidden assumptions into daylight.",
    status: "speaking",
    accent: "#8bf3ff",
  },
  {
    id: "nietzsche",
    name: "Nietzsche",
    persona: "Existential critic. Attacks herd morality with fire and irony.",
    status: "thinking",
    accent: "#ff7b9c",
  },
  {
    id: "musk",
    name: "Musk",
    persona: "Techno-optimist founder. Obsessive about scaling reality.",
    status: "idle",
    accent: "#ffb347",
  },
  {
    id: "hitler",
    name: "Hitler",
    persona: "Authoritarian demagogue. Cold, absolutist, and combative.",
    status: "idle",
    accent: "#ff5c5c",
  },
  {
    id: "marx",
    name: "Marx",
    persona: "Historical materialist. Frames everything as class conflict.",
    status: "speaking",
    accent: "#a58bff",
  },
];

const initialMessages: Message[] = [
  {
    id: "m0",
    agentId: null,
    role: "system",
    content: "Proposition: Why is humanity not extinct yet?",
    time: "00:00",
  },
  {
    id: "m1",
    agentId: "socrates",
    role: "agent",
    content:
      "Define extinction. Do you mean biological collapse, moral decay, or the end of meaning?",
    time: "00:06",
  },
  {
    id: "m2",
    agentId: "marx",
    role: "agent",
    content:
      "Because the material base still reproduces itself. Crisis is real, but capital is a survivor.",
    time: "00:12",
  },
];

const statusLabels: Record<Agent["status"], string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking",
};

const systemPromptBase = [
  "You are an extreme persona in a multi-agent debate arena.",
  "Stay in character at all times.",
  "You see the full chat log and must decide if you should respond.",
  "If you add nothing new, stay silent.",
  "Return ONLY valid JSON with keys: should_respond (boolean), content (string).",
  "If should_respond is false, content must be an empty string.",
].join(" ");

function buildAgentPrompt(agent: Agent) {
  return [
    systemPromptBase,
    `Persona: ${agent.name}. ${agent.persona}`,
  ].join(" ");
}

function formatTimeStamp() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function readStream(
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
        if (delta) {
          onChunk(delta);
        }
      } catch {
        continue;
      }
    }
  }
}

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [maxAgents, setMaxAgents] = useState(5);
  const [agentList, setAgentList] = useState(defaultAgents);
  const [messages, setMessages] = useState(initialMessages);
  const [propositionInput, setPropositionInput] = useState(
    "Why is humanity not extinct yet?",
  );
  const [round, setRound] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [autoRound, setAutoRound] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateAgentStatus = (id: string, status: Agent["status"]) => {
    setAgentList((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, status } : agent)),
    );
  };

  const runRound = useCallback(async () => {
    if (!apiKey.trim()) {
      setError("Missing API key.");
      return;
    }
    if (isRunning) {
      return;
    }
    setError(null);
    setIsRunning(true);

    const endpoint = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    let responded = 0;
    let didError = false;
    let currentMessages = [...messages];

    const pushMessage = (message: Message) => {
      currentMessages = [...currentMessages, message];
      setMessages(currentMessages);
    };

    const updateMessageContent = (id: string, content: string) => {
      currentMessages = currentMessages.map((message) =>
        message.id === id ? { ...message, content } : message,
      );
      setMessages(currentMessages);
    };

    const removeMessage = (id: string) => {
      currentMessages = currentMessages.filter((message) => message.id !== id);
      setMessages(currentMessages);
    };

    for (const agent of agentList) {
      if (responded >= maxAgents) {
        updateAgentStatus(agent.id, "idle");
        continue;
      }

      updateAgentStatus(agent.id, "thinking");

      const chatLog = currentMessages
        .map((message) => {
          const name =
            message.agentId == null
              ? "System"
              : agentList.find((item) => item.id === message.agentId)?.name ??
                "Agent";
          return `${name}: ${message.content}`;
        })
        .join("\n");

      const payload = {
        model,
        temperature,
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
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ ...payload, stream: streaming }),
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status}).`);
        }

        let content = "";
        let placeholderId: string | null = null;

        if (streaming) {
          placeholderId = `${agent.id}-${Date.now()}`;
          updateAgentStatus(agent.id, "speaking");
          pushMessage({
            id: placeholderId,
            agentId: agent.id,
            role: "agent",
            content: "",
            time: formatTimeStamp(),
          });

          await readStream(response, (chunk) => {
            content += chunk;
            updateMessageContent(placeholderId as string, content);
          });
        } else {
          const data = await response.json();
          content = data?.choices?.[0]?.message?.content ?? "";
        }

        const cleaned = content
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        let parsed: { should_respond: boolean; content: string } | null = null;
        try {
          parsed = JSON.parse(cleaned);
        } catch (parseError) {
          parsed = {
            should_respond: true,
            content: content.trim(),
          };
        }

        if (parsed?.should_respond && parsed.content.trim()) {
          responded += 1;
          if (placeholderId) {
            updateMessageContent(placeholderId, parsed.content.trim());
          } else {
            updateAgentStatus(agent.id, "speaking");
            pushMessage({
              id: `${agent.id}-${Date.now()}`,
              agentId: agent.id,
              role: "agent",
              content: parsed.content.trim(),
              time: formatTimeStamp(),
            });
          }
        } else if (placeholderId) {
          removeMessage(placeholderId);
        }
        updateAgentStatus(agent.id, "idle");
      } catch (requestError) {
        updateAgentStatus(agent.id, "idle");
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Request failed.",
        );
        didError = true;
        break;
      }
    }

    if (!didError) {
      setRound((prev) => prev + 1);
    }
    setIsRunning(false);
  }, [
    agentList,
    apiKey,
    baseUrl,
    isRunning,
    maxAgents,
    messages,
    model,
    streaming,
    temperature,
  ]);

  const resetProposition = () => {
    setMessages([
      {
        id: `m-${Date.now()}`,
        agentId: null,
        role: "system",
        content: `Proposition: ${propositionInput.trim() || "Untitled"}`,
        time: formatTimeStamp(),
      },
    ]);
    setRound(0);
    setError(null);
  };

  useEffect(() => {
    if (!autoRound || isRunning) {
      return;
    }
    const timer = window.setTimeout(() => {
      runRound();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [autoRound, isRunning, runRound]);

  return (
    <div className="arena-bg min-h-screen px-6 py-10 text-[15px] sm:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-3">
            <span className="text-display text-xs uppercase tracking-[0.5em] text-[color:var(--muted)]">
              Multi-Agent Arena
            </span>
            <h1 className="text-display text-5xl font-semibold text-white sm:text-6xl">
              Cyber Arene
            </h1>
            <p className="max-w-xl text-base text-[color:var(--muted)]">
              Throw in a proposition. Release five extreme minds. Watch the room
              decide whether to burn it down or build the future.
            </p>
          </div>
          <div className="arena-card glow-ring flex flex-wrap items-center gap-3 rounded-full px-6 py-3 text-xs uppercase tracking-[0.35em] text-[color:var(--muted)]">
            <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--accent)] shadow-[0_0_10px_var(--accent)]" />
            Round {round} / {isRunning ? "Live" : "Idle"}
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="arena-card flex flex-col gap-6 rounded-[32px] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-display text-2xl text-white">Arena Feed</h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white disabled:opacity-40"
                    onClick={runRound}
                    disabled={isRunning}
                  >
                    Start
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white disabled:opacity-40"
                    onClick={runRound}
                    disabled={isRunning}
                  >
                    Next Round
                  </button>
                  <button
                    className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white"
                    onClick={() => setAutoRound((prev) => !prev)}
                  >
                    Auto {autoRound ? "On" : "Off"}
                  </button>
                </div>
              </div>

            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const agent = agentList.find((item) => item.id === message.agentId);
                return (
                  <div
                    key={message.id}
                    className={`arena-card-strong flex flex-col gap-2 rounded-2xl border-l-4 px-5 py-4 ${
                      message.role === "system" ? "border-l-white/30" : ""
                    }`}
                    style={{
                      borderLeftColor: agent?.accent ?? "rgba(255,255,255,0.2)",
                    }}
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                      <span>{agent?.name ?? "System"}</span>
                      <span>{message.time}</span>
                    </div>
                    <p className="text-sm leading-7 text-white">{message.content}</p>
                  </div>
                );
              })}
            </div>

            <div className="arena-card-strong flex flex-col gap-4 rounded-2xl p-4">
              <label className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                Proposition Input
              </label>
              <textarea
                className="min-h-[120px] w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                placeholder="Drop a question that forces the arena to react..."
                value={propositionInput}
                onChange={(event) => setPropositionInput(event.target.value)}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full bg-[color:var(--accent)] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[color:var(--accent-strong)]"
                  onClick={resetProposition}
                >
                  Launch Debate
                </button>
                <button
                  className="rounded-full border border-white/10 px-6 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white"
                  onClick={() => setMessages([])}
                >
                  Clear
                </button>
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <section className="arena-card glow-ring flex flex-col gap-5 rounded-[28px] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-display text-2xl text-white">Roster</h2>
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                  5 Agents
                </span>
              </div>
              <div className="flex flex-col gap-4">
                {agentList.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-start gap-4 rounded-2xl border border-white/10 bg-black/30 px-4 py-4"
                  >
                    <div
                      className="mt-1 h-10 w-10 rounded-full border border-white/20"
                      style={{
                        background: `radial-gradient(circle at 30% 30%, ${agent.accent}, transparent 65%)`,
                        boxShadow: `0 0 16px ${agent.accent}`,
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">
                          {agent.name}
                        </h3>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--muted)]">
                          {statusLabels[agent.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-[color:var(--muted)]">
                        {agent.persona}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="arena-card flex flex-col gap-5 rounded-[28px] p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-display text-xl text-white">Settings</h3>
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--muted)]">
                  Client-side
                </span>
              </div>
              <div className="flex flex-col gap-4 text-sm text-[color:var(--muted)]">
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    API Key
                  </span>
                  <input
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    placeholder="sk-..."
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Base URL
                  </span>
                  <input
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    placeholder="https://api.openai.com/v1"
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Model
                  </span>
                  <input
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    placeholder="gpt-4o-mini"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Temperature
                  </span>
                  <input
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    type="number"
                    min={0}
                    max={1}
                    step={0.1}
                    value={temperature}
                    onChange={(event) => setTemperature(Number(event.target.value))}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Max Agents Per Round
                  </span>
                  <input
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    type="number"
                    min={1}
                    max={10}
                    value={maxAgents}
                    onChange={(event) => setMaxAgents(Number(event.target.value))}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs uppercase tracking-[0.3em] text-white/70">
                  <span>Streaming</span>
                  <button
                    className="rounded-full border border-white/10 px-4 py-1 text-[10px] text-white/80 transition hover:border-white/40 hover:text-white"
                    onClick={() => setStreaming((prev) => !prev)}
                  >
                    {streaming ? "On" : "Off"}
                  </button>
                </label>
                {error ? (
                  <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                    {error}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="arena-card-strong float-slow flex flex-col gap-4 rounded-[28px] p-6">
              <h3 className="text-display text-xl text-white">Signal Panel</h3>
              <div className="flex flex-col gap-3 text-sm text-[color:var(--muted)]">
                <p className="flex items-center justify-between">
                  <span>Room Intensity</span>
                  <span className="text-white">74%</span>
                </p>
                <div className="h-2 rounded-full bg-white/5">
                  <div className="glow-pulse h-full w-[74%] rounded-full bg-[color:var(--accent)]" />
                </div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/70">
                  Auto-round {autoRound ? "enabled" : "disabled"}
                </p>
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
