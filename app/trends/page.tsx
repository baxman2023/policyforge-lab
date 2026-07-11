import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ensureUserWorkspace } from "@/lib/workspaces";
import { TrendsBoard } from "@/components/trends-board";

export default async function TrendsPage() {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const { workspace } = await ensureUserWorkspace(user.id);
  const [trends, channels] = await Promise.all([
    prisma.trendOpportunity.findMany({ where: { workspaceId: workspace.id, status: { notIn: ["COMPLETED", "DISMISSED"] } }, include: { channel: true }, orderBy: [{ score: "desc" }, { createdAt: "desc" }] }),
    prisma.channel.findMany({ where: { workspaceId: workspace.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
  ]);
  return <main className="login-page season-page"><section className="login-panel season-panel"><h1>Trend Opportunities</h1><p>One underlying event appears once. Scores combine active-channel relevance, freshness, specificity, and source support.</p><TrendsBoard channels={channels} initialTrends={trends.map((trend) => ({ id: trend.id, channelId: trend.channelId, channelName: trend.channel.name, score: trend.score, status: trend.status, headline: trend.headline, summary: trend.summary, suggestedAngle: trend.suggestedAngle }))} /></section></main>;
}
