import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const existing = await prisma.storyIdea.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true, title: true, status: true, projects: { select: { id: true } } }
    });

    if (!existing) return Response.json({ error: "Story idea not found." }, { status: 404 });

    await prisma.storyIdea.delete({ where: { id } });
    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_idea.deleted",
      metadata: {
        id,
        title: existing.title,
        status: existing.status,
        detachedProjectCount: existing.projects.length
      }
    });

    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error, 400);
  }
}
