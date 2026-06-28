import { StoryIdeaStatus } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getUserChannel } from "@/lib/channels";
import { buildDuplicateReport } from "@/lib/duplicates";
import { forgeIdeaBrief, forgeNicheByChannel } from "@/lib/forge-niches";
import { jsonError } from "@/lib/http";
import { generateJson, OpenRouterConfigurationError } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserSettings } from "@/lib/settings";
import { storyLengthOptions } from "@/lib/story-options";
import { fallbackIdeas, ideaGenerationPrompt, type IdeaFactoryInput } from "@/lib/story-prompts";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { slugify } from "@/lib/utils";

const GenerateIdeasSchema = z.object({
  niche: z.string().min(1),
  tone: z.string().min(1),
  category: z.string().min(1),
  desiredLength: z.string().min(1),
  sourceType: z.string().min(1),
  contentMode: z.enum([
    "STORY_DOCUMENTARY",
    "EXPERT_AUTHORITY",
    "LOCAL_LEAD_GEN",
    "SALES_OFFER",
    "EDUCATION_COURSE",
    "BOOK_PUBLISHING",
    "REPURPOSE_MULTIPLIER",
    "BRAND_CHANNEL_STRATEGY"
  ]).default("STORY_DOCUMENTARY"),
  businessAudience: z.string().optional(),
  businessOffer: z.string().optional(),
  businessLocation: z.string().optional(),
  businessGoal: z.string().optional(),
  businessCompliance: z.string().optional(),
  businessCta: z.string().optional(),
  projectFormat: z.string().optional(),
  moneyGoal: z.string().optional(),
  affiliateOffer: z.string().optional(),
  riskProfile: z.string().optional(),
  productionCapacity: z.string().optional(),
  count: z.number().int().min(1).max(50).default(10),
  model: z.string().optional(),
  save: z.boolean().default(true),
  demoFallback: z.boolean().default(true),
  channelId: z.string().optional()
});

const IDEA_GENERATION_BATCH_SIZE = 10;
const IDEA_GENERATION_EXTRA_ATTEMPTS = 6;

type GeneratedIdea = {
  title: string;
  hook: string;
  category: string;
  summary: string;
  whyCompelling?: string;
  estimatedLengthPotential?: string;
  recommendedLengthMinutes?: number;
  recommendedTone?: string;
  recommendedNarrationStyle?: string;
  sourceType?: string;
  people: string[];
  location?: string;
  eventName?: string;
  originalityScore: number;
  curiosityScore: number;
  emotionalScore: number;
  escalationScore: number;
  lengthPotentialScore: number;
  researchDifficultyScore: number;
  productionPriority: string;
  suggestedAngle: string;
  ideaPowerPack?: IdeaPowerPack;
};

type PowerTitleTest = {
  title: string;
  angle?: string;
  score?: number;
};

type PowerThumbnailTest = {
  overlayText: string;
  visualHook: string;
  score?: number;
};

