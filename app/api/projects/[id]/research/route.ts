import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { generateText } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { projectResearchPrompt } from "@/lib/story-prompts";
import { canonicalSubjectKey } from "@/lib/upgrade-domain";

const ResearchSchema = z.object({
  sourceMaterial: z.string().optional(),
  sourceUrls: z.array(z.string().url()).max(8).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`research:${user.id}`, 8, 60_000);
    if (!limit.ok) {
      return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
    }

    const { id } = await context.params;
    const input = ResearchSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { storyIdea: true, canonicalSubject: true }
    });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const subjectKey = canonicalSubjectKey({ title: project.title, eventName: project.storyIdea?.eventName, category: project.storyIdea?.category });
    const canonicalChannelId = project.channelId || (await fallbackChannelId(workspace.id));
    const canonical = project.canonicalSubject ?? await prisma.canonicalSubject.upsert({
      where: { workspaceId_channelId_subjectKey: { workspaceId: workspace.id, channelId: canonicalChannelId, subjectKey } },
      update: {},
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        channelId: canonicalChannelId,
        subjectKey,
        canonicalName: project.storyIdea?.eventName || project.title,
        aliases: [project.title]
      }
    });
    if (!project.canonicalSubjectId) {
      await prisma.storyProject.update({ where: { id: project.id }, data: { canonicalSubjectId: canonical.id } });
    }
    if (!canonical.verifiedAt) {
      const claimed = await prisma.canonicalSubject.updateMany({ where: { id: canonical.id, OR: [{ researchLeaseUntil: null }, { researchLeaseUntil: { lt: new Date() } }, { researchLeaseProjectId: project.id }] }, data: { researchLeaseProjectId: project.id, researchLeaseUntil: new Date(Date.now() + 10 * 60_000) } });
      if (!claimed.count) return Response.json({ error: "The primary subject dossier is being completed by a sibling episode. Retry after it becomes reusable." }, { status: 409 });
    }
    const processedUrls = stringArray(canonical.processedSourceUrls);
    const newUrls = Array.from(new Set(input.sourceUrls ?? [])).filter((url) => !processedUrls.includes(url));
    const urlNotes = await collectSourceUrlNotes(newUrls, `${project.title} ${project.storyIdea?.summary || ""}`);
    const reusableEvidence = canonical.approvedClaims || canonical.evidence || canonical.verifiedSources
      ? `Canonical subject dossier (reused; do not re-extract):\n${JSON.stringify({ verifiedSources: canonical.verifiedSources, approvedClaims: canonical.approvedClaims, quotations: canonical.quotations, classifications: canonical.classifications, evidence: canonical.evidence })}`
      : "";
    const existingNotes = [
      input.sourceMaterial ?? project.sourceMaterial ?? "",
      reusableEvidence,
      urlNotes ? `New source URL ingestion (delta only)\n\n${urlNotes}` : ""
    ].filter((item) => item.trim()).join("\n\n---\n\n");

    const result = await generateText({
      userId: user.id,
      workspaceId: workspace.id,
      storyProjectId: project.id,
      passType: "RESEARCH",
      messages: [
        {
          role: "user",
          content: projectResearchPrompt({
            title: project.title,
            hook: project.storyIdea?.hook,
            summary: project.storyIdea?.summary,
            category: project.storyIdea?.category,
            location: project.storyIdea?.location,
            eventName: project.storyIdea?.eventName,
            format: project.format,
            targetLengthMinutes: project.targetLengthMinutes,
            targetWordCount: project.targetWordCount,
            tone: project.tone,
            narrationStyle: project.narrationStyle,
            existingNotes
          })
        }
      ],
      temperature: 0.35,
      maxTokens: 3500
    });

    const researchBlock = `Source Pack / Research brief (${result.model})\n\n${result.content.trim()}`;
    const sourceMaterial = existingNotes.trim() ? `${existingNotes.trim()}\n\n---\n\n${researchBlock}` : researchBlock;

    const madeProgress = newUrls.length > 0 || !canonical.verifiedAt;
    await prisma.$transaction([
      prisma.storyProject.update({ where: { id: project.id }, data: { sourceMaterial, canonicalSubjectId: canonical.id } }),
      prisma.canonicalSubject.update({
        where: { id: canonical.id },
        data: {
          verifiedSources: mergeJsonArray(canonical.verifiedSources, newUrls.map((url) => ({ url, addedAt: new Date().toISOString() }))),
          approvedClaims: mergeJsonArray(canonical.approvedClaims, [{ projectId: project.id, researchBrief: result.content.trim() }]),
          evidence: mergeJsonArray(canonical.evidence, [{ projectId: project.id, model: result.model, deltaSourceCount: newUrls.length }]),
          processedSourceUrls: Array.from(new Set([...processedUrls, ...newUrls])),
          verifiedAt: new Date(),
          noProgressCount: madeProgress ? 0 : { increment: 1 },
          searchStrategy: madeProgress ? canonical.searchStrategy : nextSearchStrategy(canonical.searchStrategy),
          researchLeaseProjectId: null,
          researchLeaseUntil: null
        }
      })
    ]);

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.researched",
      metadata: { projectId: project.id, model: result.model, canonicalSubjectId: canonical.id, reusedCanonicalDossier: Boolean(reusableEvidence), deltaSourceCount: newUrls.length }
    });
    return Response.json({ notes: result.content, sourceMaterial, modelUsed: result.model });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function fallbackChannelId(workspaceId: string) {
  const channel = await prisma.channel.findFirst({ where: { workspaceId, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!channel) throw new Error("Create a channel before researching this project.");
  return channel.id;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mergeJsonArray(existing: unknown, additions: unknown[]) {
  return [...(Array.isArray(existing) ? existing : []), ...additions];
}

function nextSearchStrategy(current: string) {
  if (current === "authoritative-first") return "regulator-and-primary-documents";
  if (current === "regulator-and-primary-documents") return "named-entity-and-date";
  return "alternate-provider-and-query";
}

async function collectSourceUrlNotes(urls: string[], relevanceQuery: string) {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean))).slice(0, 6);
  if (!uniqueUrls.length) return "";

  const results = await Promise.all(uniqueUrls.map(async (url) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "BaxterGrowthLabResearchBot/1.0",
          "Accept": "text/html,text/plain,application/xhtml+xml"
        },
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) {
        return `Source: ${url}\nStatus: Could not fetch (${response.status}).`;
      }
      const contentType = response.headers.get("content-type") || "";
      const raw = await response.text();
      const text = contentType.includes("html") ? stripHtml(raw) : raw;
      return `Source: ${url}\nRelevance-focused excerpt:\n${relevanceExcerpt(text, relevanceQuery, 3_200)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      return `Source: ${url}\nStatus: Could not fetch (${message}).`;
    }
  }));

  return results.join("\n\n");
}

function relevanceExcerpt(value: string, query: string, maxLength: number) {
  const terms = new Set(query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((term) => term.length > 3));
  const paragraphs = value.split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/).map(cleanWhitespace).filter((part) => part.length > 40);
  const ranked = paragraphs.map((part, index) => ({ part, index, score: [...terms].reduce((sum, term) => sum + (part.toLowerCase().includes(term) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const selected: string[] = [];
  let length = 0;
  for (const item of ranked) { if (length + item.part.length > maxLength && selected.length) continue; selected.push(item.part); length += item.part.length + 2; if (length >= maxLength) break; }
  return truncateText(selected.join("\n\n") || cleanWhitespace(value), maxLength);
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}
