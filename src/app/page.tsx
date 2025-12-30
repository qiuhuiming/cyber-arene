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

const agents: Agent[] = [
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

const messages: Message[] = [
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

export default function Home() {
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
            Round 0 / Idle
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.6fr_0.9fr]">
          <section className="arena-card flex flex-col gap-6 rounded-[32px] p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-display text-2xl text-white">Arena Feed</h2>
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white">
                  Start
                </button>
                <button className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white">
                  Next Round
                </button>
                <button className="rounded-full border border-white/10 px-5 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white">
                  Auto
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {messages.map((message) => {
                const agent = agents.find((item) => item.id === message.agentId);
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
              />
              <div className="flex flex-wrap gap-3">
                <button className="rounded-full bg-[color:var(--accent)] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[color:var(--accent-strong)]">
                  Launch Debate
                </button>
                <button className="rounded-full border border-white/10 px-6 py-2 text-xs uppercase tracking-[0.3em] text-white/80 transition hover:border-white/40 hover:text-white">
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
                {agents.map((agent) => (
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
                  Auto-round disabled
                </p>
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
