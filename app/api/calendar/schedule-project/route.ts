import { PublishingSlotStatus, PublishingSlotType, StoryProjectFormat } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { ensureDefaultChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { dateKey, nextAppendCursor, nextOpenDate, normalizePublishDate } from "@/lib/publishing-calendar";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { shortScheduleDates } from "@/lib/editorial-calendar";

const ScheduleProjectSchema = z.object({
  projectId: z.string().min(1),
  startDate: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ScheduleProjectSchema.parse(await request.json());
    const defaultChannel = await ensureDefaultChannel(user.id, workspace.id);
    const requestedStart = input.startDate ? new Date(input.startDate) : new Date();
    const startDate = normalizePublishDate(Number.isNaN(requestedStart.getTime()) ? new Date() : requestedStart);

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.storyProject.findFirst({
        where: { id: input.projectId, workspaceId: workspace.id },
        include: { publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 } }
      });
      if (!project) return null;
      if (project.format === StoryProjectFormat.EPISODIC_SERIES) {
        throw new Error("Episode series are scheduled through Monthly Auto.");
      }
      const projectChannelId = project.channelId || defaultChannel.id;

      const existingProjectSlot = project.publishingSlots[0];
      if (existingProjectSlot) {
        return { slotId: existingProjectSlot.id, alreadyScheduled: true };
      }

      const existingSlots = await tx.publishingSlot.findMany({
        where: { workspaceId: workspace.id, channelId: projectChannelId, scheduledDate: { gte: startDate } },
        select: { scheduledDate: true },
        orderBy: { scheduledDate: "asc" }
      });
      const usedDates = new Set(existingSlots.map((slot) => dateKey(slot.scheduledDate)));
      const cursor = nextAppendCursor(startDate, existingSlots.map((slot) => slot.scheduledDate));
      const scheduledDate = nextOpenDate(cursor, usedDates, [1, 4]);
      const slot = await tx.publishingSlot.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          channelId: projectChannelId,
          storyProjectId: project.id,
          title: project.title,
          scheduledDate,
          slotType: PublishingSlotType.STANDALONE,
          status: PublishingSlotStatus.SCHEDULED,
          durationMinutes: project.targetLengthMinutes
        }
      });

      return { slotId: slot.id, alreadyScheduled: false };
    });

    if (!result) return Response.json({ error: "Story project not found." }, { status: 404 });

    const slot = await prisma.publishingSlot.findFirst({
      where: { id: result.slotId, workspaceId: workspace.id },
      include: {
        storyProject: {
          include: {
            storyIdea: true,
            drafts: { orderBy: { createdAt: "desc" }, take: 50 },
            publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
          }
        }
      }
    });

    if (!slot) return Response.json({ error: "Calendar item not found." }, { status: 404 });
    const shortDates = shortScheduleDates(slot.scheduledDate);
    const shorts = await prisma.shortAsset.findMany({ where: { storyProjectId: slot.storyProjectId }, orderBy: { shortIndex: "asc" } });
    for (const [index, short] of shorts.slice(0, 9).entries()) {
      let scheduledAt = shortDates[index];
      for (let attempt = 0; attempt < 21; attempt += 1) {
        const dayStart = new Date(scheduledAt); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
        const count = await prisma.shortAsset.count({ where: { workspaceId: workspace.id, channelId: slot.channelId || undefined, id: { not: short.id }, scheduledAt: { gte: dayStart, lt: dayEnd } } });
        if (count < 2) break;
        scheduledAt = new Date(scheduledAt); scheduledAt.setDate(scheduledAt.getDate() + 1);
      }
      await prisma.shortAsset.update({ where: { id: short.id }, data: { scheduledAt, status: "SCHEDULED" } });
    }

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: result.alreadyScheduled ? "publishing_slot.schedule_existing" : "publishing_slot.schedule_project",
      metadata: { projectId: input.projectId, slotId: slot.id, scheduledDate: slot.scheduledDate }
    });

    return Response.json({ slot, alreadyScheduled: result.alreadyScheduled });
  } catch (error) {
    return jsonError(error, 400);
  }
}