type IdeaPowerPack = {
  ideaMarketScore: number;
  titleThumbnailPretest: {
    titles: PowerTitleTest[];
    thumbnailPrompts: PowerThumbnailTest[];
    clickPromise: string;
    retentionPromise: string;
  };
  thumbnailFirstFit: {
    visualClarityScore: number;
    coreImage: string;
    titleThumbnailMatch: string;
    firstFrameExpectation: string;
    hardToVisualizeWarning: string;
  };
  sourceDepthPreflight: {
    depthScore: number;
    bestLengthMinutes: number;
    sourceTypesNeeded: string[];
    mustVerify: string[];
    thinRisk: string;
    seriesPotential: string;
  };
  analyticsFit: {
    fitScore: number;
    whyItFits: string;
    patternToUse: string;
    patternToAvoid: string;
  };
  ideaCluster: {
    clusterName: string;
    role: string;
    followUpIdeas: string[];
    shorts: string[];
  };
  monetizationRisk: {
    riskLevel: "Low" | "Medium" | "High";
    riskScore: number;
    concerns: string[];
    saferFraming: string;
  };
  monetizationStrategy: {
    primaryRevenuePath: string;
    sponsorFit: string;
    affiliateAngle: string;
    cta: string;
    emailCaptureIdea: string;
    productIdea: string;
    revenueWarnings: string[];
  };
  whiteSpace: {
    whiteSpaceScore: number;
    underCoveredAngle: string;
    overdoneAngleToAvoid: string;
    differentiator: string;
  };
};

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`ideas:${user.id}`, 10, 60_000);
    if (!limit.ok) {
      return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
    }

    const input = GenerateIdeasSchema.parse(await request.json()) as IdeaFactoryInput & {
      model?: string;
      save: boolean;
      demoFallback: boolean;
      channelId?: string;
    };
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);
    const forgeNiche = forgeNicheByChannel(channel);
    const baseGenerationInput = forgeNiche
      ? {
          ...input,
          niche: forgeIdeaBrief(forgeNiche),
          tone: forgeNiche.tone,
          category: forgeNiche.category,
          sourceType: forgeNiche.sourceType,
          contentMode: "LOCAL_LEAD_GEN" as const,
          businessAudience: input.businessAudience || "Texas homeowners, drivers, families, landlords, and small-business owners, especially Houston and surrounding areas",
          businessOffer: input.businessOffer || "Home and auto quotes, commercial P&C, life insurance, renewal reviews, and coverage checkups from Baxter Insurance Agency, Inc.",
          businessLocation: input.businessLocation || "Texas, primarily Houston and surrounding areas",
          businessGoal: input.businessGoal || "Generate quote requests, policy reviews, cross-sells, referrals, and local SEO visibility",
          businessCompliance: input.businessCompliance || "Licensed for General Lines and life in Texas only. Do not promise savings, coverage, eligibility, underwriting acceptance, or claim outcomes. Coverage depends on policy terms, conditions, exclusions, limits, deductibles, endorsements, carrier appetite, underwriting, and Texas regulations.",
          businessCta: input.businessCta || "Call Baxter Insurance Agency, Inc. at 281-445-1381 or request a Texas insurance review."
        }
      : input;
    const existing = await prisma.storyIdea.findMany({ where: { workspaceId: workspace.id, channelId: channel.id } });
    const settings = await getOrCreateUserSettings(user.id);
    const generationInput = {
      ...baseGenerationInput,
      analyticsGuide: await channelAnalyticsGuideForIdeas(channel.id, workspace.id),
      whiteSpaceGuide: buildWhiteSpaceGuide(existing)
    };
    let generated: GeneratedIdea[] = [];
    const modelUsed = new Set<string>();

    try {
      generated = await generateIdeaTopUp({
        userId: user.id,
        workspaceId: workspace.id,
        input: generationInput,
        existingTitles: existing.map((idea) => idea.title),
        fallbackNarrationStyle: settings.narrationStyle,
        modelUsed,
        modelCandidates: discoveryModelCandidates(input.model, settings)
      });
    } catch (error) {
      if (!input.demoFallback || !(error instanceof OpenRouterConfigurationError)) {
        throw error;
      }
      generated = fallbackIdeas(generationInput).slice(0, generationInput.count);
      modelUsed.add("demo-fallback");
    }

    const ideas = [];
    for (const rawIdea of generated.slice(0, generationInput.count)) {
      const duplicate = buildDuplicateReport(rawIdea, existing);
      const estimatedLengthPotential = normalizeLengthLabel(
        rawIdea.estimatedLengthPotential,
        rawIdea.recommendedLengthMinutes,
        generationInput.projectFormat
      );
      const recommendedLengthMinutes = normalizeLengthMinutes(rawIdea.recommendedLengthMinutes, estimatedLengthPotential, generationInput.projectFormat);
      const recommendedTone = rawIdea.recommendedTone || generationInput.tone;
      const recommendedNarrationStyle = rawIdea.recommendedNarrationStyle || settings.narrationStyle;
      const totalScore = ideaTotalScore(rawIdea);
      const sourceUrls = rawIdea.ideaPowerPack
        ? {
            ideaPowerPack: rawIdea.ideaPowerPack,
            generatedBy: "idea-power-pack-v1"
          }
        : undefined;

      if (input.save && !duplicate.blocked && !duplicate.exactMatch) {
        const idea = await prisma.storyIdea.create({
          data: {
            userId: user.id,
            workspaceId: workspace.id,
            channelId: channel.id,
            title: rawIdea.title,
            slug: await uniqueSlug(workspace.id, channel.id, rawIdea.title),
            hook: rawIdea.hook,
            summary: rawIdea.summary,
            category: rawIdea.category,
            sourceType: rawIdea.sourceType,
            sourceUrls,
            people: rawIdea.people ?? [],
            location: rawIdea.location,
            eventName: rawIdea.eventName,
            originalityScore: rawIdea.originalityScore,
            curiosityScore: rawIdea.curiosityScore,
            emotionalScore: rawIdea.emotionalScore,
            escalationScore: rawIdea.escalationScore,
            lengthPotentialScore: rawIdea.lengthPotentialScore,
            researchDifficultyScore: rawIdea.researchDifficultyScore,
            estimatedLengthPotential,
            recommendedLengthMinutes,
            recommendedTone,
            recommendedNarrationStyle,
            totalScore,
            productionPriority: rawIdea.productionPriority,
            suggestedAngle: rawIdea.suggestedAngle,
            status: StoryIdeaStatus.UNUSED
          }
        });
        existing.push(idea);
        ideas.push({ ...idea, duplicate });
      } else {
        ideas.push({
          ...rawIdea,
          id: crypto.randomUUID(),
          estimatedLengthPotential,
          recommendedLengthMinutes,
          recommendedTone,
          recommendedNarrationStyle,
          totalScore,
          status: "UNUSED",
          sourceUrls,
          duplicate
        });
      }
    }

    const modelUsedLabel = Array.from(modelUsed).join(", ") || settings.discoveryModel;
    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_ideas.generated",
      metadata: {
        requested: generationInput.count,
        count: ideas.length,
        modelUsed: modelUsedLabel,
        channelId: channel.id,
        forgeNiche: forgeNiche?.name
      }
    });
    return Response.json({ ideas, modelUsed: modelUsedLabel });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function generateIdeaTopUp(input: {
  userId: string;
  workspaceId: string;
  input: IdeaFactoryInput & { model?: string };
  existingTitles: string[];
  fallbackNarrationStyle: string;
  modelUsed: Set<string>;
  modelCandidates: string[];
}) {
  const generated: GeneratedIdea[] = [];
  const seenTitles = new Set(input.existingTitles.map(normalizeTitleKey));
  const maxAttempts = Math.max(
    1,
    Math.ceil(input.input.count / IDEA_GENERATION_BATCH_SIZE) + IDEA_GENERATION_EXTRA_ATTEMPTS
  );

  for (let attempt = 1; generated.length < input.input.count && attempt <= maxAttempts; attempt += 1) {
    const remaining = input.input.count - generated.length;
    const batchCount = Math.min(IDEA_GENERATION_BATCH_SIZE, remaining);
    const batchInput = { ...input.input, count: batchCount };
    const avoidTitles = [...input.existingTitles, ...generated.map((idea) => idea.title)];
    const model = input.modelCandidates[(attempt - 1) % input.modelCandidates.length];
    let batch: GeneratedIdea[];
    try {
      const result = await generateJson<unknown>({
        userId: input.userId,
        workspaceId: input.workspaceId,
        passType: "DISCOVERY",
        model,
        messages: [
          {
            role: "user",
            content: ideaGenerationPrompt(batchInput, avoidTitles)
          }
        ],
        temperature: 0.85,
        maxTokens: ideaGenerationMaxTokens(batchCount)
      });

      input.modelUsed.add(result.model);
      batch = normalizeGeneratedIdeas(result.data, batchInput, input.fallbackNarrationStyle);
    } catch (error) {
      if (error instanceof OpenRouterConfigurationError || !generated.length) throw error;
      continue;
    }

    for (const idea of batch) {
      const key = normalizeTitleKey(idea.title);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      generated.push(idea);
      if (generated.length >= input.input.count) break;
    }
  }

  if (!generated.length) {
    throw new Error("The selected model did not return usable growth ideas. Try a different discovery model or reduce the idea count.");
  }
  if (generated.length < input.input.count) {
    throw new Error(`Baxter Growth Lab only generated ${generated.length} usable ideas out of ${input.input.count}. The discovery model under-returned or failed during top-up. Try again or choose a different Discovery Model in Settings.`);
  }

  return generated;
}

