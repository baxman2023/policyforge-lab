import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = await request.json().catch(() => ({})) as { channelId?: string };
    const deleted = await prisma.youtubeConnection.deleteMany({
      where: {
        userId: user.id,
        workspaceId: workspace.id,
        ...(input.channelId ? { channelId: input.channelId } : {})
      }
    });
    return Response.json({ deleted: deleted.count });
  } catch (error) {
    return jsonError(error, 400);
  }
}
