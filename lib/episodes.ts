export const DEFAULT_EPISODE_COUNT = 5;
export const MAX_EPISODE_COUNT = 5;

type EpisodeCountIdea = {
  bestFormat?: string | null;
  episodeArc?: unknown;
  [key: string]: unknown;
} | null | undefined;

type EpisodeCountProject = {
  format?: string | null;
  storyIdea?: EpisodeCountIdea;
  drafts?: Array<{ passType?: string | null }> | null;
} | null | undefined;

function clampEpisodeCount(value: number, fallback = DEFAULT_EPISODE_COUNT) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_EPISODE_COUNT, Math.max(1, Math.round(value)));
}

export function episodeCountForIdea(idea: EpisodeCountIdea, fallback = DEFAULT_EPISODE_COUNT) {
  const bestFormat = idea?.bestFormat?.toLowerCase() || "";
  if (/\b3\b|three/.test(bestFormat)) return 3;
  if (/\b5\b|five/.test(bestFormat)) return 5;

  const arc = idea?.episodeArc;
  if (Array.isArray(arc) && arc.length > 0) {
    return clampEpisodeCount(arc.length, fallback);
  }

  return fallback;
}

export function projectHasEpisodePlan(project: EpisodeCountProject) {
  return project?.format === "EPISODIC_SERIES" || Boolean(project?.drafts?.some((draft) => draft.passType === "EPISODES"));
}

export function episodeCountForProject(project: EpisodeCountProject, fallback = DEFAULT_EPISODE_COUNT) {
  if (!projectHasEpisodePlan(project)) return 1;
  return episodeCountForIdea(project?.storyIdea, fallback);
}

export function episodeSeriesLabel(count: number) {
  return `${clampEpisodeCount(count)}-episode series`;
}

export function episodePartList(count: number) {
  return Array.from({ length: clampEpisodeCount(count) }, (_, index) => `Part ${index + 1}`).join(", ");
}