function discoveryModelCandidates(
  requestedModel: string | undefined,
  settings: {
    discoveryModel: string;
    defaultModel: string;
    structureModel: string;
    draftingModel: string;
    rewriteModel: string;
    critiqueModel: string;
    dossierModel: string;
  }
) {
  return uniqueStrings([
    requestedModel,
    settings.discoveryModel,
    settings.defaultModel,
    settings.structureModel,
    settings.draftingModel,
    settings.rewriteModel,
    settings.critiqueModel,
    settings.dossierModel,
    "openai/gpt-4o-mini"
  ]);
}

function uniqueStrings(values: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique.length ? unique : ["openai/gpt-4o-mini"];
}

function ideaGenerationMaxTokens(count: number) {
  return Math.min(22_000, Math.max(7_000, 1_800 + count * 1_850));
}

function normalizeLengthMinutes(value?: number, label?: string, format?: string) {
  if (value && storyLengthOptions.some((item) => item.minutes === value)) return value;
  if (format === "SHORT_BOOK") {
    if (/compact|10,?000|short/i.test(label ?? "")) return 30;
    if (/deep|20,?000|long/i.test(label ?? "")) return 60;
    return 45;
  }
  if (format === "LONG_BOOK") {
    if (/starter|40,?000/i.test(label ?? "")) return 30;
    if (/deep|80,?000/i.test(label ?? "")) return 60;
    return 45;
  }
  const matched = storyLengthOptions.find((item) => lengthLabelMatches(item, label));
  return matched?.minutes ?? 45;
}

function normalizeLengthLabel(value?: string, minutes?: number, format?: string) {
  if (format === "SHORT_BOOK") {
    if (/compact|10,?000|short/i.test(value ?? "") || minutes === 30) return "Compact short book - about 10,000 words";
    if (/deep|20,?000|long/i.test(value ?? "") || minutes === 60) return "Deep short book - about 20,000 words";
    return "Standard short book - about 15,000 words";
  }
  if (format === "LONG_BOOK") {
    if (/starter|40,?000/i.test(value ?? "") || minutes === 30) return "Starter long form book - about 40,000 words";
    if (/deep|80,?000/i.test(value ?? "") || minutes === 60) return "Deep long form book - about 80,000 words";
    return "Standard long form book - about 60,000 words";
  }
  const matched = storyLengthOptions.find((item) => lengthLabelMatches(item, value) || item.minutes === minutes);
  return matched?.label ?? "45-60 min";
}

function lengthLabelMatches(item: { label: string; minutes: number }, label?: string) {
  const normalized = label?.trim().toLowerCase();
  if (!normalized) return false;
  return normalized === item.label.toLowerCase() || normalized === item.label.replace("min", "minutes").toLowerCase();
}

function normalizeGeneratedIdeas(data: unknown, input: IdeaFactoryInput, fallbackNarrationStyle: string) {
  const rawIdeas = extractIdeaArray(data);
  const normalized = rawIdeas
    .map((rawIdea, index) => normalizeGeneratedIdea(rawIdea, index, input, fallbackNarrationStyle))
    .filter((idea): idea is GeneratedIdea => Boolean(idea));

  if (!normalized.length) {
    throw new Error("The selected model did not return usable growth ideas. Try a different discovery model or reduce the idea count.");
  }

  return normalized;
}

