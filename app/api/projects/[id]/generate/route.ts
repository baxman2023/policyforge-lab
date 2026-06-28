import { ScriptPassType, StoryProjectStatus, type ScriptDraft, type StoryProjectFormat } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { generateJson, generateText } from "@/lib/openrouter";
import { isBookProjectFormat, normalizeSponsorBlurbForFormat, normalizeSponsorLanguageForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { normalizePublishingPack } from "@/lib/publishing-pack";
import { prisma } from "@/lib/prisma";
import { formatKeywordMetricsForPrompt, optionalSeoKeywordMetrics } from "@/lib/dataforseo";
import { formatDraftForResponse } from "@/lib/project-response";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { projectGenerationPrompt, scriptExpansionPrompt } from "@/lib/story-prompts";
import { checkRateLimit } from "@/lib/rate-limit";
import { getOrCreateUserSettings } from "@/lib/settings";
import { ensureIntroSponsorPlacement, ensureOutroSponsorPlacement, stripSponsorCopyFromBody } from "@/lib/sponsor-placement";
import { DEFAULT_THUMBNAIL_STYLE_GUIDE } from "@/lib/thumbnail-style";
import { formatScriptForTts } from "@/lib/tts-format";
import { estimatedMinutesFromWords, wordCount } from "@/lib/utils";
import { formatPublishingPackContent } from "@/lib/youtube-description";

const GenerateProjectSchema = z.object({
  passType: z.nativeEnum(ScriptPassType),
  model: z.string().optional(),
  sourceMaterial: z.string().optional(),
  sponsorBlurb: z.string().optional(),
  sponsorLink: z.string().optional(),
  forceSave: z.boolean().optional()
});

const LONG_BOOK_CHAPTERS_PER_REQUEST = 1;
const LONG_BOOK_PROGRESS_PREFIX = "segmented-long-book-progress:";

const BookChapterPlanSchema = z.object({
  chapters: z.array(z.object({
    number: z.number().int().positive().optional(),
    title: z.string().min(1),
    purpose: z.string().min(1),
    keyMaterial: z.string().optional(),
    emotionalTurn: z.string().optional(),
    endingQuestion: z.string().optional()
  })).min(3)
});

const EpisodePublishingPackSchema = z.object({
  episodeNumber: z.number().int().min(1).max(5).optional(),
  partLabel: z.string().optional(),
  titles: z.array(z.object({
    title: z.string().min(1),
    angle: z.string().optional()
  })).min(3),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).min(8),
  thumbnailPrompts: z.array(z.object({
    title: z.string().min(1),
    overlayText: z.string().optional(),
    prompt: z.string().min(1)
  })).min(3),
  sunoPrompt: z.object({
    title: z.string().optional(),
    prompt: z.string().min(1)
  }).optional(),
  pinnedComment: z.string().optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`project:${user.id}`, 30, 60_000);
    if (!limit.ok) {
      return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
    }

    const { id } = await context.params;
    const input = GenerateProjectSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { storyIdea: true, drafts: { orderBy: { createdAt: "desc" }, take: 40 } }
    });
    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });

    const sourceMaterial = input.sourceMaterial ?? project.sourceMaterial ?? "";
    const sponsorAllowed = supportsSponsorBlurb(project.format);
    const sponsorBlurb = sponsorAllowed ? normalizeSponsorBlurbForFormat(input.sponsorBlurb ?? project.sponsorBlurb ?? "", project.format) : "";
    const sponsorLink = sponsorAllowed ? input.sponsorLink ?? project.sponsorLink ?? "" : "";
    const settings = await getOrCreateUserSettings(user.id);
    const channelVoiceGuide = await channelVoiceGuideForProject(project.channelId, workspace.id);
    const analyticsGuide = await channelAnalyticsGuideForProject(project.channelId, workspace.id);
    const seoKeywordHints = input.passType === ScriptPassType.PUBLISHING_PACK
      ? await publishingPackKeywordHints(user.id, project)
      : "";
    const passContext = buildPassContext(input.passType, project.drafts, project.format, sponsorBlurb);
    const hasEpisodePlan = project.format === "EPISODIC_SERIES" || project.drafts.some((draft) => draft.passType === ScriptPassType.EPISODES);
    const effectiveTargetWordCount = hasEpisodePlan && project.format !== "EPISODIC_SERIES"
      ? project.targetWordCount * 5
      : project.targetWordCount;
    const generatedEpisodePack = await generateSegmentedEpisodePublishingPackIfNeeded({
      userId: user.id,
      workspaceId: workspace.id,
      project,
      passType: input.passType,
      model: input.model,
      sourceMaterial,
      sponsorBlurb,
      sponsorLink,
      channelVoiceGuide,
      seoKeywordHints,
      thumbnailStyleGuide: settings.thumbnailStyleGuide || DEFAULT_THUMBNAIL_STYLE_GUIDE,
      passContext
    });
    const generatedBookDraft = generatedEpisodePack ?? await generateSegmentedBookDraftIfNeeded({
      userId: user.id,
      workspaceId: workspace.id,
      project,
      passType: input.passType,
      model: input.model,
      sourceMaterial,
      sponsorBlurb,
      channelVoiceGuide,
      passContext
    });
    const localBookFinal = generatedBookDraft ?? finalizeBookLocallyIfNeeded(input.passType, project.format, project.drafts, project.targetWordCount, sponsorBlurb);

    if (localBookFinal) {
      const latest = await prisma.scriptDraft.findFirst({
        where: { storyProjectId: project.id, passType: input.passType },
        orderBy: { version: "desc" }
      });
      const words = wordCount(localBookFinal.content);
      const draft = await prisma.scriptDraft.create({
        data: {
          storyProjectId: project.id,
          version: (latest?.version ?? 0) + 1,
          passType: input.passType,
          modelUsed: localBookFinal.modelUsed,
          content: localBookFinal.content,
          wordCount: words,
          estimatedMinutes: estimatedMinutesFromWords(words)
        }
      });

      await prisma.storyProject.update({
        where: { id: project.id },
        data: {
          status: projectStatusForPass(input.passType),
          ...(input.sourceMaterial !== undefined ? { sourceMaterial } : {}),
          ...(input.sponsorBlurb !== undefined || !sponsorAllowed ? { sponsorBlurb: sponsorAllowed ? sponsorBlurb : null } : {}),
          ...(input.sponsorLink !== undefined || !sponsorAllowed ? { sponsorLink: sponsorAllowed ? sponsorLink.trim() || null : null } : {})
        }
      });

      await auditLog({ userId: user.id, workspaceId: workspace.id, action: "story_project.generated", metadata: { projectId: project.id, passType: input.passType, model: localBookFinal.modelUsed } });
      const shouldContinuePass = "continuePass" in localBookFinal ? localBookFinal.continuePass : undefined;
      const progressMessage = "progressMessage" in localBookFinal ? localBookFinal.progressMessage : undefined;
      return Response.json({
        draft: formatDraftForResponse(draft, { ...project, sponsorBlurb, sponsorLink }),
        modelUsed: localBookFinal.modelUsed,
        continuePass: shouldContinuePass,
        progressMessage
      });
    }

    const result = await generateText({
      userId: user.id,
      workspaceId: workspace.id,
      storyProjectId: project.id,
      passType: input.passType,
      model: input.model,
      messages: [
        {
          role: "user",
          content: projectGenerationPrompt(input.passType, {
            title: project.title,
            hook: project.storyIdea?.hook,
            summary: project.storyIdea?.summary,
            format: hasEpisodePlan ? "EPISODIC_SERIES" : project.format,
            targetLengthMinutes: project.targetLengthMinutes,
            targetWordCount: effectiveTargetWordCount,
            tone: project.tone,
            narrationStyle: project.narrationStyle,
            sourceMaterial,
            sponsorBlurb,
            sponsorLink,
            thumbnailStyleGuide: settings.thumbnailStyleGuide || DEFAULT_THUMBNAIL_STYLE_GUIDE,
            seoKeywordHints,
            channelVoiceGuide,
            analyticsGuide,
            passContext,
            category: project.storyIdea?.category,
            sourceType: project.storyIdea?.sourceType,
            suggestedAngle: project.storyIdea?.suggestedAngle,
            location: project.storyIdea?.location,
            eventName: project.storyIdea?.eventName
          })
        }
      ],
      temperature: temperatureForPass(input.passType),
      maxTokens: maxTokensForPass(input.passType, project.format, hasEpisodePlan)
    });

    const latest = await prisma.scriptDraft.findFirst({
      where: { storyProjectId: project.id, passType: input.passType },
      orderBy: { version: "desc" }
    });
    const effectiveProjectFormat = hasEpisodePlan ? "EPISODIC_SERIES" : project.format;
    const polishedContent = polishGeneratedContent(input.passType, result.content, sponsorBlurb, effectiveProjectFormat, {
      forceSave: Boolean(input.forceSave)
    });
    const enforced = await enforceMinimumScriptLength({
      userId: user.id,
      workspaceId: workspace.id,
      project: { ...project, format: effectiveProjectFormat as StoryProjectFormat, targetWordCount: effectiveTargetWordCount },
      passType: input.passType,
      model: input.model,
      content: polishedContent,
      modelUsed: result.model,
      sourceMaterial,
      sponsorBlurb,
      passContext
    });
    const content = input.passType === ScriptPassType.PUBLISHING_PACK && project.format !== "ARTICLE" && project.format !== "PODCAST_EPISODE" && project.format !== "SHORT_BOOK" && project.format !== "LONG_BOOK"
      ? formatPublishingPackContent(enforced.content, {
          title: project.title,
          sponsorBlurb,
          sponsorLink,
          summary: project.storyIdea?.summary,
          hook: project.storyIdea?.hook,
          targetLengthMinutes: project.targetLengthMinutes,
          actualLengthMinutes: actualScriptMinutesForPublishing(project.drafts, project.targetLengthMinutes)
        })
      : enforced.content;
    const words = wordCount(content);
    const draft = await prisma.scriptDraft.create({
      data: {
        storyProjectId: project.id,
        version: (latest?.version ?? 0) + 1,
        passType: input.passType,
        modelUsed: enforced.modelUsed,
        content,
        wordCount: words,
        estimatedMinutes: estimatedMinutesFromWords(words)
      }
    });

    await prisma.storyProject.update({
      where: { id: project.id },
      data: {
        status: projectStatusForPass(input.passType),
        ...(input.sourceMaterial !== undefined ? { sourceMaterial } : {}),
        ...(input.sponsorBlurb !== undefined || !sponsorAllowed ? { sponsorBlurb: sponsorAllowed ? sponsorBlurb : null } : {}),
        ...(input.sponsorLink !== undefined || !sponsorAllowed ? { sponsorLink: sponsorAllowed ? sponsorLink.trim() || null : null } : {})
      }
    });

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "story_project.generated", metadata: { projectId: project.id, passType: input.passType, model: enforced.modelUsed } });
    return Response.json({ draft: formatDraftForResponse(draft, { ...project, sponsorBlurb, sponsorLink }), modelUsed: enforced.modelUsed });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function channelVoiceGuideForProject(channelId: string | null | undefined, workspaceId: string) {
  if (!channelId) return "";
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, workspaceId },
    select: { name: true, description: true }
  });
  if (!channel?.description) return channel?.name ? `Channel name: ${channel.name}` : "";
  return channelVoiceGuideFromDescription(channel.description, channel.name);
}

