import { z } from "zod";
import { enqueueAutomationJob } from "@/lib/automation-queue";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

const Schema = z.object({ projectId: z.string(), mode: z.enum(["FULL", "EPISODE"]).default("FULL") });

export async function GET() {
  try { const { workspace } = await requireActiveWorkspace(); const jobs = await prisma.automationJob.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 50 }); return Response.json({ jobs }); } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = Schema.parse(await request.json());
    const [project, settings] = await Promise.all([prisma.storyProject.findFirst({ where: { id: input.projectId, workspaceId: workspace.id } }), prisma.userSettings.findUnique({ where: { userId: user.id } })]);
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const result = await enqueueAutomationJob({ userId: user.id, workspaceId: workspace.id, channelId: project.channelId, storyProjectId: project.id, type: "ALWAYS_FINISH_SCRIPT", payload: { mode: input.mode }, idempotencyKey: `always-finish:${project.id}:${project.updatedAt.getTime()}`, priority: project.canonicalSubjectId ? 20 : 10, maxAttempts: 5, runBudgetUsd: Number(settings?.monthlyRunBudgetUsd || 75) });
    return Response.json(result);
  } catch (error) { return jsonError(error, 400); }
}
