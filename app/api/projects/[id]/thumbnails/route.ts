import { ScriptPassType, StoryProjectFormat } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { parsePublishingPack } from "@/lib/publishing-pack";
import { prisma } from "@/lib/prisma";
import { generateProjectThumbnails } from "@/lib/runware";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        drafts: {
          where: { passType: ScriptPassType.PUBLISHING_PACK },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format !== StoryProjectFormat.STANDALONE && project.format !== StoryProjectFormat.EPISODIC_SERIES) {
      return Response.json({ error: "Thumbnails are only available for video projects." }, { status: 400 });
    }
    const packDraft = project.drafts[0];
    if (!packDraft) return Response.json({ error: "Create a Publishing Pack before generating thumbnails." }, { status: 400 });

    const pack = parsePublishingPack(packDraft.content);
    const thumbnailPrompts = pack.episodePacks?.length
      ? pack.episodePacks.flatMap((episode) => episode.thumbnailPrompts)
      : pack.thumbnailPrompts;
    const expectedPromptCount = pack.episodePacks?.length ? 15 : 3;
    if (thumbnailPrompts.length !== expectedPromptCount) {
      return Response.json({ error: `Publishing Pack must include exactly ${expectedPromptCount} thumbnail prompts.` }, { status: 400 });
    }

    const thumbnails = await generateProjectThumbnails({
      userId: user.id,
      storyProjectId: project.id,
      scriptDraftId: packDraft.id,
      prompts: thumbnailPrompts
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.thumbnails_generated",
      metadata: { projectId: project.id, count: thumbnails.length }
    });

    return Response.json({ thumbnails });
  } catch (error) {
    return jsonError(error, 400);
  }
}
