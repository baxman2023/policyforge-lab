import { UserRole, WorkspaceSubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  canManageWorkspaceRole,
  publicWorkspace,
  requireWorkspace,
  workspacePatch
} from "@/lib/workspaces";

const WorkspacePatchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  tagline: z.string().trim().min(2).max(120).optional(),
  logoUrl: z.string().trim().optional().nullable(),
  customDomain: z.string().trim().optional().nullable(),
  subscriptionStatus: z.nativeEnum(WorkspaceSubscriptionStatus).optional(),
  subscriptionPlan: z.string().trim().max(120).optional().nullable(),
  setupCompleted: z.boolean().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    const { id } = await context.params;
    const input = WorkspacePatchSchema.parse(await request.json());

    const membership = await prisma.workspaceMembership.findFirst({
      where: { workspaceId: id, userId: access.user.id },
      include: { workspace: true }
    });
    const globalAdmin = access.user.role === UserRole.ADMIN;
    if (!membership && !globalAdmin) return Response.json({ error: "Workspace not found." }, { status: 404 });
    if (!globalAdmin && (!membership || !canManageWorkspaceRole(membership.role))) {
      return Response.json({ error: "Only workspace owners and admins can update this workspace." }, { status: 403 });
    }
    if (!globalAdmin && (input.subscriptionStatus !== undefined || input.subscriptionPlan !== undefined)) {
      return Response.json({ error: "Only app admins can update subscription status." }, { status: 403 });
    }

    const data = workspacePatch(input);
    const updated = await prisma.workspace.update({ where: { id }, data });
    await auditLog({
      userId: access.user.id,
      workspaceId: id,
      action: "workspace.updated",
      metadata: { workspaceId: id, fields: Object.keys(data) }
    });
    return Response.json({ workspace: publicWorkspace(updated, membership ?? undefined) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
