import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const [users, generations, logs] = await Promise.all([
      prisma.user.count(),
      prisma.generationLog.count(),
      prisma.generationLog.groupBy({
        by: ["status"],
        _sum: { totalTokens: true, estimatedCost: true },
        _count: true
      })
    ]);

    return Response.json({ users, generations, logs });
  } catch (error) {
    return jsonError(error);
  }
}