function extractIdeaArray(data: unknown) {
  if (Array.isArray(data)) return data;
  const record = asRecord(data);
  for (const key of ["ideas", "storyIdeas", "story_ideas", "results", "items"]) {
    const value = record?.[key];
    if (Array.isArray(value)) return value;
    const nestedRecord = asRecord(value);
    if (nestedRecord) return Object.values(nestedRecord);
  }
  if (record && looksLikeIdeaRecord(record)) return [record];
  return [];
}

function normalizeGeneratedIdea(
  value: unknown,
  index: number,
  input: IdeaFactoryInput,
  fallbackNarrationStyle: string
): GeneratedIdea | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const scores = asRecord(raw.scores) ?? asRecord(raw.aiScoreBreakdown) ?? asRecord(raw.scoreBreakdown);
  const title =
    readString(raw, ["title", "storyTitle", "story_title", "ideaTitle", "idea_title", "headline", "name"]) ??
    readString(raw, ["idea", "storyIdea", "story_idea"]);

  const hook =
    readString(raw, ["hook", "shortHook", "short_hook", "storyHook", "story_hook", "logline", "tagline", "pitch"]) ??
    firstSentence(readString(raw, ["summary", "synopsis", "description", "overview", "storySummary", "story_summary"])) ??
    readString(raw, ["whyCompelling", "why_compelling", "reason"]);

  const summary =
    readString(raw, ["summary", "synopsis", "description", "overview", "storySummary", "story_summary"]) ??
    readString(raw, ["whyCompelling", "why_compelling", "reason"]) ??
    hook;

  if (!title && !hook && !summary) return null;

  const estimatedLengthPotential =
    readString(raw, ["estimatedLengthPotential", "estimated_length_potential", "estimatedLength", "lengthPotential", "recommendedLength"]) ??
    input.desiredLength.replace("utes", "");

  const recommendedLengthMinutes = readNumber(raw, [
    "recommendedLengthMinutes",
    "recommended_length_minutes",
    "targetLengthMinutes",
    "target_length_minutes",
    "lengthMinutes"
  ]);
  const originalityScore = clampScore(readNumber(raw, ["originalityScore", "originality_score"]) ?? readNumber(scores, ["originality"]), 75);
  const curiosityScore = clampScore(readNumber(raw, ["curiosityScore", "curiosity_score"]) ?? readNumber(scores, ["curiosity"]), 75);
  const emotionalScore = clampScore(readNumber(raw, ["emotionalScore", "emotional_score", "emotionalImpactScore"]) ?? readNumber(scores, ["emotionalImpact", "emotion"]), 75);
  const escalationScore = clampScore(readNumber(raw, ["escalationScore", "escalation_score"]) ?? readNumber(scores, ["escalation"]), 75);
  const lengthPotentialScore = clampScore(readNumber(raw, ["lengthPotentialScore", "length_potential_score"]) ?? readNumber(scores, ["lengthPotential"]), 75);
  const researchDifficultyScore = clampScore(readNumber(raw, ["researchDifficultyScore", "research_difficulty_score"]) ?? readNumber(scores, ["researchDifficulty"]), 50);

  return {
    title: title ?? `Story idea ${index + 1}`,
    hook: hook ?? summary ?? "This story needs a focused research pass before scripting.",
    category: readString(raw, ["category", "storyCategory", "story_category", "genre", "topic"]) ?? input.category,
    summary: summary ?? hook ?? "The model returned this idea without a full summary. Use the dossier pass to expand and verify it.",
    whyCompelling: readString(raw, ["whyCompelling", "why_compelling", "reason"]),
    estimatedLengthPotential,
    recommendedLengthMinutes,
    recommendedTone: readString(raw, ["recommendedTone", "recommended_tone", "tone"]) ?? input.tone,
    recommendedNarrationStyle:
      readString(raw, ["recommendedNarrationStyle", "recommended_narration_style", "narrationStyle", "narration_style"]) ??
      fallbackNarrationStyle,
    sourceType: readString(raw, ["sourceType", "source_type"]) ?? input.sourceType,
    people: readStringArray(raw.people),
    location: readString(raw, ["location", "place", "setting"]),
    eventName: readString(raw, ["eventName", "event_name", "incidentName", "incident_name"]),
    originalityScore,
    curiosityScore,
    emotionalScore,
    escalationScore,
    lengthPotentialScore,
    researchDifficultyScore,
    productionPriority: readString(raw, ["productionPriority", "production_priority", "priority"]) ?? "Medium",
    suggestedAngle: readString(raw, ["suggestedAngle", "suggested_angle", "angle", "approach"]) ?? hook ?? "",
    ideaPowerPack: normalizeIdeaPowerPack(raw, {
      title: title ?? `Story idea ${index + 1}`,
      hook: hook ?? summary ?? "",
      category: readString(raw, ["category", "storyCategory", "story_category", "genre", "topic"]) ?? input.category,
      recommendedLengthMinutes,
      originalityScore,
      curiosityScore,
      emotionalScore,
      escalationScore,
      lengthPotentialScore,
      researchDifficultyScore
    })
  };
}

