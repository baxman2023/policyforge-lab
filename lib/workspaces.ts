import "server-only";
import { randomBytes } from "crypto";
import type { Prisma, UserRole, Workspace, WorkspaceMembership } from "@prisma/client";
import { WorkspaceRole, WorkspaceSubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, requireUser } from "@/lib/session";
import { getOrCreateUserSettings } from "@/lib/settings";
import { slugify } from "@/lib/utils";

const ACTIVE_WORKSPACE_STATUSES = new Set<WorkspaceSubscriptionStatus>([
  WorkspaceSubscriptionStatus.ACTIVE,
  WorkspaceSubscriptionStatus.TRIALING
]);

export type WorkspaceAccess = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: UserRole;
    disabledAt?: null;
  };
  workspace: Workspace;
  membership: WorkspaceMembership;
  canManageWorkspace: boolean;
};

export function isWorkspaceActive(workspace: Pick<Workspace, "subscriptionStatus">) {
  return ACTIVE_WORKSPACE_STATUSES.has(workspace.subscriptionStatus);
}

export function canManageWorkspaceRole(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

export async function requireWorkspace(options: { allowInactive?: boolean } = {}): Promise<WorkspaceAccess> {
  const user = await requireUser();
  const { workspace, membership } = await ensureUserWorkspace(user.id);
  const adminBypass = user.role === "ADMIN";
  if (!options.allowInactive && !adminBypass && !isWorkspaceActive(workspace)) {
    throw new ForbiddenError("This workspace subscription is inactive. Contact the workspace owner to reactivate access.");
  }

  return {
    user,
    workspace,
    membership,
    canManageWorkspace: canManageWorkspaceRole(membership.role) || adminBypass
  };
}

export function requireWorkspaceManager(access: WorkspaceAccess) {
  if (!access.canManageWorkspace) {
    throw new ForbiddenError("Only workspace owners and admins can manage this workspace.");
  }
}

export function requireActiveWorkspace() {
  return requireWorkspace({ allowInactive: false });
}

export async function ensureUserWorkspace(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      activeWorkspace: true,
      workspaceMemberships: {
        include: { workspace: true },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!user || user.disabledAt) {
    throw new ForbiddenError("This account is unavailable.");
  }

  const activeMembership = user.activeWorkspaceId
    ? user.workspaceMemberships.find((item) => item.workspaceId === user.activeWorkspaceId)
    : null;
  if (activeMembership?.workspace) {
    await backfillWorkspaceAssets(userId, activeMembership.workspaceId);
    return { workspace: activeMembership.workspace, membership: activeMembership };
  }

  const firstMembership = user.workspaceMemberships[0];
  if (firstMembership?.workspace) {
    await prisma.user.update({
      where: { id: userId },
      data: { activeWorkspaceId: firstMembership.workspaceId }
    });
    await backfillWorkspaceAssets(userId, firstMembership.workspaceId);
    return { workspace: firstMembership.workspace, membership: firstMembership };
  }

  return createDefaultWorkspaceForUser(userId);
}

export async function switchActiveWorkspace(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMembership.findFirst({
    where: { userId, workspaceId },
    include: { workspace: true }
  });
  if (!membership) throw new ForbiddenError("You do not have access to that workspace.");
  await prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: workspaceId } });
  await backfillWorkspaceAssets(userId, workspaceId);
  return { workspace: membership.workspace, membership };
}

export async function createWorkspaceForUser(input: {
  userId: string;
  name: string;
  tagline?: string | null;
  logoUrl?: string | null;
}) {
  const cleanName = input.name.trim();
  if (cleanName.length < 2) throw new Error("Workspace name must be at least 2 characters.");
  const workspace = await prisma.workspace.create({
    data: {
      name: cleanName,
      slug: await uniqueWorkspaceSlug(cleanName),
      tagline: input.tagline?.trim() || "AI Script Engine",
      logoUrl: input.logoUrl?.trim() || null,
      memberships: {
        create: {
          userId: input.userId,
          role: WorkspaceRole.OWNER
        }
      }
    }
  });
  await prisma.user.update({ where: { id: input.userId }, data: { activeWorkspaceId: workspace.id } });
  return workspace;
}

export async function backfillWorkspaceAssets(userId: string, workspaceId: string) {
  await prisma.$transaction([
    prisma.channel.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } }),
    prisma.storyIdea.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } }),
    prisma.storyProject.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } }),
    prisma.publishingSlot.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } }),
    prisma.generationLog.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } }),
    prisma.auditLog.updateMany({ where: { userId, workspaceId: null }, data: { workspaceId } })
  ]);
}

