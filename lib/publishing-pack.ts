import { jsonrepair } from "jsonrepair";

export type PublishingTitle = {
  title: string;
  angle?: string;
};

export type ThumbnailPrompt = {
  title: string;
  overlayText?: string;
  prompt: string;
};

export type SunoMusicPrompt = {
  title?: string;
  prompt: string;
};

export type ArticleImagePlan = {
  placement: string;
  prompt: string;
  altText?: string;
  caption?: string;
};

export type ArticleFaq = {
  question: string;
  answer: string;
};

export type ArticleSeoPack = {
  primaryKeyword?: string;
  secondaryKeywords: string[];
  searchIntent?: string;
  seoTitle?: string;
  metaDescription?: string;
  urlSlug?: string;
  h1?: string;
  h2Outline: string[];
  faq: ArticleFaq[];
  internalLinkSuggestions: string[];
  externalSourceSuggestions: string[];
  schemaRecommendation?: string;
  featuredSnippetTarget?: string;
  imagePlan: ArticleImagePlan[];
};

export type TopicalAuthorityArticle = {
  title: string;
  primaryKeyword?: string;
  intent?: string;
  funnelStage?: string;
  priority?: string;
  angle?: string;
  internalLinks: string[];
};

export type TopicalAuthorityCluster = {
  clusterName: string;
  pillarArticle?: string;
  supportingArticles: TopicalAuthorityArticle[];
};

export type TopicalAuthorityMap = {
  pillarTopic?: string;
  audience?: string;
  authorityGoal?: string;
  clusters: TopicalAuthorityCluster[];
  recommendedNextArticles: TopicalAuthorityArticle[];
};

export type ConversionAssets = {
  gbpPost?: string;
  clientEmail?: string;
  facebookPost?: string;
  shortClipHooks: string[];
  callScript?: string;
  websiteArticleAngle?: string;
  reviewReferralPrompt?: string;
};

export type PublishingPack = {
  titles: PublishingTitle[];
  description: string;
  tags: string[];
  thumbnailPrompts: ThumbnailPrompt[];
  sunoPrompt?: SunoMusicPrompt;
  pinnedComment?: string;
  seoPack?: ArticleSeoPack;
  topicalAuthorityMap?: TopicalAuthorityMap;
  conversionAssets?: ConversionAssets;
  episodePacks?: EpisodePublishingPack[];
};

export type EpisodePublishingPack = {
  episodeNumber: number;
  partLabel: string;
  titles: PublishingTitle[];
  description: string;
  tags: string[];
  thumbnailPrompts: ThumbnailPrompt[];
  sunoPrompt?: SunoMusicPrompt;
  pinnedComment?: string;
};

export function normalizePublishingPack(content: string, options: { requireThumbnailPrompts?: boolean } = {}) {
  const pack = parsePublishingPack(content);
  if (pack.episodePacks?.length) {
    if (pack.episodePacks.length !== 5) throw new Error("Episodic Publishing Pack must include exactly 5 episode packs.");
    for (const episode of pack.episodePacks) {
      if (episode.titles.length !== 3) throw new Error(`${episode.partLabel} must include exactly 3 title options.`);
      if (options.requireThumbnailPrompts !== false && episode.thumbnailPrompts.length !== 3) {
        throw new Error(`${episode.partLabel} must include exactly 3 thumbnail prompts.`);
      }
    }
  } else {
    if (pack.titles.length !== 3) throw new Error("Publishing Pack must include exactly 3 titles.");
    if (options.requireThumbnailPrompts !== false && pack.thumbnailPrompts.length !== 3) {
      throw new Error("Publishing Pack must include exactly 3 thumbnail prompts.");
    }
  }
  return JSON.stringify(pack, null, 2);
}

