export type YoutubeDescriptionInput = {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  sponsorBlurb?: string | null;
  sponsorLink?: string | null;
  summary?: string | null;
  hook?: string | null;
  targetLengthMinutes?: number | null;
  actualLengthMinutes?: number | null;
};

export function formatYoutubeDescription(input: YoutubeDescriptionInput) {
  const existing = input.description?.trim() ?? "";
  if (looksLikeFormulaDescription(existing) && timestampRangeFits(existing, input.actualLengthMinutes ?? input.targetLengthMinutes)) {
    return existing;
  }

  const tags = input.tags ?? [];
  const sponsorLink = input.sponsorLink?.trim() || extractFirstUrl(existing);
  const plain = stripLegacyMetadataAndSponsor(existing, sponsorLink);
  const sentences = splitSentences(plain);
  const fallbackSummary = splitSentences(`${input.hook ?? ""} ${input.summary ?? ""}`.trim());
  const partOne = compactSentences(sentences.slice(0, 5), fallbackSummary.slice(0, 3), input.title);
  const partTwo = compactSentences(
    sentences.slice(5, 10),
    [
      `This video is built as a careful long-form documentary, separating what can be said responsibly from what remains uncertain.`,
      `Watch for the timeline, the competing explanations, and the details that usually get flattened in shorter retellings.`
    ],
    input.title
  );

  return [
    mainKeyword(input.title, tags),
    primaryCta(input.sponsorBlurb, sponsorLink),
    partOne,
    timestampBlock(existing, input.actualLengthMinutes ?? input.targetLengthMinutes),
    partTwo,
    finalCta(input.sponsorBlurb, sponsorLink),
    hashtagLine(tags, input.title)
  ].filter(Boolean).join("\n\n");
}

export function formatPublishingPackContent(content: string, input: Omit<YoutubeDescriptionInput, "description" | "tags"> = {}) {
  try {
    const parsed = JSON.parse(content) as { description?: unknown; tags?: unknown };
    if (Array.isArray((parsed as { episodePacks?: unknown }).episodePacks)) {
      return content;
    }
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((item): item is string => typeof item === "string") : [];
    return JSON.stringify(
      {
        ...parsed,
        description: formatYoutubeDescription({
          ...input,
          description: typeof parsed.description === "string" ? parsed.description : "",
          tags
        })
      },
      null,
      2
    );
  } catch {
    return content;
  }
}

function looksLikeFormulaDescription(value: string) {
  if (!value) return false;
  const blocks = value.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1] ?? "";
  return blocks.length >= 6 && /^Timestamps?:/im.test(value) && /^#\w+(?:\s+#\w+){2,4}$/i.test(last);
}

