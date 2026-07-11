import { channelIdFromRequest, getUserChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { ensureEditorialCalendar } from "@/lib/editorial-calendar";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const channel = await getUserChannel(user.id, workspace.id, channelIdFromRequest(request));
    await ensureEditorialCalendar({ userId: user.id, workspaceId: workspace.id, channelId: channel.id });
    const [slots, shorts, opportunities] = await Promise.all([prisma.publishingSlot.findMany({
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
    }), prisma.shortAsset.findMany({ where: { workspaceId: workspace.id, channelId: channel.id }, orderBy: [{ scheduledAt: "asc" }, { shortIndex: "asc" }], take: 300 }), prisma.editorialOpportunity.findMany({ where: { workspaceId: workspace.id, channelId: channel.id }, orderBy: { opportunityDate: "asc" }, take: 100 })]);

    return Response.json({ slots, shorts, opportunities });
  } catch (error) {
    return jsonError(error);
  }
}
