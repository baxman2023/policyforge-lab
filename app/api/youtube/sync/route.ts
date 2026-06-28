import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { syncYoutubeConnection } from "@/lib/youtube";

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = await request.json().catch(() => ({})) as { channelId?: string };
    const connection = await prisma.youtubeConnection.findFirst({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        ...(input.channelId ? { channelId: input.channelId } : {})
      },
      orderBy: { updatedAt: "desc" }
    });
    if (!connection) throw new Error("Connect YouTube before syncing analytics.");
    const result = await syncYoutubeConnection(connection.id);
    return Response.json(result);
  } catch (error) {
    return jsonError(error, 400);
  }
}
