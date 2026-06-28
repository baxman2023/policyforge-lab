import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserSettings } from "@/lib/settings";
import { requireUser } from "@/lib/session";

const BlockedChannelIdeaSchema = z.object({
  key: z.string().trim().min(2).max(120),
  title: z.string().trim().min(2).max(160),
  blocked: z.boolean()
});

type BlockedChannelIdea = {
  key: string;
  title: string;
  blockedAt: string;
};

const BLOCKED_IDEAS_KEY = "blockedChannelIdeas";

export async function GET() {
  try {
    const user = await requireUser();
    const settings = await getOrCreateUserSettings(user.id);
    return Response.json({ blockedIdeas: readBlockedIdeas(settings.defaultCategories) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = BlockedChannelIdeaSchema.parse(await request.json());
    const settings = await getOrCreateUserSettings(user.id);
    const currentPayload = settingsPayload(settings.defaultCategories);
    const currentIdeas = readBlockedIdeas(currentPayload);
    const key = normalizeIdeaKey(input.key);
    const nextIdeas = input.blocked
      ? [
          ...currentIdeas.filter((idea) => idea.key !== key),
          { key, title: input.title, blockedAt: new Date().toISOString() }
        ].sort((a, b) => a.title.localeCompare(b.title))
      : currentIdeas.filter((idea) => idea.key !== key);

    const nextPayload = {
      ...currentPayload,
      [BLOCKED_IDEAS_KEY]: nextIdeas
    };

    await prisma.userSettings.update({
      where: { userId: user.id },
      data: { defaultCategories: nextPayload as Prisma.InputJsonValue }
    });

    return Response.json({ blockedIdeas: nextIdeas });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function readBlockedIdeas(value: unknown): BlockedChannelIdea[] {
  const source = settingsPayload(value)[BLOCKED_IDEAS_KEY];
  if (!Array.isArray(source)) return [];

  return source
    .map((item) => {
      if (!isRecord(item)) return null;
      const key = normalizeIdeaKey(readString(item.key));
      const title = readString(item.title);
      const blockedAt = readString(item.blockedAt) || new Date().toISOString();
      if (!key || !title) return null;
      return { key, title, blockedAt };
    })
    .filter((item): item is BlockedChannelIdea => Boolean(item));
}

function settingsPayload(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return { ...value };
  return {};
}

function normalizeIdeaKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
