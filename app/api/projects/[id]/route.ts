import { PublishingSlotStatus, StoryIdeaStatus, StoryProjectFormat, StoryProjectStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { episodeCountForProject } from "@/lib/episodes";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { normalizeSponsorBlurbForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { formatProjectForResponse } from "@/lib/project-response";
import { targetWordsForProject } from "@/lib/utils";
import { requireActiveWorkspace } from "@/lib/workspaces";

const ProjectPatchSchema = z.object({
  status: z.nativeEnum(StoryProjectStatus).optional(),
  sourceMaterial: z.string().optional(),
  sponsorBlurb: z.string().optional(),
  sponsorLink: z.string().optional(),
  targetLengthMinutes: z.number().int().min(7).max(60).optional(),
  platform: z.string().trim().optional(),
  publishedUrl: z.string().trim().optional(),
  notes: z.string().trim().optional()
}).refine(
  (value) => value.status !== undefined || value.sourceMaterial !== undefined || value.sponsorBlurb !== undefined || value.sponsorLink !== undefined || value.targetLengthMinutes !== undefined,
  "Provide a status, source material, sponsor blurb, sponsor link, or target length to update."
);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = ProjectPatchSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.storyProject.findFirst({
        where: { id, workspaceId: workspace.id },
        include: {
          storyIdea: true,
          publishedStories: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      });

      if (!project) return null;
      if (input.targetLengthMinutes !== undefined && isRuntimeScriptFormat(project.format) && input.targetLengthMinutes > 30) {
        throw new Error("HeyGen video and podcast scripts must be 30 minutes or less.");
      }
      const sponsorAllowed = supportsSponsorBlurb(project.format);
      const sponsorBlurb = sponsorAllowed ? normalizeSponsorBlurbForFormat(input.sponsorBlurb ?? project.sponsorBlurb ?? "", project.format) : null;

      const updatedProject = await tx.storyProject.update({
        where: { id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.sourceMaterial !== undefined ? { sourceMaterial: input.sourceMaterial } : {}),
          ...(input.sponsorBlurb !== undefined || !sponsorAllowed ? { sponsorBlurb } : {}),
          ...(input.sponsorLink !== undefined || !sponsorAllowed ? { sponsorLink: sponsorAllowed ? (input.sponsorLink ?? "").trim() || null : null } : {}),
          ...(input.targetLengthMinutes !== undefined
            ? {
                targetLengthMinutes: input.targetLengthMinutes,
                targetWordCount: targetWordsForProject(project.format, input.targetLengthMinutes, episodeCountForProject(project))
              }
            : {})
        },
        include: {
          storyIdea: true,
          drafts: { orderBy: { createdAt: "desc" }, take: 50 },
          thumbnails: { orderBy: { createdAt: "desc" }, take: 24 },
          publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 },
          publishedStories: { orderBy: { createdAt: "desc" }, take: 1 }
        }
      });

      const ideaStatus = input.status ? ideaStatusForProject(input.status) : null;
      const updatedIdea =
        project.storyIdeaId && ideaStatus
          ? await tx.storyIdea.update({
              where: { id: project.storyIdeaId },
              data: {
                status: ideaStatus,
                usedAt: isUsedIdeaStatus(ideaStatus) ? new Date() : null
              }
            })
          : null;

      if (input.status === StoryProjectStatus.PUBLISHED) {
        await tx.publishingSlot.updateMany({
          where: { storyProjectId: project.id },
          data: { status: PublishingSlotStatus.PUBLISHED }
        });
        const publishedData = {
          platform: input.platform || "Baxter Growth Lab",
          publishedUrl: input.publishedUrl || null,
          notes: input.notes || null,
          publishedAt: new Date()
        };
        const latestPublished = project.publishedStories[0];
        if (latestPublished) {
          await tx.publishedStory.update({
            where: { id: latestPublished.id },
            data: publishedData
          });
        } else {
          await tx.publishedStory.create({
            data: {
              storyProjectId: project.id,
              ...publishedData
            }
          });
        }
      } else if (input.status === StoryProjectStatus.PRODUCED) {
        await tx.publishingSlot.updateMany({
          where: { storyProjectId: project.id, status: PublishingSlotStatus.SCHEDULED },
          data: { status: PublishingSlotStatus.PRODUCED }
        });
      }

      return { project: updatedProject, idea: updatedIdea };
    });

    if (!result) return Response.json({ error: "Story project not found." }, { status: 404 });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: input.status ? "story_project.status_changed" : "story_project.inputs_saved",
      metadata: {
        id,
        ...(input.status ? { status: input.status } : {}),
        sourceMaterial: input.sourceMaterial !== undefined,
        sponsorBlurb: input.sponsorBlurb !== undefined,
        sponsorLink: input.sponsorLink !== undefined
      }
    });

    return Response.json({ ...result, project: formatProjectForResponse(result.project) });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function isRuntimeScriptFormat(format: StoryProjectFormat) {
  return format === StoryProjectFormat.STANDALONE || format === StoryProjectFormat.EPISODIC_SERIES || format === StoryProjectFormat.PODCAST_EPISODE;
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;

    const deleted = await prisma.$transaction(async (tx) => {
      const project = await tx.storyProject.findFirst({
        where: { id, workspaceId: workspace.id },
        select: {
          id: true,
          title: true,
          status: true,
          storyIdeaId: true,
          storyIdea: { select: { status: true } },
          drafts: { select: { id: true } }
        }
      });

      if (!project) return null;

      await tx.storyProject.delete({ where: { id } });

      if (
        project.storyIdeaId &&
        (project.storyIdea?.status === StoryIdeaStatus.IN_PROGRESS ||
          project.storyIdea?.status === StoryIdeaStatus.DRAFTED)
      ) {
        const remainingProjects = await tx.storyProject.count({ where: { storyIdeaId: project.storyIdeaId } });
        if (remainingProjects === 0) {
          await tx.storyIdea.update({
            where: { id: project.storyIdeaId },
            data: { status: StoryIdeaStatus.SAVED, usedAt: null }
          });
        }
      }

      return {
        id: project.id,
        title: project.title,
        status: project.status,
        storyIdeaId: project.storyIdeaId,
        draftCount: project.drafts.length
      };
    });

    if (!deleted) return Response.json({ error: "Story project not found." }, { status: 404 });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.deleted",
      metadata: deleted
    });

    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function ideaStatusForProject(status: StoryProjectStatus) {
  if (status === StoryProjectStatus.PRODUCED) return StoryIdeaStatus.PRODUCED;
  if (status === StoryProjectStatus.PUBLISHED) return StoryIdeaStatus.PUBLISHED;
  if (status === StoryProjectStatus.ARCHIVED) return StoryIdeaStatus.ARCHIVED;
  if (status === StoryProjectStatus.FINAL) return StoryIdeaStatus.DRAFTED;
  if (
    status === StoryProjectStatus.DOSSIER ||
    status === StoryProjectStatus.OUTLINE ||
    status === StoryProjectStatus.DRAFTING ||
    status === StoryProjectStatus.CRITIQUE ||
    status === StoryProjectStatus.REWRITE
  ) {
    return StoryIdeaStatus.IN_PROGRESS;
  }
  return null;
}

function isUsedIdeaStatus(status: StoryIdeaStatus) {
  return status === StoryIdeaStatus.PRODUCED || status === StoryIdeaStatus.PUBLISHED || status === StoryIdeaStatus.ARCHIVED;
}
