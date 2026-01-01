import {
  listProviderSummaries,
  loadArenaConfig,
  pickDefaultProviderKey,
} from "@/config/arena-config";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = loadArenaConfig();
    return Response.json({
      defaultProvider: pickDefaultProviderKey(config),
      providers: listProviderSummaries(config),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to load providers.",
      },
      { status: 500 },
    );
  }
}
