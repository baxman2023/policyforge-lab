import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { syncYoutubeConnection } from "@/lib/youtube";

export async function GET(request: Request) {
  try {
    assertCronSecret(request);
    const dueConnections = await prisma.youtubeConnection.findMany({
      where: {
        syncEnabled: true,
        OR: [
          { nextSyncAt: null },
          { nextSyncAt: { lte: new Date() } }
        ]
      },
      orderBy: { nextSyncAt: "asc" },
      take: 10
    });

    const results = [];
    for (const connection of dueConnections) {
      try {
        const result = await syncYoutubeConnection(connection.id);
        results.push({ connectionId: connection.id, ok: true, ...result });
      } catch (error) {
        results.push({
          connectionId: connection.id,
          ok: false,
          error: error instanceof Error ? error.message : "YouTube sync failed."
        });
      }
    }

    return Response.json({ checked: dueConnections.length, results });
  } catch (error) {
    return jsonError(error, 401);
  }
}

function assertCronSecret(request: Request) {
  const configured = process.env.YOUTUBE_SYNC_SECRET || process.env.CRON_SECRET;
  if (!configured) throw new Error("YOUTUBE_SYNC_SECRET is not configured.");
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") || url.searchParams.get("secret");
  if (provided !== configured) throw new Error("Invalid cron secret.");
}
