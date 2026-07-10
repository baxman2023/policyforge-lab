import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { setYoutubeThumbnail } from "@/lib/youtube";

const ThumbnailSchema = z.object({
  storyProjectId: z.string().min(1),
  youtubeVideoId: z.string().trim().min(6).max(32),
  thumbnailAssetId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ThumbnailSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id: input.storyProjectId, workspaceId: workspace.id, youtubeVideoId: input.youtubeVideoId }
    });
    if (!project?.channelId) return Response.json({ error: "The linked YouTube project was not found." }, { status: 404 });
    const asset = await prisma.thumbnailAsset.findFirst({
      where: { id: input.thumbnailAssetId, storyProjectId: project.id }
    });
    if (!asset) return Response.json({ error: "The selected project thumbnail was not found." }, { status: 404 });
    const connection = await prisma.youtubeConnection.findFirst({
      where: { userId: user.id, workspaceId: workspace.id, channelId: project.channelId }
    });
    if (!connection) return Response.json({ error: "Reconnect this PolicyForge channel to YouTube." }, { status: 400 });
    await setYoutubeThumbnail({ connection, youtubeVideoId: input.youtubeVideoId, imageUrl: asset.imageUrl });
    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "youtube.thumbnail_set", metadata: { projectId: project.id, youtubeVideoId: input.youtubeVideoId, thumbnailAssetId: asset.id } });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
