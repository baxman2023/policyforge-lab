import { ScriptPassType, StoryProjectFormat } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { parsePublishingPack } from "@/lib/publishing-pack";
import { prisma } from "@/lib/prisma";
import { generateArticleImages } from "@/lib/runware";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        drafts: {
          orderBy: { createdAt: "desc" },
          take: 80
        }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format !== StoryProjectFormat.ARTICLE) {
      return Response.json({ error: "Article images are only available for Article projects." }, { status: 400 });
    }

    const packDraft = project.drafts.find((draft) => draft.passType === ScriptPassType.PUBLISHING_PACK);
    if (!packDraft) return Response.json({ error: "Create an Article SEO Pack before generating article images." }, { status: 400 });

    const pack = parsePublishingPack(packDraft.content);
    const imagePlan = pack.seoPack?.imagePlan ?? [];
    if (!imagePlan.length) {
      return Response.json({ error: "The Article SEO Pack needs an image plan before images can be generated." }, { status: 400 });
    }

    const latestArticle =
      project.drafts.find((draft) => draft.passType === ScriptPassType.FINAL) ??
      project.drafts.find((draft) => draft.passType === ScriptPassType.VOICE_POLISH) ??
      project.drafts.find((draft) => draft.passType === ScriptPassType.REWRITE) ??
      project.drafts.find((draft) => draft.passType === ScriptPassType.DRAFT) ??
      packDraft;

    const images = await generateArticleImages({
      userId: user.id,
      storyProjectId: project.id,
      scriptDraftId: latestArticle.id,
      images: imagePlan
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.article_images_generated",
      metadata: { projectId: project.id, count: images.length }
    });

    return Response.json({
      images,
      estimatedCost: images.reduce((sum, item) => sum + Number(item.estimatedCost ?? 0), 0),
      modelUsed: images[0]?.modelUsed ?? null
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
