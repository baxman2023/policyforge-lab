import { buildContentPackMarkdown, contentPackFilename } from "@/lib/content-pack";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 80 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 24 }
      }
    });

    if (!project) return Response.json({ error: "Story project not found." }, { status: 404 });

    const markdown = buildContentPackMarkdown(project);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${contentPackFilename(project.title)}"`
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
