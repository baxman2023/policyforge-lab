import { z } from "zod";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { scoreTrend, underlyingEventKey } from "@/lib/upgrade-domain";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("scan"), channelId: z.string() }),
  z.object({ action: z.literal("select"), ids: z.array(z.string()).min(1).max(20) }),
  z.object({ action: z.literal("create-videos"), ids: z.array(z.string()).min(1).max(20) })
]);

export async function GET(request: Request) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const channelId = new URL(request.url).searchParams.get("channelId") || undefined;
    const trends = await prisma.trendOpportunity.findMany({ where: { workspaceId: workspace.id, status: { notIn: ["COMPLETED", "DISMISSED"] }, ...(channelId ? { channelId } : {}) }, orderBy: [{ score: "desc" }, { createdAt: "desc" }] });
    return Response.json({ trends });
  } catch (error) { return jsonError(error); }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ActionSchema.parse(await request.json());
    if (input.action === "scan") {
      const channel = await prisma.channel.findFirst({ where: { id: input.channelId, workspaceId: workspace.id } });
      if (!channel) return Response.json({ error: "Channel not found." }, { status: 404 });
      const terms = trendTerms(channel.sourceFoundation, channel.name);
      const articles = await fetchTrendArticles(terms.slice(0, 3));
      const clustered = new Map<string, typeof articles>();
      for (const article of articles) {
        const key = underlyingEventKey(article.title, [article.url]);
        const bucket = clustered.get(key) || [];
        bucket.push(article);
        clustered.set(key, bucket);
      }
      for (const [eventKey, group] of clustered) {
        const first = group[0];
        if (!first) continue;
        const score = scoreTrend({ channelText: `${channel.name} ${channel.description || ""}`, title: first.title, summary: first.summary, freshnessHours: first.publishedAt ? (Date.now() - new Date(first.publishedAt).getTime()) / 36e5 : null, sourceCount: group.length });
        await prisma.trendOpportunity.upsert({
          where: { workspaceId_channelId_eventKey: { workspaceId: workspace.id, channelId: channel.id, eventKey } },
          update: { headline: first.title, summary: first.summary || first.title, sourceUrls: group.map((item) => item.url), score, relevanceReason: `Scored ${score}/100 from channel fit, freshness, specificity, and source support.` },
          create: { userId: user.id, workspaceId: workspace.id, channelId: channel.id, eventKey, subject: first.title, headline: first.title, summary: first.summary || first.title, sourceUrls: group.map((item) => item.url), score, relevanceReason: `Scored ${score}/100 from channel fit, freshness, specificity, and source support.`, suggestedAngle: `Explain what this development means for a Texas insurance buyer, what remains uncertain, and what policy or quote detail is worth reviewing.` }
        });
      }
      const trends = await prisma.trendOpportunity.findMany({ where: { workspaceId: workspace.id, channelId: channel.id, status: { notIn: ["COMPLETED", "DISMISSED"] } }, orderBy: { score: "desc" } });
      return Response.json({ trends });
    }
    const trends = await prisma.trendOpportunity.findMany({ where: { id: { in: input.ids }, workspaceId: workspace.id } });
    if (input.action === "select") {
      await prisma.trendOpportunity.updateMany({ where: { id: { in: trends.map((item) => item.id) }, workspaceId: workspace.id }, data: { status: "SELECTED", selectedAt: new Date() } });
      return Response.json({ selected: trends.length });
    }
    const projects = [];
    for (const trend of trends) {
      if (trend.status === "COMPLETED" || trend.storyIdeaId) continue;
      const idea = await prisma.storyIdea.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: trend.channelId, title: trend.headline, slug: `${eventSlug(trend.headline)}-${trend.id.slice(-6)}`, hook: trend.suggestedAngle, summary: trend.summary, category: "Timely Texas insurance", sourceUrls: trend.sourceUrls || undefined, originalityScore: 80, curiosityScore: Math.min(100, trend.score), emotionalScore: 65, escalationScore: 65, lengthPotentialScore: 75, researchDifficultyScore: 55, totalScore: trend.score, productionPriority: trend.score >= 80 ? "High" : "Medium", suggestedAngle: trend.suggestedAngle, status: "IN_PROGRESS", recommendedLengthMinutes: 10, episodeFit: "Medium", bestFormat: "Single Video" } });
      const project = await prisma.storyProject.create({ data: { userId: user.id, workspaceId: workspace.id, channelId: trend.channelId, storyIdeaId: idea.id, title: trend.headline, targetLengthMinutes: 10, targetWordCount: 1550, tone: "Helpful, local, consultative", narrationStyle: "Journalistic" } });
      await prisma.trendOpportunity.update({ where: { id: trend.id }, data: { storyIdeaId: idea.id, status: "DEVELOPED" } });
      projects.push(project);
    }
    return Response.json({ projects });
  } catch (error) { return jsonError(error, 400); }
}

type TrendArticle = { title: string; url: string; summary: string; publishedAt: string | null };
function trendTerms(value: unknown, fallback: string) { const record = value && typeof value === "object" ? value as Record<string, unknown> : {}; const lanes = Array.isArray(record.editorialLanes) ? record.editorialLanes.filter((item): item is string => typeof item === "string") : []; return lanes.length ? lanes : [fallback, "Texas home insurance", "Texas auto insurance"]; }
async function fetchTrendArticles(terms: string[]): Promise<TrendArticle[]> { const lists = await Promise.all(terms.map(fetchGoogleNews)); const seen = new Set<string>(); return lists.flat().filter((item) => { const key = item.url || item.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 30); }
async function fetchGoogleNews(term: string): Promise<TrendArticle[]> { try { const url = new URL("https://news.google.com/rss/search"); url.searchParams.set("q", `${term} Texas insurance when:7d`); url.searchParams.set("hl", "en-US"); url.searchParams.set("gl", "US"); url.searchParams.set("ceid", "US:en"); const response = await fetch(url, { signal: AbortSignal.timeout(12_000) }); if (!response.ok) return []; const xml = await response.text(); return xml.split(/<item>/i).slice(1).map((item) => ({ title: decodeXml(tag(item, "title").replace(/\s+-\s+[^-]+$/, "")), url: tag(item, "link"), summary: decodeXml(tag(item, "description").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(), publishedAt: tag(item, "pubDate") ? new Date(tag(item, "pubDate")).toISOString() : null })).filter((item) => item.title && item.url); } catch { return []; } }
function tag(xml: string, name: string) { return (xml.match(new RegExp(`<${name}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, "i"))?.[1] || "").trim(); }
function decodeXml(value: string) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
function eventSlug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "trend"; }
