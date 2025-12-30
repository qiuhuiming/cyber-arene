import {
  listRosterSummaries,
  loadArenaRosterConfig,
  pickDefaultRosterKey,
} from "@/config/arena-roster";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = loadArenaRosterConfig();
    return Response.json({
      defaultRoster: pickDefaultRosterKey(config),
      rosters: listRosterSummaries(config),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load rosters." },
      { status: 500 },
    );
  }
}