function channelVoiceGuideFromDescription(description: string, channelName: string) {
  try {
    const parsed = JSON.parse(description) as Record<string, unknown>;
    return [
      `Channel name: ${String(parsed.channelName || channelName)}`,
      parsed.tagline ? `Tagline: ${String(parsed.tagline)}` : "",
      parsed.targetAudience ? `Target audience: ${String(parsed.targetAudience)}` : "",
      parsed.toneRules ? `Tone rules: ${String(parsed.toneRules)}` : "",
      parsed.voiceProfile ? `Brand voice: ${String(parsed.voiceProfile)}` : "",
      parsed.introStyle ? `Intro style: ${String(parsed.introStyle)}` : "",
      parsed.formattingRules ? `Formatting rules: ${String(parsed.formattingRules)}` : "",
      parsed.phrasesToUse ? `Preferred phrases: ${String(parsed.phrasesToUse)}` : "",
      parsed.bannedPhrases ? `Banned phrases: ${String(parsed.bannedPhrases)}` : "",
      parsed.phrasesToAvoid ? `Phrases to avoid: ${String(parsed.phrasesToAvoid)}` : "",
      parsed.recurringStoryTypes ? `Recurring content lanes: ${String(parsed.recurringStoryTypes)}` : "",
      parsed.sponsorRules ? `Sponsor rules: ${String(parsed.sponsorRules)}` : "",
      parsed.moneyGoal ? `Money goal: ${String(parsed.moneyGoal)}` : "",
      parsed.riskTolerance ? `Monetization risk lane: ${String(parsed.riskTolerance)}` : "",
      parsed.weeklyVideoTarget ? `Weekly production target: ${String(parsed.weeklyVideoTarget)} videos` : "",
      parsed.offerDescription ? `Affiliate/offer fit: ${String(parsed.offerDescription)}` : "",
      parsed.affiliateUrl ? `Affiliate/sponsor URL: ${String(parsed.affiliateUrl)}` : "",
      parsed.emailCapturePlan ? `Email capture plan: ${String(parsed.emailCapturePlan)}` : "",
      parsed.primaryCta ? `Primary CTA: ${String(parsed.primaryCta)}` : ""
    ].filter(Boolean).join("\n");
  } catch {
    return `Channel name: ${channelName}\nSaved channel notes: ${description}`;
  }
}

async function channelAnalyticsGuideForProject(channelId: string | null | undefined, workspaceId: string) {
  if (!channelId) return "";
  const connection = await prisma.youtubeConnection.findFirst({
    where: { channelId, workspaceId },
    include: {
      recommendations: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 6 }
    }
  });
  if (!connection) return "No connected YouTube analytics for this channel yet. Do not invent performance data; use general retention best practices.";

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
    "Use this as directional channel guidance only. Do not claim these stats in public script copy unless the user explicitly asks."
  ].filter(Boolean).join("\n");
}

async function publishingPackKeywordHints(userId: string, project: {
  title: string;
  tone: string;
  narrationStyle: string;
  storyIdea?: {
    title: string;
    category: string;
    sourceType?: string | null;
    hook: string;
    summary: string;
    location?: string | null;
    eventName?: string | null;
    suggestedAngle?: string | null;
  } | null;
}) {
  const ideaText = [
    project.storyIdea?.category,
    project.storyIdea?.sourceType,
    project.storyIdea?.suggestedAngle,
    project.storyIdea?.location,
    project.storyIdea?.eventName
  ].filter(Boolean).join(" ").toLowerCase();
  const isBusinessIdea = /\blocal\b|near me|service area|quote|consultation|lead generation|buyer question|service explainer|authority|expert|faq|objection|compliance|cost and pricing|local seo/.test(ideaText);
  const keywords = isBusinessIdea
    ? [
        project.title,
        project.storyIdea?.title,
        project.storyIdea?.category,
        project.storyIdea?.location,
        project.storyIdea?.eventName,
        project.storyIdea?.sourceType,
        `${project.title} guide`,
        `${project.title} tips`,
        `${project.storyIdea?.eventName || project.storyIdea?.category || project.title} questions`,
        project.storyIdea?.location && project.storyIdea?.eventName ? `${project.storyIdea.location} ${project.storyIdea.eventName}` : undefined
      ].filter(Boolean) as string[]
    : [
        project.title,
        project.storyIdea?.title,
        project.storyIdea?.category,
        project.storyIdea?.location,
        project.storyIdea?.eventName,
        `${project.storyIdea?.category || ""} documentary`,
        `${project.title} documentary`,
        `${project.title} story`,
        "true story documentary",
        "mystery documentary"
      ].filter(Boolean) as string[];
  const metrics = await optionalSeoKeywordMetrics({ userId, keywords });
  return formatKeywordMetricsForPrompt(metrics.metrics);
}

function projectStatusForPass(passType: ScriptPassType) {
  if (passType === ScriptPassType.DOSSIER) return StoryProjectStatus.DOSSIER;
  if (
    passType === ScriptPassType.INTRO ||
    passType === ScriptPassType.ANALYTICS_BRIEF ||
    passType === ScriptPassType.EPISODES ||
    passType === ScriptPassType.SERIES_BIBLE ||
    passType === ScriptPassType.HOOK_LAB ||
    passType === ScriptPassType.STORY_SPINE ||
    passType === ScriptPassType.STRUCTURE ||
    passType === ScriptPassType.RETENTION_MAP ||
    passType === ScriptPassType.SCRIPT_LENGTH_GOVERNOR ||
    passType === ScriptPassType.OPEN_LOOP_LEDGER
  ) {
    return StoryProjectStatus.OUTLINE;
  }
  if (passType === ScriptPassType.DRAFT) return StoryProjectStatus.DRAFTING;
  if (passType === ScriptPassType.RETENTION_ANALYSIS || passType === ScriptPassType.CRITIQUE || passType === ScriptPassType.FACT_CHECK) return StoryProjectStatus.CRITIQUE;
  if (passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH || passType === ScriptPassType.QUALITY_GATE) return StoryProjectStatus.REWRITE;
  return StoryProjectStatus.FINAL;
}

