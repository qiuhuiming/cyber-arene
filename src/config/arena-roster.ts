import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type RosterKey = string;

export type RosterAgent = {
  id: string;
  name: string;
  persona: string;
  accent: string;
};

export type ArenaRoster = {
  key: RosterKey;
  name: string;
  agents: RosterAgent[];
};

export type ArenaRosterConfig = {
  defaultRoster?: RosterKey;
  rosters: Record<RosterKey, Omit<ArenaRoster, "key">>;
};

export type RosterSummary = {
  key: RosterKey;
  name: string;
  agentCount: number;
};

function resolveRosterPath() {
  const configured = process.env.ARENA_ROSTER_CONFIG?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "arena-roster.yaml");
}

function normalizeAgent(value: unknown, index: number): RosterAgent {
  if (!value || typeof value !== "object") {
    throw new Error(`Agent at index ${index} must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const persona = typeof record.persona === "string" ? record.persona.trim() : "";
  const accent =
    typeof record.accent === "string" && record.accent.trim() ? record.accent.trim() : "#9aa2ff";

  if (!id) {
    throw new Error(`Agent at index ${index} is missing id.`);
  }
  if (!name) {
    throw new Error(`Agent '${id}' is missing name.`);
  }
  if (!persona) {
    throw new Error(`Agent '${id}' is missing persona.`);
  }
  return { id, name, persona, accent };
}

function normalizeRoster(key: string, value: unknown): Omit<ArenaRoster, "key"> {
  if (!value || typeof value !== "object") {
    throw new Error(`Roster '${key}' must be an object.`);
  }
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : key;
  const agentsRaw = record.agents;
  if (!Array.isArray(agentsRaw)) {
    throw new Error(`Roster '${key}' is missing agents array.`);
  }
  const agents = agentsRaw.map((agent, index) => normalizeAgent(agent, index));
  if (agents.length === 0) {
    throw new Error(`Roster '${key}' must have at least one agent.`);
  }

  const uniqueIds = new Set<string>();
  for (const agent of agents) {
    if (uniqueIds.has(agent.id)) {
      throw new Error(`Roster '${key}' has duplicate agent id '${agent.id}'.`);
    }
    uniqueIds.add(agent.id);
  }

  return { name, agents };
}

export function loadArenaRosterConfig(): ArenaRosterConfig {
  const rosterPath = resolveRosterPath();
  if (!fs.existsSync(rosterPath)) {
    throw new Error(
      `Missing arena roster config: ${rosterPath}. Create it from arena-roster.example.yaml`,
    );
  }

  const raw = fs.readFileSync(rosterPath, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: root must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  const rostersRaw = record.rosters;
  if (!rostersRaw || typeof rostersRaw !== "object") {
    throw new Error("Invalid YAML: rosters must be an object map.");
  }

  const rosters: ArenaRosterConfig["rosters"] = {};
  for (const [key, value] of Object.entries(rostersRaw as Record<string, unknown>)) {
    if (!key.trim()) {
      continue;
    }
    rosters[key] = normalizeRoster(key, value);
  }

  if (Object.keys(rosters).length === 0) {
    throw new Error("Invalid YAML: rosters must not be empty.");
  }

  const defaultRoster =
    typeof record.defaultRoster === "string" && record.defaultRoster.trim()
      ? record.defaultRoster.trim()
      : undefined;

  return { defaultRoster, rosters };
}

export function pickDefaultRosterKey(config: ArenaRosterConfig): string {
  if (config.defaultRoster && config.rosters[config.defaultRoster]) {
    return config.defaultRoster;
  }
  return Object.keys(config.rosters)[0] as string;
}

export function getRoster(config: ArenaRosterConfig, key: string): ArenaRoster {
  const roster = config.rosters[key];
  if (!roster) {
    throw new Error(`Unknown roster '${key}'.`);
  }
  return { key, ...roster };
}

export function listRosterSummaries(config: ArenaRosterConfig): RosterSummary[] {
  return Object.entries(config.rosters).map(([key, roster]) => ({
    key,
    name: roster.name,
    agentCount: roster.agents.length,
  }));
}
