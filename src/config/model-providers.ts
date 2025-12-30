import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type ModelProviderKey = string;

export type ModelProvider = {
  key: ModelProviderKey;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
};

export type ModelProvidersConfig = {
  defaultProvider?: ModelProviderKey;
  providers: Record<ModelProviderKey, Omit<ModelProvider, "key">>;
};

export type ProviderSummary = {
  key: ModelProviderKey;
  name: string;
  models: string[];
};

function resolveConfigPath() {
  const configured = process.env.MODEL_PROVIDERS_CONFIG?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "model-providers.yaml");
}

function normalizeProvider(
  key: string,
  value: unknown,
): Omit<ModelProvider, "key"> {
  if (!value || typeof value !== "object") {
    throw new Error(`Provider '${key}' must be an object.`);
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" && record.name.trim() ? record.name : key;
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

export function loadModelProvidersConfig() {
  const configPath = resolveConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing model providers config: ${configPath}. Create it from model-providers.example.yaml`,
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid YAML: root must be an object.");
  }

  const record = parsed as Record<string, unknown>;
  const providersRaw = record.providers;
  if (!providersRaw || typeof providersRaw !== "object") {
    throw new Error("Invalid YAML: providers must be an object map.");
  }

  const providers: ModelProvidersConfig["providers"] = {};
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

  const defaultProvider =
    typeof record.defaultProvider === "string" && record.defaultProvider.trim()
      ? record.defaultProvider.trim()
      : undefined;

  return { defaultProvider, providers } satisfies ModelProvidersConfig;
}

export function listProviderSummaries(config: ModelProvidersConfig): ProviderSummary[] {
  return Object.entries(config.providers).map(([key, provider]) => ({
    key,
    name: provider.name,
    models: provider.models,
  }));
}

export function pickDefaultProviderKey(config: ModelProvidersConfig): string {
  if (config.defaultProvider && config.providers[config.defaultProvider]) {
    return config.defaultProvider;
  }
  return Object.keys(config.providers)[0] as string;
}

export function getProvider(config: ModelProvidersConfig, key: string): ModelProvider {
  const provider = config.providers[key];
  if (!provider) {
    throw new Error(`Unknown provider '${key}'.`);
  }
  return { key, ...provider };
}

