import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { ensureUserWorkspace } from "@/lib/workspaces";

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user?.id) redirect("/login");
  const { workspace } = await ensureUserWorkspace(user.id);
  const { id } = await params;
  const season = await prisma.contentSeason.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { channel: true, episodes: { orderBy: { episodeNumber: "asc" }, include: { project: true } }, storyIdea: true, trendOpportunity: true }
  });
  if (!season) notFound();
  return (
    <main className="login-page season-page">
      <section className="login-panel season-panel">
        <Link href="/">Back to PolicyForge</Link>
        <p>{season.channel.name} · {season.episodes.length} episode season</p>
        <h1>{season.title}</h1>
        <p>{season.premise}</p>
        <div className="section-stack">
          {season.episodes.map((episode) => (
            <article className="panel pad" key={episode.id}>
              <small>Episode {episode.episodeNumber}</small>
              <h2>{episode.title}</h2>
              <p>{episode.promise}</p>
              {episode.deltaResearchQuestion ? <p><b>Delta research:</b> {episode.deltaResearchQuestion}</p> : null}
              <p>{episode.project ? `Production project ready: ${episode.project.title}` : "Project not created yet."}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
