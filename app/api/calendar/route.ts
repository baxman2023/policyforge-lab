import { channelIdFromRequest, getUserChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const channel = await getUserChannel(user.id, workspace.id, channelIdFromRequest(request));
    const slots = await prisma.publishingSlot.findMany({
      where: { workspaceId: workspace.id, channelId: channel.id },
      include: {
        storyProject: {
          include: {
            storyIdea: true,
            drafts: { orderBy: { createdAt: "desc" }, take: 50 },
            publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
          }
        }
      },
      orderBy: [{ scheduledDate: "asc" }, { createdAt: "asc" }],
      take: 240
    });

    return Response.json({ slots });
  } catch (error) {
    return jsonError(error);
  }
}
