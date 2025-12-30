import {
  getRoster,
  loadArenaRosterConfig,
  pickDefaultRosterKey,
} from "@/config/arena-roster";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rosterKey = url.searchParams.get("roster")?.trim() ?? "";

    const config = loadArenaRosterConfig();
    const key = rosterKey || pickDefaultRosterKey(config);
    const roster = getRoster(config, key);

    return Response.json({
      defaultRoster: pickDefaultRosterKey(config),
      roster,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to load roster." },
      { status: 500 },
    );
  }
}

