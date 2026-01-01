import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { ArenaPrompts } from "@/chat/chat-core";

export type ArenaConfigKey = string;

export type ModelProviderKey = string;

export type ModelProvider = {
  key: ModelProviderKey;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
};

export type ProviderSummary = {
  key: ModelProviderKey;
  name: string;
  models: string[];
};

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

export type RosterSummary = {
  key: RosterKey;
  name: string;
  agentCount: number;
};

export type ArenaUiConfig = {
  defaultProposition?: string;
};

export type ArenaConfig = {
  ui?: ArenaUiConfig;
  prompts: ArenaPrompts;
  defaultProvider?: ModelProviderKey;
  providers: Record<ModelProviderKey, Omit<ModelProvider, "key">>;
  defaultRoster?: RosterKey;
  rosters: Record<RosterKey, Omit<ArenaRoster, "key">>;
};

function resolveArenaConfigPath() {
  const configured = process.env.ARENA_CONFIG?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "arena-config.yaml");
}

function normalizeProvider(
  key: string,
  value: unknown,
): Omit<ModelProvider, "key"> {
  if (!value || typeof value !== "object") {
    throw new Error(`Provider '${key}' must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : key;
  const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl.trim() : "";
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  const models = Array.isArray(record.models)
    ? record.models.filter((m): m is string => typeof m === "string" && m.trim().length > 0)
    : [];

  if (!baseUrl) {
    throw new Error(`Provider '${key}' is missing baseUrl.`);
  }
  if (!apiKey) {
    throw new Error(`Provider '${key}' is missing apiKey.`);
  }
  if (models.length === 0) {
    throw new Error(`Provider '${key}' must have at least one model.`);
  }

  return { name, baseUrl, apiKey, models };
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

function normalizePrompts(value: unknown): ArenaPrompts {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid YAML: prompts must be an object.");
  }
  const record = value as Record<string, unknown>;

  const systemName =
    typeof record.systemName === "string" && record.systemName.trim()
      ? record.systemName.trim()
      : "";
  const unknownAgentName =
    typeof record.unknownAgentName === "string" && record.unknownAgentName.trim()
      ? record.unknownAgentName.trim()
      : "";
  const systemPropositionTemplate =
    typeof record.systemPropositionTemplate === "string" && record.systemPropositionTemplate.trim()
      ? record.systemPropositionTemplate
      : "";
  const agentSystemBase =
    typeof record.agentSystemBase === "string" && record.agentSystemBase.trim()
      ? record.agentSystemBase
      : "";
  const agentPersonaTemplate =
    typeof record.agentPersonaTemplate === "string" && record.agentPersonaTemplate.trim()
      ? record.agentPersonaTemplate
      : "";
  const userChatLogTemplate =
    typeof record.userChatLogTemplate === "string" && record.userChatLogTemplate.trim()
      ? record.userChatLogTemplate
      : "";

  if (!systemName) {
    throw new Error("Invalid YAML: prompts.systemName is required.");
  }
  if (!unknownAgentName) {
    throw new Error("Invalid YAML: prompts.unknownAgentName is required.");
  }
  if (!systemPropositionTemplate) {
    throw new Error("Invalid YAML: prompts.systemPropositionTemplate is required.");
  }
  if (!agentSystemBase) {
    throw new Error("Invalid YAML: prompts.agentSystemBase is required.");
  }
  if (!agentPersonaTemplate) {
    throw new Error("Invalid YAML: prompts.agentPersonaTemplate is required.");
  }
  if (!userChatLogTemplate) {
    throw new Error("Invalid YAML: prompts.userChatLogTemplate is required.");
  }

  return {
    systemName,
    unknownAgentName,
    systemPropositionTemplate,
    agentSystemBase,
    agentPersonaTemplate,
    userChatLogTemplate,
  };
}

export function loadArenaConfig(): ArenaConfig {
  const configPath = resolveArenaConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing arena config: ${configPath}. Create it from arena-config.example.yaml`,
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: root must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  const prompts = normalizePrompts(record.prompts);

  const providersRaw = record.providers;
  if (!providersRaw || typeof providersRaw !== "object") {
    throw new Error("Invalid YAML: providers must be an object map.");
  }

  const providers: ArenaConfig["providers"] = {};
  for (const [key, value] of Object.entries(
    providersRaw as Record<string, unknown>,
  )) {
    if (!key.trim()) {
      continue;
    }
    providers[key] = normalizeProvider(key, value);
  }

  if (Object.keys(providers).length === 0) {
    throw new Error("Invalid YAML: providers must not be empty.");
  }

  const rostersRaw = record.rosters;
  if (!rostersRaw || typeof rostersRaw !== "object") {
    throw new Error("Invalid YAML: rosters must be an object map.");
  }

  const rosters: ArenaConfig["rosters"] = {};
  for (const [key, value] of Object.entries(rostersRaw as Record<string, unknown>)) {
    if (!key.trim()) {
      continue;
    }
    rosters[key] = normalizeRoster(key, value);
  }

  if (Object.keys(rosters).length === 0) {
    throw new Error("Invalid YAML: rosters must not be empty.");
  }

  const defaultProvider =
    typeof record.defaultProvider === "string" && record.defaultProvider.trim()
      ? record.defaultProvider.trim()
      : undefined;

  const defaultRoster =
    typeof record.defaultRoster === "string" && record.defaultRoster.trim()
      ? record.defaultRoster.trim()
      : undefined;

  const uiRaw = record.ui;
  let ui: ArenaUiConfig | undefined;
  if (uiRaw && typeof uiRaw === "object") {
    const record = uiRaw as Record<string, unknown>;
    const proposition =
      typeof record.defaultProposition === "string" ? record.defaultProposition.trim() : "";
    ui = proposition ? { defaultProposition: proposition } : undefined;
  }

  return {
    ui,
    prompts,
    defaultProvider,
    providers,
    defaultRoster,
    rosters,
  };
}

export function pickDefaultProviderKey(config: ArenaConfig): string {
  if (config.defaultProvider && config.providers[config.defaultProvider]) {
    return config.defaultProvider;
  }
  return Object.keys(config.providers)[0] as string;
}

export function getProvider(config: ArenaConfig, key: string): ModelProvider {
  const provider = config.providers[key];
  if (!provider) {
    throw new Error(`Unknown provider '${key}'.`);
  }
  return { key, ...provider };
}

export function listProviderSummaries(config: ArenaConfig): ProviderSummary[] {
  return Object.entries(config.providers).map(([key, provider]) => ({
    key,
    name: provider.name,
    models: provider.models,
  }));
}

export function pickDefaultRosterKey(config: ArenaConfig): string {
  if (config.defaultRoster && config.rosters[config.defaultRoster]) {
    return config.defaultRoster;
  }
  return Object.keys(config.rosters)[0] as string;
}

export function getRoster(config: ArenaConfig, key: string): ArenaRoster {
  const roster = config.rosters[key];
  if (!roster) {
    throw new Error(`Unknown roster '${key}'.`);
  }
  return { key, ...roster };
}

export function listRosterSummaries(config: ArenaConfig): RosterSummary[] {
  return Object.entries(config.rosters).map(([key, roster]) => ({
    key,
    name: roster.name,
    agentCount: roster.agents.length,
  }));
}

export function getDefaultProposition(config: ArenaConfig): string {
  const raw = config.ui?.defaultProposition ?? "";
  return raw.trim();
}
