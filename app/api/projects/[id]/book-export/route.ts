import {
  bookExportFilename,
  buildIllustratedBookEpub,
  buildIllustratedBookPdf,
  isBookExportFormat
} from "@/lib/book-export";
import { latestBodyDraft } from "@/lib/content-pack";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") === "epub" ? "epub" : "pdf";
    const authorName = (searchParams.get("author") || "").trim();
    if (!authorName) {
      return Response.json({ error: "Author name is required before exporting a book." }, { status: 400 });
    }
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        drafts: { orderBy: { createdAt: "desc" }, take: 80 },
        thumbnails: { orderBy: [{ variant: "asc" }, { createdAt: "asc" }], take: 48 }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (!isBookExportFormat(project.format)) {
      return Response.json({ error: "Illustrated book export is only available for Short Book and Long Form Book projects." }, { status: 400 });
    }
    if (!latestBodyDraft(project.drafts)) {
      return Response.json({ error: "Run the book workflow before exporting." }, { status: 400 });
    }

    const body = format === "epub"
      ? await buildIllustratedBookEpub(project, { authorName })
      : await buildIllustratedBookPdf(project, { authorName });
    const contentType = format === "epub" ? "application/epub+zip" : "application/pdf";
    const filename = bookExportFilename(project.title, format);

    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
