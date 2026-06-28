import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  createWorkspaceForUser,
  publicWorkspace,
  requireWorkspace,
  workspaceUsageSummary
} from "@/lib/workspaces";

const CreateWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(120).optional(),
  logoUrl: z.string().trim().optional()
});

export async function GET() {
  try {
    const access = await requireWorkspace({ allowInactive: true });
    const memberships = await prisma.workspaceMembership.findMany({
      where: { userId: access.user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" }
    });

    const [members, invites, usage] = await Promise.all([
      prisma.workspaceMembership.findMany({
        where: { workspaceId: access.workspace.id },
        include: { user: { select: { id: true, name: true, email: true, disabledAt: true, createdAt: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }]
      }),
      access.canManageWorkspace
        ? prisma.workspaceInvite.findMany({
            where: { workspaceId: access.workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: "desc" }
          })
        : [],
      workspaceUsageSummary(access.workspace.id)
    ]);

    return Response.json({
      activeWorkspace: publicWorkspace(access.workspace, access.membership),
      canManageWorkspace: access.canManageWorkspace,
      workspaces: memberships.map((membership) => publicWorkspace(membership.workspace, membership)),
      members: members.map((membership) => ({
        id: membership.id,
        userId: membership.userId,
        role: membership.role,
        createdAt: membership.createdAt,
        user: membership.user
      })),
      invites,
      usage
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = CreateWorkspaceSchema.parse(await request.json());
    const workspace = await createWorkspaceForUser({
      userId: user.id,
      name: input.name,
      tagline: input.tagline,
      logoUrl: input.logoUrl
    });
    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "workspace.created",
      metadata: { workspaceId: workspace.id, name: workspace.name }
    });
    return Response.json({ workspace: publicWorkspace(workspace, { role: "OWNER" }) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