async function enforceMinimumScriptLength(input: {
  userId: string;
  workspaceId?: string | null;
  project: {
    id: string;
    title: string;
    format: StoryProjectFormat;
    targetLengthMinutes: number;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
  };
  passType: ScriptPassType;
  model?: string;
  content: string;
  modelUsed: string;
  sourceMaterial: string;
  sponsorBlurb: string;
  passContext: string;
}) {
  if (!shouldEnforceScriptLength(input.passType, input.project.format)) {
    return { content: input.content, modelUsed: input.modelUsed };
  }

  const minimumWordCount = minimumAcceptableScriptWords(input.project.targetWordCount);
  const currentWordCount = wordCount(input.content);
  if (currentWordCount >= minimumWordCount) {
    return { content: input.content, modelUsed: input.modelUsed };
  }

  const expansion = await generateText({
    userId: input.userId,
    workspaceId: input.workspaceId,
    storyProjectId: input.project.id,
    passType: input.passType,
    model: input.model,
    messages: [
      {
        role: "user",
        content: scriptExpansionPrompt({
          title: input.project.title,
          format: input.project.format,
          targetLengthMinutes: input.project.targetLengthMinutes,
          targetWordCount: input.project.targetWordCount,
          currentWordCount,
          minimumWordCount,
          tone: input.project.tone,
          narrationStyle: input.project.narrationStyle,
          sourceMaterial: input.sourceMaterial,
          sponsorBlurb: input.sponsorBlurb,
          passContext: input.passContext,
          currentContent: input.content
        })
      }
    ],
    temperature: 0.62,
    maxTokens: maxTokensForPass(input.passType, input.project.format, /Five-episode series plan/i.test(input.passContext))
  });

  const expandedContent = polishGeneratedContent(input.passType, expansion.content, input.sponsorBlurb, input.project.format);
  const expandedWordCount = wordCount(expandedContent);
  if (expandedWordCount < minimumWordCount) {
    throw new Error(
      `${passLabelForError(input.passType)} was too short and was not saved. ` +
        `The target is ${input.project.targetWordCount.toLocaleString()} words; minimum acceptable is ${minimumWordCount.toLocaleString()} words. ` +
        `The model returned ${currentWordCount.toLocaleString()} words, and the automatic expansion returned ${expandedWordCount.toLocaleString()} words. ` +
        `Try a stronger drafting model, add source material, or choose a shorter target length.`
    );
  }

  return {
    content: expandedContent,
    modelUsed: `${input.modelUsed}; expanded:${expansion.model}`
  };
}

function shouldEnforceScriptLength(passType: ScriptPassType, format: StoryProjectFormat) {
  if (passType !== ScriptPassType.DRAFT && passType !== ScriptPassType.REWRITE && passType !== ScriptPassType.VOICE_POLISH && passType !== ScriptPassType.FINAL) return false;
  return format === "STANDALONE" || format === "EPISODIC_SERIES" || format === "PODCAST_EPISODE";
}

function minimumAcceptableScriptWords(targetWordCount: number) {
  return Math.max(700, Math.round(targetWordCount * 0.7));
}

function passLabelForError(passType: ScriptPassType) {
  if (passType === ScriptPassType.DRAFT) return "Draft";
  if (passType === ScriptPassType.REWRITE) return "Rewrite";
  if (passType === ScriptPassType.VOICE_POLISH) return "Voice polish";
  if (passType === ScriptPassType.FINAL) return "Final script";
  return "Output";
}

async function generateSegmentedEpisodePublishingPackIfNeeded(input: {
  userId: string;
  workspaceId?: string | null;
  project: {
    id: string;
    title: string;
    format: StoryProjectFormat;
    targetLengthMinutes: number;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    sponsorBlurb?: string | null;
    sponsorLink?: string | null;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
    drafts: ScriptDraft[];
  };
  passType: ScriptPassType;
  model?: string;
  sourceMaterial: string;
  sponsorBlurb: string;
  sponsorLink: string;
  channelVoiceGuide: string;
  seoKeywordHints: string;
  thumbnailStyleGuide: string;
  passContext: string;
}) {
  const hasEpisodePlan = input.project.format === "EPISODIC_SERIES" || input.project.drafts.some((draft) => draft.passType === ScriptPassType.EPISODES);
  if (input.passType !== ScriptPassType.PUBLISHING_PACK || !hasEpisodePlan) return null;

  const finishedScript = latestDraftForTypes(input.project.drafts, [ScriptPassType.FINAL, ScriptPassType.REWRITE, ScriptPassType.DRAFT]);
  const episodeSections = parseServerEpisodeOutputSections(finishedScript?.content || "");
  const packs = [];
  const modelsUsed: string[] = [];

  for (let episodeNumber = 1; episodeNumber <= 5; episodeNumber += 1) {
    const episode = episodeSections.find((section) => section.episodeNumber === episodeNumber);
    const result = await generateJson<unknown>({
      userId: input.userId,
      workspaceId: input.workspaceId,
      storyProjectId: input.project.id,
      passType: input.passType,
      model: input.model,
      messages: [
        {
          role: "user",
          content: singleEpisodePublishingPackPrompt({
            ...input,
            episodeNumber,
            episodeTitle: episode?.title || `Episode ${episodeNumber}`,
            episodeScript: episode?.content || finishedScript?.content || "No finished script is available yet. Use the episode plan and previous context.",
            episodePlan: latestDraftForTypes(input.project.drafts, [ScriptPassType.EPISODES])?.content || "",
          })
        }
      ],
      temperature: 0.5,
      maxTokens: 5_500
    });
    const parsed = EpisodePublishingPackSchema.parse(result.data);
    packs.push(parsed);
    modelsUsed.push(result.model);
  }

  const content = normalizePublishingPack(JSON.stringify({ episodePacks: packs }, null, 2));
  return {
    content,
    modelUsed: `${uniqueModelLabels(modelsUsed).join("; ")}; segmented-episode-publishing-pack:5`
  };
}

function latestDraftForTypes(drafts: ScriptDraft[], passTypes: ScriptPassType[]) {
  for (const passType of passTypes) {
    const draft = [...drafts]
      .filter((item) => item.passType === passType)
      .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (draft) return draft;
  }
  return undefined;
}

function parseServerEpisodeOutputSections(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const headingPattern = /^(Episode\s+(One|Two|Three|Four|Five|1|2|3|4|5)(?:\s*:\s*|\s+-\s+|\s+)([^\n]*?)?)\s*$/gim;
  const matches = Array.from(normalized.matchAll(headingPattern));
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const heading = match[1].trim();
    const episodeNumber = episodeNumberFromLabel(match[2]);
    const nextIndex = matches[index + 1]?.index ?? normalized.length;
    const startIndex = (match.index ?? 0) + match[0].length;
    const title = (match[3] || "").trim() || `Episode ${episodeNumber}`;
    return {
      episodeNumber,
      heading,
      title,
      content: normalized.slice(startIndex, nextIndex).trim()
    };
  }).filter((section) => section.episodeNumber >= 1 && section.episodeNumber <= 5 && section.content);
}

function episodeNumberFromLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "one" || normalized === "1") return 1;
  if (normalized === "two" || normalized === "2") return 2;
  if (normalized === "three" || normalized === "3") return 3;
  if (normalized === "four" || normalized === "4") return 4;
  if (normalized === "five" || normalized === "5") return 5;
  return 0;
}

