import { ScriptPassType, type ScriptDraft } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { generateText } from "@/lib/openrouter";
import { normalizePublishingPack, parsePublishingPack } from "@/lib/publishing-pack";
import { prisma } from "@/lib/prisma";
import { formatDraftForResponse } from "@/lib/project-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { estimatedMinutesFromWords, wordCount } from "@/lib/utils";
import { formatPublishingPackContent } from "@/lib/youtube-description";

const PublishingDescriptionSchema = z.object({
  sponsorBlurb: z.string().optional(),
  sponsorLink: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`publishing-description:${user.id}`, 8, 60_000);
    if (!limit.ok) {
      return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
    }

    const { id } = await context.params;
    const input = PublishingDescriptionSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { storyIdea: true, drafts: { orderBy: { createdAt: "desc" }, take: 50 } }
    });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format === "ARTICLE" || project.format === "PODCAST_EPISODE" || project.format === "SHORT_BOOK" || project.format === "LONG_BOOK") {
      return Response.json({ error: "Description regeneration is only available for video Publishing Packs." }, { status: 400 });
    }

    const latestPackDraft = latestDraft(project.drafts, ScriptPassType.PUBLISHING_PACK);
    if (!latestPackDraft) {
      return Response.json({ error: "Create a Publishing Pack before regenerating the video description." }, { status: 400 });
    }

    const pack = parsePublishingPack(latestPackDraft.content);
    const sponsorBlurb = input.sponsorBlurb ?? project.sponsorBlurb ?? "";
    const sponsorLink = input.sponsorLink ?? project.sponsorLink ?? "";
    const actualLengthMinutes = actualScriptMinutesForPublishing(project.drafts, project.targetLengthMinutes);
    const result = await generateText({
      userId: user.id,
      workspaceId: workspace.id,
      storyProjectId: project.id,
      passType: ScriptPassType.PUBLISHING_PACK,
      messages: [
        {
          role: "user",
          content: publishingDescriptionPrompt({
            title: project.title,
            summary: project.storyIdea?.summary ?? "",
            hook: project.storyIdea?.hook ?? "",
            targetLengthMinutes: project.targetLengthMinutes,
            actualLengthMinutes,
            sponsorBlurb,
            sponsorLink,
            existingTitles: pack.titles.map((item) => item.title),
            existingTags: pack.tags,
            scriptContext: publishingDescriptionContext(project.drafts)
          })
        }
      ],
      temperature: 0.5,
      maxTokens: 2200
    });

    const description = cleanDescription(result.content);
    if (!description) throw new Error("The regenerated video description was empty.");

    const content = formatPublishingPackContent(
      normalizePublishingPack(JSON.stringify({ ...pack, description })),
      {
        title: project.title,
        sponsorBlurb,
        sponsorLink,
        summary: project.storyIdea?.summary,
        hook: project.storyIdea?.hook,
        targetLengthMinutes: project.targetLengthMinutes,
        actualLengthMinutes
      }
    );
    const words = wordCount(content);
    const draft = await prisma.scriptDraft.create({
      data: {
        storyProjectId: project.id,
        version: latestPackDraft.version + 1,
        passType: ScriptPassType.PUBLISHING_PACK,
        modelUsed: result.model,
        content,
        wordCount: words,
        estimatedMinutes: estimatedMinutesFromWords(words)
      }
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.publishing_description_regenerated",
      metadata: { projectId: project.id, model: result.model }
    });

    return Response.json({ draft: formatDraftForResponse(draft, { ...project, sponsorBlurb, sponsorLink }), description });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function publishingDescriptionPrompt(input: {
  title: string;
  summary: string;
  hook: string;
  targetLengthMinutes: number;
  actualLengthMinutes: number;
  sponsorBlurb: string;
  sponsorLink: string;
  existingTitles: string[];
  existingTags: string[];
  scriptContext: string;
}) {
  const sponsorLink = input.sponsorLink.trim();
  const sponsorText = input.sponsorBlurb.trim() || "No sponsor blurb provided.";
  const sponsorLinkText = sponsorLink || "No sponsor link provided.";

  return `Regenerate ONLY the YouTube video description for this Publishing Pack.

Return plain text only. Do not return JSON. Do not include Markdown fences. Do not regenerate titles, tags, thumbnail prompts, or pinned comments.

Story title:
${input.title}

Story hook:
${input.hook || "No hook provided."}

Story summary:
${input.summary || "No summary provided."}

Target length:
${input.targetLengthMinutes} minutes

Actual finished script length:
About ${input.actualLengthMinutes} minutes based on the saved script word count

Existing title options:
${input.existingTitles.map((title, index) => `${index + 1}. ${title}`).join("\n") || "No title options provided."}

Existing tags:
${input.existingTags.join(", ") || "No tags provided."}

Sponsor blurb:
${sponsorText}

Sponsor link:
${sponsorLinkText}

Script and story context:
${input.scriptContext || "No finished script context provided."}

Required output formula, separated by blank lines:
1. MAIN KEYWORD: one search-focused phrase for the video. Do not label it. No hashtag.
2. CTA LINK: if a sponsor link is provided, write a short direct sponsor CTA and include the exact sponsor link. If no sponsor link is provided, use a brief subscribe/comment CTA with no fake URL.
3. DESCRIPTION PART 1: two to four sentences that hook the viewer and summarize the central story.
4. TIMESTAMPS: include a "Timestamps:" heading and five to eight estimated timestamps in MM:SS format for major story beats. Base them on the actual finished script length above, not the requested target length.
5. DESCRIPTION PART 2: two to four sentences with deeper context, stakes, and what the viewer will learn, without unsupported claims.
6. CTA WITH LINK: if a sponsor link is provided, repeat the exact sponsor link with a clear CTA. If no sponsor link is provided, use a like/subscribe/comment CTA with no fake URL.
7. HASHTAGS: one final line containing only three to five relevant hashtags.

Rules:
- Do not add labels such as "MAIN KEYWORD", "DESCRIPTION PART 1", or "CTA WITH LINK"; output the actual YouTube-ready description text.
- Preserve factual caution. Do not present speculation as fact.
- Do not create timestamps beyond the actual finished script length.
- If a sponsor link is provided, include this exact URL twice: ${sponsorLink || "no sponsor link"}.
- If no sponsor link is provided, do not invent one.
- The last line must contain only three to five hashtags.`;
}