export function parsePublishingPack(content: string): PublishingPack {
  const raw = parseJsonObject(content);
  const titles = readArray(raw.titles)
    .map((item) => {
      const record = asRecord(item);
      const title = record ? readString(record.title) : readString(item);
      if (!title) return null;
      const result: PublishingTitle = { title };
      const angle = record ? readString(record.angle) : undefined;
      if (angle) result.angle = angle;
      return result;
    })
    .filter((item): item is PublishingTitle => item !== null)
    .slice(0, 3);

  const description = readString(raw.description) ?? "";
  const baseTags = readArray(raw.tags)
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20);
  const tags = enrichTags(baseTags, titles, description).slice(0, 20);

  const thumbnailPrompts = readArray(raw.thumbnailPrompts ?? raw.thumbnails)
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const prompt = readString(record.prompt);
      if (!prompt) return null;
      const result: ThumbnailPrompt = {
        title: readString(record.title) ?? "Thumbnail concept",
        prompt
      };
      const overlayText = readString(record.overlayText);
      if (overlayText) result.overlayText = overlayText;
      return result;
    })
    .filter((item): item is ThumbnailPrompt => item !== null)
    .slice(0, 3);

  const sunoPrompt = readSunoMusicPrompt(raw.sunoPrompt ?? raw.musicPrompt ?? raw.backgroundMusicPrompt ?? raw.suno)
    ?? (thumbnailPrompts.length ? fallbackSunoPrompt(titles, tags, description) : undefined);

  return {
    titles,
    description,
    tags,
    thumbnailPrompts,
    sunoPrompt,
    pinnedComment: readString(raw.pinnedComment),
    seoPack: readArticleSeoPack(raw.seoPack ?? raw.articleSeoPack ?? raw.seo),
    topicalAuthorityMap: readTopicalAuthorityMap(raw.topicalAuthorityMap ?? raw.authorityMap ?? raw.contentMap),
    conversionAssets: readConversionAssets(raw.conversionAssets ?? raw.supportingAssets ?? raw.repurposeAssets ?? raw.growthAssets),
    episodePacks: readEpisodePublishingPacks(raw.episodePacks ?? raw.episodes ?? raw.parts)
  };
}

function readConversionAssets(value: unknown): ConversionAssets | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const assets: ConversionAssets = {
    shortClipHooks: readStringArray(record.shortClipHooks ?? record.shorts ?? record.shortHooks).slice(0, 8)
  };
  const gbpPost = readString(record.gbpPost ?? record.googleBusinessProfilePost ?? record.googlePost);
  if (gbpPost) assets.gbpPost = gbpPost;
  const clientEmail = readString(record.clientEmail ?? record.email ?? record.prospectEmail);
  if (clientEmail) assets.clientEmail = clientEmail;
  const facebookPost = readString(record.facebookPost ?? record.socialPost ?? record.socialCaption);
  if (facebookPost) assets.facebookPost = facebookPost;
  const callScript = readString(record.callScript ?? record.phoneScript ?? record.staffCallScript);
  if (callScript) assets.callScript = callScript;
  const websiteArticleAngle = readString(record.websiteArticleAngle ?? record.articleAngle ?? record.websiteFollowUp);
  if (websiteArticleAngle) assets.websiteArticleAngle = websiteArticleAngle;
  const reviewReferralPrompt = readString(record.reviewReferralPrompt ?? record.referralPrompt ?? record.reviewPrompt);
  if (reviewReferralPrompt) assets.reviewReferralPrompt = reviewReferralPrompt;
  return Object.keys(assets).some((key) => key !== "shortClipHooks" || assets.shortClipHooks.length) ? assets : undefined;
}

function readEpisodePublishingPacks(value: unknown): EpisodePublishingPack[] | undefined {
  const packs = readArray(value)
    .map((item, index) => readEpisodePublishingPack(item, index + 1))
    .filter((item): item is EpisodePublishingPack => item !== null)
    .slice(0, 5);
  return packs.length ? packs : undefined;
}

