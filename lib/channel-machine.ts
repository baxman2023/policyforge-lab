import "server-only";
import { formatKeywordMetricsForPrompt, type SeoKeywordMetric } from "@/lib/dataforseo";
import { nicheFocusOptions, storyLengthOptions, toneOptions } from "@/lib/story-options";

const CHANNEL_KEYWORDS_MAX_CHARS = 500;
const CHANNEL_KEYWORDS_TARGET_CHARS = 470;
const CHANNEL_DESCRIPTION_MAX_CHARS = 1000;
const CHANNEL_DESCRIPTION_TARGET_MIN_CHARS = 850;
const CHANNEL_DESCRIPTION_TARGET_MAX_CHARS = 980;

export type ChannelIdeaCombination = {
  nicheFocus: string;
  category: string;
  tone: string;
  desiredLength: string;
  sourceType: string;
  rationale: string;
  sampleAngles: string[];
};

export type ChannelKeyword = {
  keyword: string;
  intent: string;
  priority: "Primary" | "Secondary" | "Experimental";
  searchVolume?: number;
  competition?: string;
  competitionIndex?: number;
  cpc?: number;
};

export type ChannelIdeaMachineKit = {
  channelName: string;
  tagline: string;
  description: string;
  targetAudience: string;
  toneRules: string;
  voiceProfile: string;
  introStyle: string;
  formattingRules: string;
  phrasesToUse: string;
  recurringStoryTypes: string;
  bannedPhrases: string;
  phrasesToAvoid: string;
  thumbnailStyle: string;
  sponsorRules: string;
  publishingRhythm: string;
  keywords: ChannelKeyword[];
  ideaCombinations: ChannelIdeaCombination[];
  logoPrompt: string;
  bannerPrompt: string;
  logoImageUrl?: string;
  bannerImageUrl?: string;
  imageModelUsed?: string;
  dataForSeoWarning?: string;
};

export function channelIdeaMachinePrompt(input: {
  currentChannelName: string;
  seed: string;
  keywordMetrics: SeoKeywordMetric[];
  surpriseMe?: boolean;
}) {
  const lengthChoices = storyLengthOptions.map((item) => `${item.label.replace("min", "minutes")}`).join(", ");

  return `Create a complete channel strategy kit for a Texas insurance agency growth engine.

This is for a NEW channel.
Do not preserve, echo, remix, or reuse any existing active channel name or previous channel concept.

Mode:
${input.surpriseMe ? "SURPRISE ME. Invent a fresh, differentiated, commercially strong channel concept from scratch." : "Guided new-channel planning. Use the creator direction as the absolute source of truth."}

Agency direction or seed:
${input.seed || "No seed provided. Develop a strong, sellable insurance growth lane from the existing Baxter Growth Lab strengths."}

Agency facts to preserve:
- Baxter Insurance Agency, Inc.
- Phone: 281-445-1381
- Mailing address: 450 N Sam Houston Pkwy E Ste 103, Houston, TX 77060
- Licensed for General Lines and life in Texas only.
- Serves all of Texas, mainly Houston and surrounding areas.
- Primary revenue emphasis: home and auto. Also supports commercial P&C and life.
- Priority carriers to mention carefully when relevant: Germania, Travelers, SWYFFT, Progressive, GEICO, plus other available markets.
- Never promise savings, coverage, eligibility, underwriting acceptance, or claim outcomes. Coverage depends on policy terms, conditions, limits, exclusions, endorsements, deductibles, underwriting, carrier appetite, and Texas regulations.

Keyword metrics from DataForSEO, when available:
${formatKeywordMetricsForPrompt(input.keywordMetrics)}

Available Idea Factory dropdown choices:
- Niche / Focus: ${nicheFocusOptions.join(", ")}
- Tone: ${toneOptions.join(", ")}
- Desired Length: ${lengthChoices}
- Source Type: Agency knowledge, Texas market context, carrier guidelines, client FAQs, local SEO research, policy review notes, claims documentation checklist

Return strict JSON only. Do not use Markdown fences.

Schema:
{
  "channelName": "short memorable channel name",
  "tagline": "short subtext / banner subtitle",
  "description": "Channel or brand About description, 900-980 characters, never over 1000 characters",
  "targetAudience": "who this channel is for",
  "toneRules": "voice, pacing, claims, ethics, and narration rules",
  "voiceProfile": "specific reusable brand voice rules for all outputs",
  "introStyle": "repeatable opening style that should vary naturally from piece to piece",
  "formattingRules": "format-specific output rules for scripts, articles, podcasts, books, and packs",
  "phrasesToUse": "comma-separated preferred language patterns",
  "recurringStoryTypes": "the repeatable story lanes this channel owns",
  "bannedPhrases": "phrases and framing to avoid",
  "phrasesToAvoid": "comma-separated extra phrases or habits to avoid",
  "thumbnailStyle": "visual rules for thumbnails and channel identity",
  "sponsorRules": "sponsor placement and tone rules",
  "publishingRhythm": "publishing rhythm",
  "keywords": [
    { "keyword": "keyword phrase", "intent": "why it matters", "priority": "Primary | Secondary | Experimental" }
  ],
  "ideaCombinations": [
    {
      "nicheFocus": "exact Niche / Focus dropdown value",
      "category": "specific category phrase for the Category dropdown",
      "tone": "exact Tone dropdown value",
      "desiredLength": "exact Desired Length dropdown value",
      "sourceType": "exact Source Type dropdown value",
      "rationale": "why this combination is strategically useful",
      "sampleAngles": ["sample story search angle", "sample story search angle", "sample story search angle"]
    }
  ],
  "logoPrompt": "Ideogram 4 prompt for a square channel logo",
  "bannerPrompt": "Ideogram 4 prompt for a 2560 x 1440 YouTube or web banner with channel name and tagline only inside the centered 1546 x 423 safe area"
}

Rules:
- The ideaCombinations are the most important output. Provide 12-18 combinations.
- In Surprise Me mode, make the channel concept specific enough to feel ownable, not a generic insurance content bucket.
- Generate a fresh channelName for this kit.
- If the creator direction mentions a line such as homeowners, auto, flood, storm, renewal, commercial, contractors, life, local SEO, referrals, or umbrella, the channelName, tagline, description, keywords, and ideaCombinations must clearly match that requested line.
- Never reuse or lightly reword a previous active channel name.
- Every idea combination must be designed to repeatedly generate quote-ready videos, local SEO pages, emails, social posts, client checklists, or scripts for this exact channel.
- Use only exact values from the Niche / Focus, Tone, Desired Length, and Source Type lists.
- Category can be specific and channel-tailored, but must be short enough to use in the Idea Factory dropdown.
- Favor combinations with local search intent, household/business urgency, renewal timing, cross-sell value, referral potential, and compliance-safe education.
- Mix evergreen search demand with seasonal Texas moments such as storm season, renewals, home purchases, teen drivers, new businesses, and contract/certificate requests.
- The description is for a channel About or brand setup field. Write 900-980 useful characters so it is close to the 1000-character limit without exceeding it. Do not pad with generic hype.
- The description must include the agency promise, recurring asset lanes, education/source approach, audience fit, compliance boundaries, and a concise quote/review reason. Work in natural local SEO phrases without keyword stuffing.
- YouTube channel keywords are copied into a 500-character setup field. Return enough compact keyword phrases for the comma-separated keyword string to land between 430 and 500 characters. Prefer 24-36 short phrases. No single keyword should exceed 5 words.
- If keyword metrics are available, prefer keywords with meaningful volume and defensible topical fit over generic high-volume bait.
- The banner prompt must explicitly include the channelName and tagline as readable text.
- Banner safe-area rule is mandatory: full image 2560 x 1440, all text/logo/brand marks only inside the centered safe rectangle 1546 x 423, from x=507 to x=2053 and y=508 to y=931. Outer areas must have no text, no logos, no initials, no numbers, and no important subject details.
- The logo prompt should avoid tiny text; use initials, a symbolic mark, or a simple emblem if the full name is too long.`;
}

