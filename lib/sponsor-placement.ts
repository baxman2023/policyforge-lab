const sponsorPatternSources = [
  "\\bbrought to you by\\b",
  "\\bsponsored by\\b",
  "\\btoday['’]?s sponsor\\b",
  "\\bour sponsor\\b",
  "\\bsupport(?: for)? this (?:episode|video|channel|story)\\b",
  "\\bthis (?:episode|video|story) is (?:brought to you|sponsored|made possible)\\b",
  "\\bthanks? to .{0,80}\\bfor sponsoring\\b",
  "\\buse (?:code|promo code)\\b",
  "\\bpromo code\\b",
  "\\bdiscount code\\b",
  "\\blink in (?:the )?description\\b",
  "\\bdescription below\\b",
  "\\blearn more in (?:the )?description\\b",
  "\\bcheck (?:it|them|us|this|that|the offer) out .{0,80}\\bdescription\\b"
];

const sponsorAdPattern = new RegExp(sponsorPatternSources.join("|"), "i");

export function stripSponsorCopyFromBody(content: string, sponsorBlurb?: string | null) {
  if (!content.trim()) return content;

  return content
    .split(/\n{2,}/)
    .map((paragraph) => stripSponsorCopyFromParagraph(paragraph, sponsorBlurb))
    .filter((paragraph) => paragraph.trim().length > 0)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasSponsorPlacement(content: string, sponsorBlurb?: string | null) {
  return sponsorAdPattern.test(content) || isLikelyProvidedSponsorCopy(content, sponsorBlurb);
}

export function ensureIntroSponsorPlacement(content: string, sponsorBlurb?: string | null) {
  const sponsor = sponsorBlurb?.trim();
  const trimmed = content.trim();
  if (!sponsor || !trimmed || hasSponsorPlacement(trimmed, sponsor)) return trimmed;

  const transition = /Now,\s+let['’]s get into today['’]s story\.?$/i;
  if (!transition.test(trimmed)) return `${trimmed.replace(/[.?!]?$/, ".")} ${sponsor}`;

  return trimmed.replace(transition, `${sponsor.replace(/[.?!]?$/, ".")} Now, let's get into today's story.`);
}

export function ensureOutroSponsorPlacement(content: string, sponsorBlurb?: string | null) {
  const sponsor = sponsorBlurb?.trim();
  const trimmed = content.trim();
  if (!sponsor || !trimmed || hasSponsorPlacement(trimmed, sponsor)) return trimmed;

  return `${trimmed.replace(/[.?!]?$/, ".")} ${sponsor}`;
}

function stripSponsorCopyFromParagraph(paragraph: string, sponsorBlurb?: string | null) {
  const trimmed = paragraph.trim();
  if (!trimmed) return "";

  if (hasSponsorPlacement(trimmed, sponsorBlurb)) {
    const sentences = splitSentences(trimmed);
    const kept = sentences.filter((sentence) => !hasSponsorPlacement(sentence, sponsorBlurb));
    if (kept.length === sentences.length) return "";
    if (kept.length === 0 || kept.length < sentences.length) return kept.join(" ").replace(/\s{2,}/g, " ").trim();
  }

  return paragraph.trim();
}

function splitSentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

function isLikelyProvidedSponsorCopy(content: string, sponsorBlurb?: string | null) {
  if (!sponsorBlurb?.trim()) return false;

  const normalizedContent = normalizePhrase(content);
  const normalizedSponsor = normalizePhrase(sponsorBlurb);
  if (normalizedSponsor.length >= 30 && normalizedContent.includes(normalizedSponsor)) return true;

  const contentTerms = significantTerms(content);
  const sponsorTerms = significantTerms(sponsorBlurb);
  if (contentTerms.length < 3 || sponsorTerms.length < 3) return false;

  const contentSet = new Set(contentTerms);
  const sponsorSet = new Set(sponsorTerms);
  const shared = [...sponsorSet].filter((term) => contentSet.has(term)).length;
  const ratio = shared / Math.min(contentSet.size, sponsorSet.size);

  if (shared >= 7 && ratio >= 0.45) return true;
  return shared >= 3 && ratio >= 0.75;
}

function normalizePhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantTerms(value: string) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "and",
    "are",
    "because",
    "been",
    "before",
    "being",
    "but",
    "can",
    "could",
    "for",
    "from",
    "had",
    "has",
    "have",
    "her",
    "his",
    "into",
    "its",
    "just",
    "more",
    "not",
    "one",
    "only",
    "our",
    "out",
    "over",
    "that",
    "the",
    "their",
    "them",
    "then",
    "there",
    "they",
    "this",
    "through",
    "today",
    "was",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "will",
    "with",
    "you",
    "your"
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((term) => term.replace(/^['-]+|['-]+$/g, ""))
    .filter((term) => term.length >= 4 && !stopWords.has(term));
}
