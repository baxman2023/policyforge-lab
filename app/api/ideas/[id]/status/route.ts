import { StoryIdeaStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

const StatusSchema = z.object({
  status: z.nativeEnum(StoryIdeaStatus)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const { status } = StatusSchema.parse(await request.json());
    const existing = await prisma.storyIdea.findFirst({ where: { id, workspaceId: workspace.id } });
    if (!existing) return Response.json({ error: "Story idea not found." }, { status: 404 });
    const used = status === StoryIdeaStatus.PRODUCED || status === StoryIdeaStatus.PUBLISHED;
    const idea = await prisma.storyIdea.update({
      where: { id },
      data: {
        status,
        usedAt: used ? new Date() : status === StoryIdeaStatus.ARCHIVED ? new Date() : null
      }
    });
    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "story_idea.status_changed", metadata: { id, status } });
    return Response.json({ idea });
  } catch (error) {
    return jsonError(error, 400);
  }
}
