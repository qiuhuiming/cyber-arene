# Multi-Agent Cyber Arena Plan

## Vision
Build a front-end only "cyber arena" where a user throws in a proposition and a set
of extreme personas debate it. Each persona reads the full chat log, decides whether
to respond, and if so, posts a message into the shared room. The experience should
feel fast, theatrical, and opinionated.

## Constraints
- Next.js + Bun
- No backend (direct LLM API calls from the browser)
- Support OpenAI- and DeepSeek-compatible APIs
- User provides API key in the UI (BYOK) to avoid shipping secrets

## Goals
- Simple single-room debate loop with multiple agents
- Clear persona definitions and consistent voices
- A prompt-engineering layer that nudges agents to either respond or stay silent
- Streaming output in the chat timeline for live drama
- Ship with a hardcoded initial persona set, while keeping it configurable in UI

## Non-Goals (v1)
- Multi-user rooms or persistence
- Server-side storage or analytics
- Advanced moderation or safety policies

## Product Flow
1. User enters a proposition and starts a session.
2. Predefined agents load with distinct personas.
3. The app runs a round: each agent reads the chat log and decides if it should reply.
4. Replies are appended to the chat; another round can be triggered automatically or
   manually.

## Architecture (Front-End Only)
### Pages / Routes
- `/` Arena page (main chat + controls)
- `/settings` API key + model selection + advanced knobs

### Core Components
- `ArenaShell`: layout and top-level state
- `ChatTimeline`: renders messages, streaming updates
- `AgentRoster`: shows agent list and status
- `InputBar`: proposition input + round controls
- `SettingsPanel`: API key, model, base URL, temperature

### State Model
- `messages`: array of `{ id, agentId, role, content, ts }`
- `agents`: array of `{ id, name, persona, status }`
- `session`: proposition, round count, model config

## LLM Integration (Client-Side)
### Model Endpoints
- OpenAI: `https://api.openai.com/v1/chat/completions`
- DeepSeek: OpenAI-compatible base URL (user-configurable)

### Request Pattern
For each agent in a round:
- Build a system prompt with persona + rules
- Provide the full chat history
- Ask for structured JSON output:
  - `should_respond`: boolean
  - `content`: string (empty if silent)

### JSON Output Contract
```
{
  "should_respond": true,
  "content": "..."
}
```
If JSON parsing fails, fall back to raw text and display it.

### Streaming
Use `fetch` with `ReadableStream` to display partial tokens. For JSON responses,
buffer until valid JSON is complete.

## Prompt Engineering Strategy
### Global Instructions
- Stay in persona.
- React to recent messages and the proposition.
- If you have nothing novel to add, stay silent.

### Persona Packs (initial set)
Hardcode these five for v1, but build config so they can be replaced in UI:
- Socrates (Socratic questioner)
- Nietzsche (existential critic)
- Musk (techno-optimist founder)
- Hitler (extremist dictator persona)
- Marx (historical materialist critic)

## UX Notes
- Debates feel like a fast feed of hot takes.
- Agent "thinking" indicators during requests.
- Controls: Start, Next Round, Stop, Clear, Auto-Round toggle.

## Risks and Mitigations
- Exposed API keys: mitigate with BYOK and local-only storage.
- CORS issues: allow custom base URL and document limitations.
- Cost spikes: display token usage estimates and allow per-round limits.

## Milestones
1. Scaffold Next.js + Bun app and base layout
2. Implement chat UI and agent roster
3. Add settings for API key and model configuration
4. Implement LLM request loop with JSON gating
5. Add streaming output and round controls
6. Polish UI and ship MVP
7. Git commit after each milestone is completed