function readEpisodePublishingPack(value: unknown, fallbackEpisodeNumber: number): EpisodePublishingPack | null {
  const record = asRecord(value);
  if (!record) return null;
  const rawEpisodeNumber = Number(record.episodeNumber ?? record.partNumber ?? fallbackEpisodeNumber);
  const episodeNumber = Number.isFinite(rawEpisodeNumber) && rawEpisodeNumber > 0 ? Math.round(rawEpisodeNumber) : fallbackEpisodeNumber;
  const partLabel = `Part ${episodeNumber}`;
  const titles = readArray(record.titles)
    .map((item) => {
      const titleRecord = asRecord(item);
      const title = titleRecord ? readString(titleRecord.title) : readString(item);
      if (!title) return null;
      const result: PublishingTitle = { title: withPartLabel(title, partLabel) };
      const angle = titleRecord ? readString(titleRecord.angle) : undefined;
      if (angle) result.angle = angle;
      return result;
    })
    .filter((item): item is PublishingTitle => item !== null)
    .slice(0, 3);
  const description = readString(record.description) ?? "";
  const tags = enrichTags(readStringArray(record.tags).slice(0, 20), titles, description).slice(0, 20);
  const thumbnailPrompts = readArray(record.thumbnailPrompts ?? record.thumbnails)
    .map((item) => {
      const thumbnailRecord = asRecord(item);
      if (!thumbnailRecord) return null;
      const prompt = readString(thumbnailRecord.prompt);
      if (!prompt) return null;
      const result: ThumbnailPrompt = {
        title: withPartLabel(readString(thumbnailRecord.title) ?? "Thumbnail concept", partLabel),
        prompt: withPartPrompt(prompt, partLabel)
      };
      const overlayText = readString(thumbnailRecord.overlayText);
      result.overlayText = withPartLabel(overlayText || partLabel.toUpperCase(), partLabel);
      return result;
    })
    .filter((item): item is ThumbnailPrompt => item !== null)
    .slice(0, 3);
  return {
    episodeNumber,
    partLabel,
    titles,
    description,
    tags,
    thumbnailPrompts,
    sunoPrompt: readSunoMusicPrompt(record.sunoPrompt ?? record.musicPrompt ?? record.backgroundMusicPrompt ?? record.suno),
    pinnedComment: readString(record.pinnedComment)
  };
}

function withPartLabel(value: string, partLabel: string) {
  const trimmed = value.trim();
  if (new RegExp(`\\b${escapeRegExp(partLabel)}\\b`, "i").test(trimmed)) return trimmed;
  return `${partLabel}: ${trimmed}`;
}

function withPartPrompt(value: string, partLabel: string) {
  const trimmed = value.trim();
  if (new RegExp(`\\b${escapeRegExp(partLabel)}\\b`, "i").test(trimmed)) return trimmed;
  return `${trimmed} Include the exact visible text "${partLabel}" as part of the thumbnail overlay.`;
}

function readSunoMusicPrompt(value: unknown): SunoMusicPrompt | undefined {
  const directPrompt = readString(value);
  if (directPrompt) return { prompt: directPrompt };
  const record = asRecord(value);
  if (!record) return undefined;
  const prompt = readString(record.prompt ?? record.stylePrompt ?? record.description);
  if (!prompt) return undefined;
  const title = readString(record.title ?? record.trackTitle ?? record.name);
  return title ? { title, prompt } : { prompt };
}

function fallbackSunoPrompt(titles: PublishingTitle[], tags: string[], description: string): SunoMusicPrompt {
  const primaryTitle = titles[0]?.title || "Documentary Background Score";
  const moodTags = tags.slice(0, 6).join(", ") || extractKeyPhrases(description).slice(0, 4).join(", ") || "documentary mystery";
  return {
    title: `${primaryTitle.split(/\s+/).slice(0, 5).join(" ")} Underscore`,
    prompt: `Instrumental cinematic documentary background music for "${primaryTitle}". Mood keywords: ${moodTags}. Slow-burn, restrained, tense but respectful, emotional undercurrent, sparse piano, low strings, atmospheric pads, subtle pulsing percussion, gradual build, loopable under spoken narration, no vocals, no lyrics, no copyrighted artist references.`
  };
}