function normalizeIdeaPowerPack(raw: Record<string, unknown>, idea: {
  title: string;
  hook: string;
  category: string;
  recommendedLengthMinutes?: number;
  originalityScore: number;
  curiosityScore: number;
  emotionalScore: number;
  escalationScore: number;
  lengthPotentialScore: number;
  researchDifficultyScore: number;
}): IdeaPowerPack {
  const pack =
    asRecord(raw.ideaPowerPack) ??
    asRecord(raw.idea_power_pack) ??
    asRecord(raw.powerPack) ??
    asRecord(raw.ideaIntelligence) ??
    raw;
  const titlePretest = asRecord(pack.titleThumbnailPretest) ?? asRecord(pack.title_thumbnail_pretest) ?? asRecord(pack.packagingPretest);
  const thumbnailFirstFit = asRecord(pack.thumbnailFirstFit) ?? asRecord(pack.thumbnail_first_fit) ?? asRecord(pack.visualFit);
  const sourceDepth = asRecord(pack.sourceDepthPreflight) ?? asRecord(pack.source_depth_preflight) ?? asRecord(pack.sourceDepth);
  const analyticsFit = asRecord(pack.analyticsFit) ?? asRecord(pack.analytics_fit);
  const cluster = asRecord(pack.ideaCluster) ?? asRecord(pack.idea_cluster) ?? asRecord(pack.cluster);
  const monetizationRisk = asRecord(pack.monetizationRisk) ?? asRecord(pack.monetization_risk) ?? asRecord(pack.adSafety);
  const monetizationStrategy = asRecord(pack.monetizationStrategy) ?? asRecord(pack.monetization_strategy) ?? asRecord(pack.revenueStrategy);
  const whiteSpace = asRecord(pack.whiteSpace) ?? asRecord(pack.white_space) ?? asRecord(pack.whitespace);

  const depthScore = clampScore(readNumber(sourceDepth, ["depthScore", "sourceDepthScore", "score"]) ?? idea.lengthPotentialScore, idea.lengthPotentialScore);
  const riskScore = clampScore(readNumber(monetizationRisk, ["riskScore", "score"]) ?? inferredRiskScore(idea.category, idea.title), 30);
  const whiteSpaceScore = clampScore(readNumber(whiteSpace, ["whiteSpaceScore", "whitespaceScore", "score"]) ?? idea.originalityScore, idea.originalityScore);
  const analyticsFitScore = clampScore(readNumber(analyticsFit, ["fitScore", "analyticsFitScore", "score"]) ?? idea.curiosityScore, idea.curiosityScore);
  const visualClarityScore = clampScore(readNumber(thumbnailFirstFit, ["visualClarityScore", "visual_clarity_score", "score"]) ?? Math.round((idea.curiosityScore + idea.emotionalScore) / 2), 75);
  const ideaMarketScore = clampScore(
    readNumber(pack, ["ideaMarketScore", "marketScore", "demandScore"]) ??
      Math.round((idea.curiosityScore * 0.25) + (idea.lengthPotentialScore * 0.22) + (idea.escalationScore * 0.18) + (visualClarityScore * 0.13) + (whiteSpaceScore * 0.12) + ((100 - riskScore) * 0.1)),
    75
  );

  return {
    ideaMarketScore,
    titleThumbnailPretest: {
      titles: normalizeTitleTests(titlePretest, idea.title),
      thumbnailPrompts: normalizeThumbnailTests(titlePretest, idea.title),
      clickPromise: readString(titlePretest, ["clickPromise", "click_promise"]) ?? idea.hook,
      retentionPromise: readString(titlePretest, ["retentionPromise", "retention_promise"]) ?? "A clear mystery, escalation, and payoff that sustains the chosen length."
    },
    thumbnailFirstFit: {
      visualClarityScore,
      coreImage: readString(thumbnailFirstFit, ["coreImage", "core_image", "visualAnchor"]) ?? `One clear focal image that makes ${idea.title} understandable before the viewer reads the title.`,
      titleThumbnailMatch: readString(thumbnailFirstFit, ["titleThumbnailMatch", "title_thumbnail_match", "promiseMatch"]) ?? "The first line of narration must immediately acknowledge the title and thumbnail promise.",
      firstFrameExpectation: readString(thumbnailFirstFit, ["firstFrameExpectation", "first_frame_expectation"]) ?? "Open on the same subject, evidence, map, person, object, or mystery implied by the thumbnail.",
      hardToVisualizeWarning: readString(thumbnailFirstFit, ["hardToVisualizeWarning", "hard_to_visualize_warning", "warning"]) ?? (visualClarityScore < 65 ? "This idea may be hard to package visually. Find a stronger object, face, map, document, or before/after contrast before scripting." : "Thumbnail concept appears clear enough to test before scripting.")
    },
    sourceDepthPreflight: {
      depthScore,
      bestLengthMinutes: normalizePowerLength(readNumber(sourceDepth, ["bestLengthMinutes", "best_length_minutes", "recommendedLengthMinutes"]) ?? idea.recommendedLengthMinutes),
      sourceTypesNeeded: readStringArrayFromKeys(sourceDepth, ["sourceTypesNeeded", "source_types_needed", "sourceTypes"]) || defaultSourceTypes(idea.category),
      mustVerify: readStringArrayFromKeys(sourceDepth, ["mustVerify", "must_verify", "verificationTargets"]) || ["Primary source availability", "timeline accuracy", "names, dates, and locations"],
      thinRisk: readString(sourceDepth, ["thinRisk", "thin_risk"]) ?? "May need a dossier pass before committing to the longest format.",
      seriesPotential: readString(sourceDepth, ["seriesPotential", "series_potential"]) ?? "Use follow-up ideas only after the first video proves viewer demand."
    },
    analyticsFit: {
      fitScore: analyticsFitScore,
      whyItFits: readString(analyticsFit, ["whyItFits", "why_it_fits", "reason"]) ?? "Fits general retention and curiosity patterns until channel-specific analytics are synced.",
      patternToUse: readString(analyticsFit, ["patternToUse", "pattern_to_use"]) ?? "Open with the strongest viewer question, then escalate through concrete reveals.",
      patternToAvoid: readString(analyticsFit, ["patternToAvoid", "pattern_to_avoid"]) ?? "Avoid slow context before the promise is clear."
    },
    ideaCluster: {
      clusterName: readString(cluster, ["clusterName", "cluster_name", "name"]) ?? idea.category,
      role: readString(cluster, ["role", "clusterRole", "cluster_role"]) ?? "Standalone",
      followUpIdeas: readStringArrayFromKeys(cluster, ["followUpIdeas", "follow_up_ideas", "followups"]) || fallbackFollowUps(idea.title),
      shorts: readStringArrayFromKeys(cluster, ["shorts", "shortIdeas", "shortsIdeas"]) || fallbackShorts(idea.title)
    },
    monetizationRisk: {
      riskLevel: normalizeRiskLevel(readString(monetizationRisk, ["riskLevel", "risk_level", "level"]), riskScore),
      riskScore,
      concerns: readStringArrayFromKeys(monetizationRisk, ["concerns", "risks", "flags"]) || defaultRiskConcerns(riskScore),
      saferFraming: readString(monetizationRisk, ["saferFraming", "safer_framing"]) ?? "Frame as educational documentary analysis with clear uncertainty labels and no instructions for harm."
    },
    monetizationStrategy: {
      primaryRevenuePath: readString(monetizationStrategy, ["primaryRevenuePath", "primary_revenue_path", "revenuePath"]) ?? "Build watch time and subscriber trust first, then use a soft CTA that fits the episode promise.",
      sponsorFit: readString(monetizationStrategy, ["sponsorFit", "sponsor_fit"]) ?? "Good fit only if the sponsor is introduced as a relevant resource, not as a hard sell.",
      affiliateAngle: readString(monetizationStrategy, ["affiliateAngle", "affiliate_angle"]) ?? "Use an educational resource angle tied to the viewer's next step.",
      cta: readString(monetizationStrategy, ["cta", "callToAction", "call_to_action"]) ?? "Subscribe for the next episode and use the saved link only when it naturally helps the viewer.",
      emailCaptureIdea: readString(monetizationStrategy, ["emailCaptureIdea", "email_capture_idea", "leadMagnet"]) ?? "Offer a simple episode companion checklist, map, source guide, or resource list.",
      productIdea: readString(monetizationStrategy, ["productIdea", "product_idea"]) ?? "Create a small paid guide only after repeated topics prove demand.",
      revenueWarnings: readStringArrayFromKeys(monetizationStrategy, ["revenueWarnings", "revenue_warnings", "warnings"]) || ["Do not let the CTA interrupt the hook, proof, or payoff."]
    },
    whiteSpace: {
      whiteSpaceScore,
      underCoveredAngle: readString(whiteSpace, ["underCoveredAngle", "under_covered_angle"]) ?? "Use the least-covered consequence, survivor, document, or unanswered question as the angle.",
      overdoneAngleToAvoid: readString(whiteSpace, ["overdoneAngleToAvoid", "overdone_angle_to_avoid"]) ?? "Avoid a generic overview that repeats the most common version of the story.",
      differentiator: readString(whiteSpace, ["differentiator", "uniqueAngle", "unique_angle"]) ?? "Lead with a specific unresolved question and build the story around evidence."
    }
  };
}