function singleEpisodePublishingPackPrompt(input: {
  project: {
    title: string;
    targetLengthMinutes: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
  };
  episodeNumber: number;
  episodeTitle: string;
  episodeScript: string;
  episodePlan: string;
  sourceMaterial: string;
  sponsorBlurb: string;
  sponsorLink: string;
  channelVoiceGuide: string;
  seoKeywordHints: string;
  thumbnailStyleGuide: string;
  passContext: string;
}) {
  const partLabel = `Part ${input.episodeNumber}`;
  return `Create one YouTube Publishing Pack for ${partLabel} of this five-episode series.

Series title: ${input.project.title}
Episode title: ${input.episodeTitle}
Part label that must appear in every title and thumbnail: ${partLabel}
Target runtime for this episode: ${input.project.targetLengthMinutes} minutes
Tone: ${input.project.tone}
Narration style: ${input.project.narrationStyle}
Hook: ${input.project.storyIdea?.hook || "Not provided"}
Summary: ${input.project.storyIdea?.summary || "Not provided"}
Category: ${input.project.storyIdea?.category || "Not provided"}
Source type: ${input.project.storyIdea?.sourceType || "Not provided"}
Suggested angle: ${input.project.storyIdea?.suggestedAngle || "Not provided"}
Location or market: ${input.project.storyIdea?.location || "Not provided"}
Event, service problem, or buyer moment: ${input.project.storyIdea?.eventName || "Not provided"}

Sponsor blurb:
${input.sponsorBlurb || "No sponsor blurb provided."}

Sponsor link:
${input.sponsorLink || "No sponsor link provided."}

Channel voice and brand rules:
${input.channelVoiceGuide || "No saved channel voice profile."}

Channel thumbnail style guide:
${input.thumbnailStyleGuide || "Use a premium documentary thumbnail style with consistent lighting, texture, and composition across all videos."}

SEO keyword hints from DataForSEO, when available:
${input.seoKeywordHints || "No keyword metrics available. Use the strongest natural search phrases from the story."}

Episode plan:
${input.episodePlan || "No episode plan available."}

Episode script:
${input.episodeScript}

Source material:
${input.sourceMaterial || "No source material pasted yet. Avoid unsupported claims."}

Previous workflow context:
${input.passContext || "No previous pass material available."}

Return strict JSON only. Do not use Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "episodeNumber": ${input.episodeNumber},
  "partLabel": "${partLabel}",
  "titles": [
    { "title": "${partLabel}: Title option 1", "angle": "Why this title should test well" },
    { "title": "${partLabel}: Title option 2", "angle": "Why this title should test well" },
    { "title": "${partLabel}: Title option 3", "angle": "Why this title should test well" }
  ],
  "description": "YouTube description text for ${partLabel} only",
  "tags": ["tag one", "tag two"],
  "thumbnailPrompts": [
    { "title": "${partLabel} thumbnail concept 1", "overlayText": "PART ${input.episodeNumber} HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible ${partLabel} text" },
    { "title": "${partLabel} thumbnail concept 2", "overlayText": "PART ${input.episodeNumber} HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible ${partLabel} text" },
    { "title": "${partLabel} thumbnail concept 3", "overlayText": "PART ${input.episodeNumber} HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible ${partLabel} text" }
  ],
  "sunoPrompt": {
    "title": "Short track concept title",
    "prompt": "Suno.com background music prompt for this specific episode"
  },
  "pinnedComment": "Pinned comment text for ${partLabel}"
}

Rules:
- This pack is for ${partLabel} only, not the whole series.
- Provide exactly 3 title options. Every title must include "${partLabel}".
- Provide 12-20 useful tags.
- Provide exactly 3 thumbnail prompts. Every thumbnail title, overlayText, and prompt must include "${partLabel}" or "PART ${input.episodeNumber}".
- Description must be ready to paste into YouTube and summarize only this episode without unsupported claims.
- The description must include a Timestamps section with 5-8 estimated timestamps in MM:SS format for this episode.
- If a sponsor link is provided, include the exact sponsor link at least twice: ${input.sponsorLink || "no sponsor link"}.
- If no sponsor link is provided, do not add a fake URL.
- Thumbnail prompts should be bold documentary YouTube thumbnails, visually consistent with the channel style, with one dominant focal subject and a clear curiosity gap.
- The overlayText must be exactly 2-4 punchy all-caps words and include PART ${input.episodeNumber}.
- Suno prompt must be instrumental only, no vocals, no lyrics, loopable, emotionally aligned to this episode, and not reference copyrighted artists.`;
}

function actualScriptMinutesForPublishing(drafts: ScriptDraft[], fallbackMinutes: number) {
  const body = drafts.find((draft) =>
    draft.passType === ScriptPassType.FINAL ||
    draft.passType === ScriptPassType.VOICE_POLISH ||
    draft.passType === ScriptPassType.REWRITE ||
    draft.passType === ScriptPassType.DRAFT
  );
  if (!body) return fallbackMinutes;
  return estimatedMinutesFromWords(body.wordCount);
}

