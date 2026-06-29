import { StoryIdeaStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { channelIdFromRequest, getUserChannel } from "@/lib/channels";
import { buildDuplicateReport } from "@/lib/duplicates";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { storyLengthOptions } from "@/lib/story-options";
import { slugify } from "@/lib/utils";

const IdeaSchema = z.object({
  title: z.string().min(3),
  hook: z.string().min(3),
  summary: z.string().min(3),
  category: z.string().min(1),
  sourceType: z.string().optional(),
  sourceUrls: z.array(z.string()).optional(),
  people: z.array(z.string()).optional(),
  location: z.string().optional(),
  eventName: z.string().optional(),
  originalityScore: z.number().int().min(0).max(100).default(0),
  curiosityScore: z.number().int().min(0).max(100).default(0),
  emotionalScore: z.number().int().min(0).max(100).default(0),
  escalationScore: z.number().int().min(0).max(100).default(0),
  lengthPotentialScore: z.number().int().min(0).max(100).default(0),
  researchDifficultyScore: z.number().int().min(0).max(100).default(0),
  estimatedLengthPotential: z.string().optional(),
  recommendedLengthMinutes: z.number().int().min(10).max(60).optional(),
  episodeFit: z.enum(["Low", "Medium", "High"]).optional(),
  bestFormat: z.enum(["Single Video", "3-Part Series", "5-Part Series"]).optional(),
  episodeWhy: z.string().optional(),
  episodeArc: z.array(z.object({
    part: z.string(),
    title: z.string(),
    promise: z.string()
  })).optional(),
  episodeBusinessValue: z.string().optional(),
  recommendedTone: z.string().optional(),
  recommendedNarrationStyle: z.string().optional(),
  productionPriority: z.string().default("Medium"),
  suggestedAngle: z.string().default(""),
  status: z.nativeEnum(StoryIdeaStatus).default(StoryIdeaStatus.UNUSED),
  confirmDuplicate: z.boolean().default(false),
  channelId: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const url = new URL(request.url);
    const channel = await getUserChannel(user.id, workspace.id, channelIdFromRequest(request));
    const status = url.searchParams.get("status") as StoryIdeaStatus | null;
    const ideas = await prisma.storyIdea.findMany({
      where: {
        workspaceId: workspace.id,
        channelId: channel.id,
        ...(status ? { status } : {})
      },
      orderBy: [{ totalScore: "desc" }, { updatedAt: "desc" }],
      take: 100
    });
    return Response.json({ ideas });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = IdeaSchema.parse(await request.json());
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);
    const existing = await prisma.storyIdea.findMany({ where: { workspaceId: workspace.id, channelId: channel.id } });
    const duplicate = buildDuplicateReport(input, existing);
    const estimatedLengthPotential = normalizeLengthLabel(
      input.estimatedLengthPotential,
      input.recommendedLengthMinutes
    );

    if ((duplicate.exactMatch || duplicate.blocked) && !input.confirmDuplicate) {
      return Response.json({ duplicate, error: duplicate.warning }, { status: 409 });
    }

    const idea = await prisma.storyIdea.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        channelId: channel.id,
        title: input.title,
        slug: await uniqueSlug(workspace.id, channel.id, input.title),
        hook: input.hook,
        summary: input.summary,
        category: input.category,
        sourceType: input.sourceType,
        sourceUrls: input.sourceUrls ?? [],
        people: input.people ?? [],
        location: input.location,
        eventName: input.eventName,
        originalityScore: input.originalityScore,
        curiosityScore: input.curiosityScore,
        emotionalScore: input.emotionalScore,
        escalationScore: input.escalationScore,
        lengthPotentialScore: input.lengthPotentialScore,
        researchDifficultyScore: input.researchDifficultyScore,
        estimatedLengthPotential,
        recommendedLengthMinutes: normalizeLengthMinutes(input.recommendedLengthMinutes, estimatedLengthPotential),
        episodeFit: input.episodeFit,
        bestFormat: input.bestFormat,
        episodeWhy: input.episodeWhy,
        episodeArc: input.episodeArc ?? [],
        episodeBusinessValue: input.episodeBusinessValue,
        recommendedTone: input.recommendedTone,
        recommendedNarrationStyle: input.recommendedNarrationStyle,
        totalScore: Math.round(
          (input.originalityScore +
            input.curiosityScore +
            input.emotionalScore +
            input.escalationScore +
            input.lengthPotentialScore) /
            5
        ),
        productionPriority: input.productionPriority,
        suggestedAngle: input.suggestedAngle,
        status: input.status
      }
    });

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "story_idea.created", metadata: { ideaId: idea.id, channelId: channel.id } });
    return Response.json({ idea, duplicate });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const channel = await getUserChannel(user.id, workspace.id, channelIdFromRequest(request));
    const ideas = await prisma.storyIdea.findMany({
      where: { workspaceId: workspace.id, channelId: channel.id },
      select: { id: true, status: true }
    });

    if (!ideas.length) {
      return Response.json({ deleted: true, count: 0 });
    }

    const statusCounts = ideas.reduce<Record<string, number>>((counts, idea) => {
      counts[idea.status] = (counts[idea.status] ?? 0) + 1;
      return counts;
    }, {});

    const result = await prisma.storyIdea.deleteMany({
      where: { workspaceId: workspace.id, channelId: channel.id }
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_ideas.deleted_all",
      metadata: { channelId: channel.id, count: result.count, statusCounts }
    });

    return Response.json({ deleted: true, count: result.count });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function normalizeLengthMinutes(value?: number, label?: string) {
  if (value && storyLengthOptions.some((item) => item.minutes === value)) return value;
  const matched = storyLengthOptions.find((item) => lengthLabelMatches(item, label));
  return matched?.minutes ?? 7;
}

function normalizeLengthLabel(value?: string, minutes?: number) {
  const matched = storyLengthOptions.find((item) => lengthLabelMatches(item, value) || item.minutes === minutes);
  return matched?.label ?? "7 min";
}

function lengthLabelMatches(item: { label: string; minutes: number }, label?: string) {
  const normalized = label?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === item.label.toLowerCase() || normalized === item.label.replace("min", "minutes").toLowerCase();
}

async function uniqueSlug(workspaceId: string, channelId: string, title: string) {
  const base = slugify(title) || "story-idea";
  let slug = base;
  let index = 2;
  while (await prisma.storyIdea.findFirst({ where: { workspaceId, channelId, slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}
