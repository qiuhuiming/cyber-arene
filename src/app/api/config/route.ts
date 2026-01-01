import {
  getDefaultProposition,
  listProviderSummaries,
  listRosterSummaries,
  loadArenaConfig,
  pickDefaultProviderKey,
  pickDefaultRosterKey,
} from "@/config/arena-config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = loadArenaConfig();
    return Response.json({
      ui: {
        defaultProposition: getDefaultProposition(config),
      },
      prompts: config.prompts,
      defaultProvider: pickDefaultProviderKey(config),
      providers: listProviderSummaries(config),
      defaultRoster: pickDefaultRosterKey(config),
      rosters: listRosterSummaries(config),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load config.",
      },
      { status: 500 },
    );
  }
}