export function normalizeChannelKit(raw: unknown, metrics: SeoKeywordMetric[] = []): ChannelIdeaMachineKit {
  const source = isRecord(raw) ? raw : {};
  const metricMap = new Map(metrics.map((metric) => [metric.keyword.toLowerCase(), metric]));
  const channelName = readString(source.channelName) || "Baxter Coverage Lab";
  const tagline = readString(source.tagline) || "Texas insurance made easier to understand.";
  const targetAudience = readString(source.targetAudience) || "Texas homeowners, drivers, families, landlords, and small-business owners who need practical insurance guidance.";
  const recurringStoryTypes = readString(source.recurringStoryTypes) || "Home and auto reviews, Houston homeowners questions, storm readiness, flood education, renewal rescue, commercial coverage explainers, referral campaigns, and cross-sell prompts.";
  const ideaCombinations = normalizeCombinations(source.ideaCombinations);
  const description = fitChannelDescription(
    readString(source.description) || `${channelName} creates practical Texas insurance education for homeowners, drivers, families, landlords, and business owners who want clearer coverage conversations before they buy, renew, or request a quote.`,
    { channelName, tagline, targetAudience, recurringStoryTypes, ideaCombinations }
  );
  const keywords = readArray(source.keywords).map((item) => {
    const record = isRecord(item) ? item : {};
    const keyword = normalizeKeywordPhrase(readString(record.keyword));
    const metric = metricMap.get(keyword.toLowerCase());
    return {
      keyword,
      intent: readString(record.intent) || "Discovery keyword for this channel.",
      priority: normalizePriority(readString(record.priority)),
      ...(metric ? {
        searchVolume: metric.searchVolume,
        competition: metric.competition,
        competitionIndex: metric.competitionIndex,
        cpc: metric.cpc
      } : {})
    };
  }).filter((item) => item.keyword);

  return {
    channelName,
    tagline,
    description,
    targetAudience,
    toneRules: readString(source.toneRules) || "Helpful, local, plain-English, and careful about policy limitations. Never promise savings, coverage, eligibility, underwriting acceptance, or claim outcomes.",
    voiceProfile: readString(source.voiceProfile) || "Trusted Texas insurance advisor: warm, direct, practical, and compliance-safe.",
    introStyle: readString(source.introStyle) || "Open with a real Texas insurance question, risk, renewal issue, household change, storm concern, or business decision.",
    formattingRules: readString(source.formattingRules) || "Keep each asset format-specific: clean article headings, teleprompter-safe spoken scripts, useful emails, and quote-ready checklists.",
    phrasesToUse: readString(source.phrasesToUse) || "coverage depends on policy terms, request a review, quote-ready checklist, talk with a licensed Texas agent",
    recurringStoryTypes,
    bannedPhrases: readString(source.bannedPhrases) || "guaranteed savings, fully covered, cheapest, best rate guaranteed, claim will be paid, everyone qualifies, no exclusions.",
    phrasesToAvoid: readString(source.phrasesToAvoid) || "secret trick, loophole, one weird hack, guaranteed, always covered, never denied",
    thumbnailStyle: readString(source.thumbnailStyle) || "Clean professional insurance visuals, Texas/Houston cues, home/auto/business subject, readable two-to-five-word overlay, trust-first not fear-first.",
    sponsorRules: readString(source.sponsorRules) || "Use Baxter Insurance Agency, Inc. as the natural call-to-action. Mention 281-445-1381 where appropriate. Do not make carrier promises.",
    publishingRhythm: readString(source.publishingRhythm) || "Two weekly education assets, one weekly local SEO asset, and one weekly client/referral campaign.",
    keywords: fitChannelKeywords(keywords, { channelName, tagline, description, targetAudience, recurringStoryTypes, ideaCombinations }),
    ideaCombinations,
    logoPrompt: readString(source.logoPrompt) || `Square premium insurance brand logo for "${channelName}", clean shield or document emblem, Texas professional feel, no tiny text.`,
    bannerPrompt: readString(source.bannerPrompt) || safeAreaBannerPrompt(channelName, tagline)
  };
}

export function enrichChannelKitKeywords(kit: ChannelIdeaMachineKit, metrics: SeoKeywordMetric[]) {
  const metricMap = new Map(metrics.map((metric) => [metric.keyword.toLowerCase(), metric]));
  const keywords = fitChannelKeywords(kit.keywords.map((keyword) => {
    const metric = metricMap.get(keyword.keyword.toLowerCase());
    if (!metric) return keyword;
    return {
      ...keyword,
      searchVolume: metric.searchVolume,
      competition: metric.competition,
      competitionIndex: metric.competitionIndex,
      cpc: metric.cpc
    };
  }), kit);
  return {
    ...kit,
    keywords: keywords.sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
  };
}

export function fallbackChannelKit(input: {
  currentChannelName: string;
  seed?: string;
  surpriseMe?: boolean;
  metrics?: SeoKeywordMetric[];
}): ChannelIdeaMachineKit {
  const lane = inferFallbackLane(input.seed || "", input.surpriseMe);
  const keywords = fallbackKeywords(lane).map((keyword, index) => {
    const metric = input.metrics?.find((item) => item.keyword.toLowerCase() === keyword.toLowerCase());
    return {
      keyword,
      intent: index < 4 ? "Core discovery keyword for this channel lane." : "Supporting keyword for story research and SEO packaging.",
      priority: index < 4 ? "Primary" as const : index < 9 ? "Secondary" as const : "Experimental" as const,
      ...(metric ? {
        searchVolume: metric.searchVolume,
        competition: metric.competition,
        competitionIndex: metric.competitionIndex,
        cpc: metric.cpc
      } : {})
    };
  });

  return {
    channelName: lane.channelName,
    tagline: lane.tagline,
    description: fitChannelDescription(lane.description, {
      channelName: lane.channelName,
      tagline: lane.tagline,
      targetAudience: lane.targetAudience,
      recurringStoryTypes: lane.recurringStoryTypes,
      ideaCombinations: lane.combinations
    }),
    targetAudience: lane.targetAudience,
    toneRules: "Helpful, local, compliance-safe, and clear about policy limitations. Never promise savings, coverage, eligibility, underwriting acceptance, or claim outcomes.",
    voiceProfile: "Trusted Texas insurance advisor: practical, warm, direct, and plain-English.",
    introStyle: "Begin with a real Texas insurance risk, household question, renewal issue, storm concern, or business decision.",
    formattingRules: "Use format-specific structure: clean headings for SEO pages, no production notes in final spoken scripts, and clear licensed-agent review CTAs.",
    phrasesToUse: "coverage depends on policy terms, request a review, quote-ready checklist, licensed Texas agent",
    recurringStoryTypes: lane.recurringStoryTypes,
    bannedPhrases: "guaranteed savings, fully covered, cheapest, best rate guaranteed, claim will be paid, everyone qualifies, no exclusions.",
    phrasesToAvoid: "secret trick, loophole, one weird hack, guaranteed, always covered, never denied",
    thumbnailStyle: "Consistent insurance advisor visuals with one central home, vehicle, business, document, or Texas cue, strong contrast, readable three-to-five-word text.",
    sponsorRules: "Use Baxter Insurance Agency, Inc. as the natural call-to-action and mention 281-445-1381 when appropriate.",
    publishingRhythm: "Two weekly education assets, one weekly local SEO asset, and one weekly client/referral campaign.",
    keywords: fitChannelKeywords(keywords, {
      channelName: lane.channelName,
      tagline: lane.tagline,
      description: lane.description,
      targetAudience: lane.targetAudience,
      recurringStoryTypes: lane.recurringStoryTypes,
      ideaCombinations: lane.combinations
    }),
    ideaCombinations: lane.combinations,
    logoPrompt: `Square premium insurance brand logo for "${lane.channelName}", simple shield, roofline, car, or document emblem, bold readable mark, no tiny text.`,
    bannerPrompt: safeAreaBannerPrompt(lane.channelName, lane.tagline)
  };
}