function stripLegacyMetadataAndSponsor(value: string, sponsorLink: string) {
  let cleaned = bodyBeforeTimestamps(value);
  cleaned = cleaned.replace(/#\w+/g, " ");
  cleaned = removeSponsorBlock(cleaned, sponsorLink);
  if (sponsorLink) {
    cleaned = cleaned.replaceAll(sponsorLink, " ");
  }
  cleaned = cleaned.replace(/https?:\/\/\S+/gi, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return splitSentences(cleaned)
    .filter((sentence) => !/\b(today'?s sponsor|sponsor|learn more here|link in the description|subscribe|leave a like|join the discussion|comments?)\b/i.test(sentence))
    .join(" ");
}

function splitSentences(value: string) {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function compactSentences(primary: string[], fallback: string[], title?: string | null) {
  const selected = primary.length ? primary : fallback;
  if (selected.length) return selected.slice(0, 4).join(" ");
  return `This long-form documentary investigates ${title?.trim() || "this story"} with a focus on the timeline, the evidence, and the questions still worth asking.`;
}

function mainKeyword(title?: string | null, tags: string[] = []) {
  const keyword = tags.find((tag) => tag.trim().length >= 5) ?? title ?? "Long Form Documentary";
  return keyword.trim();
}

function primaryCta(sponsorBlurb?: string | null, sponsorLink = "") {
  if (sponsorLink) return `${sponsorLead(sponsorBlurb)}\n${sponsorLink}`;
  return "Subscribe for more long-form documentary stories, and leave your questions or theories in the comments.";
}

function finalCta(sponsorBlurb?: string | null, sponsorLink = "") {
  if (sponsorLink) return `Learn more from ${sponsorName(sponsorBlurb)} here:\n${sponsorLink}`;
  return "If this story kept you thinking, subscribe, like the video, and share it with someone who would want to follow the mystery.";
}

function sponsorLead(sponsorBlurb?: string | null) {
  const name = sponsorName(sponsorBlurb);
  return `Today's sponsor is ${name}. Learn more here:`;
}

function sponsorName(sponsorBlurb?: string | null) {
  const text = sponsorBlurb?.trim() ?? "";
  const match = text.match(/\b(?:today'?s\s+)?(?:sponsor|from|by|with)\s*(?:is|:)?\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,3})/);
  if (match?.[1]) return cleanSponsorName(match[1]);
  const firstWords = text.match(/^([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,2})\b/);
  const fallback = firstWords?.[1] ? cleanSponsorName(firstWords[1]) : "";
  return fallback && !/^(today'?s|this|sponsor|if|learn)\b/i.test(fallback) ? fallback : "today's sponsor";
}

function cleanSponsorName(value: string) {
  return value
    .replace(/\b(?:If|Learn|Visit|Use|Get|Check|For|When|It|This|That)\b[\s\S]*$/g, "")
    .trim()
    .replace(/[,.!?;:]+$/g, "")
    .trim();
}

function timestampBlock(existing: string, targetLengthMinutes?: number | null) {
  const extracted = extractTimestamps(existing);
  const stamps = extracted.length >= 3 && timestampItemsFit(extracted, targetLengthMinutes)
    ? extracted
    : defaultTimestamps(targetLengthMinutes ?? 7);
  return ["Timestamps:", ...stamps.map((item) => `${item.time} - ${item.label}`)].join("\n");
}

function extractTimestamps(value: string) {
  const section = timestampSection(value);
  const withoutTags = section.replace(/#\w+/g, " ");
  const matches = Array.from(withoutTags.matchAll(/(\d{1,2}:\d{2})\s*-?\s*([\s\S]*?)(?=\s+\d{1,2}:\d{2}\s*-?|$)/g));
  return matches
    .map((match) => ({ time: match[1], label: cleanTimestampLabel(match[2]) }))
    .filter((item) => item.label)
    .slice(0, 10);
}

function cleanTimestampLabel(value: string) {
  return value.replace(/[|,;]+$/g, "").replace(/\s+/g, " ").trim();
}

function bodyBeforeTimestamps(value: string) {
  const index = timestampMarkerIndex(value);
  return index >= 0 ? value.slice(0, index) : value;
}

function timestampSection(value: string) {
  const index = timestampMarkerIndex(value);
  if (index < 0) return "";
  return value.slice(index).replace(/^\s*(?:CHAPTERS?|TIMESTAMPS?)\s*:?\s*/i, "");
}

function timestampMarkerIndex(value: string) {
  const match = value.match(/\b(?:CHAPTERS?|TIMESTAMPS?)\s*:?\s*(?=\d{1,2}:\d{2})/i);
  return match?.index ?? -1;
}

function timestampRangeFits(value: string, targetLengthMinutes?: number | null) {
  return timestampItemsFit(extractTimestamps(value), targetLengthMinutes);
}

function timestampItemsFit(items: Array<{ time: string; label: string }>, targetLengthMinutes?: number | null) {
  if (!items.length || !targetLengthMinutes) return true;
  const maxSeconds = Math.max(...items.map((item) => timestampToSeconds(item.time)));
  return maxSeconds <= Math.max(0, targetLengthMinutes * 60 + 120);
}

function timestampToSeconds(value: string) {
  const [minutes, seconds] = value.split(":").map((part) => Number(part));
  return Number.isFinite(minutes) && Number.isFinite(seconds) ? minutes * 60 + seconds : 0;
}

function removeSponsorBlock(value: string, sponsorLink: string) {
  if (!sponsorLink) {
    return value.replace(/\bToday'?s sponsor\b[\s\S]*$/i, " ");
  }
  const escapedLink = escapeRegExp(sponsorLink);
  return value.replace(new RegExp(`\\b(?:Today'?s sponsor|This video'?s sponsor|Sponsor)\\b[\\s\\S]*?${escapedLink}`, "i"), " ");
}

function extractFirstUrl(value: string) {
  return value.match(/https?:\/\/\S+/i)?.[0]?.replace(/[),.;]+$/, "") ?? "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function defaultTimestamps(targetLengthMinutes: number) {
  const minutes = Math.max(6, Math.min(30, targetLengthMinutes || 7));
  const totalSeconds = minutes * 60;
  const marks = [0, 0.14, 0.28, 0.44, 0.6, 0.78, 0.92].map((ratio) => roundToNearestFifteen(totalSeconds * ratio));
  const labels = ["Opening question", "The setup", "The first major turn", "The evidence trail", "The competing explanations", "What remains unresolved", "Final takeaway"];
  let previous = -60;
  return marks.map((seconds, index) => {
    const adjusted = Math.min(totalSeconds, Math.max(seconds, previous + 45));
    previous = adjusted;
    return { time: formatTimestamp(adjusted), label: labels[index] };
  });
}

function roundToNearestFifteen(seconds: number) {
  return Math.round(seconds / 15) * 15;
}

function formatTimestamp(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function hashtagLine(tags: string[] = [], title?: string | null) {
  const values = [...tags, title ?? "", "True Stories", "Mystery Documentary", "Long Form Documentary"]
    .map(hashtag)
    .filter(Boolean);
  return unique(values).slice(0, 5).join(" ");
}

function hashtag(value: string) {
  const words = value.match(/[A-Za-z0-9]+/g);
  if (!words?.length) return "";
  const text = words.slice(0, 4).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
  return text.length >= 3 ? `#${text}` : "";
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}