function buildPassContext(passType: ScriptPassType, drafts: ScriptDraft[], format: StoryProjectFormat, sponsorBlurb?: string | null) {
  const latest = (type: ScriptPassType) => drafts.find((draft) => draft.passType === type);
  const sections: string[] = [];
  const isBook = isBookProjectFormat(format);
  const outputName = format === "ARTICLE" ? "article" : format === "PODCAST_EPISODE" ? "podcast script" : format === "SHORT_BOOK" ? "short book manuscript" : format === "LONG_BOOK" ? "long form book manuscript" : "script";
  const finishedOutputName = format === "ARTICLE" ? "Finished article" : format === "PODCAST_EPISODE" ? "Finished podcast script" : format === "SHORT_BOOK" ? "Finished short book manuscript" : format === "LONG_BOOK" ? "Finished long form book manuscript" : "Finished script";

  if (passType === ScriptPassType.INTRO) {
    const episodes = latest(ScriptPassType.EPISODES);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    const script = latest(ScriptPassType.FINAL) ?? latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (hookLab) sections.push(formatDraftContext("Selected hook to align with", hookLab));
    if (storySpine) sections.push(formatDraftContext("Story spine to respect", storySpine));
    if (script) sections.push(formatDraftContext(`Existing ${outputName} to match`, script));
  }

  if (passType === ScriptPassType.ANALYTICS_BRIEF) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const episodes = latest(ScriptPassType.EPISODES);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
  }

  if (passType === ScriptPassType.EPISODES) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief to respect", analyticsBrief));
  }

  if (passType === ScriptPassType.SERIES_BIBLE) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief to respect", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
  }

  if (passType === ScriptPassType.HOOK_LAB) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
  }

  if (passType === ScriptPassType.STORY_SPINE) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
    if (hookLab) sections.push(formatDraftContext("Hook Lab selected hook", hookLab));
  }

  if (passType === ScriptPassType.STRUCTURE) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
    if (hookLab) sections.push(formatDraftContext("Hook Lab selected hook", hookLab));
    if (storySpine) sections.push(formatDraftContext("Locked story spine", storySpine));
  }

  if (passType === ScriptPassType.RETENTION_MAP) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    const structure = latest(ScriptPassType.STRUCTURE);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
    if (hookLab) sections.push(formatDraftContext("Hook Lab selected hook", hookLab));
    if (storySpine) sections.push(formatDraftContext("Locked story spine", storySpine));
    if (structure) sections.push(formatDraftContext("Approved structure", structure));
  }

  if (passType === ScriptPassType.SCRIPT_LENGTH_GOVERNOR) {
    const structure = latest(ScriptPassType.STRUCTURE);
    const retentionMap = latest(ScriptPassType.RETENTION_MAP);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
    if (structure) sections.push(formatDraftContext("Approved structure", structure));
    if (retentionMap) sections.push(formatDraftContext("Retention beat map", retentionMap));
  }

  if (passType === ScriptPassType.OPEN_LOOP_LEDGER) {
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    const structure = latest(ScriptPassType.STRUCTURE);
    const retentionMap = latest(ScriptPassType.RETENTION_MAP);
    const lengthGovernor = latest(ScriptPassType.SCRIPT_LENGTH_GOVERNOR);
    if (hookLab) sections.push(formatDraftContext("Hook strategy", hookLab));
    if (storySpine) sections.push(formatDraftContext("Locked story spine", storySpine));
    if (structure) sections.push(formatDraftContext("Approved structure", structure));
    if (retentionMap) sections.push(formatDraftContext("Retention beat map", retentionMap));
    if (lengthGovernor) sections.push(formatDraftContext("Length governor", lengthGovernor));
  }

  if (passType === ScriptPassType.DRAFT) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const analyticsBrief = latest(ScriptPassType.ANALYTICS_BRIEF);
    const episodes = latest(ScriptPassType.EPISODES);
    const seriesBible = latest(ScriptPassType.SERIES_BIBLE);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    const structure = latest(ScriptPassType.STRUCTURE);
    const retentionMap = latest(ScriptPassType.RETENTION_MAP);
    const lengthGovernor = latest(ScriptPassType.SCRIPT_LENGTH_GOVERNOR);
    const openLoopLedger = latest(ScriptPassType.OPEN_LOOP_LEDGER);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (analyticsBrief) sections.push(formatDraftContext("Analytics brief", analyticsBrief));
    if (episodes) sections.push(formatDraftContext("Five-episode series plan", episodes));
    if (seriesBible) sections.push(formatDraftContext("Series bible", seriesBible));
    if (hookLab) sections.push(formatDraftContext("Hook Lab selected hook", hookLab));
    if (storySpine) sections.push(formatDraftContext("Locked story spine", storySpine));
    if (structure) sections.push(formatDraftContext("Approved structure to draft from", structure));
    if (retentionMap) sections.push(formatDraftContext("Retention beat map", retentionMap));
    if (lengthGovernor) sections.push(formatDraftContext("Length governor word budget", lengthGovernor));
    if (openLoopLedger) sections.push(formatDraftContext("Open loop ledger", openLoopLedger));
  }

  if (passType === ScriptPassType.RETENTION_ANALYSIS) {
    const script = latest(ScriptPassType.DRAFT);
    const retentionMap = latest(ScriptPassType.RETENTION_MAP);
    const lengthGovernor = latest(ScriptPassType.SCRIPT_LENGTH_GOVERNOR);
    const openLoopLedger = latest(ScriptPassType.OPEN_LOOP_LEDGER);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} draft to analyze`, script, script.content, bookContextLimit(format, "manuscript")));
    if (retentionMap) sections.push(formatDraftContext("Original retention map", retentionMap));
    if (lengthGovernor) sections.push(formatDraftContext("Length governor", lengthGovernor));
    if (openLoopLedger) sections.push(formatDraftContext("Open loop ledger", openLoopLedger));
  }

  if (passType === ScriptPassType.CRITIQUE) {
    const script = latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const retentionMap = latest(ScriptPassType.RETENTION_MAP);
    const retentionAnalysis = latest(ScriptPassType.RETENTION_ANALYSIS);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to critique`, script, script.content, bookContextLimit(format, "manuscript")));
    if (retentionMap) sections.push(formatDraftContext("Retention beat map to compare against", retentionMap));
    if (retentionAnalysis) sections.push(formatDraftContext("Post-draft retention analysis", retentionAnalysis));
  }

  if (passType === ScriptPassType.FACT_CHECK) {
    const dossier = latest(ScriptPassType.DOSSIER);
    const script = latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    if (dossier) sections.push(formatDraftContext("Research dossier and fact ledger", dossier));
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to check`, script, script.content, bookContextLimit(format, "manuscript")));
  }

  if (passType === ScriptPassType.REWRITE) {
    const script = latest(ScriptPassType.DRAFT);
    const retentionAnalysis = latest(ScriptPassType.RETENTION_ANALYSIS);
    const critique = latest(ScriptPassType.CRITIQUE);
    const factCheck = latest(ScriptPassType.FACT_CHECK);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to rewrite`, script, script.content, bookContextLimit(format, "manuscript")));
    if (retentionAnalysis) sections.push(formatDraftContext("Retention analysis to apply", retentionAnalysis, retentionAnalysis.content, bookContextLimit(format, "notes")));
    if (critique) sections.push(formatDraftContext("Critique notes to apply", critique, critique.content, bookContextLimit(format, "notes")));
    if (factCheck) sections.push(formatDraftContext("Fact and continuity fixes to apply", factCheck, factCheck.content, bookContextLimit(format, "notes")));
  }

  if (passType === ScriptPassType.VOICE_POLISH) {
    const script = latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const retentionAnalysis = latest(ScriptPassType.RETENTION_ANALYSIS);
    const critique = latest(ScriptPassType.CRITIQUE);
    const factCheck = latest(ScriptPassType.FACT_CHECK);
    const openLoopLedger = latest(ScriptPassType.OPEN_LOOP_LEDGER);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to humanize`, script, script.content, bookContextLimit(format, "manuscript")));
    if (retentionAnalysis) sections.push(formatDraftContext("Retention analysis", retentionAnalysis, retentionAnalysis.content, bookContextLimit(format, "notes")));
    if (critique) sections.push(formatDraftContext("Critique notes", critique, critique.content, bookContextLimit(format, "notes")));
    if (factCheck) sections.push(formatDraftContext("Fact and continuity cautions", factCheck, factCheck.content, bookContextLimit(format, "notes")));
    if (openLoopLedger) sections.push(formatDraftContext("Open loop ledger", openLoopLedger));
  }

  if (passType === ScriptPassType.QUALITY_GATE) {
    const script = latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const retentionAnalysis = latest(ScriptPassType.RETENTION_ANALYSIS);
    const critique = latest(ScriptPassType.CRITIQUE);
    const factCheck = latest(ScriptPassType.FACT_CHECK);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to score`, script, script.content, bookContextLimit(format, "manuscript")));
    if (retentionAnalysis) sections.push(formatDraftContext("Retention analysis", retentionAnalysis, retentionAnalysis.content, bookContextLimit(format, "notes")));
    if (critique) sections.push(formatDraftContext("Critique notes", critique, critique.content, bookContextLimit(format, "notes")));
    if (factCheck) sections.push(formatDraftContext("Fact and continuity check", factCheck, factCheck.content, bookContextLimit(format, "notes")));
  }

  if (passType === ScriptPassType.FINAL) {
    const script = latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const qualityGate = latest(ScriptPassType.QUALITY_GATE);
    const factCheck = latest(ScriptPassType.FACT_CHECK);
    const critique = latest(ScriptPassType.CRITIQUE);
    if (script) {
      const label = format === "ARTICLE"
        ? "Article to finalize"
        : format === "PODCAST_EPISODE"
          ? "Podcast script to finalize"
          : format === "SHORT_BOOK"
            ? "Short book manuscript to finalize"
            : format === "LONG_BOOK"
              ? "Long form book manuscript to finalize"
            : "Script to finalize for teleprompter";
      sections.push(formatDraftContext(label, script, script.content, bookContextLimit(format, "manuscript")));
    }
    if (qualityGate) sections.push(formatDraftContext("Final quality gate instructions", qualityGate, qualityGate.content, bookContextLimit(format, "notes")));
    if (factCheck) sections.push(formatDraftContext("Fact and continuity cautions", factCheck, factCheck.content, bookContextLimit(format, "notes")));
    if (critique) sections.push(formatDraftContext("Quality notes to respect", critique, critique.content, bookContextLimit(format, "notes")));
  }

  if (passType === ScriptPassType.OUTRO) {
    const script = latest(ScriptPassType.FINAL) ?? latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const qualityGate = latest(ScriptPassType.QUALITY_GATE);
    if (script) sections.push(formatDraftContext(`${capitalizeFirst(outputName)} to close`, script, stripSponsorCopyFromBody(script.content, sponsorBlurb)));
    if (qualityGate) sections.push(formatDraftContext("Final quality gate notes", qualityGate));
  }

  if (passType === ScriptPassType.SCENE_CARDS) {
    const intro = latest(ScriptPassType.INTRO);
    const script = latest(ScriptPassType.FINAL) ?? latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const outro = latest(ScriptPassType.OUTRO);
    const openLoopLedger = latest(ScriptPassType.OPEN_LOOP_LEDGER);
    const retentionAnalysis = latest(ScriptPassType.RETENTION_ANALYSIS);
    if (intro) sections.push(formatDraftContext("Intro", intro));
    if (script) sections.push(formatDraftContext(finishedOutputName, script, script.content, bookContextLimit(format, "manuscript")));
    if (outro) sections.push(formatDraftContext("Outro", outro));
    if (openLoopLedger) sections.push(formatDraftContext("Open loop ledger", openLoopLedger));
    if (retentionAnalysis) sections.push(formatDraftContext("Retention analysis", retentionAnalysis));
  }

  if (passType === ScriptPassType.PUBLISHING_PACK) {
    const intro = latest(ScriptPassType.INTRO);
    const script = latest(ScriptPassType.FINAL) ?? latest(ScriptPassType.VOICE_POLISH) ?? latest(ScriptPassType.REWRITE) ?? latest(ScriptPassType.DRAFT);
    const outro = latest(ScriptPassType.OUTRO);
    const hookLab = latest(ScriptPassType.HOOK_LAB);
    const storySpine = latest(ScriptPassType.STORY_SPINE);
    const sceneCards = latest(ScriptPassType.SCENE_CARDS);
    if (intro) sections.push(formatDraftContext("Intro", intro));
    if (script) sections.push(formatDraftContext(finishedOutputName, script, script.content, bookContextLimit(format, "manuscript")));
    if (outro) sections.push(formatDraftContext("Outro", outro));
    if (hookLab) sections.push(formatDraftContext("Hook strategy", hookLab));
    if (storySpine) sections.push(formatDraftContext("Story spine", storySpine));
    if (sceneCards) sections.push(formatDraftContext("Production scene cards", sceneCards));
  }

  return [
    isBook
      ? "BOOK CONTEXT NOTE: Long manuscript context may be shortened for reliability. Preserve the existing chapter structure, continuity, factual cautions, and ending from the provided manuscript excerpts and notes."
      : "",
    ...sections
  ].filter(Boolean).join("\n\n---\n\n");
}

function formatDraftContext(label: string, draft: ScriptDraft, content = draft.content, maxCharacters?: number) {
  const prepared = shortenContext(content, maxCharacters);
  const shortenedNote = maxCharacters && content.length > maxCharacters
    ? "\n[Context shortened for request reliability. Beginning, ending, and nearby structure were preserved.]"
    : "";
  return `${label} (${draft.passType} v${draft.version}, ${draft.wordCount} words):${shortenedNote}\n${prepared}`;
}

function bookContextLimit(format: StoryProjectFormat, type: "manuscript" | "notes") {
  if (!isBookProjectFormat(format)) return undefined;
  if (type === "notes") return format === "LONG_BOOK" ? 14_000 : 10_000;
  return format === "LONG_BOOK" ? 70_000 : 50_000;
}

function shortenContext(content: string, maxCharacters?: number) {
  if (!maxCharacters || content.length <= maxCharacters) return content;
  const chapterLines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:chapter|part|section)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/i.test(line))
    .slice(0, 30);
  const headingBlock = chapterLines.length ? `Chapter/section map:\n${chapterLines.join("\n")}\n\n` : "";
  const available = Math.max(8_000, maxCharacters - headingBlock.length - 120);
  const headLength = Math.round(available * 0.62);
  const tailLength = available - headLength;

  return [
    headingBlock.trim(),
    content.slice(0, headLength).trim(),
    "[...middle shortened for reliability...]",
    content.slice(-tailLength).trim()
  ].filter(Boolean).join("\n\n");
}