function readArticleSeoPack(value: unknown): ArticleSeoPack | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const faq = readArray(record.faq ?? record.faqSection)
    .map((item) => {
      const faqRecord = asRecord(item);
      if (!faqRecord) return null;
      const question = readString(faqRecord.question);
      const answer = readString(faqRecord.answer);
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((item): item is ArticleFaq => item !== null)
    .slice(0, 8);
  const imagePlan = readArray(record.imagePlan ?? record.images)
    .map((item) => {
      const imageRecord = asRecord(item);
      if (!imageRecord) return null;
      const placement = readString(imageRecord.placement);
      const prompt = readString(imageRecord.prompt);
      if (!placement || !prompt) return null;
      const result: ArticleImagePlan = { placement, prompt };
      const altText = readString(imageRecord.altText);
      const caption = readString(imageRecord.caption);
      if (altText) result.altText = altText;
      if (caption) result.caption = caption;
      return result;
    })
    .filter((item): item is ArticleImagePlan => item !== null)
    .slice(0, 6);
  const pack: ArticleSeoPack = {
    secondaryKeywords: readStringArray(record.secondaryKeywords),
    h2Outline: readStringArray(record.h2Outline ?? record.outline),
    faq,
    internalLinkSuggestions: readStringArray(record.internalLinkSuggestions ?? record.internalLinks),
    externalSourceSuggestions: readStringArray(record.externalSourceSuggestions ?? record.externalSources),
    imagePlan
  };
  const primaryKeyword = readString(record.primaryKeyword);
  const searchIntent = readString(record.searchIntent);
  const seoTitle = readString(record.seoTitle);
  const metaDescription = readString(record.metaDescription);
  const urlSlug = readString(record.urlSlug ?? record.slug);
  const h1 = readString(record.h1);
  const schemaRecommendation = readString(record.schemaRecommendation ?? record.schema);
  const featuredSnippetTarget = readString(record.featuredSnippetTarget ?? record.featuredSnippet);
  if (primaryKeyword) pack.primaryKeyword = primaryKeyword;
  if (searchIntent) pack.searchIntent = searchIntent;
  if (seoTitle) pack.seoTitle = seoTitle;
  if (metaDescription) pack.metaDescription = metaDescription;
  if (urlSlug) pack.urlSlug = urlSlug;
  if (h1) pack.h1 = h1;
  if (schemaRecommendation) pack.schemaRecommendation = schemaRecommendation;
  if (featuredSnippetTarget) pack.featuredSnippetTarget = featuredSnippetTarget;
  return pack;
}

function readTopicalAuthorityMap(value: unknown): TopicalAuthorityMap | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const clusters = readArray(record.clusters)
    .map(readTopicalAuthorityCluster)
    .filter((item): item is TopicalAuthorityCluster => item !== null)
    .slice(0, 8);
  const recommendedNextArticles = readArray(record.recommendedNextArticles ?? record.nextArticles)
    .map(readTopicalAuthorityArticle)
    .filter((item): item is TopicalAuthorityArticle => item !== null)
    .slice(0, 12);
  const map: TopicalAuthorityMap = {
    clusters,
    recommendedNextArticles
  };
  const pillarTopic = readString(record.pillarTopic);
  const audience = readString(record.audience);
  const authorityGoal = readString(record.authorityGoal);
  if (pillarTopic) map.pillarTopic = pillarTopic;
  if (audience) map.audience = audience;
  if (authorityGoal) map.authorityGoal = authorityGoal;
  if (!map.pillarTopic && !map.clusters.length && !map.recommendedNextArticles.length) return undefined;
  return map;
}

function readTopicalAuthorityCluster(value: unknown): TopicalAuthorityCluster | null {
  const record = asRecord(value);
  if (!record) return null;
  const clusterName = readString(record.clusterName ?? record.name);
  if (!clusterName) return null;
  const supportingArticles = readArray(record.supportingArticles ?? record.articles)
    .map(readTopicalAuthorityArticle)
    .filter((item): item is TopicalAuthorityArticle => item !== null)
    .slice(0, 10);
  const cluster: TopicalAuthorityCluster = { clusterName, supportingArticles };
  const pillarArticle = readString(record.pillarArticle);
  if (pillarArticle) cluster.pillarArticle = pillarArticle;
  return cluster;
}

