import { PublishingSlotStatus, StoryIdeaStatus, StoryProjectStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

const SlotStatusSchema = z.object({
  status: z.nativeEnum(PublishingSlotStatus)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = SlotStatusSchema.parse(await request.json());

    const slot = await prisma.$transaction(async (tx) => {
      const existing = await tx.publishingSlot.findFirst({
        where: { id, workspaceId: workspace.id },
        include: { storyProject: true }
      });
      if (!existing) return null;

      await tx.publishingSlot.update({
        where: { id },
        data: { status: input.status }
      });

      const projectSlots = await tx.publishingSlot.findMany({
        where: { storyProjectId: existing.storyProjectId },
        select: { status: true }
      });
      const allPublished = projectSlots.length > 0 && projectSlots.every((item) => item.status === PublishingSlotStatus.PUBLISHED);
      const allProducedOrPublished =
        projectSlots.length > 0 &&
        projectSlots.every((item) => item.status === PublishingSlotStatus.PRODUCED || item.status === PublishingSlotStatus.PUBLISHED);
      const nextProjectStatus = allPublished
        ? StoryProjectStatus.PUBLISHED
        : allProducedOrPublished
          ? StoryProjectStatus.PRODUCED
          : null;
      const nextIdeaStatus = allPublished
        ? StoryIdeaStatus.PUBLISHED
        : allProducedOrPublished
          ? StoryIdeaStatus.PRODUCED
          : null;

      if (nextProjectStatus) {
        await tx.storyProject.update({
          where: { id: existing.storyProjectId },
          data: { status: nextProjectStatus }
        });
        if (existing.storyProject.storyIdeaId && nextIdeaStatus) {
          await tx.storyIdea.update({
            where: { id: existing.storyProject.storyIdeaId },
            data: { status: nextIdeaStatus, usedAt: new Date() }
          });
        }
      }

      return tx.publishingSlot.findFirst({
        where: { id, workspaceId: workspace.id },
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
    });

    if (!slot) return Response.json({ error: "Calendar item not found." }, { status: 404 });

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "publishing_slot.status_changed", metadata: { id, status: input.status } });
    return Response.json({ slot });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const existing = await prisma.publishingSlot.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!existing) return Response.json({ error: "Calendar item not found." }, { status: 404 });

    await prisma.publishingSlot.delete({ where: { id } });
    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "publishing_slot.deleted", metadata: { id, scheduledDate: existing.scheduledDate } });
    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error, 400);
  }
}