async function generateSegmentedBookDraftIfNeeded(input: {
  userId: string;
  workspaceId?: string | null;
  project: {
    id: string;
    title: string;
    format: StoryProjectFormat;
    targetLengthMinutes: number;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
    drafts?: ScriptDraft[];
  };
  passType: ScriptPassType;
  model?: string;
  sourceMaterial: string;
  sponsorBlurb: string;
  channelVoiceGuide?: string;
  passContext: string;
}) {
  if (input.passType !== ScriptPassType.DRAFT || input.project.format !== "LONG_BOOK") return null;

  const chapterCount = longBookChapterCount(input.project.targetWordCount);
  const targetWordsPerChapter = Math.max(2_600, Math.round(input.project.targetWordCount / chapterCount));
  const minimumWordsPerChapter = Math.round(targetWordsPerChapter * 0.72);
  const minimumTotalWords = minimumAcceptableBookWords(input.project.format, input.project.targetWordCount);
  const chapters = await createLongBookChapterPlan(input, chapterCount);
  const previousDraft = latestLongBookProgressDraft(input.project.drafts);
  const progress = previousDraft ? parseLongBookProgress(previousDraft.modelUsed) : null;
  const completedChapters = progress ? Math.min(progress.completedChapters, chapterCount) : 0;
  const previousManuscript = progress && previousDraft ? cleanArticleMarkup(previousDraft.content) : "";
  const nextChapters: string[] = [];
  const modelsUsed: string[] = [];
  const chaptersToGenerate = chapters.slice(completedChapters, completedChapters + LONG_BOOK_CHAPTERS_PER_REQUEST);

  for (const chapter of chaptersToGenerate) {
    const result = await generateText({
      userId: input.userId,
      workspaceId: input.workspaceId,
      storyProjectId: input.project.id,
      passType: input.passType,
      model: input.model,
      messages: [
        {
          role: "user",
          content: longBookChapterDraftPrompt({
            ...input,
            chapter,
            chapters,
            chapterIndex: completedChapters + nextChapters.length,
            targetWordsPerChapter,
            minimumWordsPerChapter,
            priorChapterEnding: nextChapters.length ? nextChapters[nextChapters.length - 1] : previousManuscript
          })
        }
      ],
      temperature: 0.68,
      maxTokens: maxTokensForPass(ScriptPassType.DRAFT)
    });

    let chapterText = cleanArticleMarkup(result.content);
    modelsUsed.push(result.model);

    if (wordCount(chapterText) < minimumWordsPerChapter) {
      const expansion = await generateText({
        userId: input.userId,
        workspaceId: input.workspaceId,
        storyProjectId: input.project.id,
        passType: input.passType,
        model: input.model,
        messages: [
          {
            role: "user",
            content: longBookChapterExpansionPrompt({
              title: input.project.title,
              chapter,
              targetWordsPerChapter,
              minimumWordsPerChapter,
              currentWordCount: wordCount(chapterText),
              currentChapter: chapterText,
              sourceMaterial: input.sourceMaterial,
              passContext: input.passContext
            })
          }
        ],
        temperature: 0.64,
        maxTokens: maxTokensForPass(ScriptPassType.DRAFT)
      });
      chapterText = appendChapterText(chapterText, cleanArticleMarkup(expansion.content));
      modelsUsed.push(expansion.model);
    }

    nextChapters.push(chapterText);
  }

  const manuscript = cleanArticleMarkup([previousManuscript, ...nextChapters].filter(Boolean).join("\n\n"));
  const newCompletedChapters = completedChapters + nextChapters.length;
  if (newCompletedChapters < chapterCount) {
    return {
      content: manuscript,
      modelUsed: `${uniqueModelLabels(modelsUsed).join("; ")}; ${LONG_BOOK_PROGRESS_PREFIX}${newCompletedChapters}/${chapterCount}`,
      continuePass: true,
      progressMessage: `Long form book draft saved through chapter ${newCompletedChapters} of ${chapterCount}. Continuing with the next chapter.`
    };
  }

  const manuscriptWords = wordCount(manuscript);
  if (manuscriptWords < minimumTotalWords) {
    throw new Error(
      `Long form book draft was too short and was not saved. ` +
        `Target: ${input.project.targetWordCount.toLocaleString()} words. Minimum acceptable: ${minimumTotalWords.toLocaleString()} words. ` +
        `The chapter builder produced ${manuscriptWords.toLocaleString()} words. ` +
        `Use a stronger drafting model, add more source material, or choose a shorter book size.`
    );
  }

  return {
    content: manuscript,
    modelUsed: `${uniqueModelLabels(modelsUsed).join("; ")}; segmented-long-book-draft:${chapterCount}-chapters`
  };
}

async function createLongBookChapterPlan(input: {
  userId: string;
  workspaceId?: string | null;
  project: {
    id: string;
    title: string;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
  };
  passType: ScriptPassType;
  model?: string;
  sourceMaterial: string;
  passContext: string;
}, chapterCount: number) {
  try {
    const plan = await generateJson<unknown>({
      userId: input.userId,
      workspaceId: input.workspaceId,
      storyProjectId: input.project.id,
      passType: input.passType,
      model: input.model,
      messages: [
        {
          role: "user",
          content: longBookChapterPlanPrompt(input, chapterCount)
        }
      ],
      temperature: 0.35,
      maxTokens: 5_000
    });
    const parsed = BookChapterPlanSchema.parse(plan.data);
    return normalizeChapterPlan(parsed.chapters, chapterCount);
  } catch {
    return fallbackChapterPlan(input.project.title, chapterCount);
  }
}

function bookContentModeContext(storyIdea?: {
  category?: string | null;
  sourceType?: string | null;
  location?: string | null;
  eventName?: string | null;
  suggestedAngle?: string | null;
} | null) {
  const text = [
    storyIdea?.category,
    storyIdea?.sourceType,
    storyIdea?.location,
    storyIdea?.eventName,
    storyIdea?.suggestedAngle
  ].filter(Boolean).join(" ").toLowerCase();
  const isLocalLeadGen = /\blocal\b|near me|service area|quote|consultation|lead generation|cost and pricing|local seo/.test(text);
  const isExpertAuthority = isLocalLeadGen || /authority|expert|buyer question|service explainer|case stud|compliance|faq|objection|myth bust|comparison content|industry expertise|qualified leads/.test(text);
  if (!isExpertAuthority) return "";

  return `
Content mode: ${isLocalLeadGen ? "Local Lead Gen" : "Expert / Authority"}
Category: ${storyIdea?.category || "Not provided"}
Source type: ${storyIdea?.sourceType || "Not provided"}
Market/location: ${storyIdea?.location || "Not provided"}
Service problem or buyer moment: ${storyIdea?.eventName || "Not provided"}
Suggested angle: ${storyIdea?.suggestedAngle || "Not provided"}

Business book rules:
- Treat this as ${isLocalLeadGen ? "a local lead-generation authority book" : "an expert authority book"}, not a mystery/documentary book.
- Build chapters around buyer questions, risks, decisions, frameworks, objections, examples, proof points, and practical next steps.
- Do not invent credentials, testimonials, statistics, local facts, laws, case results, prices, discounts, or guaranteed outcomes.
- If the niche is regulated or high-stakes, write as general education and recommend speaking with a qualified professional.
- Do not add hard-sell CTAs inside the manuscript.`;
}

function longBookChapterPlanPrompt(input: {
  project: {
    title: string;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
  };
  sourceMaterial: string;
  passContext: string;
}, chapterCount: number) {
  return `Create a chapter plan for a long form nonfiction book.

Book title: ${input.project.title}
Target manuscript length: ${input.project.targetWordCount.toLocaleString()} words
Required chapter count: ${chapterCount}
Tone: ${input.project.tone}
Narration style: ${input.project.narrationStyle}
Hook: ${input.project.storyIdea?.hook || "Not provided"}
Summary: ${input.project.storyIdea?.summary || "Not provided"}
${bookContentModeContext(input.project.storyIdea)}

Source material:
${input.sourceMaterial || "No source material pasted yet. Label uncertainty clearly and avoid unsupported claims."}

Planning context:
${shortenContext(input.passContext, 22_000) || "No prior planning context is available."}

Return strict JSON only:
{
  "chapters": [
    {
      "number": 1,
      "title": "Chapter title",
      "purpose": "What this chapter accomplishes in the book",
      "keyMaterial": "Facts, records, scenes, or arguments to develop",
      "emotionalTurn": "Reader-facing emotional or curiosity turn",
      "endingQuestion": "Question or unresolved tension leading into the next chapter"
    }
  ]
}

Rules:
- Return exactly ${chapterCount} chapters.
- Build a complete book arc, not a video outline.
- Each chapter must have enough substance for a full chapter.
- Do not invent facts, sources, or certainty.`;
}