function ideaTotalScore(idea: GeneratedIdea) {
  const power = idea.ideaPowerPack;
  const riskPenalty = power ? Math.round(power.monetizationRisk.riskScore * 0.12) : 0;
  const weighted =
    idea.curiosityScore * 0.16 +
    idea.lengthPotentialScore * 0.14 +
    idea.escalationScore * 0.12 +
    idea.emotionalScore * 0.1 +
    idea.originalityScore * 0.1 +
    (power?.ideaMarketScore ?? 75) * 0.18 +
    (power?.sourceDepthPreflight.depthScore ?? idea.lengthPotentialScore) * 0.08 +
    (power?.analyticsFit.fitScore ?? idea.curiosityScore) * 0.06 +
    (power?.thumbnailFirstFit.visualClarityScore ?? idea.curiosityScore) * 0.06 +
    (power?.whiteSpace.whiteSpaceScore ?? idea.originalityScore) * 0.06;
  return clampScore(Math.round(weighted - riskPenalty), 75);
}

function normalizeTitleTests(record: Record<string, unknown> | null, fallbackTitle: string): PowerTitleTest[] {
  const tests = readObjectArray(record, ["titles", "titleTests", "title_tests"])
    .map((item) => ({
      title: readString(item, ["title", "headline"]) ?? "",
      angle: readString(item, ["angle", "promise", "reason"]),
      score: optionalScore(readNumber(item, ["score", "clickScore", "ctrScore"]))
    }))
    .filter((item) => item.title);
  if (tests.length) return tests.slice(0, 5);
  return [
    { title: fallbackTitle, angle: "Primary promise", score: 75 },
    { title: `${fallbackTitle}: The Evidence`, angle: "Evidence-first version", score: 72 },
    { title: `The Hidden Truth Behind ${fallbackTitle}`, angle: "Curiosity-gap version", score: 70 }
  ];
}

