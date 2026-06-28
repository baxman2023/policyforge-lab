import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireWorkspace } from "@/lib/workspaces";

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [byModel, byPass, recent] = await Promise.all([
      prisma.generationLog.groupBy({
        by: ["modelUsed", "status"],
        where: { workspaceId: workspace.id, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
        orderBy: { _count: { modelUsed: "desc" } },
        take: 12
      }),
      prisma.generationLog.groupBy({
        by: ["passType", "status"],
        where: { workspaceId: workspace.id, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { totalTokens: true, estimatedCost: true },
        orderBy: { _count: { passType: "desc" } },
        take: 16
      }),
      prisma.generationLog.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          storyProjectId: true,
          passType: true,
          modelUsed: true,
          totalTokens: true,
          estimatedCost: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          storyProject: { select: { title: true } }
        }
      })
    ]);

    return Response.json({
      since,
      byModel: byModel.map((row) => ({
        modelUsed: row.modelUsed,
        status: row.status,
        generationCount: row._count._all,
        totalTokens: row._sum.totalTokens ?? 0,
        estimatedCost: Number(row._sum.estimatedCost ?? 0)
      })),
      byPass: byPass.map((row) => ({
        passType: row.passType,
        status: row.status,
        generationCount: row._count._all,
        totalTokens: row._sum.totalTokens ?? 0,
        estimatedCost: Number(row._sum.estimatedCost ?? 0)
      })),
      recent: recent.map((row) => ({
        id: row.id,
        storyProjectId: row.storyProjectId,
        projectTitle: row.storyProject?.title ?? null,
        passType: row.passType,
        modelUsed: row.modelUsed,
        totalTokens: row.totalTokens,
        estimatedCost: Number(row.estimatedCost ?? 0),
        status: row.status,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}
