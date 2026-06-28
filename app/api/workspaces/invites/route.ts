import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { createWorkspaceInvite, publicWorkspace, requireWorkspace, requireWorkspaceManager } from "@/lib/workspaces";
import { jsonError } from "@/lib/http";

const InviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.nativeEnum(WorkspaceRole).default(WorkspaceRole.MEMBER)
});

export async function POST(request: Request) {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    requireWorkspaceManager(access);
    const input = InviteSchema.parse(await request.json());
    if (input.role === WorkspaceRole.OWNER && access.membership.role !== WorkspaceRole.OWNER && access.user.role !== "ADMIN") {
      return Response.json({ error: "Only workspace owners can invite another owner." }, { status: 403 });
    }

    const invite = await createWorkspaceInvite({
      workspaceId: access.workspace.id,
      invitedByUserId: access.user.id,
      email: input.email,
      role: input.role
    });
    await auditLog({
      userId: access.user.id,
      workspaceId: access.workspace.id,
      action: "workspace.invite.created",
      metadata: { inviteId: invite.id, email: invite.email, role: invite.role }
    });

    return Response.json({
      invite,
      workspace: publicWorkspace(access.workspace, access.membership),
      inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://phpstack-1305612-6519184.cloudwaysapps.com"}/login?invite=${invite.token}`
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
