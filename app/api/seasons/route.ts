import { z } from "zod";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { targetWordsForMinutes } from "@/lib/utils";
import { canonicalSubjectKey } from "@/lib/upgrade-domain";

const CreateSeasonSchema = z.object({
  ideaId: z.string().optional(),
  trendId: z.string().optional(),
  createProjects: z.boolean().default(true)
}).refine((value) => Boolean(value.ideaId || value.trendId), "Choose an idea or trend.");

export async function GET(request: Request) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const channelId = new URL(request.url).searchParams.get("channelId") || undefined;
    const seasons = await prisma.contentSeason.findMany({
      where: { workspaceId: workspace.id, ...(channelId ? { channelId } : {}) },
      include: { episodes: { orderBy: { episodeNumber: "asc" }, include: { project: true } }, storyIdea: true, trendOpportunity: true },
      orderBy: { updatedAt: "desc" }
    });
    return Response.json({ seasons });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = CreateSeasonSchema.parse(await request.json());
    const idea = input.ideaId ? await prisma.storyIdea.findFirst({ where: { id: input.ideaId, workspaceId: workspace.id } }) : null;
    const trend = input.trendId ? await prisma.trendOpportunity.findFirst({ where: { id: input.trendId, workspaceId: workspace.id } }) : null;
    if (!idea && !trend) return Response.json({ error: "Idea or trend not found." }, { status: 404 });
    const channelId = idea?.channelId || trend?.channelId;
    if (!channelId) throw new Error("Choose a channel before developing a season.");
    const title = idea?.title || trend?.headline || "New season";
    const subjectKey = canonicalSubjectKey({ title, eventName: idea?.eventName, category: idea?.category });
    const canonicalSubject = await prisma.canonicalSubject.upsert({ where: { workspaceId_channelId_subjectKey: { workspaceId: workspace.id, channelId, subjectKey } }, update: { aliases: [title, ...(idea?.eventName ? [idea.eventName] : [])] }, create: { userId: user.id, workspaceId: workspace.id, channelId, subjectKey, canonicalName: idea?.eventName || trend?.subject || title, aliases: [title] } });
    const sourceArc = arrayRecords(idea?.episodeArc);
    const episodeCount = sourceArc.length >= 2 ? Math.min(5, sourceArc.length) : 3;
    const episodeInputs = Array.from({ length: episodeCount }, (_, index) => {
      const source = sourceArc[index];
      return {
        episodeNumber: index + 1,
        title: stringValue(source?.title) || `${title}: Part ${index + 1}`,
        hook: stringValue(source?.part) || `Part ${index + 1}`,
        promise: stringValue(source?.promise) || `Answer one distinct buyer question about ${title} without repeating another episode.`,
        deltaResearchQuestion: `What episode-specific Texas evidence, policy language, consumer guidance, examples, or exceptions are needed for part ${index + 1}?`
      };
    });
    const season = await prisma.contentSeason.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        channelId,
        storyIdeaId: idea?.id,
        trendOpportunityId: trend?.id,
        title,
        premise: idea?.episodeWhy || trend?.suggestedAngle || `A tightly connected Texas insurance season built around ${title}.`,
        continuityRules: { sharedDossier: true, noRepeatedOpenings: true, crossEpisodePromoteNext: true },
        episodes: { create: episodeInputs }
      },
      include: { episodes: { orderBy: { episodeNumber: "asc" } } }
    });
    if (input.createProjects) {
      for (const episode of season.episodes) {
        const project = await prisma.storyProject.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            channelId,
            canonicalSubjectId: canonicalSubject.id,
            seasonEpisodeId: episode.id,
            title: `${episode.title} - Part ${episode.episodeNumber}`,
            format: "EPISODIC_SERIES",
            targetLengthMinutes: Math.min(15, Math.max(8, idea?.recommendedLengthMinutes || 10)),
            targetWordCount: targetWordsForMinutes(Math.min(15, Math.max(8, idea?.recommendedLengthMinutes || 10))),
            tone: idea?.recommendedTone || "Helpful, local, consultative",
            narrationStyle: idea?.recommendedNarrationStyle || "Journalistic",
            sourceMaterial: `Season: ${season.title}\nParent idea: ${idea?.title || trend?.headline || season.title}\nEpisode ${episode.episodeNumber} promise: ${episode.promise}\nDelta research question: ${episode.deltaResearchQuestion || "Find episode-specific Texas evidence and policy context."}`
          }
        });
        if (indexableDate(episode.episodeNumber)) {
          await prisma.seasonEpisode.update({ where: { id: episode.id }, data: { scheduledAt: suggestedEpisodeDate(episode.episodeNumber) } });
        }
        void project;
      }
    }
    if (trend) await prisma.trendOpportunity.update({ where: { id: trend.id }, data: { status: "DEVELOPED" } });
    return Response.json({ season: await seasonWithProjects(season.id, workspace.id), url: `/seasons/${season.id}` });
  } catch (error) { return jsonError(error, 400); }
}

function arrayRecords(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : []; }
function stringValue(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function suggestedEpisodeDate(number: number) { const date = new Date(); date.setDate(date.getDate() + (number - 1) * 2); date.setHours(10, 0, 0, 0); return date; }
function indexableDate(number: number) { return number > 0; }
function seasonWithProjects(id: string, workspaceId: string) { return prisma.contentSeason.findFirst({ where: { id, workspaceId }, include: { episodes: { orderBy: { episodeNumber: "asc" }, include: { project: true } }, storyIdea: true, trendOpportunity: true } }); }
