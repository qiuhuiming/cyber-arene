import {
  getRoster,
  loadArenaConfig,
  pickDefaultRosterKey,
} from "@/config/arena-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rosterKey = url.searchParams.get("roster")?.trim() ?? "";

    const config = loadArenaConfig();
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