function normalizeThumbnailTests(record: Record<string, unknown> | null, fallbackTitle: string): PowerThumbnailTest[] {
  const tests = readObjectArray(record, ["thumbnailPrompts", "thumbnail_prompts", "thumbnails"])
    .map((item) => ({
      overlayText: readString(item, ["overlayText", "overlay_text", "text"]) ?? "",
      visualHook: readString(item, ["visualHook", "visual_hook", "prompt", "image"]) ?? "",
      score: optionalScore(readNumber(item, ["score", "clickScore", "ctrScore"]))
    }))
    .filter((item) => item.overlayText || item.visualHook);
  if (tests.length) return tests.slice(0, 5);
  return [
    { overlayText: "WHAT HAPPENED?", visualHook: `A cinematic thumbnail for ${fallbackTitle} with one clear focal point`, score: 75 },
    { overlayText: "THE EVIDENCE", visualHook: `Documents, maps, or artifacts tied to ${fallbackTitle}`, score: 72 }
  ];
}

function readObjectArray(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }
  return [];
}

function readStringArrayFromKeys(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const values = readStringArray(record[key]);
    if (values.length) return values;
  }
  return undefined;
}

function optionalScore(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? clampScore(value, 75) : undefined;
}

function normalizePowerLength(value?: number) {
  if (!value) return 45;
  if (value <= 15) return 10;
  if (value <= 25) return 20;
  if (value <= 37) return 30;
  if (value <= 52) return 45;
  return 60;
}

function normalizeRiskLevel(value: string | undefined, score: number): "Low" | "Medium" | "High" {
  const normalized = value?.toLowerCase();
  if (normalized?.includes("high")) return "High";
  if (normalized?.includes("medium") || normalized?.includes("moderate")) return "Medium";
  if (normalized?.includes("low")) return "Low";
  if (score >= 67) return "High";
  if (score >= 34) return "Medium";
  return "Low";
}

function inferredRiskScore(category: string, title: string) {
  const text = `${category} ${title}`.toLowerCase();
  if (/weapon|drug|assassin|death|cult|horror|demon|crime|murder|killer|war|disaster|conspiracy|extrem/i.test(text)) return 55;
  if (/medical|body|plague|prison|heist|predator|border/i.test(text)) return 42;
  return 25;
}

function defaultSourceTypes(category: string) {
  const text = category.toLowerCase();
  if (/space|body|extinct|invent|ai/.test(text)) return ["peer-reviewed papers", "agency publications", "expert explainers"];
  if (/crime|heist|cult|assassin|prison|unsolved|scandal/.test(text)) return ["court records", "news archives", "investigation reports", "survivor accounts"];
  if (/war|siege|empire|pirate|myth|prophecy|ritual/.test(text)) return ["primary histories", "academic books", "maps", "expert analysis"];
  return ["primary sources", "credible secondary sources", "timeline references"];
}

function defaultRiskConcerns(score: number) {
  if (score >= 67) return ["High-sensitivity subject", "Ad-safety framing required", "Avoid instructions or glorification"];
  if (score >= 34) return ["Needs careful educational framing", "Avoid sensational unsupported claims"];
  return ["Low platform risk if facts and uncertainty are handled clearly"];
}

function fallbackFollowUps(title: string) {
  return [`The aftermath of ${title}`, `What most channels leave out about ${title}`, `The unanswered questions behind ${title}`];
}

function fallbackShorts(title: string) {
  return [`The strangest clue in ${title}`, `One fact that changes ${title}`, `The 30-second mystery behind ${title}`];
}