function publishingDescriptionContext(drafts: ScriptDraft[]) {
  const intro = latestDraft(drafts, ScriptPassType.INTRO);
  const script = latestDraft(drafts, ScriptPassType.FINAL) ?? latestDraft(drafts, ScriptPassType.VOICE_POLISH) ?? latestDraft(drafts, ScriptPassType.REWRITE) ?? latestDraft(drafts, ScriptPassType.DRAFT);
  const outro = latestDraft(drafts, ScriptPassType.OUTRO);
  const storySpine = latestDraft(drafts, ScriptPassType.STORY_SPINE);
  const parts = [
    intro ? draftExcerpt("Intro", intro) : "",
    script ? draftExcerpt("Finished script", script, 12000) : "",
    outro ? draftExcerpt("Outro", outro) : "",
    storySpine ? draftExcerpt("Story spine", storySpine, 4000) : ""
  ].filter(Boolean);
  return parts.join("\n\n---\n\n");
}

function latestDraft(drafts: ScriptDraft[], passType: ScriptPassType) {
  return drafts.find((draft) => draft.passType === passType);
}

function actualScriptMinutesForPublishing(drafts: ScriptDraft[], fallbackMinutes: number) {
  const body = latestDraft(drafts, ScriptPassType.FINAL) ?? latestDraft(drafts, ScriptPassType.VOICE_POLISH) ?? latestDraft(drafts, ScriptPassType.REWRITE) ?? latestDraft(drafts, ScriptPassType.DRAFT);
  if (!body) return fallbackMinutes;
  return estimatedMinutesFromWords(body.wordCount);
}

function draftExcerpt(label: string, draft: ScriptDraft, maxLength = 2500) {
  const content = draft.content.length > maxLength ? `${draft.content.slice(0, maxLength).trim()}...` : draft.content;
  return `${label} (${draft.passType} v${draft.version}):\n${content}`;
}

function cleanDescription(content: string) {
  return content
    .replace(/```(?:text|md|markdown)?/gi, "")
    .replace(/```/g, "")
    .trim();
}
