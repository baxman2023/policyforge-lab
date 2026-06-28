import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { generateText } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { projectResearchPrompt } from "@/lib/story-prompts";

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
      include: { storyIdea: true }
    });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const urlNotes = await collectSourceUrlNotes(input.sourceUrls ?? []);
    const existingNotes = [
      input.sourceMaterial ?? project.sourceMaterial ?? "",
      urlNotes ? `Source URL ingestion\n\n${urlNotes}` : ""
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

    await prisma.storyProject.update({
      where: { id: project.id },
      data: { sourceMaterial }
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.researched",
      metadata: { projectId: project.id, model: result.model }
    });
    return Response.json({ notes: result.content, sourceMaterial, modelUsed: result.model });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function collectSourceUrlNotes(urls: string[]) {
  const uniqueUrls = Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean))).slice(0, 6);
  if (!uniqueUrls.length) return "";

  const results = await Promise.all(uniqueUrls.map(async (url) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "PolicyForgeLabResearchBot/1.0",
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
      return `Source: ${url}\nExcerpt:\n${truncateText(cleanWhitespace(text), 3_200)}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fetch failed";
      return `Source: ${url}\nStatus: Could not fetch (${message}).`;
    }
  }));

  return results.join("\n\n");
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