export function repairChannelKitForNewTopic(kit: ChannelIdeaMachineKit, input: {
  currentChannelName: string;
  seed?: string;
  metrics?: SeoKeywordMetric[];
}) {
  if (!shouldReplaceLeakyKit(kit, input)) return kit;
  const replacement = fallbackChannelKit({
    currentChannelName: input.currentChannelName,
    seed: input.seed,
    metrics: input.metrics
  });
  return {
    ...replacement,
    dataForSeoWarning: [
      kit.dataForSeoWarning,
      "Generated kit reused the active channel context, so Baxter Growth Lab replaced it with a clean topic-matched kit."
    ].filter(Boolean).join(" ")
  };
}

function safeAreaBannerPrompt(channelName: string, tagline: string) {
  return `YouTube or web banner, exact full canvas 2560 x 1440. Centered mobile safe area is 1546 x 423 pixels from x=507 to x=2053 and y=508 to y=931. Put readable text "${channelName}" and subtitle "${tagline}" entirely inside that safe area only, centered with generous padding. Do not place any text, letters, logo, initials, numbers, watermark, or important subject outside the safe area. Outer desktop/tablet areas should be professional Texas insurance background only: subtle Houston/Texas cues, home, auto, business, policy documents, premium consistent brand system.`;
}

type FallbackLane = {
  channelName: string;
  tagline: string;
  description: string;
  targetAudience: string;
  recurringStoryTypes: string;
  keywords: string[];
  combinations: ChannelIdeaCombination[];
};

function inferFallbackLane(seed: string, surpriseMe = false): FallbackLane {
  const value = seed.toLowerCase();
  if (surpriseMe) return homeAutoLane();
  if (/commercial|business|contractor|certificate|bop|general liability|fleet/.test(value)) return commercialLane();
  if (/storm|hail|wind|roof|hurricane|claim/.test(value)) return stormLane();
  if (/flood|nfip/.test(value)) return floodLane();
  if (/renew|retention|save|remarket/.test(value)) return renewalLane();
  if (/life|family protection|mortgage protection/.test(value)) return lifeLane();
  if (/seo|city|local|houston|google/.test(value)) return localSeoLane();
  return homeAutoLane();
}

function shouldReplaceLeakyKit(kit: ChannelIdeaMachineKit, input: {
  currentChannelName: string;
  seed?: string;
}) {
  const seed = (input.seed || "").toLowerCase();
  const generatedName = normalizeComparable(kit.channelName);
  const activeName = normalizeComparable(input.currentChannelName);

  if (activeName && generatedName === activeName) return true;

  const generatedText = normalizeComparable([
    kit.channelName,
    kit.tagline,
    kit.description,
    kit.keywords.map((keyword) => keyword.keyword).join(" "),
    kit.ideaCombinations.map((combination) => `${combination.nicheFocus} ${combination.category}`).join(" ")
  ].join(" "));

  const historicalRequested = /histor|history|archive|forgotten|myster/.test(seed) && !/court|legal|trial|lawsuit/.test(seed);
  const courtLeaked = /\bcourt|courtroom|legal|trial|lawsuit|deposition|affidavit|verdict|litigation\b/.test(generatedText);
  return historicalRequested && courtLeaked && /court|legal|trial|lawsuit|deposition|affidavit|verdict|litigation/.test(generatedName);
}

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function fallbackKeywords(lane: FallbackLane) {
  return lane.keywords;
}

function fitChannelKeywords(keywords: ChannelKeyword[], context: {
  channelName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  recurringStoryTypes?: string;
  ideaCombinations?: ChannelIdeaCombination[];
}) {
  const output: ChannelKeyword[] = [];
  const seen = new Set<string>();

  const addKeyword = (item: Partial<ChannelKeyword> & { keyword: string }) => {
    const keyword = normalizeKeywordPhrase(item.keyword);
    if (!keyword || seen.has(keyword)) return false;

    const nextLength = output.length ? keywordCsvLength(output) + 2 + keyword.length : keyword.length;
    if (nextLength > CHANNEL_KEYWORDS_MAX_CHARS) return false;

    seen.add(keyword);
    output.push({
      keyword,
      intent: item.intent || "Discovery keyword for this channel.",
      priority: item.priority || "Secondary",
      ...(item.searchVolume !== undefined ? { searchVolume: item.searchVolume } : {}),
      ...(item.competition !== undefined ? { competition: item.competition } : {}),
      ...(item.competitionIndex !== undefined ? { competitionIndex: item.competitionIndex } : {}),
      ...(item.cpc !== undefined ? { cpc: item.cpc } : {})
    });
    return true;
  };

  keywords.forEach((keyword) => addKeyword(keyword));

  for (const keyword of channelKeywordBackfill(context)) {
    if (keywordCsvLength(output) >= CHANNEL_KEYWORDS_TARGET_CHARS) break;
    addKeyword({
      keyword,
      intent: "Additional compact channel setup keyword.",
      priority: "Secondary"
    });
  }

  return output;
}

function fitChannelDescription(description: string, context: {
  channelName: string;
  tagline?: string;
  targetAudience?: string;
  recurringStoryTypes?: string;
  ideaCombinations?: ChannelIdeaCombination[];
}) {
  const base = normalizeDescriptionText(description);
  if (base.length >= CHANNEL_DESCRIPTION_TARGET_MIN_CHARS) return trimDescriptionToMax(base);

  const combinations = context.ideaCombinations ?? [];
  const sourceTypes = uniqueShortList(combinations.map((combination) => combination.sourceType)).slice(0, 3);
  const categories = uniqueShortList(combinations.map((combination) => combination.category)).slice(0, 5);
  const sourceLine = sourceTypes.length
    ? `Research leans on ${humanList(sourceTypes.map(sourceTypeDescription))}, then separates confirmed facts, plausible interpretations, and open questions.`
    : "Research starts with records, reports, archives, maps, testimony, photographs, and published accounts, then separates confirmed facts from open questions.";
  const laneLine = context.recurringStoryTypes
    ? `Expect recurring lanes around ${lowerFirst(context.recurringStoryTypes)}`
    : categories.length
      ? `Expect recurring lanes around ${humanList(categories)}.`
      : "Expect recurring lanes built around unresolved questions, overlooked records, human consequences, and strong visual hooks.";
  const audienceLine = context.targetAudience
    ? `It is made for ${lowerFirst(context.targetAudience)}`
    : "It is made for viewers who want long-form documentary storytelling with atmosphere, restraint, and a real paper trail.";
  const additions = [
    laneLine.endsWith(".") ? laneLine : `${laneLine}.`,
    sourceLine,
    "Every episode is structured for cinematic pacing: a clear hook, escalating evidence, human stakes, uncertainty labels where needed, and an ending that leaves the next useful question on the table.",
    audienceLine.endsWith(".") ? audienceLine : `${audienceLine}.`,
    `Subscribe to ${context.channelName} for evidence-first stories that are built to be watchable, searchable, and responsible.`
  ];

  let output = base;
  for (const addition of additions) {
    const next = normalizeDescriptionText(`${output} ${addition}`);
    if (next.length <= CHANNEL_DESCRIPTION_TARGET_MAX_CHARS || output.length < CHANNEL_DESCRIPTION_TARGET_MIN_CHARS) output = next;
    if (output.length >= CHANNEL_DESCRIPTION_TARGET_MIN_CHARS) break;
  }
  return trimDescriptionToMax(output);
}