async function channelAnalyticsGuideForIdeas(channelId: string, workspaceId: string) {
  const connection = await prisma.youtubeConnection.findFirst({
    where: { channelId, workspaceId },
    include: {
      recommendations: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 6 }
    }
  });
  if (!connection) return "No connected YouTube analytics for this channel yet. Do not invent performance data; use general retention, clarity, and packaging best practices.";

  const latestPeriod = await prisma.youtubeVideoMetric.findFirst({
    where: { youtubeConnectionId: connection.id },
    orderBy: { periodEnd: "desc" },
    select: { periodStart: true, periodEnd: true }
  });
  const latestMetrics = latestPeriod
    ? await prisma.youtubeVideoMetric.findMany({
        where: {
          youtubeConnectionId: connection.id,
          periodStart: latestPeriod.periodStart,
          periodEnd: latestPeriod.periodEnd
        },
        orderBy: [{ estimatedMinutesWatched: "desc" }, { views: "desc" }],
        take: 8
      })
    : [];

  const totals = latestMetrics.reduce((acc, metric) => ({
    views: acc.views + metric.views,
    watchMinutes: acc.watchMinutes + metric.estimatedMinutesWatched,
    subscribersNet: acc.subscribersNet + metric.subscribersGained - metric.subscribersLost,
    impressions: acc.impressions + metric.impressions,
    weightedCtr: acc.weightedCtr + metric.impressions * metric.impressionCtr,
    weightedRetention: acc.weightedRetention + metric.views * metric.averageViewPercentage,
    weightedDuration: acc.weightedDuration + metric.views * metric.averageViewDuration
  }), {
    views: 0,
    watchMinutes: 0,
    subscribersNet: 0,
    impressions: 0,
    weightedCtr: 0,
    weightedRetention: 0,
    weightedDuration: 0
  });
  const averageCtr = totals.impressions ? totals.weightedCtr / totals.impressions : 0;
  const averageRetention = totals.views ? totals.weightedRetention / totals.views : 0;
  const averageViewDuration = totals.views ? totals.weightedDuration / totals.views : 0;
  const metricLines = latestMetrics.map((metric) =>
    `- ${metric.title}: ${metric.views.toLocaleString()} views, ${(metric.estimatedMinutesWatched / 60).toFixed(1)} watch hours, ${metric.averageViewPercentage.toFixed(1)}% avg viewed, ${metric.impressionCtr.toFixed(1)}% CTR, ${metric.subscribersGained - metric.subscribersLost} net subs`
  );
  const recommendationLines = connection.recommendations.map((item) =>
    `- [${item.priority}] ${item.category}: ${item.recommendation}`
  );

  return [
    `Connected YouTube channel: ${connection.youtubeChannelTitle}`,
    latestPeriod ? `Latest synced period: ${latestPeriod.periodStart.toISOString().slice(0, 10)} to ${latestPeriod.periodEnd.toISOString().slice(0, 10)}` : "No synced video metrics yet.",
    latestMetrics.length
      ? `Latest-period summary: ${totals.views.toLocaleString()} views, ${(totals.watchMinutes / 60).toFixed(1)} watch hours, ${totals.subscribersNet} net subscribers, ${averageCtr.toFixed(1)}% weighted CTR, ${averageRetention.toFixed(1)}% weighted average viewed, ${Math.round(averageViewDuration)} seconds weighted average view duration.`
      : "",
    latestMetrics.length ? `Top recent videos:\n${metricLines.join("\n")}` : "",
    recommendationLines.length ? `Open analytics recommendations:\n${recommendationLines.join("\n")}` : "",
    "Use this as directional idea-selection guidance only. Do not claim these stats in public copy unless the user explicitly asks."
  ].filter(Boolean).join("\n");
}

function buildWhiteSpaceGuide(existing: Array<{ title: string; category: string; status: StoryIdeaStatus; totalScore: number; createdAt: Date }>) {
  if (!existing.length) return "No saved ideas yet. Build a balanced first batch across different viewer promises, eras, stakes, and source types.";
  const categories = new Map<string, number>();
  const activeTitles: string[] = [];
  const usedTitles: string[] = [];
  for (const idea of existing) {
    categories.set(idea.category, (categories.get(idea.category) ?? 0) + 1);
    if (idea.status === StoryIdeaStatus.UNUSED || idea.status === StoryIdeaStatus.SAVED) activeTitles.push(idea.title);
    if (idea.status === StoryIdeaStatus.DRAFTED || idea.status === StoryIdeaStatus.PRODUCED || idea.status === StoryIdeaStatus.PUBLISHED || idea.status === StoryIdeaStatus.ARCHIVED) usedTitles.push(idea.title);
  }
  const topCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([category, count]) => `${category} (${count})`);
  const repeatedTerms = repeatedTitleTerms(existing.map((idea) => idea.title));
  return [
    `Existing ideas in this channel: ${existing.length}.`,
    topCategories.length ? `Most-used categories: ${topCategories.join(", ")}.` : "",
    repeatedTerms.length ? `Repeated title/topic words to avoid overusing unless the angle is fresh: ${repeatedTerms.join(", ")}.` : "",
    activeTitles.length ? `Active queue examples:\n${activeTitles.slice(-12).map((title) => `- ${title}`).join("\n")}` : "",
    usedTitles.length ? `Already used or archived examples:\n${usedTitles.slice(-12).map((title) => `- ${title}`).join("\n")}` : "",
    "Prefer under-covered angles, new evidence types, fresh stakes, and repeatable clusters. Avoid generating another generic overview when a sharper document, survivor, place, timeline, or unanswered-question angle exists."
  ].filter(Boolean).join("\n");
}

function repeatedTitleTerms(titles: string[]) {
  const stopWords = new Set(["the", "and", "that", "this", "with", "from", "into", "what", "when", "where", "why", "how", "who", "was", "were", "never", "true", "story", "hidden", "secret", "inside", "behind"]);
  const counts = new Map<string, number>();
  for (const title of titles) {
    for (const word of title.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []) {
      if (stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word]) => word);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readNumber(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/[^0-9.-]/g, "")) : NaN;
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function firstSentence(value?: string) {
  return value?.split(/(?<=[.!?])\s+/)[0]?.trim();
}

function looksLikeIdeaRecord(record: Record<string, unknown>) {
  return Boolean(readString(record, ["title", "storyTitle", "story_title", "ideaTitle", "headline", "name"]));
}

function normalizeTitleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clampScore(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value ?? fallback)));
}

async function uniqueSlug(workspaceId: string, channelId: string, title: string) {
  const base = slugify(title) || "story-idea";
  let slug = base;
  let index = 2;
  while (await prisma.storyIdea.findFirst({ where: { workspaceId, channelId, slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}
