import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspace, requireWorkspaceManager } from "@/lib/workspaces";

const MemberPatchSchema = z.object({
  role: z.nativeEnum(WorkspaceRole)
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    requireWorkspaceManager(access);
    const { id } = await context.params;
    const input = MemberPatchSchema.parse(await request.json());
    const member = await prisma.workspaceMembership.findFirst({
      where: { id, workspaceId: access.workspace.id }
    });
    if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
    if (input.role === WorkspaceRole.OWNER && access.membership.role !== WorkspaceRole.OWNER && access.user.role !== "ADMIN") {
      return Response.json({ error: "Only workspace owners can assign owner access." }, { status: 403 });
    }

    const updated = await prisma.workspaceMembership.update({ where: { id }, data: { role: input.role } });
    await auditLog({
      userId: access.user.id,
      workspaceId: access.workspace.id,
      action: "workspace.member.updated",
      metadata: { membershipId: id, memberUserId: member.userId, role: input.role }
    });
    return Response.json({ member: updated });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    requireWorkspaceManager(access);
    const { id } = await context.params;
    const member = await prisma.workspaceMembership.findFirst({
      where: { id, workspaceId: access.workspace.id }
    });
    if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
    if (member.userId === access.user.id) {
      return Response.json({ error: "You cannot remove yourself from the active workspace." }, { status: 400 });
    }
    if (member.role === WorkspaceRole.OWNER && access.membership.role !== WorkspaceRole.OWNER && access.user.role !== "ADMIN") {
      return Response.json({ error: "Only workspace owners can remove another owner." }, { status: 403 });
    }

    await prisma.workspaceMembership.delete({ where: { id } });
    await auditLog({
      userId: access.user.id,
      workspaceId: access.workspace.id,
      action: "workspace.member.removed",
      metadata: { membershipId: id, memberUserId: member.userId }
    });
    return Response.json({ deleted: true, id });
  } catch (error) {
    return jsonError(error, 400);
  }
}
