import { Prisma, StoryIdeaStatus, StoryProjectFormat } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { channelIdFromRequest, getUserChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { normalizeSponsorBlurbForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { formatProjectForResponse } from "@/lib/project-response";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { targetWordsForProject } from "@/lib/utils";

const ProjectSchema = z.object({
  storyIdeaId: z.string().optional(),
  title: z.string().min(3).optional(),
  format: z.nativeEnum(StoryProjectFormat).default(StoryProjectFormat.STANDALONE),
  targetLengthMinutes: z.number().int().min(10).max(60).default(45),
  tone: z.string().default("Mysterious & gripping"),
  narrationStyle: z.string().default("Calm suspense"),
  sponsorBlurb: z.string().optional(),
  sponsorLink: z.string().optional(),
  channelId: z.string().optional()
});

const storyProjectInclude = {
  storyIdea: true,
  drafts: { orderBy: { createdAt: "desc" as const }, take: 50 },
  thumbnails: { orderBy: { createdAt: "desc" as const }, take: 24 },
  publishingSlots: { orderBy: { scheduledDate: "asc" as const }, take: 20 }
};

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const channel = await getUserChannel(user.id, workspace.id, channelIdFromRequest(request));
    const projects = await prisma.storyProject.findMany({
      where: { workspaceId: workspace.id, channelId: channel.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 50 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 24 },
        publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return Response.json({ projects: projects.map(formatProjectForResponse) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ProjectSchema.parse(await request.json());
    const sponsorAllowed = supportsSponsorBlurb(input.format);
    const sponsorBlurb = sponsorAllowed ? normalizeSponsorBlurbForFormat(input.sponsorBlurb, input.format) || null : null;
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);
    const idea = input.storyIdeaId
      ? await prisma.storyIdea.findFirst({ where: { id: input.storyIdeaId, workspaceId: workspace.id, channelId: channel.id } })
      : null;

    if (input.storyIdeaId && !idea) {
      return Response.json({ error: "Story idea not found." }, { status: 404 });
    }

    if (idea) {
      const existingProject = await findExistingIdeaProject(workspace.id, idea.channelId || channel.id, idea.id, input.format);
      if (existingProject) {
        if (idea.status !== StoryIdeaStatus.IN_PROGRESS) {
          await prisma.storyIdea.update({
            where: { id: idea.id },
            data: { status: StoryIdeaStatus.IN_PROGRESS }
          });
        }
        await auditLog({
          userId: user.id,
          workspaceId: workspace.id,
          action: "story_project.reused",
          metadata: { projectId: existingProject.id, storyIdeaId: idea.id, channelId: idea.channelId || channel.id }
        });
        return Response.json({ project: formatProjectForResponse(existingProject), existing: true });
      }
    }

    const projectChannelId = idea?.channelId || channel.id;
    let project;
    try {
      project = await prisma.storyProject.create({
        data: {
          userId: user.id,
          workspaceId: workspace.id,
          channelId: projectChannelId,
          storyIdeaId: idea?.id,
          title: input.title || idea?.title || "Untitled Content Project",
          format: input.format,
          targetLengthMinutes: input.targetLengthMinutes,
          targetWordCount: targetWordsForProject(input.format, input.targetLengthMinutes),
          tone: input.tone,
          narrationStyle: input.narrationStyle,
          sponsorBlurb,
          sponsorLink: sponsorAllowed ? input.sponsorLink : null
        },
        include: storyProjectInclude
      });
    } catch (error) {
      if (idea && isDuplicateIdeaProjectError(error)) {
        const existingProject = await findExistingIdeaProject(workspace.id, projectChannelId, idea.id, input.format);
        if (existingProject) {
          await auditLog({
            userId: user.id,
            workspaceId: workspace.id,
            action: "story_project.reused",
            metadata: { projectId: existingProject.id, storyIdeaId: idea.id, channelId: projectChannelId, source: "unique_constraint" }
          });
          return Response.json({ project: formatProjectForResponse(existingProject), existing: true });
        }
      }
      throw error;
    }

    if (idea) {
      await prisma.storyIdea.update({
        where: { id: idea.id },
        data: { status: StoryIdeaStatus.IN_PROGRESS }
      });
    }

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "story_project.created", metadata: { projectId: project.id, storyIdeaId: idea?.id, channelId: idea?.channelId || channel.id } });
    return Response.json({ project: formatProjectForResponse(project) });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function findExistingIdeaProject(workspaceId: string, channelId: string, storyIdeaId: string, format: StoryProjectFormat) {
  return prisma.storyProject.findFirst({
    where: { workspaceId, channelId, storyIdeaId, format },
    include: storyProjectInclude,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
}

function isDuplicateIdeaProjectError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
