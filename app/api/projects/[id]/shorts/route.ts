import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ensureNineShortAssets } from "@/lib/short-assets";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({ where: { id, workspaceId: workspace.id }, select: { id: true } });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    const shorts = await prisma.shortAsset.findMany({ where: { storyProjectId: id }, orderBy: { shortIndex: "asc" } });
    return Response.json({ shorts });
  } catch (error) { return jsonError(error); }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { drafts: { where: { passType: "FINAL" }, orderBy: { version: "desc" }, take: 1 } }
    });
    if (!project?.channelId || !project.drafts[0]) return Response.json({ error: "Complete the final long-form script first." }, { status: 400 });
    const shorts = await ensureNineShortAssets({ userId: user.id, workspaceId: workspace.id, channelId: project.channelId, storyProjectId: project.id, title: project.title, script: project.drafts[0].content });
    return Response.json({ shorts });
  } catch (error) { return jsonError(error, 400); }
}
