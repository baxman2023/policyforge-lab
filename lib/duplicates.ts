import type { StoryIdea, StoryIdeaStatus } from "@prisma/client";
import { slugify } from "@/lib/utils";

const USED_STATUSES: StoryIdeaStatus[] = ["PRODUCED", "PUBLISHED", "ARCHIVED"];

export type DuplicateReport = {
  exactMatch: boolean;
  highestSimilarity: number;
  blocked: boolean;
  warning: string | null;
  matchedIdea: Pick<StoryIdea, "id" | "title" | "status" | "totalScore" | "updatedAt"> | null;
};

export function isUsedStatus(status: StoryIdeaStatus) {
  return USED_STATUSES.includes(status);
}

export function buildDuplicateReport(
  candidate: {
    title: string;
    hook?: string | null;
    summary?: string | null;
    people?: string[];
    location?: string | null;
    eventName?: string | null;
  },
  existing: StoryIdea[]
): DuplicateReport {
  const candidateSlug = slugify(candidate.title);
  const candidateText = comparisonText(candidate);
  let best: { idea: StoryIdea; score: number; exact: boolean } | null = null;

  for (const idea of existing) {
    const exact = slugify(idea.title) === candidateSlug;
    const score = exact
      ? 1
      : jaccardSimilarity(candidateText, comparisonText(idea));
    if (!best || score > best.score) {
      best = { idea, score, exact };
    }
  }

  const matchedIdea = best?.score && best.score >= 0.45 ? best.idea : null;
  const blocked = Boolean(matchedIdea && isUsedStatus(matchedIdea.status));
  const warning = blocked
    ? `This appears similar to a story already marked as used: ${matchedIdea!.title}. Continue anyway?`
    : matchedIdea
      ? `This appears similar to an existing idea: ${matchedIdea.title}.`
      : null;

  return {
    exactMatch: Boolean(best?.exact),
    highestSimilarity: Math.round((best?.score ?? 0) * 100),
    blocked,
    warning,
    matchedIdea: matchedIdea
      ? {
          id: matchedIdea.id,
          title: matchedIdea.title,
          status: matchedIdea.status,
          totalScore: matchedIdea.totalScore,
          updatedAt: matchedIdea.updatedAt
        }
      : null
  };
}

function comparisonText(input: {
  title: string;
  hook?: string | null;
  summary?: string | null;
  people?: unknown;
  location?: string | null;
  eventName?: string | null;
}) {
  const people = Array.isArray(input.people)
    ? input.people.filter((item): item is string => typeof item === "string")
    : [];

  return [
    input.title,
    input.hook,
    input.summary,
    input.eventName,
    input.location,
    ...people
  ]
    .filter(Boolean)
    .join(" ");
}

function tokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function jaccardSimilarity(a: string, b: string) {
  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (!aTokens.size || !bTokens.size) return 0;
  const intersection = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  return intersection / union;
}