function normalizeDescriptionText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimDescriptionToMax(value: string) {
  const normalized = normalizeDescriptionText(value);
  if (normalized.length <= CHANNEL_DESCRIPTION_MAX_CHARS) return normalized;
  const clipped = normalized.slice(0, CHANNEL_DESCRIPTION_MAX_CHARS + 1);
  const sentenceBoundary = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("? "), clipped.lastIndexOf("! "));
  if (sentenceBoundary >= CHANNEL_DESCRIPTION_TARGET_MIN_CHARS) return clipped.slice(0, sentenceBoundary + 1).trim();
  return `${normalized.slice(0, CHANNEL_DESCRIPTION_MAX_CHARS - 3).trimEnd()}...`;
}

function lowerFirst(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

function humanList(values: string[]) {
  const cleaned = uniqueShortList(values);
  if (cleaned.length <= 1) return cleaned[0] || "";
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned[cleaned.length - 1]}`;
}

function uniqueShortList(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const cleaned = value.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function sourceTypeDescription(sourceType: string) {
  if (/carrier|quot/i.test(sourceType)) return "carrier guidelines and quoting workflow";
  if (/local|seo|keyword|service/i.test(sourceType)) return "local SEO research and service-area pages";
  if (/client|faq|policy|review/i.test(sourceType)) return "client FAQs and policy review notes";
  if (/claim/i.test(sourceType)) return "claims documentation checklists";
  if (/pasted|supplied/i.test(sourceType)) return "agency-supplied source material";
  return sourceType.toLowerCase();
}

function keywordCsvLength(keywords: ChannelKeyword[]) {
  return keywords.map((item) => item.keyword).join(", ").length;
}

function channelKeywordBackfill(context: {
  channelName?: string;
  tagline?: string;
  description?: string;
  targetAudience?: string;
  recurringStoryTypes?: string;
  ideaCombinations?: ChannelIdeaCombination[];
}) {
  const combinations = context.ideaCombinations ?? [];
  const raw = [
    context.channelName,
    ...compactKeywordFragments(context.tagline || ""),
    ...compactKeywordFragments(context.targetAudience || ""),
    ...compactKeywordFragments(context.recurringStoryTypes || ""),
    ...combinations.flatMap((combination) => [
      combination.nicheFocus,
      combination.category,
      `${combination.category} documentary`,
      `${combination.category} stories`,
      `${combination.nicheFocus} documentary`,
      sourceTypeKeyword(combination.sourceType)
    ]),
    ...GENERIC_CHANNEL_KEYWORDS
  ];

  return raw.filter((keyword): keyword is string => Boolean(keyword));
}

function compactKeywordFragments(value: string) {
  return value
    .replace(/\bviewers who (?:love|like|want|watch)\b/gi, "")
    .replace(/\bbuilt for\b/gi, "")
    .split(/[,.;:]|\band\b/i)
    .map((part) => part.replace(/\b(documentary stories|storytelling stories)\b/gi, "stories").trim())
    .filter(Boolean);
}

function sourceTypeKeyword(sourceType: string) {
  if (/carrier|quot/i.test(sourceType)) return "carrier guidelines";
  if (/local|seo|keyword|service/i.test(sourceType)) return "local SEO";
  if (/client|faq|policy|review/i.test(sourceType)) return "client FAQs";
  if (/claim/i.test(sourceType)) return "claims checklist";
  if (/pasted|supplied/i.test(sourceType)) return "agency notes";
  return "";
}

const GENERIC_CHANNEL_KEYWORDS = [
  "Texas insurance",
  "Houston insurance agency",
  "home insurance Houston",
  "auto insurance Houston",
  "Texas home insurance",
  "Texas auto insurance",
  "home and auto bundle",
  "insurance renewal review",
  "storm insurance Texas",
  "flood insurance Houston",
  "business insurance Houston",
  "general liability Texas",
  "contractor insurance Texas",
  "commercial auto insurance",
  "personal umbrella insurance",
  "life insurance Houston",
  "Baxter Insurance Agency",
  "Germania insurance",
  "Travelers insurance",
  "Progressive insurance",
  "GEICO insurance",
  "SWYFFT insurance",
  "policy review",
  "insurance quote Texas"
];

function homeAutoLane(): FallbackLane {
  return insuranceLane({
    channelName: "Baxter Home Auto Lab",
    tagline: "Texas home and auto made clearer.",
    description: "Baxter Home Auto Lab helps Texas homeowners and drivers understand the decisions behind home insurance, auto insurance, bundles, deductibles, renewal changes, teen drivers, roof questions, and household reviews. Built by Baxter Insurance Agency, Inc. in Houston, the channel is for families who want plain-English guidance before they request a quote or review. Coverage depends on policy terms, conditions, exclusions, limits, deductibles, endorsements, underwriting, carrier appetite, and Texas regulations.",
    targetAudience: "Texas homeowners, drivers, families, and households in Houston and surrounding areas.",
    recurringStoryTypes: "Home and auto quote checklists, renewal reviews, deductible explainers, teen driver questions, roof and storm readiness, bundle conversations, and household cross-sell prompts.",
    keywords: ["Texas home insurance", "Houston auto insurance", "home and auto bundle", "Baxter Insurance Agency", "Texas insurance review", "homeowners insurance Houston", "auto insurance quote Texas", "insurance renewal review"],
    combinations: [
      combo("Home and auto insurance", "Home Auto Reviews", "Helpful, local, consultative", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Primary quote lane for Texas households.", ["Home and auto review checklist", "What changes before renewal can affect premiums", "Bundle questions for Houston families"]),
      combo("Homeowners insurance", "Houston Homeowners", "Local expert", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Core Houston local SEO and quote intent.", ["Roof age questions", "Wind and hail deductible explainer", "Home insurance review before storm season"]),
      combo("Auto insurance", "Texas Drivers", "Clear and practical", "10 minutes", "Mixed (Books, Articles, Podcasts)", "High-volume auto quote and cross-sell lane.", ["Uninsured motorist conversation", "Teen driver checklist", "Liability limits explained plainly"])
    ]
  });
}

function commercialLane(): FallbackLane {
  return insuranceLane({
    channelName: "Baxter Business Coverage",
    tagline: "Insurance checklists for Texas businesses.",
    description: "Baxter Business Coverage turns small-business insurance questions into practical checklists for Texas owners, contractors, retailers, restaurants, offices, and service companies. The channel explains general liability, BOP, commercial property, certificates of insurance, commercial auto, hired and non-owned auto, tools, equipment, leases, contracts, and renewals. It is built for Houston-area business owners who need quote-ready guidance from Baxter Insurance Agency, Inc. before growth creates avoidable coverage gaps.",
    targetAudience: "Texas small-business owners, contractors, retailers, restaurants, offices, and service businesses.",
    recurringStoryTypes: "General liability explainers, BOP checklists, certificate requests, commercial auto questions, contractor tools and equipment, lease insurance requirements, and renewal reviews.",
    keywords: ["business insurance Houston", "Texas general liability", "contractor insurance Texas", "certificate of insurance", "commercial auto insurance", "business owners policy", "commercial property insurance", "Houston business insurance"],
    combinations: [
      combo("Small business insurance", "Business Insurance", "Professional and plain-English", "10 minutes", "Court records and official reports", "High-value commercial account lane.", ["Before signing a business lease", "BOP versus general liability", "Certificate requests explained"]),
      combo("Contractor insurance", "Contractors", "Direct and practical", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Urgent certificate-driven quote behavior.", ["Contractor COI checklist", "Tools and equipment questions", "Commercial auto for work trucks"]),
      combo("Commercial auto", "Business Vehicles", "Risk-aware", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Strong commercial cross-sell.", ["Personal versus business driving", "Hired and non-owned auto", "Driver list renewal hygiene"])
    ]
  });
}

function stormLane(): FallbackLane {
  return insuranceLane({
    channelName: "Texas Storm Coverage Lab",
    tagline: "Prepare before the weather turns.",
    description: "Texas Storm Coverage Lab helps Houston-area homeowners prepare for wind, hail, hurricane, water, roof, and claim-documentation conversations before bad weather creates panic. The channel explains deductible questions, home inventories, roof age, photos to take, what to ask before renewal, and how to contact the carrier or agent after damage. It does not replace carrier claim guidance or policy review. Baxter Insurance Agency, Inc. uses this lane to create calm, useful education before storm season.",
    targetAudience: "Houston-area homeowners and Texas property owners preparing for storm season or roof-related insurance questions.",
    recurringStoryTypes: "Storm readiness checklists, wind and hail deductible explainers, roof age education, home inventory reminders, claim documentation tips, and post-storm next steps.",
    keywords: ["Texas hail insurance", "Houston storm damage", "wind hail deductible", "roof insurance claim", "hurricane insurance Texas", "storm readiness checklist", "home inventory insurance", "Texas homeowners insurance"],
    combinations: [
      combo("Storm readiness", "Wind Hail Roof", "Calm and action-oriented", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Seasonal urgency and client-service value.", ["Wind and hail deductible surprise", "Photos before hurricane season", "Roof damage first 24 hours"]),
      combo("Homeowners insurance", "Roof Questions", "Local expert", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Common Houston homeowner pain point.", ["Why roof age matters", "What roof updates to report", "Inspection questions before renewal"])
    ]
  });
}

function floodLane(): FallbackLane {
  return insuranceLane({
    channelName: "Houston Flood Insurance Guide",
    tagline: "Flood risk deserves its own conversation.",
    description: "Houston Flood Insurance Guide explains flood risk for Texas homeowners, renters, landlords, and property buyers who may not realize flood coverage is a separate conversation from a standard home policy. The channel covers NFIP basics, private flood questions, lender requirements, waiting periods, maps, elevation, Houston flooding realities, and quote triggers. Baxter Insurance Agency, Inc. uses this lane to help clients ask better flood questions before water is already at the door.",
    targetAudience: "Houston and Texas property owners, renters, landlords, and buyers with flood-risk questions.",
    recurringStoryTypes: "NFIP basics, private flood education, lender requirements, waiting periods, flood map questions, quote triggers, and property-buyer checklists.",
    keywords: ["Houston flood insurance", "Texas flood insurance", "NFIP flood policy", "private flood insurance", "flood insurance waiting period", "flood zone Houston", "home insurance flood coverage", "Baxter Insurance Agency"],
    combinations: [
      combo("Flood insurance", "Flood Education", "Educational and urgent", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Major Houston protection gap.", ["Flood insurance waiting periods", "Outside the flood zone questions", "NFIP versus private flood"]),
      combo("Homeowners insurance", "Buyer Flood Checklist", "Helpful, local, consultative", "10 minutes", "Local archives and newspapers", "High-intent homebuyer education.", ["Flood questions before buying", "Lender requirements", "Houston property flood review"])
    ]
  });
}

function renewalLane(): FallbackLane {
  return insuranceLane({
    channelName: "Baxter Renewal Rescue",
    tagline: "Do not panic at renewal.",
    description: "Baxter Renewal Rescue helps Texas clients understand renewal reviews, premium changes, remarketing questions, policy updates, household changes, and cross-sell opportunities before they shop blindly or cancel too quickly. The channel is built for current clients and warm prospects who want a calm explanation and a practical next step. Baxter Insurance Agency, Inc. uses this lane to protect relationships, start reviews earlier, and turn renewal frustration into better coverage conversations.",
    targetAudience: "Current clients, warm prospects, homeowners, drivers, families, and business owners facing renewal decisions.",
    recurringStoryTypes: "Renewal review emails, premium-change explainers, remarketing checklists, retention scripts, cross-sell prompts, and client service follow-ups.",
    keywords: ["insurance renewal review", "home insurance premium increase", "auto insurance renewal", "policy review Texas", "insurance remarketing", "renewal checklist", "Baxter Insurance Agency", "Houston insurance agency"],
    combinations: [
      combo("Retention", "Renewal Reviews", "Calm and proactive", "10 minutes", "User-pasted source material", "Directly protects existing revenue.", ["Before reacting to a renewal increase", "Renewal review email", "Rate pressure explanation"]),
      combo("Referral campaigns", "Client Follow Up", "Grateful and human", "10 minutes", "User-pasted source material", "Creates warm referrals and reviews.", ["Review request after setup", "Referral ask for home auto clients", "Thank-you sequence"])
    ]
  });
}

function lifeLane(): FallbackLane {
  return insuranceLane({
    channelName: "Baxter Family Protection",
    tagline: "Life insurance conversations made human.",
    description: "Baxter Family Protection helps Texas families, homeowners, young parents, and business owners approach life insurance without pressure or fear tactics. The channel explains family protection reviews, mortgage-related questions, income replacement, business-owner planning prompts, and when to talk with a licensed Texas agent. Baxter Insurance Agency, Inc. uses this lane as a respectful cross-sell from home, auto, and commercial relationships.",
    targetAudience: "Texas families, homeowners, young parents, business owners, and clients who need a practical life insurance conversation.",
    recurringStoryTypes: "Family protection reviews, mortgage conversations, young-parent checklists, business-owner prompts, annual review scripts, and life insurance FAQs.",
    keywords: ["Texas life insurance", "Houston life insurance", "family protection review", "mortgage protection life insurance", "life insurance checklist", "young parent life insurance", "business owner life insurance", "Baxter Insurance Agency"],
    combinations: [
      combo("Life insurance", "Family Protection", "Warm and trust-building", "10 minutes", "Mixed (Books, Articles, Podcasts)", "Relationship-based cross-sell lane.", ["Life insurance after buying a home", "Young parent checklist", "Business owner protection questions"])
    ]
  });
}

function localSeoLane(): FallbackLane {
  return insuranceLane({
    channelName: "Baxter Local SEO",
    tagline: "Texas insurance pages that earn calls.",
    description: "Baxter Local SEO creates city pages, Google Business Profile posts, FAQs, service pages, comparison explainers, schema-ready sections, and quote-focused local content for Baxter Insurance Agency, Inc. The lane focuses on Houston and surrounding Texas communities while keeping copy useful, specific, and compliant. It prioritizes home and auto searches first, then flood, storm, commercial, landlord, umbrella, life, and referral campaigns that can turn search intent into real agency conversations.",
    targetAudience: "Texas insurance prospects searching locally for home, auto, flood, storm, commercial, life, or agency review help.",
    recurringStoryTypes: "City pages, neighborhood pages, Google Business Profile posts, FAQ blocks, quote pages, service explainers, and weekly local campaigns.",
    keywords: ["insurance agency Houston TX", "home insurance Houston", "auto insurance Houston", "Texas insurance agency", "Houston homeowners insurance", "local insurance agent Houston", "business insurance Houston", "Baxter Insurance Agency"],
    combinations: [
      combo("Local SEO", "Houston Pages", "Useful and search-focused", "Article", "Local archives and newspapers", "Compounding search value.", ["Houston home insurance page", "Spring TX auto page", "storm season GBP post"]),
      combo("Home and auto insurance", "City Pages", "Helpful, local, consultative", "Article", "Mixed (Books, Articles, Podcasts)", "Local buyer intent.", ["Klein home auto page", "Humble homeowners page", "The Woodlands auto page"])
    ]
  });
}

function insuranceLane(input: FallbackLane): FallbackLane {
  return input;
}

function vanishedPlacesLane(): FallbackLane {
  return {
    channelName: "Vanished Places Archive",
    tagline: "Real places. Missing histories. Human aftermath.",
    description: "Vanished Places Archive tells long-form documentary stories about towns, settlements, islands, neighborhoods, institutions, and communities that disappeared from the map or from public memory. Each episode follows the records first: maps, newspapers, archives, court files, weather, infrastructure decisions, and the people left to carry the consequences. The channel is built for viewers who want mystery without gimmicks, history with emotional stakes, and stories that reveal how a place can vanish without the truth vanishing with it.",
    targetAudience: "Viewers who love archival documentaries, forgotten history, maps, abandoned places, civic mysteries, and evidence-first long-form storytelling.",
    recurringStoryTypes: "Flooded towns, erased neighborhoods, abandoned islands, ghost settlements, company towns, closed institutions, vanished resorts, and communities displaced by disaster or policy.",
    keywords: ["vanished towns", "forgotten places", "abandoned history", "ghost towns documentary", "erased neighborhoods", "flooded towns", "lost communities", "historical mystery documentary", "archive documentary", "abandoned places history", "forgotten true stories", "local history mystery"],
    combinations: [
      combo("Forgotten history", "Vanished Places", "Measured documentary", "45-60 minutes", "Local archives and newspapers", "Local records create repeatable episodes with strong place identity.", ["Flooded towns where residents never returned", "Company towns that collapsed after one decision", "Neighborhoods erased by infrastructure projects"]),
      combo("Historical mysteries", "Erased Communities", "Investigative", "45-60 minutes", "Court records and official reports", "Official records create defensible stories with social stakes.", ["Condemnation files that reveal what residents lost", "Displacement cases hidden inside public records", "Town meetings that changed the map"]),
      combo("Local legends", "Ghost Settlements", "Mysterious & gripping", "30-45 minutes", "Local archives and newspapers", "Folklore gives the hook, archives give the truth.", ["Ghost towns with one disputed origin story", "Abandoned settlements tied to one surviving witness", "Local legends that began as newspaper fragments"]),
      combo("Disasters", "Flooded Towns", "Dark but grounded", "45-60 minutes", "Mixed (Books, Articles, Podcasts)", "Disaster and aftermath create a clear narrative arc.", ["Reservoir towns buried under water", "Storms that made a place unlivable", "Industrial disasters that ended a community"]),
      combo("Human endurance", "Last Residents", "Emotionally intimate", "30-45 minutes", "User-pasted source material", "Human-scale episodes make place history feel personal.", ["The final family to leave a dying town", "Caretakers of abandoned institutions", "People who stayed after everyone else left"]),
      combo("True & Unexplained", "Map Mysteries", "Suspenseful", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Map gaps and unanswered timelines make strong curiosity engines.", ["Places shown on maps that no longer exist", "Settlements with conflicting disappearance dates", "Roads that lead to vanished communities"]),
      combo("Military operations", "Restricted Places", "Measured documentary", "45-60 minutes", "Court records and official reports", "Military and government records create deep research lanes.", ["Communities removed for training grounds", "Closed bases that reshaped nearby towns", "Restricted zones with civilian aftermath"]),
      combo("Strange small-town stories", "One-Event Towns", "Mysterious & gripping", "30-45 minutes", "Local archives and newspapers", "One strange event can explain why a place entered legend.", ["A one-night panic that changed a town's reputation", "A trial that defined a forgotten place", "A disappearance that outlived the town itself"]),
      combo("Scams and cons", "Boomtown Collapse", "Investigative", "45-60 minutes", "Local archives and newspapers", "Financial booms and collapses create repeatable stakes.", ["Fake mines that built real towns", "Land schemes that stranded settlers", "Resorts sold on promises that vanished"]),
      combo("Maritime mysteries", "Vanished Islands", "Atmospheric", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Islands combine visual intrigue with archival depth.", ["Islands erased by storms", "Quarantine islands with forgotten records", "Fishing communities abandoned after one season"]),
      combo("Courtroom and legal stories", "Property Battles", "Investigative", "45-60 minutes", "Court records and official reports", "Legal documents reveal the human cost of vanished places.", ["Estate fights over abandoned land", "Eminent-domain battles with buried details", "Court cases that preserved a lost community"]),
      combo("Forgotten history", "Lost Institutions", "Reflective", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Institutions create repeatable episodes with built-in records.", ["Hospitals that closed and disappeared", "Schools abandoned after scandal or disaster", "Prisons whose records outlived the buildings"])
    ]
  };
}

function historicalMysteryLane(): FallbackLane {
  return {
    channelName: "The Hidden Chronicle",
    tagline: "History leaves traces.",
    description: "The Hidden Chronicle turns forgotten historical mysteries into long-form documentary stories built from archives, newspapers, maps, diaries, reports, photographs, and disputed accounts. Each episode follows the evidence behind a buried question: what disappeared from the public record, why a famous version may be incomplete, and how ordinary people were caught inside events history nearly forgot. The channel is for viewers who want historical mystery without sensational claims, with atmosphere, restraint, and a strong paper trail.",
    targetAudience: "Viewers who like historical mysteries, forgotten history, archive discoveries, old newspapers, unresolved questions, and evidence-first documentary storytelling.",
    recurringStoryTypes: "Lost expeditions, vanished settlements, unexplained historical events, forgotten disasters, archival contradictions, strange newspaper trails, missing artifacts, and mysteries hidden inside local history.",
    keywords: ["historical mysteries", "forgotten history", "history documentary", "archive mysteries", "old newspaper stories", "lost expeditions", "unexplained history", "forgotten disasters", "local history mystery", "mystery documentary", "historical documentary", "archival research", "lost history", "strange history", "forgotten true stories", "hidden history"],
    combinations: [
      combo("Historical mysteries", "Archive Mysteries", "Measured documentary", "45-60 minutes", "Local archives and newspapers", "Archival contradictions create repeatable mystery engines without forcing a conclusion.", ["Old newspaper trails that do not match the accepted story", "A famous event rebuilt from forgotten local reports", "Archive gaps that changed how history remembered a person"]),
      combo("Forgotten history", "Lost Expeditions", "Atmospheric", "45-60 minutes", "Mixed (Books, Articles, Podcasts)", "Expeditions provide strong chronology, stakes, and visual research material.", ["An expedition remembered for the wrong reason", "A missing party reconstructed through journals", "A failed mission with one surviving document"]),
      combo("Historical mysteries", "Missing Artifacts", "Investigative", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Artifacts create clear hooks while archives keep the story grounded.", ["A relic that disappeared from a museum record", "A disputed object with a stranger paper trail", "A discovery that was quietly forgotten"]),
      combo("Forgotten history", "Buried Disasters", "Dark but grounded", "45-60 minutes", "Local archives and newspapers", "Forgotten disasters carry human stakes and under-covered source depth.", ["A local disaster that vanished from national memory", "A preventable tragedy buried in small papers", "A town that remembered what history skipped"]),
      combo("True & Unexplained", "Historical Questions", "Mysterious & gripping", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Unresolved history lets the channel ask strong questions without overclaiming.", ["A historical disappearance with competing accounts", "A strange event preserved by one witness", "An official explanation that never satisfied locals"]),
      combo("Historical mysteries", "Map Mysteries", "Suspenseful", "30-45 minutes", "Local archives and newspapers", "Maps give visual structure and repeatable discovery angles.", ["Places that vanished between map editions", "Routes that do not match survivor accounts", "A boundary dispute that hid a deeper story"]),
      combo("Forgotten history", "Strange Archives", "Reflective", "30-45 minutes", "User-pasted source material", "Viewer-submitted source material can become defensible, human-scale episodes.", ["Family papers that point to a larger mystery", "A scrapbook that preserves a lost event", "Local records that contradict public memory"]),
      combo("Disasters", "Forgotten Catastrophes", "Dark but grounded", "45-60 minutes", "Court records and official reports", "Official inquiries and reports help separate tragedy from legend.", ["Inquiry reports after a disaster history forgot", "Official warnings ignored before a catastrophe", "A disaster explained only after records surfaced"]),
      combo("Strange small-town stories", "Historical Legends", "Measured documentary", "30-45 minutes", "Local archives and newspapers", "Local legends become stronger when tested against first reports.", ["A legend born from a single old headline", "A town mystery older than its modern retellings", "A local tradition with a disputed origin"]),
      combo("Military operations", "Forgotten Missions", "Investigative", "45-60 minutes", "Court records and official reports", "Military records create high-stakes historical mysteries with documented timelines.", ["A training mission with unanswered aftermath", "A classified place that shaped a community", "A wartime incident buried in official files"]),
      combo("Human endurance", "Historical Survival", "Emotionally intimate", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Survival stories inside history make the past feel immediate.", ["A survivor account that changed over time", "A journey where one decision saved lives", "A forgotten ordeal reconstructed from letters"]),
      combo("Historical mysteries", "Photo Mysteries", "Atmospheric", "30-45 minutes", "Local archives and newspapers", "Photographs create instant curiosity and strong thumbnail potential.", ["An unidentified person in a historic image", "A photograph that outlived the event it captured", "A mystery solved only by comparing archive images"])
    ]
  };
}

function recordRoomLane(): FallbackLane {
  return {
    channelName: "The Record Room",
    tagline: "The file tells a different story.",
    description: "The Record Room turns court filings, inquests, affidavits, depositions, official reports, and archived hearings into long-form documentary stories. The channel focuses on cases where the public version was incomplete and the paper trail reveals the real stakes. It is built for viewers who want evidence-first storytelling, careful claims, and the quiet thrill of watching a story change when the original documents are finally read closely.",
    targetAudience: "Viewers who like legal documentaries, archival research, case files, public records, and careful true-story analysis.",
    recurringStoryTypes: "Inquests, civil lawsuits, disputed timelines, public hearings, official reports, affidavits, institutional failures, and forgotten cases preserved in legal records.",
    keywords: ["court records", "case files", "legal documentary", "public records", "inquest documentary", "affidavit", "lawsuit documentary", "true story documentary", "archival research", "official report", "documentary case file", "legal mystery"],
    combinations: [
      combo("Courtroom and legal stories", "Case Files", "Investigative", "45-60 minutes", "Court records and official reports", "Court files provide defensible structure and strong reveals.", ["Civil cases that changed the public story", "Inquests with overlooked witness details", "Depositions that quietly explain the timeline"]),
      combo("Historical mysteries", "Public Records", "Measured documentary", "45-60 minutes", "Court records and official reports", "Records-focused mysteries create trust and depth.", ["Official reports that contradicted headlines", "Old records that reopened a question", "Files that reveal institutional delay"]),
      combo("Scams and cons", "Paper Trail Scams", "Investigative", "30-45 minutes", "Court records and official reports", "Fraud stories have documents, characters, and consequences.", ["Ponzi cases preserved in filings", "Land scams exposed by lawsuits", "Consumer fraud cases with strange paper trails"]),
      combo("Disasters", "Official Failure", "Dark but grounded", "45-60 minutes", "Court records and official reports", "Failure investigations create strong accountability stories.", ["Disasters where warnings were documented", "After-action reports that shifted blame", "Lawsuits after preventable failures"]),
      combo("Forgotten history", "Lost Hearings", "Reflective", "30-45 minutes", "Local archives and newspapers", "Public hearings make forgotten history concrete.", ["Town hearings that changed lives", "School-board records behind a local crisis", "Commission minutes that explain a scandal"])
    ]
  };
}

function maritimeLane(): FallbackLane {
  return {
    channelName: "The Salt Archive",
    tagline: "Lost ships. Real records. Human stakes.",
    description: "The Salt Archive tells maritime documentary stories through logbooks, weather, port records, survivor accounts, shipping reports, and the hard decisions made far from shore. The channel avoids myth-first storytelling and instead rebuilds sea mysteries from the evidence: drifting vessels, lost crews, failed rescues, wrecks, strange cargo, and the human cost of water, weather, and timing.",
    targetAudience: "Viewers who like maritime mysteries, shipwrecks, survival stories, evidence-based legends, and atmospheric long-form documentaries.",
    recurringStoryTypes: "Abandoned vessels, lost crews, shipwrecks, maritime survival, port mysteries, storm timelines, strange cargo, and nautical legends tested against records.",
    keywords: ["maritime mysteries", "lost ships", "shipwreck documentary", "abandoned ships", "survival at sea", "ocean mystery", "sea disaster", "nautical history", "drifting vessel", "maritime documentary", "lost crew", "ship mystery"],
    combinations: [
      combo("Maritime mysteries", "Lost Ships", "Dark but grounded", "45-60 minutes", "Mixed (Books, Articles, Podcasts)", "Maritime stories have strong visual hooks and deep archives.", ["Ships found drifting without answers", "Crews lost between two ports", "Cargo mysteries that outlived the vessel"]),
      combo("Survival and rescue", "Sea Survival", "Suspenseful", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Survival arcs create natural retention and emotional stakes.", ["Survivors adrift after a preventable failure", "Rescues delayed by one bad assumption", "Rafts, storms, and impossible timelines"]),
      combo("Historical mysteries", "Port Records", "Investigative", "45-60 minutes", "Court records and official reports", "Port and inquiry records add evidentiary authority.", ["Inquiry records that changed a wreck story", "Port logs with one strange detail", "Insurance records that exposed a motive"]),
      combo("Disasters", "Storm Timelines", "Measured documentary", "45-60 minutes", "Local archives and newspapers", "Weather records give each episode a strong structure.", ["Storms that trapped crews in impossible choices", "Forecast failures with fatal outcomes", "Disasters reconstructed hour by hour"]),
      combo("Forgotten history", "Forgotten Voyages", "Atmospheric", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Forgotten voyages provide evergreen history with mystery.", ["Expeditions remembered for one missing detail", "Fishing trips that became legends", "Small vessels with outsized aftermath"])
    ]
  };
}

function survivalLane(): FallbackLane {
  return {
    channelName: "The Decision Line",
    tagline: "One choice. Then everything changed.",
    description: "The Decision Line is a long-form survival documentary channel about the small choices that turn ordinary plans into emergencies. Each episode follows the decision chain: weather, maps, assumptions, equipment, fatigue, leadership, and rescue timing. The promise is not cheap danger. It is clarity: how people ended up past the point of easy return, what saved them, and what the record can teach without blaming the victims.",
    targetAudience: "Viewers who like survival documentaries, rescue timelines, outdoor mistakes, human endurance, and practical story analysis.",
    recurringStoryTypes: "Wrong turns, bad weather, failed gear, delayed rescues, mountain routes, desert exposure, cold cases with survival questions, and decisions that changed outcomes.",
    keywords: ["survival stories", "rescue stories", "wilderness survival", "lost hikers", "survival documentary", "mountain rescue", "bad decisions", "human endurance", "true survival story", "search and rescue", "outdoor survival", "wrong turn"],
    combinations: [
      combo("Survival and rescue", "Decision Chains", "Suspenseful", "45-60 minutes", "Mixed (Books, Articles, Podcasts)", "Decision chains make natural episode structure.", ["Wrong turns that became multi-day searches", "One weather shift that changed everything", "Equipment failures with documented warning signs"]),
      combo("Human endurance", "Last Push", "Emotionally intimate", "30-45 minutes", "User-pasted source material", "Human endurance stories are emotional and repeatable.", ["People who survived by changing plans late", "The final mile that mattered", "Survivors whose notes explained the ordeal"]),
      combo("Disasters", "Preventable Exposure", "Dark but grounded", "45-60 minutes", "Court records and official reports", "Official reports anchor hard survival stories.", ["Exposure deaths with misunderstood timelines", "Rescue delays explained by records", "Group decisions that fractured under pressure"]),
      combo("Missing persons", "Search Radius", "Investigative", "45-60 minutes", "Local archives and newspapers", "Search geography gives strong visual structure.", ["Missing hikers found outside the search zone", "Cars found miles from expected routes", "Searches shaped by one early assumption"]),
      combo("True & Unexplained", "Impossible Routes", "Mysterious & gripping", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Unusual routes create curiosity without overclaiming.", ["Routes no one can fully explain", "Survival cases with contradictory sightings", "Remote trails with one unanswered choice"])
    ]
  };
}

function smallTownLane(): FallbackLane {
  return {
    channelName: "The Town File",
    tagline: "Local stories that outgrew the map.",
    description: "The Town File is a long-form documentary channel about strange local events, small-town mysteries, public panics, forgotten trials, disappearances, hoaxes, disasters, and legends that became larger than the place where they began. Each episode starts with the local record, then follows how newspapers, rumor, institutions, and memory turned one event into a lasting story.",
    targetAudience: "Viewers who like small-town mysteries, local legends, forgotten true stories, newspaper archives, and grounded documentary storytelling.",
    recurringStoryTypes: "Local panics, small-town disappearances, strange trials, forgotten disasters, newspaper-born legends, hoaxes, rumors, and events remembered differently by the people who lived through them.",
    keywords: ["small town mysteries", "local legends", "forgotten true stories", "newspaper archive", "town mystery", "strange local history", "true story documentary", "cold case documentary", "local history", "unsolved mystery", "rural mystery", "forgotten case"],
    combinations: [
      combo("Strange small-town stories", "Local Legends", "Mysterious & gripping", "30-45 minutes", "Local archives and newspapers", "Local legends have hooks and archives have grounding.", ["One-night events that became folklore", "Local panics amplified by newspapers", "A town rumor with a documented origin"]),
      combo("Missing persons", "Town Disappearances", "Investigative", "45-60 minutes", "Local archives and newspapers", "Missing-person stories need careful local sourcing.", ["Small-town disappearances with disputed timelines", "Cases where local search records matter", "Families and towns divided by one theory"]),
      combo("Forgotten history", "County Archives", "Measured documentary", "30-45 minutes", "Local archives and newspapers", "County archives are deep and repeatable.", ["Forgotten trials that once dominated a county", "Local disasters missing from national memory", "Institutions that shaped a town's fate"]),
      combo("Local legends", "Rumor Engine", "Dark but grounded", "30-45 minutes", "Mixed (Books, Articles, Podcasts)", "Rumor versus record creates a strong narrative contrast.", ["Legends born from a misreported detail", "Stories retold until the facts changed", "A single headline that created a myth"]),
      combo("Scams and cons", "Town Schemes", "Investigative", "45-60 minutes", "Court records and official reports", "Small-town scams make compelling paper-trail episodes.", ["Local investment schemes that emptied savings", "Fake development projects sold to a town", "County fraud cases with human aftermath"])
    ]
  };
}

function combo(
  nicheFocus: string,
  category: string,
  tone: string,
  desiredLength: string,
  sourceType: string,
  rationale: string,
  sampleAngles: string[]
): ChannelIdeaCombination {
  return { nicheFocus, category, tone, desiredLength, sourceType, rationale, sampleAngles };
}

function normalizeCombinations(value: unknown) {
  return readArray(value).map((item) => {
    const record = isRecord(item) ? item : {};
    return {
      nicheFocus: exactOrDefault(readString(record.nicheFocus), nicheFocusOptions, "Forgotten history"),
      category: readString(record.category) || "Forgotten History",
      tone: exactOrDefault(readString(record.tone), toneOptions, "Measured documentary"),
      desiredLength: normalizeDesiredLength(readString(record.desiredLength)),
      sourceType: exactOrDefault(readString(record.sourceType), [
        "Agency knowledge, Texas market context, carrier guidelines",
        "Client FAQs and policy review notes",
        "Local SEO keywords and service pages",
        "Carrier appetite and quoting workflow",
        "Claims documentation checklist",
        "User-pasted source material"
      ], "Agency knowledge, Texas market context, carrier guidelines"),
      rationale: readString(record.rationale) || "Repeatable insurance growth lane with clear quote, renewal, cross-sell, or local SEO value.",
      sampleAngles: readArray(record.sampleAngles).map((angle) => String(angle).trim()).filter(Boolean).slice(0, 4)
    };
  }).filter((item) => item.category).slice(0, 18);
}

function normalizePriority(value: string): "Primary" | "Secondary" | "Experimental" {
  if (/experimental/i.test(value)) return "Experimental";
  if (/secondary/i.test(value)) return "Secondary";
  return "Primary";
}

function normalizeDesiredLength(value: string) {
  if (/10/.test(value)) return "10 minutes";
  if (/20/.test(value)) return "20 minutes";
  if (/60/.test(value) && !/45/.test(value)) return "60 minutes";
  if (/45|60/.test(value)) return "45-60 minutes";
  return "30-45 minutes";
}

function exactOrDefault(value: string, options: string[], fallback: string) {
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) || fallback;
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKeywordPhrase(value: string) {
  const clean = value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (clean.length > 80) return "";
  if (clean.split(/\s+/).length > 5) return "";
  return clean;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
