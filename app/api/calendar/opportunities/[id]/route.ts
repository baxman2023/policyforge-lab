import { z } from "zod";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { targetWordsForMinutes } from "@/lib/utils";
import { canonicalSubjectKey } from "@/lib/upgrade-domain";

const Schema = z.object({ mode: z.enum(["VIDEO", "SEASON"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = Schema.parse(await request.json());
    const opportunity = await prisma.editorialOpportunity.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!opportunity || opportunity.relevance === "IRRELEVANT") return Response.json({ error: "This opportunity is not relevant to the active channel." }, { status: 400 });
    const idea = await prisma.storyIdea.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: opportunity.channelId, title: opportunity.title, slug: `${opportunity.opportunityKey.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${opportunity.id.slice(-5)}`, hook: opportunity.suggestedAngle || opportunity.description, summary: opportunity.description, category: "Editorial calendar", eventDate: opportunity.opportunityDate, eventName: opportunity.title, originalityScore: 75, curiosityScore: 75, emotionalScore: 70, escalationScore: 70, lengthPotentialScore: 78, researchDifficultyScore: 50, recommendedLengthMinutes: 10, episodeFit: input.mode === "SEASON" ? "High" : "Low", bestFormat: input.mode === "SEASON" ? "3-Part Series" : "Single Video", totalScore: 78, productionPriority: "High", suggestedAngle: opportunity.suggestedAngle || opportunity.description, status: "IN_PROGRESS" } });
    if (input.mode === "VIDEO") {
      const project = await prisma.storyProject.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: opportunity.channelId, storyIdeaId: idea.id, title: opportunity.title, targetLengthMinutes: 10, targetWordCount: targetWordsForMinutes(10), tone: "Helpful, local, consultative", narrationStyle: "Journalistic" } });
      return Response.json({ idea, project });
    }
    const season = await prisma.contentSeason.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: opportunity.channelId, storyIdeaId: idea.id, title: opportunity.title, premise: opportunity.suggestedAngle || opportunity.description, episodes: { create: [1, 2, 3].map((number) => ({ episodeNumber: number, title: `${opportunity.title}: Part ${number}`, hook: `Part ${number}`, promise: number === 1 ? "Explain the timely Texas risk and what changed." : number === 2 ? "Show the policy details and realistic scenarios buyers should understand." : "Give viewers a practical quote or review checklist.", deltaResearchQuestion: `Find evidence unique to editorial episode ${number}.` })) } }, include: { episodes: true } });
    const subjectKey = canonicalSubjectKey({ title: opportunity.title, eventName: opportunity.title, category: "Editorial calendar" });
    const canonicalSubject = await prisma.canonicalSubject.upsert({ where: { workspaceId_channelId_subjectKey: { workspaceId: workspace.id, channelId: opportunity.channelId, subjectKey } }, update: {}, create: { userId: user.id, workspaceId: workspace.id, channelId: opportunity.channelId, subjectKey, canonicalName: opportunity.title, aliases: [opportunity.title] } });
    for (const episode of season.episodes) {
      const scheduledAt = new Date(opportunity.opportunityDate); scheduledAt.setDate(scheduledAt.getDate() + (episode.episodeNumber - 1) * 2);
      await prisma.storyProject.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: opportunity.channelId, canonicalSubjectId: canonicalSubject.id, seasonEpisodeId: episode.id, title: episode.title, format: "EPISODIC_SERIES", targetLengthMinutes: 10, targetWordCount: targetWordsForMinutes(10), tone: "Helpful, local, consultative", narrationStyle: "Journalistic", sourceMaterial: `Editorial season: ${season.title}\nEpisode promise: ${episode.promise}\nDelta research: ${episode.deltaResearchQuestion}` } });
      await prisma.seasonEpisode.update({ where: { id: episode.id }, data: { scheduledAt } });
    }
    return Response.json({ idea, season, url: `/seasons/${season.id}` });
  } catch (error) { return jsonError(error, 400); }
}
