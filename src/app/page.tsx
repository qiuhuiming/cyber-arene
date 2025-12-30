"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createLocalProxyRequester,
  formatTimeStamp,
  runArenaRound,
  type Agent,
  type Message,
} from "@/chat/chat-core";

type ProviderSummary = {
  key: string;
  name: string;
  models: string[];
};

type RosterAgent = {
  id: string;
  name: string;
  persona: string;
  accent: string;
};

type Roster = {
  key: string;
  name: string;
  agents: RosterAgent[];
};

type RosterSummary = {
  key: string;
  name: string;
  agentCount: number;
};

const defaultProposition = "Why is humanity not extinct yet?";

const statusLabels: Record<Agent["status"], string> = {
  idle: "Idle",
  thinking: "Thinking",
  speaking: "Speaking",
};

export default function Home() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [providerKey, setProviderKey] = useState("");
  const [model, setModel] = useState("");
  const [rosters, setRosters] = useState<RosterSummary[]>([]);
  const [rosterKey, setRosterKey] = useState("");
  const [roster, setRoster] = useState<Roster | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [maxAgents, setMaxAgents] = useState(5);
  const [agentList, setAgentList] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m0",
      agentId: null,
      role: "system",
      content: `Proposition: ${defaultProposition}`,
      time: "00:00",
    },
  ]);
  const [propositionInput, setPropositionInput] = useState(
    defaultProposition,
  );
  const [round, setRound] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [autoRound, setAutoRound] = useState(false);
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/providers").then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Failed to load providers.");
        }
        return data as {
          defaultProvider: string;
          providers: ProviderSummary[];
        };
      }),
      fetch("/api/rosters").then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Failed to load rosters.");
        }
        return data as { defaultRoster: string; rosters: RosterSummary[] };
      }),
    ])
      .then(([providersData, rostersData]) => {
        if (cancelled) {
          return;
        }
        setProviders(providersData.providers);
        const initialProvider =
          providersData.providers.find((p) => p.key === providersData.defaultProvider)?.key ??
          providersData.providers[0]?.key ??
          "";
        setProviderKey(initialProvider);
        const initialModels =
          providersData.providers.find((p) => p.key === initialProvider)?.models ?? [];
        setModel(initialModels[0] ?? "");

        setRosters(rostersData.rosters);
        const initialRoster =
          rostersData.rosters.find((r) => r.key === rostersData.defaultRoster)?.key ??
          rostersData.rosters[0]?.key ??
          "";
        setRosterKey(initialRoster);
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Bootstrap failed.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!rosterKey.trim()) {
      return;
    }

    fetch(`/api/roster?roster=${encodeURIComponent(rosterKey)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error ?? "Failed to load roster.");
        }
        return data as { roster: Roster };
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        setRoster(data.roster);
        setAgentList(
          data.roster.agents.map((agent) => ({
            ...agent,
            status: "idle",
          })),
        );
        setRound(0);
        setMessages((prev) => {
          const existingProposition =
            prev.find((message) => message.role === "system")?.content ??
            `Proposition: ${defaultProposition}`;
          return [
            {
              id: `m-${Date.now()}`,
              agentId: null,
              role: "system",
              content: existingProposition,
              time: formatTimeStamp(),
            },
          ];
        });
      })
      .catch((loadError) => {
        if (cancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Failed to load roster.");
      });

    return () => {
      cancelled = true;
    };
  }, [rosterKey]);

  const updateAgentStatus = (id: string, status: Agent["status"]) => {
    setAgentList((prev) =>
      prev.map((agent) => (agent.id === id ? { ...agent, status } : agent)),
    );
  };

  const runRound = useCallback(async () => {
    if (agentList.length === 0) {
      setError("Missing roster.");
      return;
    }
    if (!providerKey.trim()) {
      setError("Missing provider.");
      return;
    }
    if (!model.trim()) {
      setError("Missing model.");
      return;
    }
    if (isRunning) {
      return;
    }
    setError(null);
    setIsRunning(true);

    const result = await runArenaRound(
      {
        model,
        temperature,
        maxAgents,
        streaming,
        agentList,
        messages,
        requestChatCompletion: createLocalProxyRequester({ providerKey }),
      },
      {
        onAgentStatus: updateAgentStatus,
        onMessageAdded: (message) => {
          setMessages((prev) => [...prev, message]);
        },
        onMessageUpdated: (id, content) => {
          setMessages((prev) =>
            prev.map((message) => (message.id === id ? { ...message, content } : message)),
          );
        },
        onMessageRemoved: (id) => {
          setMessages((prev) => prev.filter((message) => message.id !== id));
        },
      },
    );

    if (result.error) {
      setError(result.error);
    } else {
      setRound((prev) => prev + 1);
    }
    setMessages(result.messages);
    setIsRunning(false);
  }, [
    agentList,
    isRunning,
    maxAgents,
    messages,
    model,
    providerKey,
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
                  {roster ? roster.name : "Loading..."} · {agentList.length} Agents
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
                  Local YAML
                </span>
              </div>
              <div className="flex flex-col gap-4 text-sm text-[color:var(--muted)]">
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Roster
                  </span>
                  <select
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    value={rosterKey}
                    onChange={(event) => setRosterKey(event.target.value)}
                    disabled={rosters.length === 0}
                  >
                    {rosters.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.name} ({item.key}) · {item.agentCount}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Provider
                  </span>
                  <select
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    value={providerKey}
                    onChange={(event) => {
                      const nextProvider = event.target.value;
                      setProviderKey(nextProvider);
                      const nextModels =
                        providers.find((p) => p.key === nextProvider)?.models ?? [];
                      setModel(nextModels[0] ?? "");
                    }}
                    disabled={providers.length === 0}
                  >
                    {providers.map((provider) => (
                      <option key={provider.key} value={provider.key}>
                        {provider.name} ({provider.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-xs uppercase tracking-[0.3em] text-white/70">
                    Model
                  </span>
                  <select
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={!providerKey || providers.length === 0}
                  >
                    {(providers.find((p) => p.key === providerKey)?.models ?? []).map(
                      (option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ),
                    )}
                  </select>
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
                    Max Replies Per Run
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
