import {
  PublishingSlotStatus,
  PublishingSlotType,
  StoryIdeaStatus,
  StoryProjectFormat
} from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getUserChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { addDays, dateKey, nextAppendCursor, nextOpenDate, nextOpenSeriesWeek, normalizePublishDate } from "@/lib/publishing-calendar";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserSettings } from "@/lib/settings";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { targetWordsForMinutes } from "@/lib/utils";

const MonthlyAutoSchema = z.object({
  startDate: z.string().optional(),
  channelId: z.string().optional()
});

const standaloneLengths = [8, 10, 12] as const;

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = MonthlyAutoSchema.parse(await request.json().catch(() => ({})));
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);
    const settings = await getOrCreateUserSettings(user.id);
    const requestedStart = input.startDate ? new Date(input.startDate) : new Date();
    const startDate = normalizePublishDate(Number.isNaN(requestedStart.getTime()) ? new Date() : requestedStart);
    const batchId = randomUUID();

    const result = await prisma.$transaction(async (tx) => {
      const candidates = await tx.storyIdea.findMany({
        where: {
          workspaceId: workspace.id,
          channelId: channel.id,
          status: { in: [StoryIdeaStatus.UNUSED, StoryIdeaStatus.SAVED] },
          projects: { none: {} }
        },
        orderBy: [{ totalScore: "desc" }, { updatedAt: "desc" }],
        take: 80
      });

      if (candidates.length < 5) {
        throw new Error("Monthly Auto needs at least 5 unused or saved ideas that do not already have projects.");
      }

      const shuffled = shuffle(candidates);
      const seriesIdea = [...shuffled].sort(
        (a, b) =>
          b.lengthPotentialScore - a.lengthPotentialScore ||
          b.totalScore - a.totalScore ||
          a.title.localeCompare(b.title)
      )[0];
      const standaloneIdeas = shuffled.filter((idea) => idea.id !== seriesIdea.id).slice(0, 4);

      const existingSlots = await tx.publishingSlot.findMany({
        where: { workspaceId: workspace.id, channelId: channel.id, scheduledDate: { gte: startDate } },
        select: { scheduledDate: true },
        orderBy: { scheduledDate: "asc" }
      });
      const usedDates = new Set(existingSlots.map((slot) => dateKey(slot.scheduledDate)));
      let cursor = nextAppendCursor(startDate, existingSlots.map((slot) => slot.scheduledDate));

      const projects = [];
      const slots = [];

      for (const idea of standaloneIdeas) {
        const targetLengthMinutes = randomStandaloneLength();
        const project = await tx.storyProject.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            channelId: channel.id,
            storyIdeaId: idea.id,
            title: idea.title,
            format: StoryProjectFormat.STANDALONE,
            targetLengthMinutes,
            targetWordCount: targetWordsForMinutes(targetLengthMinutes),
            tone: idea.recommendedTone || settings.preferredTone,
            narrationStyle: idea.recommendedNarrationStyle || settings.narrationStyle
          }
        });
        await tx.storyIdea.update({
          where: { id: idea.id },
          data: { status: StoryIdeaStatus.IN_PROGRESS }
        });

        const scheduledDate = nextOpenDate(cursor, usedDates, [1, 4]);
        usedDates.add(dateKey(scheduledDate));
        cursor = addDays(scheduledDate, 1);

        const slot = await tx.publishingSlot.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            channelId: channel.id,
            storyProjectId: project.id,
            title: project.title,
            scheduledDate,
            slotType: PublishingSlotType.STANDALONE,
            status: PublishingSlotStatus.SCHEDULED,
            durationMinutes: targetLengthMinutes,
            batchId
          }
        });

        projects.push(project);
        slots.push(slot);
      }

      const seriesProject = await tx.storyProject.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          channelId: channel.id,
          storyIdeaId: seriesIdea.id,
          title: seriesIdea.title,
          format: StoryProjectFormat.EPISODIC_SERIES,
          targetLengthMinutes: 10,
          targetWordCount: targetWordsForMinutes(10),
          tone: seriesIdea.recommendedTone || settings.preferredTone,
          narrationStyle: seriesIdea.recommendedNarrationStyle || settings.narrationStyle
        }
      });
      await tx.storyIdea.update({
        where: { id: seriesIdea.id },
        data: { status: StoryIdeaStatus.IN_PROGRESS }
      });

      const seriesStart = nextOpenSeriesWeek(cursor, usedDates);
      const plannedEpisodeCount = Array.isArray(seriesIdea.episodeArc) ? Math.max(2, Math.min(5, seriesIdea.episodeArc.length)) : 3;
      for (let episodeIndex = 0; episodeIndex < plannedEpisodeCount; episodeIndex += 1) {
        const scheduledDate = addDays(seriesStart, episodeIndex * 2);
        usedDates.add(dateKey(scheduledDate));
        const episodeNumber = episodeIndex + 1;
        const slot = await tx.publishingSlot.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            channelId: channel.id,
            storyProjectId: seriesProject.id,
            title: `${seriesProject.title} - Episode ${episodeNumber}`,
            scheduledDate,
            slotType: PublishingSlotType.EPISODE,
            status: PublishingSlotStatus.SCHEDULED,
            episodeNumber,
            episodeCount: plannedEpisodeCount,
            durationMinutes: Math.min(15, Math.max(8, seriesIdea.recommendedLengthMinutes || 10)),
            batchId
          }
        });
        slots.push(slot);
      }
      projects.push(seriesProject);

      return { batchId, projects, slots };
    });

    const [projectsPayload, slotsPayload] = await Promise.all([
      prisma.storyProject.findMany({
        where: { workspaceId: workspace.id, channelId: channel.id, id: { in: result.projects.map((project) => project.id) } },
        include: {
          storyIdea: true,
          drafts: { orderBy: { createdAt: "desc" }, take: 50 },
          publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
        },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.publishingSlot.findMany({
        where: { workspaceId: workspace.id, channelId: channel.id, id: { in: result.slots.map((slot) => slot.id) } },
        include: {
          storyProject: {
            include: {
              storyIdea: true,
              drafts: { orderBy: { createdAt: "desc" }, take: 50 },
              publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
            }
          }
        },
        orderBy: { scheduledDate: "asc" }
      })
    ]);

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "publishing_calendar.monthly_auto",
      metadata: { batchId: result.batchId, projectCount: result.projects.length, slotCount: result.slots.length, channelId: channel.id }
    });

    return Response.json({ batchId: result.batchId, projects: projectsPayload, slots: slotsPayload });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function randomStandaloneLength() {
  return standaloneLengths[Math.floor(Math.random() * standaloneLengths.length)];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
