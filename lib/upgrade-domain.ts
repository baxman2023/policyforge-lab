import { createHash } from "crypto";

const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "for", "from", "how", "in", "is", "of", "on", "or", "part", "the", "to", "vs", "what", "when", "why", "with"]);

export function canonicalSubjectKey(input: { title: string; eventName?: string | null; category?: string | null }) {
  const source = input.eventName?.trim() || input.title;
  const normalized = source
    .toLowerCase()
    .replace(/\b(?:episode|part)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .slice(0, 12)
    .sort()
    .join("-");
  return normalized || createHash("sha1").update(`${input.category || "topic"}:${input.title}`).digest("hex").slice(0, 20);
}

export function underlyingEventKey(title: string, urls: string[] = []) {
  const subject = canonicalSubjectKey({ title });
  const hosts = urls.map((value) => {
    try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return ""; }
  }).filter(Boolean).sort().join("|");
  return createHash("sha1").update(`${subject}|${hosts}`).digest("hex").slice(0, 24);
}

export function scoreTrend(input: { channelText: string; title: string; summary?: string; freshnessHours?: number | null; sourceCount?: number }) {
  const channelWords = new Set(canonicalTokens(input.channelText));
  const trendWords = canonicalTokens(`${input.title} ${input.summary || ""}`);
  const overlap = trendWords.filter((word) => channelWords.has(word)).length;
  const relevance = Math.min(45, overlap * 7);
  const freshness = input.freshnessHours == null ? 8 : Math.max(0, 25 - Math.floor(input.freshnessHours / 6));
  const evidence = Math.min(15, Math.max(1, input.sourceCount || 1) * 5);
  const specificity = Math.min(15, Math.max(0, trendWords.length - 4));
  return Math.max(1, Math.min(100, 15 + relevance + freshness + evidence + specificity));
}

export function runtimeBounds(minutes: number, seasonEpisode = false) {
  const targetMinutes = Math.max(8, Math.min(seasonEpisode ? 15 : 12, Math.round(minutes)));
  return {
    targetMinutes,
    minWords: Math.round(targetMinutes * 135),
    targetWords: Math.round(targetMinutes * 155),
    maxWords: Math.round(targetMinutes * 175)
  };
}

export function extractCtaEvidence(script: string) {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /(?:281[-\s]445[-\s]1381|baxterinsuranceagency\.com|request (?:a )?quote|insurance review|call baxter)/i.test(sentence));
}

export type ShortCandidate = {
  hook?: string;
  payoff?: string;
  script?: string;
  title?: string;
  caption?: string;
  sourceSafety?: string;
  exportAssets?: unknown;
};

export function normalizeNineShorts(candidates: ShortCandidate[], sourceScript: string): Required<ShortCandidate>[] {
  const useful = candidates.filter((item) => item.hook?.trim() && (item.payoff?.trim() || item.script?.trim())).slice(0, 9);
  const sentences = sourceScript.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 35);
  while (useful.length < 9) {
    const index = useful.length;
    const excerpt = sentences[index % Math.max(1, sentences.length)] || "Review the policy details that control how this coverage works in Texas.";
    useful.push({
      hook: `One Texas insurance detail worth checking before your next renewal`,
      payoff: excerpt,
      script: excerpt,
      title: `Texas Insurance Check ${index + 1}`,
      caption: `${excerpt} Coverage depends on the policy terms and underwriting.`,
      sourceSafety: "Derived only from the completed, audited long-form script; verify policy-specific details before publishing.",
      exportAssets: { format: "vertical-9x16", source: "completed-long-script" }
    });
  }
  return useful.map((item, index) => ({
    hook: item.hook?.trim() || `Texas insurance question ${index + 1}`,
    payoff: item.payoff?.trim() || item.script?.trim() || "Review the exact policy terms with a licensed Texas agent.",
    script: item.script?.trim() || `${item.hook} ${item.payoff}`.trim(),
    title: item.title?.trim() || `Texas Insurance Check ${index + 1}`,
    caption: item.caption?.trim() || `${item.payoff} Call Baxter Insurance Agency at 281-445-1381 for a policy review.`,
    sourceSafety: item.sourceSafety?.trim() || "Use only claims supported by the completed source-audited long-form script.",
    exportAssets: item.exportAssets || { format: "vertical-9x16", source: "completed-long-script" }
  }));
}

export function recommendShaziStyle(input: { name: string; description?: string | null }) {
  const text = `${input.name} ${input.description || ""}`.toLowerCase();
  const commercial = /commercial|business|contractor|liability|workers|cyber/.test(text);
  const storm = /storm|flood|hurricane|weather|property|home/.test(text);
  const styleName = commercial ? "Texas business advisor documentary" : storm ? "Texas property field guide" : "Trusted local insurance explainer";
  return {
    styleName,
    visualRecipe: commercial
      ? "Authentic Texas businesses, owners at work, documents in context, restrained charts, and clean professional compositions."
      : storm
        ? "Authentic Texas homes, neighborhoods, weather context, roof and property details, policy documents, and calm practical compositions."
        : "Authentic Houston and Texas locations, families and vehicles in natural situations, policy documents, and clean educational compositions.",
    stockVideoPct: 65,
    archivalStillsPct: 10,
    aiImagesPct: 25,
    syncMode: "Exact",
    outputQuality: "1080p",
    motion: "Subtle pushes and slow natural movement; avoid constant artificial motion.",
    transitions: "Clean cuts and restrained dissolves.",
    guardrails: [
      "Generated imagery is illustrative and must not be presented as evidence of a claim or loss.",
      "Do not show carrier logos, imply carrier employment, or fabricate identifiable clients.",
      "Prefer authentic Texas locations and policy-relevant objects over generic fear imagery."
    ]
  };
}

function canonicalTokens(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}
