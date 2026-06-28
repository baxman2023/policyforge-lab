import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, requireWorkspaceManager } from "@/lib/workspaces";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    requireWorkspaceManager(access);
    const { id } = await context.params;
    const invite = await prisma.workspaceInvite.findFirst({
      where: { id, workspaceId: access.workspace.id }
    });
    if (!invite) return Response.json({ error: "Invite not found." }, { status: 404 });
    await prisma.workspaceInvite.delete({ where: { id } });
    await auditLog({
      userId: access.user.id,
      workspaceId: access.workspace.id,
      action: "workspace.invite.deleted",
      metadata: { inviteId: id, email: invite.email }
    });
    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error, 400);
  }
}
