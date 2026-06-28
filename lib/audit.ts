import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashForAudit } from "@/lib/crypto";

export async function auditLog(input: {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? null,
      workspaceId: input.workspaceId ?? null,
      action: input.action,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      ipHash: hashForAudit(input.ip)
    }
  });
}
