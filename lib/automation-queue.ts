import "server-only";
import { randomUUID } from "crypto";
import { AutomationJobStatus, type AutomationJob, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const LEASE_MS = 5 * 60_000;

export async function enqueueAutomationJob(input: { userId: string; workspaceId: string; channelId?: string | null; storyProjectId?: string | null; type: string; payload?: Prisma.InputJsonValue; idempotencyKey: string; priority?: number; maxAttempts?: number; runBudgetUsd?: number }) {
  const existing = await prisma.automationJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing && (existing.status === AutomationJobStatus.QUEUED || existing.status === AutomationJobStatus.RUNNING)) return { job: existing, created: false };
  const baseline = await generationSpend(input.workspaceId, input.storyProjectId || undefined);
  const key = existing ? `${input.idempotencyKey}:rerun:${Date.now()}` : input.idempotencyKey;
  const job = await prisma.automationJob.create({ data: { userId: input.userId, workspaceId: input.workspaceId, channelId: input.channelId, storyProjectId: input.storyProjectId, type: input.type, payload: input.payload, idempotencyKey: key, priority: input.priority || 0, maxAttempts: input.maxAttempts || 5, runBudgetUsd: input.runBudgetUsd || 10, runCostBaselineUsd: baseline } });
  return { job, created: true };
}

export async function claimNextAutomationJob(workerId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<AutomationJob[]>`
      SELECT * FROM AutomationJob
      WHERE status = 'QUEUED' AND runAfter <= NOW()
      ORDER BY priority DESC, runAfter ASC, createdAt ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED`;
    const candidate = rows[0];
    if (!candidate) return null;
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const updated = await tx.automationJob.updateMany({ where: { id: candidate.id, status: AutomationJobStatus.QUEUED }, data: { status: AutomationJobStatus.RUNNING, lockedBy: workerId, lockedAt: now, leaseExpiresAt } });
    return updated.count === 1 ? tx.automationJob.findUnique({ where: { id: candidate.id } }) : null;
  }, { isolationLevel: "ReadCommitted" });
}

export async function heartbeatAutomationJob(id: string, workerId: string) {
  const result = await prisma.automationJob.updateMany({ where: { id, status: AutomationJobStatus.RUNNING, lockedBy: workerId }, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
  return result.count === 1;
}

export async function completeAutomationJob(id: string, workerId: string) {
  const result = await prisma.automationJob.updateMany({ where: { id, status: AutomationJobStatus.RUNNING, lockedBy: workerId }, data: { status: AutomationJobStatus.COMPLETED, completedAt: new Date(), lockedBy: null, lockedAt: null, leaseExpiresAt: null } });
  return result.count === 1;
}

export async function failAutomationJob(job: AutomationJob, workerId: string, error: unknown) {
  const attempts = job.attempts + 1;
  const failed = attempts >= job.maxAttempts;
  const backoffMs = Math.min(15 * 60_000, 10_000 * (2 ** Math.max(0, attempts - 1)));
  const result = await prisma.automationJob.updateMany({ where: { id: job.id, status: AutomationJobStatus.RUNNING, lockedBy: workerId }, data: { attempts: { increment: 1 }, status: failed ? AutomationJobStatus.FAILED : AutomationJobStatus.QUEUED, runAfter: failed ? job.runAfter : new Date(Date.now() + backoffMs), lastError: error instanceof Error ? error.message.slice(0, 2000) : "Unknown worker error", lockedBy: null, lockedAt: null, leaseExpiresAt: null } });
  if (failed && job.storyProjectId) await prisma.storyProject.updateMany({ where: { id: job.storyProjectId, workspaceId: job.workspaceId, status: StoryActiveStatus(job.type) }, data: { status: "DOSSIER" } });
  return { applied: result.count === 1, failed };
}

export async function reapExpiredAutomationLeases() {
  const expired = await prisma.automationJob.findMany({ where: { status: AutomationJobStatus.RUNNING, leaseExpiresAt: { lt: new Date() } }, take: 100 });
  let recovered = 0;
  for (const job of expired) {
    const attempts = job.attempts + 1;
    const failed = attempts >= job.maxAttempts;
    const result = await prisma.automationJob.updateMany({ where: { id: job.id, status: AutomationJobStatus.RUNNING, leaseExpiresAt: { lt: new Date() } }, data: { status: failed ? AutomationJobStatus.FAILED : AutomationJobStatus.QUEUED, attempts: { increment: 1 }, runAfter: new Date(Date.now() + 30_000), lastError: "Worker lease expired; job recovered automatically.", lockedBy: null, lockedAt: null, leaseExpiresAt: null } });
    recovered += result.count;
  }
  return recovered;
}

export async function assertFreshRunBudget(job: AutomationJob) {
  const current = await generationSpend(job.workspaceId, job.storyProjectId || undefined);
  const spent = current - Number(job.runCostBaselineUsd);
  if (spent > Number(job.runBudgetUsd)) throw new Error(`Fresh run budget reached after $${spent.toFixed(2)}. Historical usage was preserved.`);
  return { spent, remaining: Math.max(0, Number(job.runBudgetUsd) - spent) };
}

async function generationSpend(workspaceId: string, storyProjectId?: string) { const aggregate = await prisma.generationLog.aggregate({ where: { workspaceId, ...(storyProjectId ? { storyProjectId } : {}) }, _sum: { estimatedCost: true } }); return Number(aggregate._sum.estimatedCost || 0); }
function StoryActiveStatus(type: string): "DRAFTING" { void type; return "DRAFTING"; }
export function workerId(slot: number) { return `policyforge-${process.pid}-${slot}-${randomUUID().slice(0, 8)}`; }