export async function workspaceUsageSummary(workspaceId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [
    ideaCount,
    projectCount,
    channelCount,
    memberCount,
    generations,
    recentGenerations,
    usageByUser
  ] = await Promise.all([
    prisma.storyIdea.count({ where: { workspaceId } }),
    prisma.storyProject.count({ where: { workspaceId } }),
    prisma.channel.count({ where: { workspaceId, archivedAt: null } }),
    prisma.workspaceMembership.count({ where: { workspaceId } }),
    prisma.generationLog.aggregate({
      where: { workspaceId },
      _count: { _all: true },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCost: true }
    }),
    prisma.generationLog.count({ where: { workspaceId, createdAt: { gte: since } } }),
    prisma.generationLog.groupBy({
      by: ["userId"],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalTokens: true, estimatedCost: true }
    })
  ]);

  const userIds = usageByUser.map((row) => row.userId);
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const userById = new Map(users.map((item) => [item.id, item]));

  return {
    ideaCount,
    projectCount,
    channelCount,
    memberCount,
    generationCount: generations._count._all,
    recentGenerationCount: recentGenerations,
    promptTokens: generations._sum.promptTokens ?? 0,
    completionTokens: generations._sum.completionTokens ?? 0,
    totalTokens: generations._sum.totalTokens ?? 0,
    estimatedCost: Number(generations._sum.estimatedCost ?? 0),
    byUser: usageByUser.map((row) => {
      const rowUser = userById.get(row.userId);
      return {
        userId: row.userId,
        name: rowUser?.name ?? rowUser?.email ?? "Team member",
        email: rowUser?.email ?? null,
        generationCount: row._count._all,
        totalTokens: row._sum.totalTokens ?? 0,
        estimatedCost: Number(row._sum.estimatedCost ?? 0)
      };
    })
  };
}

export async function createWorkspaceInvite(input: {
  workspaceId: string;
  invitedByUserId: string;
  email: string;
  role: WorkspaceRole;
}) {
  const cleanEmail = input.email.trim().toLowerCase();
  if (!cleanEmail.includes("@")) throw new Error("Enter a valid invite email.");
  return prisma.workspaceInvite.create({
    data: {
      workspaceId: input.workspaceId,
      invitedByUserId: input.invitedByUserId,
      email: cleanEmail,
      role: input.role,
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });
}

async function createDefaultWorkspaceForUser(userId: string) {
  const [user, settings] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    getOrCreateUserSettings(userId)
  ]);
  const name = settings.workspaceName || user?.name || user?.email?.split("@")[0] || "Main Workspace";
  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug: await uniqueWorkspaceSlug(name),
      tagline: settings.workspaceTagline || "AI Script Engine",
      logoUrl: settings.workspaceLogoUrl || null,
      memberships: { create: { userId, role: WorkspaceRole.OWNER } }
    }
  });
  const membership = await prisma.workspaceMembership.findFirstOrThrow({
    where: { workspaceId: workspace.id, userId }
  });
  await prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: workspace.id } });
  await backfillWorkspaceAssets(userId, workspace.id);
  return { workspace, membership };
}

async function uniqueWorkspaceSlug(name: string) {
  const base = slugify(name) || "workspace";
  let slug = base;
  let index = 2;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

export function publicWorkspace(workspace: Workspace, membership?: Pick<WorkspaceMembership, "role">) {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    tagline: workspace.tagline,
    logoUrl: workspace.logoUrl,
    customDomain: workspace.customDomain,
    subscriptionStatus: workspace.subscriptionStatus,
    subscriptionPlan: workspace.subscriptionPlan,
    setupCompletedAt: workspace.setupCompletedAt,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    role: membership?.role
  };
}

export function workspacePatch(input: {
  name?: string;
  tagline?: string;
  logoUrl?: string | null;
  customDomain?: string | null;
  subscriptionStatus?: WorkspaceSubscriptionStatus;
  subscriptionPlan?: string | null;
  setupCompleted?: boolean;
}): Prisma.WorkspaceUpdateInput {
  const data: Prisma.WorkspaceUpdateInput = {};
  if (input.name !== undefined) {
    data.name = input.name.trim();
  }
  if (input.tagline !== undefined) {
    data.tagline = input.tagline.trim() || "AI Script Engine";
  }
  if (input.logoUrl !== undefined) {
    data.logoUrl = input.logoUrl?.trim() || null;
  }
  if (input.customDomain !== undefined) {
    data.customDomain = input.customDomain?.trim() || null;
  }
  if (input.subscriptionStatus !== undefined) {
    data.subscriptionStatus = input.subscriptionStatus;
  }
  if (input.subscriptionPlan !== undefined) {
    data.subscriptionPlan = input.subscriptionPlan?.trim() || null;
  }
  if (input.setupCompleted !== undefined) {
    data.setupCompletedAt = input.setupCompleted ? new Date() : null;
  }
  return data;
}
