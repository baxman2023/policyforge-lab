import type { StoryProjectFormat } from "@prisma/client";

export function isBookProjectFormat(format?: StoryProjectFormat | string | null) {
  return format === "SHORT_BOOK" || format === "LONG_BOOK";
}

export function supportsSponsorBlurb(format?: StoryProjectFormat | string | null) {
  return !isBookProjectFormat(format);
}

export function sponsorPlacementLabel(format?: StoryProjectFormat | string | null) {
  if (format === "ARTICLE") return "article";
  if (format === "PODCAST_EPISODE") return "podcast";
  return "video";
}

export function normalizeSponsorBlurbForFormat(value?: string | null, format?: StoryProjectFormat | string | null) {
  const text = value?.trim();
  if (!text || !supportsSponsorBlurb(format)) return "";

  return normalizeSponsorLanguageForFormat(text, format);
}

export function normalizeSponsorLanguageForFormat(value?: string | null, format?: StoryProjectFormat | string | null) {
  const text = value?.trim();
  if (!text) return "";
  if (!supportsSponsorBlurb(format)) return text;

  if (format === "ARTICLE") {
    return capitalizeFirstCharacter(text
      .replace(/\bthis video is brought to you by\b/gi, "this article is sponsored by")
      .replace(/\btoday'?s video is brought to you by\b/gi, "today's article is sponsored by")
      .replace(/\bthis episode is brought to you by\b/gi, "this article is sponsored by")
      .replace(/\btoday'?s episode is brought to you by\b/gi, "today's article is sponsored by")
      .replace(/\bthis video is sponsored by\b/gi, "this article is sponsored by")
      .replace(/\bthis episode is sponsored by\b/gi, "this article is sponsored by")
      .replace(/\btoday'?s video\b/gi, "today's article")
      .replace(/\btoday'?s episode\b/gi, "today's article")
      .replace(/\bthis video\b/gi, "this article")
      .replace(/\bthis episode\b/gi, "this article")
      .replace(/\bin this video\b/gi, "in this article")
      .replace(/\bin this episode\b/gi, "in this article")
      .replace(/\bviewers\b/gi, "readers")
      .replace(/\blisteners\b/gi, "readers")
      .replace(/\bthe link is in the description\b/gi, "the link is included with this article")
      .replace(/\blink in the description\b/gi, "link included with this article")
      .replace(/\bthe link is in the show notes\b/gi, "the link is included with this article")
      .replace(/\blink in the show notes\b/gi, "link included with this article")
      .replace(/\bclick the link in the description\b/gi, "use the link included with this article")
      .replace(/\bcheck out the link in the description\b/gi, "use the link included with this article")
      .replace(/\bthrough the description\b/gi, "through the link included with this article")
      .trim());
  }

  if (format === "PODCAST_EPISODE") {
    return capitalizeFirstCharacter(text
      .replace(/\bthis video is brought to you by\b/gi, "this episode is brought to you by")
      .replace(/\btoday'?s video is brought to you by\b/gi, "today's episode is brought to you by")
      .replace(/\bthis video is sponsored by\b/gi, "this episode is sponsored by")
      .replace(/\btoday'?s video is sponsored by\b/gi, "today's episode is sponsored by")
      .replace(/\bthis article is sponsored by\b/gi, "this episode is brought to you by")
      .replace(/\btoday'?s article is sponsored by\b/gi, "today's episode is brought to you by")
      .replace(/\btoday'?s video\b/gi, "today's episode")
      .replace(/\btoday'?s article\b/gi, "today's episode")
      .replace(/\bthis video\b/gi, "this episode")
      .replace(/\bthis article\b/gi, "this episode")
      .replace(/\bin this video\b/gi, "in this episode")
      .replace(/\bin this article\b/gi, "in this episode")
      .replace(/\bviewers\b/gi, "listeners")
      .replace(/\breaders\b/gi, "listeners")
      .replace(/\bthe link is in the description\b/gi, "the link is in the show notes")
      .replace(/\blink in the description\b/gi, "link in the show notes")
      .replace(/\bthe link is included with this article\b/gi, "the link is in the show notes")
      .replace(/\blink included with this article\b/gi, "link in the show notes")
      .replace(/\bclick the link in the description\b/gi, "use the link in the show notes")
      .replace(/\bcheck out the link in the description\b/gi, "use the link in the show notes")
      .trim());
  }

  return capitalizeFirstCharacter(text
    .replace(/\bthis article is sponsored by\b/gi, "this video is brought to you by")
    .replace(/\btoday'?s article is sponsored by\b/gi, "today's video is brought to you by")
    .replace(/\bthis episode is brought to you by\b/gi, "this video is brought to you by")
    .replace(/\btoday'?s episode is brought to you by\b/gi, "today's video is brought to you by")
    .replace(/\bthis episode is sponsored by\b/gi, "this video is sponsored by")
    .replace(/\btoday'?s episode is sponsored by\b/gi, "today's video is sponsored by")
    .replace(/\btoday'?s article\b/gi, "today's video")
    .replace(/\btoday'?s episode\b/gi, "today's video")
    .replace(/\bthis article\b/gi, "this video")
    .replace(/\bthis episode\b/gi, "this video")
    .replace(/\bin this article\b/gi, "in this video")
    .replace(/\bin this episode\b/gi, "in this video")
    .replace(/\breaders\b/gi, "viewers")
    .replace(/\blisteners\b/gi, "viewers")
    .replace(/\bthe link is in the show notes\b/gi, "the link is in the description")
    .replace(/\bthe link is included with this article\b/gi, "the link is in the description")
    .replace(/\blink included with this article\b/gi, "link in the description")
    .replace(/\blink in the show notes\b/gi, "link in the description")
    .trim());
}

function capitalizeFirstCharacter(value: string) {
  return value.replace(/^([a-z])/, (letter) => letter.toUpperCase());
}
