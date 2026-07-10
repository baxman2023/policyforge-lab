import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { createYoutubeUploadSession } from "@/lib/youtube";

const StartUploadSchema = z.object({
  action: z.literal("start").default("start"),
  storyProjectId: z.string().min(1),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(5000).default(""),
  tags: z.array(z.string().trim().min(1)).max(50).default([]),
  contentType: z.string().trim().min(1),
  contentLength: z.number().int().positive(),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
  publishAt: z.string().datetime().nullable().optional()
});

const FinishUploadSchema = z.object({
  action: z.literal("finish"),
  storyProjectId: z.string().min(1),
  youtubeVideoId: z.string().trim().min(6).max(32),
  privacyStatus: z.enum(["private", "unlisted", "public"]).default("private"),
  publishAt: z.string().datetime().nullable().optional()
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const body = await request.json();
    if (body?.action === "finish") {
      const input = FinishUploadSchema.parse(body);
      const project = await prisma.storyProject.findFirst({ where: { id: input.storyProjectId, workspaceId: workspace.id } });
      if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
      const scheduledAt = input.publishAt ? new Date(input.publishAt) : null;
      await prisma.$transaction([
        prisma.storyProject.update({
          where: { id: project.id },
          data: {
            youtubeVideoId: input.youtubeVideoId,
            youtubeUploadStatus: "UPLOADED",
            youtubePrivacyStatus: input.privacyStatus,
            youtubeScheduledAt: scheduledAt
          }
        }),
        prisma.publishedStory.upsert({
          where: { youtubeVideoId: input.youtubeVideoId },
          create: {
            storyProjectId: project.id,
            platform: "YouTube",
            youtubeVideoId: input.youtubeVideoId,
            publishedUrl: `https://www.youtube.com/watch?v=${input.youtubeVideoId}`,
            notes: scheduledAt ? `Scheduled for ${scheduledAt.toISOString()}` : `Uploaded as ${input.privacyStatus}`,
            publishedAt: scheduledAt || new Date()
          },
          update: {
            storyProjectId: project.id,
            publishedUrl: `https://www.youtube.com/watch?v=${input.youtubeVideoId}`,
            notes: scheduledAt ? `Scheduled for ${scheduledAt.toISOString()}` : `Uploaded as ${input.privacyStatus}`,
            publishedAt: scheduledAt || new Date()
          }
        })
      ]);
      await auditLog({ userId: user.id, workspaceId: workspace.id, action: "youtube.video_uploaded", metadata: { projectId: project.id, youtubeVideoId: input.youtubeVideoId } });
      return Response.json({ youtubeVideoId: input.youtubeVideoId, url: `https://www.youtube.com/watch?v=${input.youtubeVideoId}` });
    }

    const input = StartUploadSchema.parse(body);
    const project = await prisma.storyProject.findFirst({ where: { id: input.storyProjectId, workspaceId: workspace.id } });
    if (!project?.channelId) return Response.json({ error: "Choose a project with an active PolicyForge channel." }, { status: 400 });
    const connection = await prisma.youtubeConnection.findFirst({
      where: { userId: user.id, workspaceId: workspace.id, channelId: project.channelId }
    });
    if (!connection) return Response.json({ error: "Connect this PolicyForge channel to YouTube before uploading." }, { status: 400 });
    const session = await createYoutubeUploadSession({
      connection,
      title: input.title,
      description: input.description,
      tags: input.tags,
      contentType: input.contentType,
      contentLength: input.contentLength,
      privacyStatus: input.privacyStatus,
      publishAt: input.publishAt ? new Date(input.publishAt) : null
    });
    await prisma.storyProject.update({ where: { id: project.id }, data: { youtubeUploadStatus: "UPLOADING" } });
    return Response.json(session);
  } catch (error) {
    return jsonError(error, 400);
  }
}