function readTopicalAuthorityArticle(value: unknown): TopicalAuthorityArticle | null {
  const record = asRecord(value);
  if (!record) return null;
  const title = readString(record.title);
  if (!title) return null;
  const article: TopicalAuthorityArticle = {
    title,
    internalLinks: readStringArray(record.internalLinks)
  };
  const primaryKeyword = readString(record.primaryKeyword);
  const intent = readString(record.intent);
  const funnelStage = readString(record.funnelStage);
  const priority = readString(record.priority);
  const angle = readString(record.angle);
  if (primaryKeyword) article.primaryKeyword = primaryKeyword;
  if (intent) article.intent = intent;
  if (funnelStage) article.funnelStage = funnelStage;
  if (priority) article.priority = priority;
  if (angle) article.angle = angle;
  return article;
}

function parseJsonObject(content: string) {
  for (const candidate of jsonCandidates(content)) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(jsonrepair(candidate)) as Record<string, unknown>;
      } catch {
        // Try the next candidate.
      }
    }
  }
  throw new Error("Publishing Pack was not valid JSON.");
}

function jsonCandidates(content: string) {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (fenced) candidates.unshift(fenced);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.unshift(trimmed.slice(first, last + 1));
  return Array.from(new Set(candidates.filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown) {
  return readArray(value)
    .map((item) => readString(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 24);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enrichTags(tags: string[], titles: PublishingTitle[], description: string) {
  const topicText = [...tags, ...titles.map((item) => item.title), description].join(" ").toLowerCase();
  const storyOrDocumentaryTopic = /\b(documentary|true story|mystery|history|historical|case|cold case|unsolved|disappearance|missing|ship|expedition|archive|records?|investigation)\b/.test(topicText);
  const fallbackTags = storyOrDocumentaryTopic
    ? [
        "documentary",
        "true story",
        "historical documentary",
        "mystery documentary",
        "unsolved mystery",
        "long form documentary",
        "strange history",
        "forgotten history",
        "true mystery",
        "case documentary"
      ]
    : [
        "expert guide",
        "buyer guide",
        "local guide",
        "how to",
        "faq",
        "cost guide",
        "comparison guide",
        "professional advice",
        "common questions",
        "decision guide"
      ];
  const candidates = [
    ...tags,
    ...titles.map((item) => item.title),
    ...extractKeyPhrases(description),
    ...fallbackTags
  ];

  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const cleaned = cleanTag(candidate);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!unique.has(key)) unique.set(key, cleaned);
    if (unique.size >= 20) break;
  }

  return Array.from(unique.values());
}

function extractKeyPhrases(value: string) {
  const phrases = new Set<string>();
  const withoutUrls = value.replace(/https?:\/\/\S+/gi, " ");
  const capitalized = withoutUrls.match(/\b[A-Z][A-Za-z'.-]+(?:\s+(?:of|the|and|from|at|in|on|[A-Z][A-Za-z'.-]+)){1,5}/g) ?? [];
  for (const phrase of capitalized) {
    phrases.add(phrase);
  }

  const topicPhrases = withoutUrls.match(/\b(?:lighthouse|island|disappearance|missing|mystery|documentary|history|official|investigation|records?|keepers?|ship|expedition|cold case|unsolved)[A-Za-z\s-]{0,50}/gi) ?? [];
  for (const phrase of topicPhrases) {
    phrases.add(phrase);
  }

  return Array.from(phrases);
}

function cleanTag(value: string) {
  const cleaned = value
    .replace(/^#+/, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\w\s'&.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 3 || cleaned.length > 60) return "";
  if (/^(the|and|with|from|this|that|today|learn more)$/i.test(cleaned)) return "";
  return cleaned;
}
