import { buildUploadReadinessPackage } from "@/lib/creator-intelligence";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 100 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 48 }
      }
    });

    if (!project) return Response.json({ error: "Story project not found." }, { status: 404 });

    const metrics = project.channelId
      ? await prisma.youtubeVideoMetric.findMany({
          where: { workspaceId: workspace.id, channelId: project.channelId },
          orderBy: { periodEnd: "desc" },
          take: 300
        })
      : [];
    const uploadPackage = buildUploadReadinessPackage(project, metrics);

    if (format === "markdown") {
      return new Response(uploadPackage.markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${uploadPackageFilename(project.title)}"`
        }
      });
    }

    return Response.json({ uploadPackage });
  } catch (error) {
    return jsonError(error);
  }
}

function uploadPackageFilename(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "upload-package";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-youtube-upload-package-${stamp}.md`;
}
