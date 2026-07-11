import "server-only";
import { FORGE_NICHES, forgeChannelDescription } from "@/lib/forge-niches";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { recommendShaziStyle } from "@/lib/upgrade-domain";

export async function listUserChannels(userId: string, workspaceId: string) {
  const defaultChannel = await ensureDefaultChannel(userId, workspaceId);
  const [channels, archivedChannels] = await Promise.all([
    prisma.channel.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ createdAt: "asc" }, { name: "asc" }]
    }),
    prisma.channel.findMany({
      where: { workspaceId, archivedAt: { not: null } },
      orderBy: [{ archivedAt: "desc" }, { name: "asc" }]
    })
  ]);
  return { channels, archivedChannels, defaultChannel };
}

export async function ensureDefaultChannel(userId: string, workspaceId: string) {
  await ensureForgeChannels(userId, workspaceId);
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, slug: FORGE_NICHES[0].slug, archivedAt: null }
  }) ?? await prisma.channel.findFirst({
    where: { workspaceId, archivedAt: null },
    orderBy: { createdAt: "asc" }
  });
  if (!channel) throw new Error("No active insurance channels are available.");
  await backfillChannelAssets(userId, workspaceId, channel.id);
  return channel;
}

export async function getUserChannel(userId: string, workspaceId: string, channelId?: string | null) {
  const defaultChannel = await ensureDefaultChannel(userId, workspaceId);
  if (!channelId || channelId === defaultChannel.id) return defaultChannel;

  const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId, archivedAt: null } });
  if (!channel) throw new Error("Channel not found.");
  return channel;
}

export async function createUserChannel(userId: string, workspaceId: string, name: string, description?: string, options: { archiveChannelId?: string | null } = {}) {
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("Channel name must be at least 2 characters.");
  const slug = await uniqueChannelSlug(workspaceId, cleanName);

  return prisma.$transaction(async (tx) => {
    if (options.archiveChannelId) {
      await tx.channel.updateMany({
        where: { id: options.archiveChannelId, workspaceId, archivedAt: null },
        data: { archivedAt: new Date() }
      });
    }

    return tx.channel.create({
      data: {
        userId,
        workspaceId,
        name: cleanName,
        slug,
        description: description?.trim() || null,
        shaziStyle: recommendShaziStyle({ name: cleanName, description })
      }
    });
  });
}

export function channelIdFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("channelId") || undefined;
}

async function backfillChannelAssets(userId: string, workspaceId: string, channelId: string) {
  await prisma.$transaction([
    prisma.storyIdea.updateMany({
      where: { workspaceId, channelId: null },
      data: { channelId, workspaceId }
    }),
    prisma.storyProject.updateMany({
      where: { workspaceId, channelId: null },
      data: { channelId, workspaceId }
    }),
    prisma.publishingSlot.updateMany({
      where: { workspaceId, channelId: null },
      data: { channelId, workspaceId }
    }),
    prisma.storyIdea.updateMany({
      where: { userId, workspaceId: null },
      data: { channelId, workspaceId }
    }),
    prisma.storyProject.updateMany({
      where: { userId, workspaceId: null },
      data: { channelId, workspaceId }
    }),
    prisma.publishingSlot.updateMany({
      where: { userId, workspaceId: null },
      data: { channelId, workspaceId }
    })
  ]);
}

async function ensureForgeChannels(userId: string, workspaceId: string) {
  const existing = await prisma.channel.findMany({ where: { workspaceId } });
  const existingBySlug = new Map(existing.map((channel) => [channel.slug, channel]));
  const existingByName = new Map(existing.map((channel) => [channel.name.trim().toUpperCase(), channel]));

  await prisma.$transaction(async (tx) => {
    for (const niche of FORGE_NICHES) {
      const existingChannel = existingBySlug.get(niche.slug) || existingByName.get(niche.name);
      if (existingChannel) {
        if (
          existingChannel.archivedAt ||
          existingChannel.name !== niche.name ||
          existingChannel.slug !== niche.slug ||
          !existingChannel.description ||
          !existingChannel.shaziStyle
        ) {
          await tx.channel.update({
            where: { id: existingChannel.id },
            data: {
              name: niche.name,
              slug: niche.slug,
              description: existingChannel.description || forgeChannelDescription(niche),
              shaziStyle: existingChannel.shaziStyle || recommendShaziStyle({ name: niche.name, description: existingChannel.description || forgeChannelDescription(niche) }),
              archivedAt: null
            }
          });
        }
        continue;
      }

      await tx.channel.create({
        data: {
          userId,
          workspaceId,
          name: niche.name,
          slug: niche.slug,
          description: forgeChannelDescription(niche),
          shaziStyle: recommendShaziStyle({ name: niche.name, description: forgeChannelDescription(niche) })
        }
      });
    }
  });
}

async function uniqueChannelSlug(workspaceId: string, name: string) {
  const base = slugify(name) || "channel";
  let slug = base;
  let index = 2;
  while (await prisma.channel.findFirst({ where: { workspaceId, slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}
