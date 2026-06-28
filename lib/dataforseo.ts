import "server-only";
import { getDataForSeoCredentials } from "@/lib/settings";

const DATAFORSEO_ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
const DEFAULT_LOCATION_CODE = 2840; // United States
const DEFAULT_LANGUAGE_CODE = "en";
const DATAFORSEO_KEYWORD_MAX_LENGTH = 80;
const DATAFORSEO_KEYWORD_MAX_WORDS = 10;

type DataForSeoSearchVolumeResponse = {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{
      keyword?: string;
      search_volume?: number | null;
      competition?: string | null;
      competition_index?: number | null;
      cpc?: number | null;
      monthly_searches?: unknown;
    }> | null;
  }>;
  status_message?: string;
};

export type SeoKeywordMetric = {
  keyword: string;
  searchVolume: number;
  competition?: string;
  competitionIndex?: number;
  cpc?: number;
};

export async function getSeoKeywordMetrics(input: {
  userId: string;
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
}) {
  const credentials = await getDataForSeoCredentials(input.userId);
  if (!credentials) return { metrics: [] as SeoKeywordMetric[], warning: "DataForSEO credentials are not configured." };

  const keywords = uniqueKeywords(input.keywords).slice(0, 100);
  if (!keywords.length) return { metrics: [] as SeoKeywordMetric[] };

  const response = await fetch(DATAFORSEO_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        location_code: input.locationCode ?? DEFAULT_LOCATION_CODE,
        language_code: input.languageCode ?? DEFAULT_LANGUAGE_CODE,
        keywords
      }
    ]),
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as DataForSeoSearchVolumeResponse;
  if (!response.ok) {
    throw new Error(payload.status_message || `DataForSEO request failed with status ${response.status}.`);
  }

  const failedTask = payload.tasks?.find((task) => task.status_code && task.status_code >= 40000);
  if (failedTask) throw new Error(failedTask.status_message || "DataForSEO keyword lookup failed.");

  const metrics = payload.tasks
    ?.flatMap((task) => task.result ?? [])
    .map((item) => ({
      keyword: item.keyword?.trim() || "",
      searchVolume: Number(item.search_volume ?? 0),
      competition: item.competition ?? undefined,
      competitionIndex: typeof item.competition_index === "number" ? item.competition_index : undefined,
      cpc: typeof item.cpc === "number" ? item.cpc : undefined
    }))
    .filter((item) => item.keyword) ?? [];

  return {
    metrics: rankKeywordMetrics(metrics)
  };
}

export async function optionalSeoKeywordMetrics(input: {
  userId: string;
  keywords: string[];
  locationCode?: number;
  languageCode?: string;
}) {
  try {
    return await getSeoKeywordMetrics(input);
  } catch (error) {
    return {
      metrics: [] as SeoKeywordMetric[],
      warning: error instanceof Error ? error.message : "DataForSEO keyword lookup is unavailable."
    };
  }
}

export function formatKeywordMetricsForPrompt(metrics: SeoKeywordMetric[]) {
  if (!metrics.length) return "No DataForSEO keyword metrics available.";
  return metrics
    .slice(0, 20)
    .map((item) => {
      const parts = [`${item.keyword}: volume ${item.searchVolume.toLocaleString()}`];
      if (item.competition) parts.push(`competition ${item.competition}`);
      if (typeof item.competitionIndex === "number") parts.push(`competition index ${item.competitionIndex}`);
      if (typeof item.cpc === "number") parts.push(`CPC $${item.cpc.toFixed(2)}`);
      return `- ${parts.join(", ")}`;
    })
    .join("\n");
}

function rankKeywordMetrics(metrics: SeoKeywordMetric[]) {
  return [...metrics].sort((a, b) => {
    const volumeDelta = b.searchVolume - a.searchVolume;
    if (volumeDelta) return volumeDelta;
    return (a.competitionIndex ?? 100) - (b.competitionIndex ?? 100);
  });
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const keyword of keywords) {
    const clean = normalizeKeywordForDataForSeo(keyword);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}

function normalizeKeywordForDataForSeo(keyword: string) {
  const clean = keyword
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!clean) return "";
  if (clean.length > DATAFORSEO_KEYWORD_MAX_LENGTH) return "";
  if (clean.split(/\s+/).length > DATAFORSEO_KEYWORD_MAX_WORDS) return "";
  return clean;
}
