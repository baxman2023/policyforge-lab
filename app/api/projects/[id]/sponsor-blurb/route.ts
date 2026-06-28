import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { generateJson } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { normalizeSponsorBlurbForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { formatProjectForResponse } from "@/lib/project-response";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveWorkspace } from "@/lib/workspaces";

const SponsorBlurbSchema = z.object({
  url: z.string().trim().min(3)
});

type SponsorBlurbResult = {
  sponsorName?: string;
  offerSummary?: string;
  sponsorBlurb?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`sponsor-blurb:${user.id}`, 6, 60_000);
    if (!limit.ok) return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });

    const { id } = await context.params;
    const input = SponsorBlurbSchema.parse(await request.json());
    const sponsorLink = normalizeSponsorUrl(input.url);
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { storyIdea: true }
    });
    if (!project) return Response.json({ error: "Story project not found." }, { status: 404 });
    if (!supportsSponsorBlurb(project.format)) {
      return Response.json({ error: "Sponsor blurbs are disabled for short and long form book projects." }, { status: 400 });
    }

    const offerPage = await fetchOfferPageText(sponsorLink);
    const prompt = sponsorPromptForFormat({
      format: project.format,
      title: project.title,
      hook: project.storyIdea?.hook || "Not provided",
      sponsorLink,
      offerPage
    });
    const result = await generateJson<SponsorBlurbResult>({
      userId: user.id,
      workspaceId: workspace.id,
      storyProjectId: project.id,
      passType: "RESEARCH",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.55,
      maxTokens: 1200
    });

    const sponsorBlurb = normalizeSponsorBlurbForFormat(cleanSponsorBlurb(result.data.sponsorBlurb), project.format);
    if (!sponsorBlurb) {
      return Response.json({ error: "The AI did not return a usable sponsor blurb. Try a different URL." }, { status: 400 });
    }

    const updatedProject = await prisma.storyProject.update({
      where: { id: project.id },
      data: {
        sponsorBlurb,
        sponsorLink
      },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 50 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 24 },
        publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 },
        publishedStories: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.sponsor_blurb_generated",
      metadata: {
        projectId: project.id,
        sponsorLink,
        model: result.model,
        sponsorName: result.data.sponsorName,
        offerSummary: result.data.offerSummary
      }
    });

    return Response.json({
      project: formatProjectForResponse(updatedProject),
      sponsorBlurb,
      sponsorLink,
      modelUsed: result.model
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function normalizeSponsorUrl(value: string) {
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(normalized);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Sponsor URL must start with http:// or https://.");
  }
  if (isUnsafeHostname(url.hostname)) {
    throw new Error("Sponsor URL must point to a public website.");
  }
  url.hash = "";
  return url.toString();
}

function isUnsafeHostname(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d{1,2})\./);
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31);
}

async function fetchOfferPageText(url: string) {
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) return "";
    const raw = (await response.text()).slice(0, 250_000);
    return htmlToText(raw).slice(0, 24_000);
  } catch {
    return "";
  }
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    let nextUrl = url;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(nextUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent": "BaxterGrowthLabSponsorBlurbBot/1.0",
          Accept: "text/html,text/plain;q=0.9,*/*;q=0.5"
        }
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      nextUrl = normalizeSponsorUrl(new URL(location, nextUrl).toString());
    }

    return await fetch(nextUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": "BaxterGrowthLabSponsorBlurbBot/1.0",
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.5"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function htmlToText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    "";
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtml(`${title}\n${description}\n${body}`)
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function cleanSponsorBlurb(value?: string) {
  return (value || "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s*\n+\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sponsorPromptForFormat(input: {
  format: string;
  title: string;
  hook: string;
  sponsorLink: string;
  offerPage: string;
}) {
  const offerNotes = input.offerPage || "The offer page could not be read. Use only the URL/domain and avoid inventing specific claims, prices, discounts, guarantees, or features not shown.";
  const shared = `Story title: ${input.title}
Story hook: ${input.hook}
Sponsor URL: ${input.sponsorLink}

Offer page notes:
${offerNotes}

Return strict JSON with this shape:
{
  "sponsorName": "brand or offer name",
  "offerSummary": "one sentence summary of the offer",
  "sponsorBlurb": "one paragraph sponsor message"
}

Rules:
- Keep sponsorBlurb between 55 and 95 words.
- Make it sound human, direct, and credible, not hypey.
- Do not invent a discount code, price, guarantee, endorsement, medical claim, financial claim, legal claim, or result claim.
- Do not mention that this was generated from a URL.`;

  if (input.format === "ARTICLE") {
    return `Create a sponsor blurb for a researched online article.

${shared}

Article-specific rules:
- The sponsorBlurb must be one natural paragraph for readers, not a spoken narrator.
- It may say "This article is sponsored by..." or "Today's article is supported by..." if that sounds natural.
- Refer to readers, not viewers or listeners.
- Mention that readers can learn more through the link included with the article.
- Do not say video, episode, channel, watch, listen, show notes, or link in the description.
- If the page content is thin, write a safer general blurb based on the domain and say readers can learn more through the link included with the article.`;
  }

  if (input.format === "PODCAST_EPISODE") {
    return `Create a sponsor blurb for a narrative podcast episode.

${shared}

Podcast-specific rules:
- The sponsorBlurb must be one natural spoken paragraph for a podcast host or narrator.
- It may say "This episode is brought to you by..." if that sounds natural.
- Refer to listeners, not viewers or readers.
- Mention that the link is in the show notes, but do not read the raw URL aloud.
- Do not say video, channel, watch, article, or link in the description.
- If the page content is thin, write a safer general blurb based on the domain and say listeners can learn more through the link in the show notes.`;
  }

  return `Create a sponsor blurb for a long-form YouTube documentary video.

${shared}

Video-specific rules:
- The sponsorBlurb must be one natural spoken paragraph for a narrator.
- It may say "This video is brought to you by..." if that sounds natural.
- Refer to viewers, not readers or podcast listeners.
- Mention that the link is in the description, but do not read the raw URL aloud.
- Do not say article, podcast, show notes, or reader.
- If the page content is thin, write a safer general blurb based on the domain and say viewers can learn more through the link in the description.`;
}