function longBookChapterDraftPrompt(input: {
  project: {
    title: string;
    targetWordCount: number;
    tone: string;
    narrationStyle: string;
    storyIdea?: {
      hook: string;
      summary: string;
      category?: string | null;
      sourceType?: string | null;
      location?: string | null;
      eventName?: string | null;
      suggestedAngle?: string | null;
    } | null;
  };
  sourceMaterial: string;
  passContext: string;
  channelVoiceGuide?: string;
  chapter: BookChapter;
  chapters: BookChapter[];
  chapterIndex: number;
  targetWordsPerChapter: number;
  minimumWordsPerChapter: number;
  priorChapterEnding: string;
}) {
  return `Write one chapter of a long form nonfiction book manuscript.

Book title: ${input.project.title}
Full book target: ${input.project.targetWordCount.toLocaleString()} words
This chapter target: about ${input.targetWordsPerChapter.toLocaleString()} words
This chapter minimum before stopping: ${input.minimumWordsPerChapter.toLocaleString()} words
Tone: ${input.project.tone}
Narration style: ${input.project.narrationStyle}
Channel voice and brand rules:
${input.channelVoiceGuide || "No saved channel voice profile."}

Hook: ${input.project.storyIdea?.hook || "Not provided"}
Summary: ${input.project.storyIdea?.summary || "Not provided"}
${bookContentModeContext(input.project.storyIdea)}

Chapter to write:
${formatChapterForPrompt(input.chapter)}

Full chapter map:
${input.chapters.map(formatChapterForPrompt).join("\n\n")}

Previous chapter ending for continuity:
${input.chapterIndex === 0 ? "This is the opening chapter." : shortenContext(input.priorChapterEnding, 2_400)}

Source material:
${input.sourceMaterial || "No source material pasted yet. Label uncertainty clearly and avoid unsupported claims."}

Planning context:
${shortenContext(input.passContext, 18_000) || "No prior planning context is available."}

Rules:
- Output only the complete manuscript text for this chapter.
- Start with a clean heading like "Chapter One: The Ice That Would Not Take Her".
- Write a real book chapter, not a summary, outline, script, podcast, or video narration.
- Develop scenes, chronology, evidence, source uncertainty, context, consequences, and reader questions.
- Use paragraphs suitable for a nonfiction book.
- Do not use bullets, timestamps, production notes, host language, sponsor language, or calls to action.
- Do not pad, repeat, or invent facts to hit length.
- If a detail is uncertain, phrase it as uncertain in the manuscript.
- End with a complete paragraph that creates continuity into the next chapter.`;
}

function longBookChapterExpansionPrompt(input: {
  title: string;
  chapter: BookChapter;
  targetWordsPerChapter: number;
  minimumWordsPerChapter: number;
  currentWordCount: number;
  currentChapter: string;
  sourceMaterial: string;
  passContext: string;
}) {
  return `The chapter below is underdeveloped for a long form book and needs additional manuscript text.

Book title: ${input.title}
Chapter:
${formatChapterForPrompt(input.chapter)}

Target chapter length: about ${input.targetWordsPerChapter.toLocaleString()} words
Minimum chapter length: ${input.minimumWordsPerChapter.toLocaleString()} words
Current chapter length: ${input.currentWordCount.toLocaleString()} words

Current chapter:
${input.currentChapter}

Source material:
${input.sourceMaterial || "No source material pasted yet. Label uncertainty clearly and avoid unsupported claims."}

Planning context:
${shortenContext(input.passContext, 12_000) || "No prior planning context is available."}

Add the missing depth for this same chapter.

Rules:
- Return only additional manuscript paragraphs to append to this chapter.
- Do not repeat the existing chapter heading.
- Deepen verified context, chronology, evidence, consequences, source uncertainty, and human stakes.
- Do not invent facts, sources, dialogue, or certainty.
- Do not add bullets, notes, timestamps, sponsor language, or calls to action.`;
}

type BookChapter = z.infer<typeof BookChapterPlanSchema>["chapters"][number] & { number: number };

function normalizeChapterPlan(chapters: z.infer<typeof BookChapterPlanSchema>["chapters"], chapterCount: number): BookChapter[] {
  const normalized = chapters.slice(0, chapterCount).map((chapter, index) => ({
    number: index + 1,
    title: chapter.title.trim() || `Chapter ${index + 1}`,
    purpose: chapter.purpose.trim(),
    keyMaterial: chapter.keyMaterial?.trim(),
    emotionalTurn: chapter.emotionalTurn?.trim(),
    endingQuestion: chapter.endingQuestion?.trim()
  }));
  if (normalized.length >= chapterCount) return normalized;
  return [
    ...normalized,
    ...fallbackChapterPlan("the story", chapterCount - normalized.length).map((chapter, index) => ({
      ...chapter,
      number: normalized.length + index + 1
    }))
  ];
}

function fallbackChapterPlan(title: string, chapterCount: number): BookChapter[] {
  const chapterTitles = [
    "The Record Opens",
    "The World Before",
    "The First Turn",
    "What Was Seen",
    "What Was Missed",
    "The Official Story",
    "The Gaps In The File",
    "The Human Cost",
    "The Long Aftermath",
    "The Competing Explanations",
    "What The Evidence Can Bear",
    "What Remains"
  ];
  return Array.from({ length: chapterCount }, (_, index) => ({
    number: index + 1,
    title: chapterTitles[index] || `Chapter ${index + 1}`,
    purpose: `Develop part ${index + 1} of ${title} with book-level context, evidence, and narrative continuity.`,
    keyMaterial: "Use the strongest confirmed records, timeline details, source cautions, and human stakes available.",
    emotionalTurn: "Move the reader from curiosity toward a clearer understanding of what can and cannot be known.",
    endingQuestion: "Carry one unresolved question into the next chapter."
  }));
}

function formatChapterForPrompt(chapter: BookChapter) {
  return [
    `Chapter ${chapter.number}: ${chapter.title}`,
    `Purpose: ${chapter.purpose}`,
    chapter.keyMaterial ? `Key material: ${chapter.keyMaterial}` : "",
    chapter.emotionalTurn ? `Emotional turn: ${chapter.emotionalTurn}` : "",
    chapter.endingQuestion ? `Ending question: ${chapter.endingQuestion}` : ""
  ].filter(Boolean).join("\n");
}

function appendChapterText(chapter: string, addition: string) {
  if (!addition.trim()) return chapter.trim();
  return `${chapter.trim()}\n\n${addition.trim()}`.trim();
}

