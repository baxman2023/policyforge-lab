import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { publicWorkspace } from "@/lib/workspaces";
import { z } from "zod";

const AcceptInviteSchema = z.object({
  token: z.string().min(12)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = AcceptInviteSchema.parse(await request.json());
    const email = user.email?.toLowerCase();
    if (!email) {
      return Response.json({ error: "Your account needs an email address before accepting this invite." }, { status: 400 });
    }

    const invite = await prisma.workspaceInvite.findFirst({
      where: {
        token: input.token,
        acceptedAt: null,
        expiresAt: { gt: new Date() }
      },
      include: { workspace: true }
    });
    if (!invite) {
      return Response.json({ error: "This invite is expired or invalid." }, { status: 404 });
    }
    if (invite.email !== email) {
      return Response.json({ error: "This invite was created for a different email address." }, { status: 403 });
    }

    const membership = await prisma.$transaction(async (tx) => {
      const joined = await tx.workspaceMembership.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role },
        update: { role: invite.role }
      });
      await tx.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { activeWorkspaceId: invite.workspaceId } });
      return joined;
    });

    await auditLog({
      userId: user.id,
      workspaceId: invite.workspaceId,
      action: "workspace.invite.accepted",
      metadata: { inviteId: invite.id, role: invite.role }
    });
    return Response.json({ workspace: publicWorkspace(invite.workspace, membership) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
