import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { ensureDefaultChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { slugify } from "@/lib/utils";

const ChannelPatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().optional(),
  archived: z.boolean().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = ChannelPatchSchema.parse(await request.json());

    const channel = await prisma.channel.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });

    if (input.archived === false && channel.archivedAt) {
      const activeDuplicate = await prisma.channel.findFirst({
        where: {
          workspaceId: workspace.id,
          archivedAt: null,
          id: { not: id },
          OR: [
            { name: channel.name },
            { slug: channel.slug.replace(/-\d+$/, "") }
          ]
        }
      });

      if (activeDuplicate) {
        const updated = await prisma.$transaction(async (tx) => {
          await tx.storyIdea.updateMany({ where: { workspaceId: workspace.id, channelId: id }, data: { channelId: activeDuplicate.id } });
          await tx.storyProject.updateMany({ where: { workspaceId: workspace.id, channelId: id }, data: { channelId: activeDuplicate.id } });
          await tx.publishingSlot.updateMany({ where: { workspaceId: workspace.id, channelId: id }, data: { channelId: activeDuplicate.id } });
          await tx.youtubeVideoMetric.updateMany({ where: { workspaceId: workspace.id, channelId: id }, data: { channelId: activeDuplicate.id } });
          await tx.youtubeRecommendation.updateMany({ where: { workspaceId: workspace.id, channelId: id }, data: { channelId: activeDuplicate.id } });

          const duplicateConnection = await tx.youtubeConnection.findUnique({ where: { channelId: id } });
          if (duplicateConnection) {
            const activeConnection = await tx.youtubeConnection.findUnique({ where: { channelId: activeDuplicate.id } });
            if (activeConnection) {
              await tx.youtubeConnection.delete({ where: { id: duplicateConnection.id } });
            } else {
              await tx.youtubeConnection.update({ where: { id: duplicateConnection.id }, data: { channelId: activeDuplicate.id } });
            }
          }

          await tx.channel.delete({ where: { id } });
          return tx.channel.update({
            where: { id: activeDuplicate.id },
            data: {
              ...(input.description !== undefined && !activeDuplicate.description ? { description: input.description.trim() || null } : {})
            }
          });
        });

        await auditLog({
          userId: user.id,
          workspaceId: workspace.id,
          action: "channel.restored_duplicate_merged",
          metadata: { channelId: updated.id, deletedDuplicateChannelId: id, name: updated.name }
        });
        return Response.json({ channel: updated, deletedChannelId: id });
      }
    }

    const updated = await prisma.channel.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name, slug: await uniqueChannelSlug(workspace.id, input.name, id) } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() || null } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {})
      }
    });

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "channel.updated", metadata: { channelId: id, name: updated.name } });
    return Response.json({ channel: updated });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;

    const channel = await prisma.channel.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });

    const [projectCount, ideaCount, slotCount] = await Promise.all([
      prisma.storyProject.count({ where: { workspaceId: workspace.id, channelId: id } }),
      prisma.storyIdea.count({ where: { workspaceId: workspace.id, channelId: id } }),
      prisma.publishingSlot.count({ where: { workspaceId: workspace.id, channelId: id } })
    ]);

    await prisma.$transaction([
      prisma.publishingSlot.deleteMany({ where: { workspaceId: workspace.id, channelId: id } }),
      prisma.storyProject.deleteMany({ where: { workspaceId: workspace.id, channelId: id } }),
      prisma.storyIdea.deleteMany({ where: { workspaceId: workspace.id, channelId: id } }),
      prisma.channel.delete({ where: { id } })
    ]);

    const defaultChannel = await ensureDefaultChannel(user.id, workspace.id);
    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "channel.deleted",
      metadata: { channelId: id, name: channel.name, projectCount, ideaCount, slotCount }
    });

    return Response.json({ deleted: true, id, defaultChannelId: defaultChannel.id, counts: { projectCount, ideaCount, slotCount } });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function uniqueChannelSlug(workspaceId: string, name: string, currentId: string) {
  const base = slugify(name) || "channel";
  let slug = base;
  let index = 2;

  while (true) {
    const existing = await prisma.channel.findFirst({ where: { workspaceId, slug } });
    if (!existing || existing.id === currentId) return slug;
    slug = `${base}-${index}`;
    index += 1;
  }
}