function latestLongBookProgressDraft(drafts?: ScriptDraft[]) {
  return drafts
    ?.filter((draft) => draft.passType === ScriptPassType.DRAFT && parseLongBookProgress(draft.modelUsed))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function parseLongBookProgress(modelUsed: string) {
  const escapedPrefix = LONG_BOOK_PROGRESS_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = modelUsed.match(new RegExp(`${escapedPrefix}(\\d+)\\/(\\d+)`));
  if (!match) return null;
  const completedChapters = Number(match[1]);
  const totalChapters = Number(match[2]);
  if (!Number.isFinite(completedChapters) || !Number.isFinite(totalChapters) || totalChapters <= 0) return null;
  return { completedChapters, totalChapters };
}

function uniqueModelLabels(models: string[]) {
  return Array.from(new Set(models.filter(Boolean)));
}

function longBookChapterCount(targetWordCount: number) {
  if (targetWordCount >= 75_000) return 24;
  if (targetWordCount >= 55_000) return 20;
  return 14;
}

function minimumAcceptableBookWords(format: StoryProjectFormat, targetWordCount: number) {
  if (format === "LONG_BOOK") return Math.max(28_000, Math.round(targetWordCount * 0.7));
  if (format === "SHORT_BOOK") return Math.max(7_500, Math.round(targetWordCount * 0.65));
  return minimumAcceptableScriptWords(targetWordCount);
}

function finalizeBookLocallyIfNeeded(passType: ScriptPassType, format: StoryProjectFormat, drafts: ScriptDraft[], targetWordCount: number, sponsorBlurb?: string | null) {
  if (!isBookProjectFormat(format)) return null;
  if (passType !== ScriptPassType.REWRITE && passType !== ScriptPassType.FINAL) return null;
  const source = passType === ScriptPassType.REWRITE
    ? drafts.find((draft) => draft.passType === ScriptPassType.DRAFT)
    : drafts.find((draft) => draft.passType === ScriptPassType.REWRITE) ?? drafts.find((draft) => draft.passType === ScriptPassType.DRAFT);
  if (!source) return null;

  const content = polishGeneratedContent(passType, source.content, sponsorBlurb, format, { forceSave: true });
  if (!content) return null;
  const words = wordCount(content);
  const minimumWords = minimumAcceptableBookWords(format, targetWordCount);
  if (words < minimumWords) {
    const label = passType === ScriptPassType.REWRITE ? "Book Rewrite" : "Final Book";
    throw new Error(
      `${label} was not saved because the source manuscript is too short. ` +
        `Target: ${targetWordCount.toLocaleString()} words. Minimum acceptable: ${minimumWords.toLocaleString()} words. ` +
        `Current manuscript: ${words.toLocaleString()} words. ` +
        `Rerun Book Draft or Fully Auto so the manuscript is built in chapter batches.`
    );
  }

  return {
    content,
    modelUsed: `${source.modelUsed}; ${passType === ScriptPassType.REWRITE ? "deterministic-book-rewrite" : "deterministic-book-finalizer"}`
  };
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function temperatureForPass(passType: ScriptPassType) {
  if (passType === ScriptPassType.INTRO || passType === ScriptPassType.OUTRO) return 0.72;
  if (passType === ScriptPassType.PUBLISHING_PACK) return 0.58;
  if (
    passType === ScriptPassType.ANALYTICS_BRIEF ||
    passType === ScriptPassType.DOSSIER ||
    passType === ScriptPassType.RETENTION_ANALYSIS ||
    passType === ScriptPassType.CRITIQUE ||
    passType === ScriptPassType.FACT_CHECK ||
    passType === ScriptPassType.QUALITY_GATE ||
    passType === ScriptPassType.FINAL
  ) {
    return 0.35;
  }
  if (
    passType === ScriptPassType.EPISODES ||
    passType === ScriptPassType.SERIES_BIBLE ||
    passType === ScriptPassType.HOOK_LAB ||
    passType === ScriptPassType.STORY_SPINE ||
    passType === ScriptPassType.STRUCTURE ||
    passType === ScriptPassType.RETENTION_MAP ||
    passType === ScriptPassType.SCRIPT_LENGTH_GOVERNOR ||
    passType === ScriptPassType.OPEN_LOOP_LEDGER ||
    passType === ScriptPassType.SCENE_CARDS
  ) {
    return 0.55;
  }
  return 0.75;
}

function maxTokensForPass(passType: ScriptPassType, format?: StoryProjectFormat | string | null, hasEpisodePlan = false) {
  if (hasEpisodePlan && (passType === ScriptPassType.INTRO || passType === ScriptPassType.OUTRO)) return 3200;
  if (passType === ScriptPassType.INTRO || passType === ScriptPassType.OUTRO) return 1600;
  if (passType === ScriptPassType.PUBLISHING_PACK && format === "ARTICLE") return 9000;
  if (passType === ScriptPassType.PUBLISHING_PACK && (format === "EPISODIC_SERIES" || hasEpisodePlan)) return 18000;
  if (passType === ScriptPassType.PUBLISHING_PACK) return 6000;
  if (
    (format === "EPISODIC_SERIES" || hasEpisodePlan) &&
    (passType === ScriptPassType.DRAFT || passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH || passType === ScriptPassType.FINAL)
  ) {
    return 28000;
  }
  if (passType === ScriptPassType.DRAFT || passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH || passType === ScriptPassType.FINAL) return 16000;
  if (passType === ScriptPassType.RETENTION_ANALYSIS || passType === ScriptPassType.CRITIQUE || passType === ScriptPassType.FACT_CHECK || passType === ScriptPassType.QUALITY_GATE) return 7000;
  if (passType === ScriptPassType.DOSSIER || passType === ScriptPassType.ANALYTICS_BRIEF || passType === ScriptPassType.EPISODES || passType === ScriptPassType.SERIES_BIBLE || passType === ScriptPassType.STRUCTURE || passType === ScriptPassType.RETENTION_MAP || passType === ScriptPassType.SCRIPT_LENGTH_GOVERNOR || passType === ScriptPassType.OPEN_LOOP_LEDGER || passType === ScriptPassType.SCENE_CARDS) return 7000;
  return 6000;
}

function polishGeneratedContent(
  passType: ScriptPassType,
  content: string,
  sponsorBlurb?: string | null,
  projectFormat?: string | null,
  options: { forceSave?: boolean } = {}
) {
  if (passType === ScriptPassType.PUBLISHING_PACK) {
    return normalizeSponsorLanguageForFormat(
      normalizePublishingPack(content, { requireThumbnailPrompts: projectFormat !== "ARTICLE" && projectFormat !== "PODCAST_EPISODE" && projectFormat !== "SHORT_BOOK" && projectFormat !== "LONG_BOOK" }),
      projectFormat
    );
  }
  if (projectFormat === "ARTICLE" || projectFormat === "SHORT_BOOK" || projectFormat === "LONG_BOOK") {
    const polished = normalizeSponsorLanguageForFormat(cleanArticleMarkup(content), projectFormat);
    if ((passType === ScriptPassType.DRAFT || passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH || passType === ScriptPassType.FINAL) && !polished) {
      const outputName = projectFormat === "SHORT_BOOK" || projectFormat === "LONG_BOOK" ? "book" : "article";
      throw new Error(`${passType === ScriptPassType.DRAFT ? "Draft" : passType === ScriptPassType.REWRITE ? "Rewrite" : `Final ${outputName}`} output was empty and was not saved. Please run it again.`);
    }
    return isBodyScriptPass(passType) ? stripSponsorCopyFromBody(polished, sponsorBlurb) : polished;
  }
  if (!isSpokenScriptPass(passType)) return normalizeSponsorLanguageForFormat(content, projectFormat);
  const spokenSponsorBlurb = sponsorBlurb ? formatScriptForTts(cleanTeleprompterMarkup(sponsorBlurb)) : sponsorBlurb;
  const polished = normalizeSponsorLanguageForFormat(isBodyScriptPass(passType)
    ? stripSponsorCopyFromBody(formatScriptForTts(cleanTeleprompterMarkup(content)), spokenSponsorBlurb)
    : formatScriptForTts(cleanTeleprompterMarkup(content)), projectFormat);

  if (projectFormat === "EPISODIC_SERIES" && (passType === ScriptPassType.INTRO || passType === ScriptPassType.OUTRO)) {
    const episodeSections = parseServerEpisodeOutputSections(polished);
    if (episodeSections.length) {
      return episodeSections.map((section) => {
        const sectionContent = passType === ScriptPassType.INTRO
          ? ensureIntroSponsorPlacement(section.content, spokenSponsorBlurb)
          : ensureOutroSponsorPlacement(section.content, spokenSponsorBlurb);
        return `${section.heading}\n\n${sectionContent}`;
      }).join("\n\n");
    }
  }

  if (passType === ScriptPassType.INTRO) {
    const oneParagraph = ensureIntroSponsorPlacement(polished.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim(), spokenSponsorBlurb);
    if (!oneParagraph) throw new Error("Intro output was empty and was not saved. Please run Intro again.");
    if (/Now,\s+let['’]s get into today['’]s story\.?$/i.test(oneParagraph)) return oneParagraph;
    return `${oneParagraph.replace(/[.?!]?$/, ".")} Now, let's get into today's story.`;
  }

  if (passType === ScriptPassType.OUTRO) {
    const oneParagraph = ensureOutroSponsorPlacement(polished.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim(), spokenSponsorBlurb);
    if (!oneParagraph) throw new Error("Outro output was empty and was not saved. Please run Outro again.");
    return oneParagraph;
  }

  if (passType === ScriptPassType.DRAFT || passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH) {
    if (!polished) throw new Error(`${passType === ScriptPassType.DRAFT ? "Draft" : passType === ScriptPassType.REWRITE ? "Rewrite" : "Voice polish"} output was empty and was not saved. Please run it again.`);
    return polished;
  }

  if (passType === ScriptPassType.FINAL && !polished) {
    throw new Error("Final script output was empty and was not saved. Please run Final again.");
  }

  if (!/[.!?]["')\]]?$/.test(polished) && !options.forceSave) {
    throw new Error("Final script output appeared incomplete and was not saved. Please run Final again, or use Force Save Final if the result is acceptable.");
  }

  return polished;
}

function isSpokenScriptPass(passType: ScriptPassType) {
  return (
    passType === ScriptPassType.INTRO ||
    passType === ScriptPassType.DRAFT ||
    passType === ScriptPassType.REWRITE ||
    passType === ScriptPassType.VOICE_POLISH ||
    passType === ScriptPassType.FINAL ||
    passType === ScriptPassType.OUTRO
  );
}

function isBodyScriptPass(passType: ScriptPassType) {
  return passType === ScriptPassType.DRAFT || passType === ScriptPassType.REWRITE || passType === ScriptPassType.VOICE_POLISH || passType === ScriptPassType.FINAL;
}

function cleanTeleprompterMarkup(content: string) {
  return content
    .replace(/\[(?:\s*(?:pause|beat|long pause|music|sfx|sound effect|silence)\s*)\]/gi, "")
    .replace(/^\s*#{1,6}\s+.+$/gm, "")
    .replace(/^\s*(?:part|chapter|section)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*:.*$/gim, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanArticleMarkup(content: string) {
  return content
    .replace(/```(?:text|md|markdown)?/gi, "")
    .replace(/```/g, "")
    .replace(/\[(?:\s*(?:pause|beat|long pause|music|sfx|sound effect|silence)\s*)\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}
