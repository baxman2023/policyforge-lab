import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { normalizeSponsorBlurbForFormat, normalizeSponsorLanguageForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { ensureIntroSponsorPlacement, ensureOutroSponsorPlacement, stripSponsorCopyFromBody } from "@/lib/sponsor-placement";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "txt" ? "txt" : "md";
    const project = await prisma.storyProject.findFirst({
      where: { id: projectId, workspaceId: workspace.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const intro = project.drafts.find((item) => item.passType === "INTRO");
    const scriptDraft =
      project.drafts.find((item) => item.passType === "FINAL") ??
      project.drafts.find((item) => item.passType === "VOICE_POLISH") ??
      project.drafts.find((item) => item.passType === "REWRITE") ??
      project.drafts.find((item) => item.passType === "DRAFT");
    const fallbackDraft = !intro && !scriptDraft ? project.drafts.find((item) => item.passType !== "OUTRO") ?? project.drafts[0] : undefined;
    const outro = project.drafts.find((item) => item.passType === "OUTRO");
    const rawBody = scriptDraft?.content ?? fallbackDraft?.content;
    const sponsorBlurb = supportsSponsorBlurb(project.format) ? normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format) : null;
    const scriptBody = [
      intro ? normalizeSponsorLanguageForFormat(ensureIntroSponsorPlacement(intro.content, sponsorBlurb), project.format) : undefined,
      rawBody ? normalizeSponsorLanguageForFormat(stripSponsorCopyFromBody(rawBody, sponsorBlurb), project.format) : undefined,
      outro ? normalizeSponsorLanguageForFormat(ensureOutroSponsorPlacement(outro.content, sponsorBlurb), project.format) : undefined
    ].filter(Boolean).join("\n\n");
    const body = format === "txt"
      ? `${project.title}\n\n${scriptBody || "No script output yet."}`
      : `# ${project.title}\n\n${project.storyIdea?.hook ? `> ${project.storyIdea.hook}\n\n` : ""}${scriptBody || "No script output yet."}`;

    return new Response(body, {
      headers: {
        "Content-Type": format === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${format}"`
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
