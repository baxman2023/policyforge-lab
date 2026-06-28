import { StoryProjectFormat } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createWordPressArticleDraft } from "@/lib/wordpress";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 80 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 24 }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format !== StoryProjectFormat.ARTICLE) {
      return Response.json({ error: "WordPress draft upload is only available for Article projects." }, { status: 400 });
    }

    const draft = await createWordPressArticleDraft({ userId: user.id, project });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.wordpress_draft_created",
      metadata: { projectId: project.id, postId: draft.postId, imageCount: draft.imageCount, tagCount: draft.tagCount }
    });

    return Response.json({ draft });
  } catch (error) {
    return jsonError(error, 400);
  }
}
