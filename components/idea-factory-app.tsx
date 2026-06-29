"use client";

import {
  Anchor,
  Archive,
  BarChart3,
  Bell,
  Bookmark,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Copy,
  Download,
  FileText,
  Filter,
  FolderKanban,
  Globe2,
  HelpCircle,
  Home,
  Image as ImageIcon,
  KeyRound,
  LayoutList,
  Lightbulb,
  ListChecks,
  Loader2,
  LogOut,
  Mic2,
  Navigation,
  Newspaper,
  Play,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  UserCog,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { parsePublishingPack } from "@/lib/publishing-pack";
import type { ArticleSeoPack, ConversionAssets, EpisodePublishingPack, SunoMusicPrompt, TopicalAuthorityMap } from "@/lib/publishing-pack";
import { FORGE_NICHES, forgeIdeaBrief, forgeNicheByChannel } from "@/lib/forge-niches";
import {
  BOOK_ILLUSTRATION_MODEL_OPTIONS,
  DEFAULT_BOOK_ILLUSTRATION_MODEL,
  formatEstimatedBookIllustrationCost,
  getBookIllustrationModelOption
} from "@/lib/book-illustration-models";
import { apiPath } from "@/lib/client-api";
import { episodeCountForProject } from "@/lib/episodes";
import { formatHeyGenSceneScript, shouldFormatAsHeyGenScenes } from "@/lib/heygen-scenes";
import { normalizeSponsorBlurbForFormat, normalizeSponsorLanguageForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { ensureIntroSponsorPlacement, ensureOutroSponsorPlacement, stripSponsorCopyFromBody } from "@/lib/sponsor-placement";
import { narrationStyleOptions, nicheFocusOptions, storyLengthOptions, toneOptions } from "@/lib/story-options";
import { DEFAULT_THUMBNAIL_STYLE_GUIDE } from "@/lib/thumbnail-style";
import { cn } from "@/lib/utils";
import { formatPublishingPackContent, formatYoutubeDescription } from "@/lib/youtube-description";

const CHANNEL_IDEA_MACHINE_SEED_LIMIT = 1900;

type AppUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string;
};

type Channel = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkspaceSubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "INACTIVE" | "CANCELED";
type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  logoUrl?: string | null;
  customDomain?: string | null;
  subscriptionStatus: WorkspaceSubscriptionStatus;
  subscriptionPlan?: string | null;
  setupCompletedAt?: string | null;
  role?: WorkspaceRole;
  createdAt?: string;
  updatedAt?: string;
};

type WorkspaceMember = {
  id: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    disabledAt?: string | null;
    createdAt?: string;
  };
};

type WorkspaceInvite = {
  id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: string;
  createdAt: string;
};

type WorkspaceUsage = {
  ideaCount: number;
  projectCount: number;
  channelCount: number;
  memberCount: number;
  generationCount: number;
  recentGenerationCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  byUser: Array<{
    userId: string;
    name: string;
    email?: string | null;
    generationCount: number;
    totalTokens: number;
    estimatedCost: number;
  }>;
};

type UsageLedger = {
  since: string;
  byModel: Array<{
    modelUsed: string;
    status: string;
    generationCount: number;
    totalTokens: number;
    estimatedCost: number;
  }>;
  byPass: Array<{
    passType?: ScriptPassType | null;
    status: string;
    generationCount: number;
    totalTokens: number;
    estimatedCost: number;
  }>;
  recent: Array<{
    id: string;
    storyProjectId?: string | null;
    projectTitle?: string | null;
    passType?: ScriptPassType | null;
    modelUsed: string;
    totalTokens: number;
    estimatedCost: number;
    status: string;
    errorMessage?: string | null;
    createdAt: string;
  }>;
};

type ClientJobStatus = "queued" | "running" | "saving" | "complete" | "failed";

type ClientJob = {
  id: string;
  label: string;
  detail: string;
  status: ClientJobStatus;
  progress: number;
  startedAt: string;
  finishedAt?: string;
};

type WorkspacePayload = {
  activeWorkspace: WorkspaceSummary;
  canManageWorkspace: boolean;
  workspaces: WorkspaceSummary[];
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  usage: WorkspaceUsage;
};

type AppSection =
  | "dashboard"
  | "campaign-builder"
  | "idea-factory"
  | "projects"
  | "script-lab"
  | "calendar"
  | "published"
  | "media"
  | "exports"
  | "analytics"
  | "guides"
  | "settings";
type ExperienceMode = "GUIDED" | "POWER";

type IdeaStatus = "UNUSED" | "SAVED" | "IN_PROGRESS" | "DRAFTED" | "PRODUCED" | "PUBLISHED" | "ARCHIVED" | "REJECTED";
type StoryProjectStatus = "DOSSIER" | "OUTLINE" | "DRAFTING" | "CRITIQUE" | "REWRITE" | "FINAL" | "PRODUCED" | "PUBLISHED" | "ARCHIVED";
type StoryProjectFormat = "STANDALONE" | "EPISODIC_SERIES" | "PODCAST_EPISODE" | "ARTICLE" | "SHORT_BOOK" | "LONG_BOOK";
type ContentMode =
  | "STORY_DOCUMENTARY"
  | "EXPERT_AUTHORITY"
  | "LOCAL_LEAD_GEN"
  | "SALES_OFFER"
  | "EDUCATION_COURSE"
  | "BOOK_PUBLISHING"
  | "REPURPOSE_MULTIPLIER"
  | "BRAND_CHANNEL_STRATEGY";
type ScriptPassType =
  | "INTRO"
  | "DOSSIER"
  | "ANALYTICS_BRIEF"
  | "EPISODES"
  | "SERIES_BIBLE"
  | "HOOK_LAB"
  | "STORY_SPINE"
  | "STRUCTURE"
  | "RETENTION_MAP"
  | "SCRIPT_LENGTH_GOVERNOR"
  | "OPEN_LOOP_LEDGER"
  | "DRAFT"
  | "RETENTION_ANALYSIS"
  | "CRITIQUE"
  | "FACT_CHECK"
  | "REWRITE"
  | "VOICE_POLISH"
  | "QUALITY_GATE"
  | "FINAL"
  | "OUTRO"
  | "SCENE_CARDS"
  | "PUBLISHING_PACK";
type PublishingSlotType = "STANDALONE" | "EPISODE";
type PublishingSlotStatus = "SCHEDULED" | "PRODUCED" | "PUBLISHED" | "SKIPPED";

type StoryIdea = {
  id: string;
  channelId?: string | null;
  title: string;
  hook: string;
  summary: string;
  category: string;
  sourceType?: string | null;
  sourceUrls?: unknown;
  people?: unknown;
  location?: string | null;
  eventName?: string | null;
  originalityScore: number;
  curiosityScore: number;
  emotionalScore: number;
  escalationScore: number;
  lengthPotentialScore: number;
  researchDifficultyScore: number;
  estimatedLengthPotential?: string | null;
  recommendedLengthMinutes?: number | null;
  episodeFit?: "Low" | "Medium" | "High" | string | null;
  bestFormat?: "Single Video" | "3-Part Series" | "5-Part Series" | string | null;
  episodeWhy?: string | null;
  episodeArc?: EpisodeArcItem[] | unknown;
  episodeBusinessValue?: string | null;
  recommendedTone?: string | null;
  recommendedNarrationStyle?: string | null;
  totalScore: number;
  productionPriority: string;
  suggestedAngle: string;
  status: IdeaStatus;
  usedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type EpisodeArcItem = {
  part?: string;
  title?: string;
  promise?: string;
};

type IdeaPowerPack = {
  ideaMarketScore?: number;
  titleThumbnailPretest?: {
    titles?: Array<{ title?: string; angle?: string; score?: number }>;
    thumbnailPrompts?: Array<{ overlayText?: string; visualHook?: string; score?: number }>;
    clickPromise?: string;
    retentionPromise?: string;
  };
  thumbnailFirstFit?: {
    visualClarityScore?: number;
    coreImage?: string;
    titleThumbnailMatch?: string;
    firstFrameExpectation?: string;
    hardToVisualizeWarning?: string;
  };
  sourceDepthPreflight?: {
    depthScore?: number;
    bestLengthMinutes?: number;
    sourceTypesNeeded?: string[];
    mustVerify?: string[];
    thinRisk?: string;
    seriesPotential?: string;
  };
  analyticsFit?: {
    fitScore?: number;
    whyItFits?: string;
    patternToUse?: string;
    patternToAvoid?: string;
  };
  ideaCluster?: {
    clusterName?: string;
    role?: string;
    followUpIdeas?: string[];
    shorts?: string[];
  };
  monetizationRisk?: {
    riskLevel?: "Low" | "Medium" | "High";
    riskScore?: number;
    concerns?: string[];
    saferFraming?: string;
  };
  monetizationStrategy?: {
    primaryRevenuePath?: string;
    sponsorFit?: string;
    affiliateAngle?: string;
    cta?: string;
    emailCaptureIdea?: string;
    productIdea?: string;
    revenueWarnings?: string[];
  };
  whiteSpace?: {
    whiteSpaceScore?: number;
    underCoveredAngle?: string;
    overdoneAngleToAvoid?: string;
    differentiator?: string;
  };
};

type ScriptDraft = {
  id: string;
  version: number;
  passType: ScriptPassType;
  modelUsed: string;
  content: string;
  wordCount: number;
  estimatedMinutes: number;
  createdAt: string;
};

type ThumbnailAsset = {
  id: string;
  storyProjectId: string;
  scriptDraftId?: string | null;
  variant: number;
  title?: string | null;
  prompt: string;
  imageUrl: string;
  imageUUID?: string | null;
  taskUUID?: string | null;
  modelUsed: string;
  estimatedCost?: string | number | null;
  createdAt: string;
};

type BookIllustrationMode = "CHAPTER_OPENERS" | "KEY_SCENES" | "FULL_ILLUSTRATED";

type BookIllustrationPrompt = {
  chapterNumber: number;
  title: string;
  scene: string;
  prompt: string;
  safetyNotes?: string;
};

type BookIllustrationPlan = {
  mode: BookIllustrationMode;
  styleBible: string;
  estimatedImageCount: number;
  estimatedCostNote: string;
  illustrations: BookIllustrationPrompt[];
};

type BookExportFormat = "pdf" | "epub";

type StoryProject = {
  id: string;
  channelId?: string | null;
  storyIdeaId?: string | null;
  title: string;
  format: StoryProjectFormat;
  targetLengthMinutes: number;
  targetWordCount: number;
  tone: string;
  narrationStyle: string;
  sourceMaterial?: string | null;
  sponsorBlurb?: string | null;
  sponsorLink?: string | null;
  status: StoryProjectStatus;
  createdAt: string;
  updatedAt: string;
  storyIdea?: StoryIdea | null;
  drafts?: ScriptDraft[];
  thumbnails?: ThumbnailAsset[];
  publishingSlots?: PublishingSlot[];
};

type PublishingSlot = {
  id: string;
  channelId?: string | null;
  storyProjectId: string;
  title: string;
  scheduledDate: string;
  slotType: PublishingSlotType;
  status: PublishingSlotStatus;
  episodeNumber?: number | null;
  episodeCount?: number | null;
  durationMinutes: number;
  batchId?: string | null;
  createdAt: string;
  updatedAt: string;
  storyProject?: StoryProject;
};

type CurrentScriptOutput = ScriptDraft & {
  displayLabel?: string;
};

type EpisodeOutputSection = {
  episodeNumber: number;
  partLabel: string;
  heading: string;
  title: string;
  content: string;
};

type ClientPublishingPack = {
  titles: Array<{ title: string; angle?: string }>;
  description: string;
  tags: string[];
  thumbnailPrompts: Array<{ title: string; overlayText?: string; prompt: string }>;
  sunoPrompt?: SunoMusicPrompt;
  pinnedComment?: string;
  seoPack?: ArticleSeoPack;
  topicalAuthorityMap?: TopicalAuthorityMap;
  conversionAssets?: ConversionAssets;
  episodePacks?: EpisodePublishingPack[];
};

function PublishingDescriptionText({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="description-text">
      {blocks.map((block, blockIndex) => {
        const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
        if (!lines.length) return null;
        if (/^Timestamps?:$/i.test(lines[0])) {
          return (
            <div className="description-timestamps" key={`${blockIndex}-${lines[0]}`}>
              <strong>{lines[0]}</strong>
              <div>
                {lines.slice(1).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div className="description-block" key={`${blockIndex}-${lines[0]}`}>
            {lines.map((line) => (
              <p className={/^https?:\/\//i.test(line) ? "description-url" : undefined} key={line}>
                {line}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ConversionAssetsView({ assets }: { assets: ConversionAssets }) {
  const cards = [
    ["GBP Post", assets.gbpPost],
    ["Client Email", assets.clientEmail],
    ["Facebook / Social Post", assets.facebookPost],
    ["Call Script", assets.callScript],
    ["Website Article Angle", assets.websiteArticleAngle],
    ["Macaly Landing Page Prompt", assets.macalyLandingPagePrompt],
    ["Review / Referral Prompt", assets.reviewReferralPrompt]
  ] as const;
  return (
    <div className="article-seo-grid">
      {cards.map(([label, value]) => value ? (
        <div className="seo-card wide" key={label}>
          <strong>{label}</strong>
          <p className={label === "Macaly Landing Page Prompt" ? "prewrap-text" : undefined}>{value}</p>
        </div>
      ) : null)}
      {assets.shortClipHooks.length ? (
        <div className="seo-card wide">
          <strong>Short Clip Hooks</strong>
          <ol>
            {assets.shortClipHooks.map((hook) => <li key={hook}>{hook}</li>)}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function ArticleSeoPackView({ pack }: { pack: ArticleSeoPack }) {
  return (
    <div className="article-seo-grid">
      <SeoMetric label="Primary Keyword" value={pack.primaryKeyword} />
      <SeoMetric label="Search Intent" value={pack.searchIntent} />
      <SeoMetric label="SEO Title" value={pack.seoTitle} />
      <SeoMetric label="URL Slug" value={pack.urlSlug} />
      <SeoMetric label="Meta Description" value={pack.metaDescription} wide />
      <SeoMetric label="H1" value={pack.h1} wide />
      {pack.secondaryKeywords.length ? (
        <div className="seo-card wide">
          <strong>Secondary Keywords</strong>
          <div className="tag-list compact-tags">
            {pack.secondaryKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
          </div>
        </div>
      ) : null}
      {pack.h2Outline.length ? (
        <div className="seo-card">
          <strong>H2 Outline</strong>
          <ol>
            {pack.h2Outline.map((heading) => <li key={heading}>{heading}</li>)}
          </ol>
        </div>
      ) : null}
      {pack.faq.length ? (
        <div className="seo-card">
          <strong>FAQ Targets</strong>
          <ol>
            {pack.faq.map((item) => (
              <li key={item.question}>
                <b>{item.question}</b>
                <span>{item.answer}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {pack.internalLinkSuggestions.length ? (
        <SeoList label="Internal Links" items={pack.internalLinkSuggestions} />
      ) : null}
      {pack.externalSourceSuggestions.length ? (
        <SeoList label="External Sources" items={pack.externalSourceSuggestions} />
      ) : null}
      <SeoMetric label="Schema" value={pack.schemaRecommendation} />
      <SeoMetric label="Featured Snippet Target" value={pack.featuredSnippetTarget} />
      {pack.imagePlan.length ? (
        <div className="seo-card wide">
          <strong>Article Image Plan</strong>
          <div className="article-image-plan">
            {pack.imagePlan.map((image) => (
              <div key={`${image.placement}-${image.prompt}`}>
                <b>{image.placement}</b>
                <p>{image.prompt}</p>
                {image.altText ? <small>Alt: {image.altText}</small> : null}
                {image.caption ? <small>Caption: {image.caption}</small> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopicalAuthorityMapView({ map }: { map: TopicalAuthorityMap }) {
  return (
    <div className="authority-map">
      <div className="authority-summary">
        <SeoMetric label="Pillar Topic" value={map.pillarTopic} />
        <SeoMetric label="Audience" value={map.audience} />
        <SeoMetric label="Authority Goal" value={map.authorityGoal} wide />
      </div>
      {map.recommendedNextArticles.length ? (
        <div className="seo-card wide">
          <strong>Recommended Next Articles</strong>
          <div className="authority-article-list">
            {map.recommendedNextArticles.map((article) => (
              <AuthorityArticleCard article={article} key={article.title} />
            ))}
          </div>
        </div>
      ) : null}
      {map.clusters.map((cluster) => (
        <div className="authority-cluster" key={cluster.clusterName}>
          <div>
            <strong>{cluster.clusterName}</strong>
            {cluster.pillarArticle ? <span>Pillar: {cluster.pillarArticle}</span> : null}
          </div>
          <div className="authority-article-list">
            {cluster.supportingArticles.map((article) => (
              <AuthorityArticleCard article={article} key={article.title} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SeoMetric({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  if (!value) return null;
  return (
    <div className={cn("seo-card", wide && "wide")}>
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function SeoList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="seo-card">
      <strong>{label}</strong>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function AuthorityArticleCard({ article }: { article: TopicalAuthorityMap["recommendedNextArticles"][number] }) {
  return (
    <div className="authority-article-card">
      <div>
        <b>{article.title}</b>
        {article.angle ? <p>{article.angle}</p> : null}
      </div>
      <div className="authority-meta">
        {article.priority ? <span>{article.priority}</span> : null}
        {article.funnelStage ? <span>{article.funnelStage}</span> : null}
        {article.intent ? <span>{article.intent}</span> : null}
      </div>
      {article.primaryKeyword ? <small>Keyword: {article.primaryKeyword}</small> : null}
      {article.internalLinks.length ? <small>Links to: {article.internalLinks.join(", ")}</small> : null}
    </div>
  );
}

type UserSettings = {
  hasOpenRouterApiKey?: boolean;
  hasAnthropicApiKey?: boolean;
  hasOpenAiApiKey?: boolean;
  hasRunwareApiKey?: boolean;
  hasDataForSeoCredentials?: boolean;
  hasWordPressCredentials?: boolean;
  hasYoutubeOAuthCredentials?: boolean;
  defaultModel: string;
  discoveryModel: string;
  dossierModel: string;
  structureModel: string;
  draftingModel: string;
  critiqueModel: string;
  rewriteModel: string;
  anthropicModel: string;
  openAiModel: string;
  runwareModel: string;
  thumbnailStyleGuide: string;
  workspaceName: string;
  workspaceTagline: string;
  workspaceLogoUrl?: string | null;
  defaultSponsorCta?: string | null;
  publishingScheduleNote: string;
  autoModelRouting: boolean;
  preferredTone: string;
  narrationStyle: string;
  defaultLengthMinutes: number;
  ttsPauseMarkers: boolean;
  openRouterApiKey?: string;
  anthropicApiKey?: string;
  openAiApiKey?: string;
  runwareApiKey?: string;
  dataForSeoLogin?: string;
  dataForSeoPassword?: string;
  wordpressSiteUrl?: string;
  wordpressUsername?: string;
  wordpressApplicationPassword?: string;
  youtubeClientId?: string;
  youtubeClientSecret?: string;
};

type YoutubeAnalyticsPayload = {
  connected: boolean;
  connection: {
    id: string;
    channelId: string;
    youtubeChannelId: string;
    youtubeChannelTitle: string;
    lastSyncedAt?: string | null;
    nextSyncAt?: string | null;
    syncEnabled: boolean;
  } | null;
  connections: Array<{
    id: string;
    channelId: string;
    channelName: string;
    youtubeChannelId: string;
    youtubeChannelTitle: string;
    lastSyncedAt?: string | null;
    nextSyncAt?: string | null;
    syncEnabled: boolean;
    latestSyncStatus?: string | null;
  }>;
  summary: {
    currentViews: number;
    currentWatchHours: number;
    currentLikes: number;
    currentComments: number;
    currentSubscribersNet: number;
    averageCtr: number;
    averageRetention: number;
    averageViewDuration: number;
    annualWatchHours: number;
    annualSubscribersNet: number;
    monetization: {
      watchHoursTo4000: number;
      subscribersTo1000: number;
      watchHoursTo3000: number;
      subscribersTo500: number;
    };
  };
  videos: Array<{
    id: string;
    youtubeVideoId: string;
    title: string;
    publishedAt?: string | null;
    thumbnailUrl?: string | null;
    views: number;
    estimatedMinutesWatched: number;
    watchHours: number;
    averageViewDuration: number;
    averageViewPercentage: number;
    likes: number;
    comments: number;
    subscribersGained: number;
    impressions: number;
    impressionCtr: number;
  }>;
  recommendations: Array<{
    id: string;
    category: string;
    priority: string;
    title: string;
    insight: string;
    recommendation: string;
    createdAt: string;
  }>;
  syncRuns: Array<{
    id: string;
    status: string;
    startedAt: string;
    finishedAt?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    videosSynced: number;
    recommendationCount: number;
    errorMessage?: string | null;
  }>;
};

type UploadReadinessPackage = {
  title: string;
  format: StoryProjectFormat;
  readinessScore: number;
  status: "Ready" | "Needs Review" | "Blocked";
  blockers: string[];
  warnings: string[];
  uploadChecklist: Array<{ label: string; ready: boolean; detail: string }>;
  sourceIntelligence: {
    score: number;
    status: "Strong" | "Usable" | "Thin";
    summary: string;
    mustVerify: string[];
    sourceLeads: string[];
  };
  visualQa: {
    score: number;
    status: "Strong" | "Review" | "Missing";
    checks: Array<{ label: string; ready: boolean; detail: string }>;
  };
  performanceMemory: {
    summary: string;
    matches: Array<{
      title: string;
      matchScore: number;
      views: number;
      watchHours: number;
      ctr: number;
      retention: number;
      netSubscribers: number;
      lesson: string;
    }>;
  };
  shorts: Array<{
    title: string;
    hook: string;
    sourceMoment: string;
    captionAngle: string;
    cta: string;
  }>;
  uploadAssets: Array<{ label: string; value: string }>;
};

type TabLabel = "Generated Ideas" | "Saved Ideas" | "Idea Queue" | "Used Ideas";
type GuideTab = "Quick Start" | "User Manual" | "Advanced Protocols";
type ModelSettingKey =
  | "defaultModel"
  | "discoveryModel"
  | "dossierModel"
  | "structureModel"
  | "draftingModel"
  | "critiqueModel"
  | "rewriteModel";

type OpenRouterModel = {
  id: string;
  name: string;
  created?: number;
  contextLength?: number;
  modality?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

type FallbackProviderModel = {
  id: string;
  name: string;
  provider: "anthropic" | "openai";
  created?: number;
  contextLength?: number;
  maxTokens?: number;
  source?: "live" | "default";
};

type ApiProvider = "openrouter" | "anthropic" | "openai" | "runware" | "dataforseo" | "wordpress";

type ApiTestResult = {
  ok: boolean;
  provider: ApiProvider;
  message: string;
  modelCount?: number;
  selectedModelAvailable?: boolean;
  testedAt?: string;
  models?: FallbackProviderModel[];
};

type FetchJsonOptions = {
  retries?: number;
  retryDelayMs?: number;
  retryUnsafe?: boolean;
};

type ChannelBlueprint = {
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
  channelName?: string;
  tagline?: string;
  description?: string;
  keywords?: ChannelKeyword[];
  ideaCombinations?: ChannelIdeaCombination[];
  logoPrompt?: string;
  bannerPrompt?: string;
  logoImageUrl?: string;
  bannerImageUrl?: string;
  imageModelUsed?: string;
  dataForSeoWarning?: string;
  moneyGoal?: string;
  riskTolerance?: string;
  weeklyVideoTarget?: number;
  affiliateUrl?: string;
  offerDescription?: string;
  emailCapturePlan?: string;
  primaryCta?: string;
};

type ChannelKeyword = {
  keyword: string;
  intent: string;
  priority: "Primary" | "Secondary" | "Experimental";
  searchVolume?: number;
  competition?: string;
  competitionIndex?: number;
  cpc?: number;
};

type ChannelIdeaCombination = {
  nicheFocus: string;
  category: string;
  tone: string;
  desiredLength: string;
  sourceType: string;
  rationale: string;
  sampleAngles: string[];
};

type ChannelHotNiche = {
  title: string;
  description: string;
  whyHotThisMonth: string;
  bestViewerPromise: string;
  monetizationRank?: number;
  monetizationScore?: number;
  monetizationTier?: string;
  monetizationRationale?: string;
  seedPrompt: string;
  nicheFocus: string;
  tone: string;
  category: string;
  sourceType: string;
  keywords: string[];
  starterAngles: string[];
};

type BlockedChannelIdea = {
  key: string;
  title: string;
  blockedAt: string;
};

type PipelineItem = {
  id: string;
  title: string;
  meta: string;
  projectId?: string;
};

type PipelineColumn = {
  label: string;
  items: PipelineItem[];
};

const defaultSettings: UserSettings = {
  defaultModel: "openai/gpt-4o-mini",
  discoveryModel: "openai/gpt-4o-mini",
  dossierModel: "anthropic/claude-3.5-sonnet",
  structureModel: "anthropic/claude-3.5-sonnet",
  draftingModel: "openai/gpt-4o",
  critiqueModel: "anthropic/claude-3.5-sonnet",
  rewriteModel: "openai/gpt-4o",
  anthropicModel: "claude-opus-4-8",
  openAiModel: "gpt-5.4",
  runwareModel: "ideogram:4@0",
  thumbnailStyleGuide: DEFAULT_THUMBNAIL_STYLE_GUIDE,
  workspaceName: "Baxter Growth Lab",
  workspaceTagline: "Insurance Growth Engine",
  workspaceLogoUrl: "",
  defaultSponsorCta: "",
  publishingScheduleNote: "Two weekly education assets, one weekly local SEO asset, and one weekly client/referral campaign.",
  autoModelRouting: true,
  preferredTone: "Helpful, local, consultative",
  narrationStyle: "Journalistic",
  defaultLengthMinutes: 7,
  ttsPauseMarkers: false,
  openRouterApiKey: "",
  anthropicApiKey: "",
  openAiApiKey: "",
  runwareApiKey: "",
  dataForSeoLogin: "",
  dataForSeoPassword: "",
  wordpressSiteUrl: "",
  wordpressUsername: "",
  wordpressApplicationPassword: "",
  youtubeClientId: "",
  youtubeClientSecret: ""
};

const DEFAULT_API_RETRIES = 4;
const DEFAULT_API_RETRY_DELAY_MS = 2_000;
const SCRIPT_PASS_RECOVERY_TIMEOUT_MS = 12 * 60_000;
const RESEARCH_RECOVERY_TIMEOUT_MS = 8 * 60_000;
const SCRIPT_RECOVERY_POLL_MS = 5_000;
const defaultChannelBlueprint: ChannelBlueprint = {
  targetAudience: "Texas homeowners, drivers, families, landlords, and small-business owners who need clear insurance guidance before buying, renewing, filing a claim, or requesting a quote.",
  toneRules: "Helpful, local, plain-English, consultative, and compliance-safe. Never promise savings, claim outcomes, coverage, eligibility, or carrier acceptance.",
  voiceProfile: "Trusted Texas insurance advisor: warm, direct, specific, practical, and careful about policy limitations.",
  introStyle: "Open with a real Texas household, auto, storm, renewal, or business-risk question, then connect it to a useful review or quote-ready checklist.",
  formattingRules: "Keep outputs clean, skimmable, and action-oriented. Use headings for written assets, teleprompter-safe prose for spoken assets, and clear coverage limitations.",
  phrasesToUse: "coverage depends on policy terms, request a review, quote-ready checklist, Texas homeowners, Houston-area families, talk with a licensed Texas agent",
  recurringStoryTypes: "Home and auto reviews, Houston homeowners questions, storm readiness, flood education, renewal rescue, local SEO pages, commercial coverage explainers, referral campaigns, and cross-sell prompts.",
  bannedPhrases: "guaranteed savings, fully covered, cheapest, best rate guaranteed, claim will be paid, everyone qualifies, no exclusions.",
  phrasesToAvoid: "secret trick, loophole, one weird hack, guaranteed, always covered, never denied",
  thumbnailStyle: "Clean professional insurance visuals, Texas/Houston cues, home/auto/business subject, readable two-to-five-word overlay, trust-first not fear-first.",
  sponsorRules: "Use Baxter Insurance Agency, Inc. as the natural call-to-action. Mention 281-445-1381 where appropriate. Do not make carrier promises.",
  publishingRhythm: "Two weekly education assets, one weekly local SEO asset, and one weekly client/referral campaign.",
  moneyGoal: "Generate quote requests, renewal saves, cross-sells, referrals, local SEO visibility, and long-term agency revenue.",
  riskTolerance: "Growth-forward but compliance-safe: prioritize useful education, quote readiness, and licensed-agent review.",
  weeklyVideoTarget: 2,
  affiliateUrl: "",
  offerDescription: "",
  emailCapturePlan: "Simple lead magnet tied to the channel promise, promoted in descriptions after the viewer value is clear.",
  primaryCta: "Call Baxter Insurance Agency, Inc. at 281-445-1381 or request a Texas insurance review.",
  keywords: [],
  ideaCombinations: []
};
const AUTO_SCRIPT_SEQUENCE: ScriptPassType[] = [
  "INTRO",
  "DOSSIER",
  "ANALYTICS_BRIEF",
  "HOOK_LAB",
  "STORY_SPINE",
  "STRUCTURE",
  "RETENTION_MAP",
  "SCRIPT_LENGTH_GOVERNOR",
  "OPEN_LOOP_LEDGER",
  "DRAFT",
  "RETENTION_ANALYSIS",
  "CRITIQUE",
  "FACT_CHECK",
  "REWRITE",
  "VOICE_POLISH",
  "QUALITY_GATE",
  "FINAL",
  "OUTRO",
  "SCENE_CARDS",
  "PUBLISHING_PACK"
];
const EPISODE_AUTO_SEQUENCE: ScriptPassType[] = [
  "INTRO",
  "ANALYTICS_BRIEF",
  "SERIES_BIBLE",
  "HOOK_LAB",
  "STORY_SPINE",
  "STRUCTURE",
  "RETENTION_MAP",
  "SCRIPT_LENGTH_GOVERNOR",
  "OPEN_LOOP_LEDGER",
  "DRAFT",
  "RETENTION_ANALYSIS",
  "CRITIQUE",
  "FACT_CHECK",
  "REWRITE",
  "VOICE_POLISH",
  "QUALITY_GATE",
  "FINAL",
  "OUTRO",
  "SCENE_CARDS",
  "PUBLISHING_PACK"
];

const navItems: Array<{ id: AppSection; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Growth Plan", icon: Home },
  { id: "campaign-builder", label: "Campaign Builder", icon: Zap },
  { id: "idea-factory", label: "Video Ideas", icon: Lightbulb },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "media", label: "Assets", icon: ImageIcon },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

type CampaignGoalKey =
  | "home-quotes"
  | "auto-bundles"
  | "germania-home"
  | "storm-season"
  | "renewal-rescue"
  | "referrals-reviews"
  | "local-seo";

type CampaignAssetKey = "video" | "article" | "landing-page" | "gbp-social" | "email" | "podcast";
type ScriptOpeningKey = "costly-mistake" | "texas-scenario" | "renewal-shock" | "storm-risk" | "before-you-buy" | "coverage-myth";

type ScriptIntentLock = {
  primaryLeadGoal: string;
  targetBuyer: string;
  serviceCarrier: string;
  cta: string;
  complianceBoundary: string;
};

const campaignGoalOptions: Array<{
  key: CampaignGoalKey;
  label: string;
  detail: string;
  goal: string;
  cta: string;
  offer: string;
}> = [
  {
    key: "home-quotes",
    label: "Get Home Insurance Quotes",
    detail: "High-intent education for Texas homeowners, buyers, renewals, and coverage reviews.",
    goal: "Generate qualified Texas home insurance quote requests and policy review conversations.",
    cta: "Call 281-445-1381 or request a Texas home insurance review with Baxter Insurance Agency.",
    offer: "Texas home insurance quotes, policy reviews, storm/flood questions, and coverage checkups."
  },
  {
    key: "auto-bundles",
    label: "Get Auto Bundle Reviews",
    detail: "Auto, home bundle, teen driver, renewal, and household-change campaigns.",
    goal: "Generate auto quote requests, bundle reviews, and household policy review conversations.",
    cta: "Call 281-445-1381 to review auto coverage, bundle options, or a Texas household renewal.",
    offer: "Texas auto quotes, home and auto bundle reviews, teen-driver reviews, and renewal checkups."
  },
  {
    key: "germania-home",
    label: "Promote Germania Home",
    detail: "Germania-focused Texas homeowners education without carrier promises.",
    goal: "Create Germania-focused Texas home insurance conversations while avoiding carrier eligibility, rate, or coverage promises.",
    cta: "Ask Baxter Insurance Agency whether Germania may be worth reviewing for your Texas home situation.",
    offer: "Germania-focused home and property quote preparation, policy review, and Texas homeowners education."
  },
  {
    key: "storm-season",
    label: "Storm Season Campaign",
    detail: "Timely Texas wind, hail, flood, roof, claim documentation, and prep content.",
    goal: "Generate storm-season policy review requests and practical coverage-prep conversations.",
    cta: "Call 281-445-1381 before storm season to review home, auto, flood, and documentation questions.",
    offer: "Storm season coverage review, flood discussion, documentation checklist, and Texas preparedness guidance."
  },
  {
    key: "renewal-rescue",
    label: "Renewal Rescue",
    detail: "Rate increase, renewal confusion, deductible, coverage change, and quote-prep campaigns.",
    goal: "Generate renewal review conversations from Texas prospects confused by rate changes, deductibles, or policy updates.",
    cta: "Call 281-445-1381 to schedule a Texas renewal review before you make a coverage decision.",
    offer: "Home, auto, landlord, and business renewal reviews with plain-English coverage questions."
  },
  {
    key: "referrals-reviews",
    label: "Referrals + Reviews",
    detail: "Client goodwill campaigns that request reviews, referrals, and policy check-ins.",
    goal: "Increase review requests, referral conversations, and client reactivation without sounding pushy.",
    cta: "Refer a Texas friend, leave a Google review, or call 281-445-1381 with a coverage question.",
    offer: "Review requests, referral prompts, client check-in campaigns, and helpful policy-review reminders."
  },
  {
    key: "local-seo",
    label: "Build Local SEO",
    detail: "City/service pages, GBP posts, FAQs, and local quote-intent articles.",
    goal: "Build Texas local SEO visibility for quote-ready insurance searches in Houston-area markets.",
    cta: "Call 281-445-1381 or request a quote from Baxter Insurance Agency for Texas insurance questions.",
    offer: "Houston-area home, auto, commercial, flood, and life insurance local SEO pages and quote-ready FAQs."
  }
];

const campaignAssetOptions: Array<{
  key: CampaignAssetKey;
  label: string;
  detail: string;
  contentMode: ContentMode;
  format: StoryProjectFormat;
  length: string;
  sourceType: string;
}> = [
  { key: "video", label: "HeyGen Video Campaign", detail: "7-10 minute script, scene cards, scene background prompts, Business Campaign Kit, thumbnails, Shorts hooks, and Macaly prompt.", contentMode: "LOCAL_LEAD_GEN", format: "STANDALONE", length: "7 minutes", sourceType: "Agency knowledge, Texas market context, carrier guidelines" },
  { key: "article", label: "SEO Article", detail: "Website-ready article, FAQ, topical map, GBP post, email, and landing page prompt.", contentMode: "EXPERT_AUTHORITY", format: "ARTICLE", length: "Feature article - about 2,000 words", sourceType: "Local SEO research and service-area pages" },
  { key: "landing-page", label: "Macaly Landing Page", detail: "Generate ideas whose campaign kit produces a Macaly prompt optimized for forms and CTAs.", contentMode: "LOCAL_LEAD_GEN", format: "ARTICLE", length: "Feature article - about 2,000 words", sourceType: "Agency knowledge, Texas market context, carrier guidelines" },
  { key: "gbp-social", label: "GBP + Social Push", detail: "Short campaign ideas for Google Business Profile, Facebook, email, and phone follow-up.", contentMode: "REPURPOSE_MULTIPLIER", format: "ARTICLE", length: "Brief article - about 900 words", sourceType: "Client FAQs and policy review notes" },
  { key: "email", label: "Client Email Campaign", detail: "Email-first education or referral push with supporting article and call script.", contentMode: "SALES_OFFER", format: "ARTICLE", length: "Brief article - about 900 words", sourceType: "Client FAQs and policy review notes" },
  { key: "podcast", label: "Podcast Episode", detail: "Podcast-ready topic with show notes, follow-up assets, and Macaly prompt.", contentMode: "EXPERT_AUTHORITY", format: "PODCAST_EPISODE", length: "20 minutes", sourceType: "Agency knowledge, Texas market context, carrier guidelines" }
];

const scriptOpeningOptions: Array<{ key: ScriptOpeningKey; label: string; detail: string; instruction: string }> = [
  {
    key: "costly-mistake",
    label: "Costly mistake",
    detail: "Open with a common insurance mistake that could create expensive confusion.",
    instruction: "Open on a specific costly mistake a Texas prospect might make, then calmly explain the practical coverage question to review."
  },
  {
    key: "texas-scenario",
    label: "Texas scenario",
    detail: "Start with a realistic Houston or Texas household/business situation.",
    instruction: "Open with a realistic Texas scenario involving a homeowner, driver, landlord, family, or small-business owner."
  },
  {
    key: "renewal-shock",
    label: "Renewal shock",
    detail: "Lead with a rate, deductible, coverage, or renewal surprise.",
    instruction: "Open with renewal confusion or sticker shock, then pivot to what a licensed Texas agent can help review."
  },
  {
    key: "storm-risk",
    label: "Storm claim risk",
    detail: "Frame the topic around wind, hail, flood, roof, claim documentation, or preparedness.",
    instruction: "Open with a Texas storm, roof, flood, claim documentation, or preparedness risk without implying any claim outcome."
  },
  {
    key: "before-you-buy",
    label: "Before you buy",
    detail: "Use a pre-purchase checklist angle for homes, cars, landlords, or businesses.",
    instruction: "Open with a before-you-buy moment and name the coverage questions worth reviewing before the decision."
  },
  {
    key: "coverage-myth",
    label: "Coverage myth",
    detail: "Challenge a common misunderstanding while staying compliance-safe.",
    instruction: "Open by correcting a common coverage misconception without making blanket coverage promises."
  }
];

const categoryOptions = [
  "All Categories",
  "Strange True Stories",
  "Survival Stories",
  "Missing Persons",
  "Disasters",
  "Historical Mysteries",
  "Maritime Stories",
  "Aviation Incidents",
  "Scams",
  "Cults",
  "Military Operations",
  "Rescue Stories",
  "Unexplained Events",
  "Forgotten History",
  "Courtroom Stories",
  "Local Legends",
  "Reddit-style Personal Stories"
];

const expertCategoryOptions = [
  "Educational Guides",
  "Prospect Questions",
  "Problem / Solution",
  "Myth Busting",
  "Comparison Content",
  "Case Studies",
  "Authority Essays",
  "Service Explainers",
  "Compliance-Safe Advice"
];

const localLeadCategoryOptions = [
  "Local SEO",
  "Service Area Guides",
  "Local Prospect Questions",
  "Emergency / What To Do",
  "Seasonal Local Demand",
  "Cost and Pricing Guides",
  "Neighborhood Problems",
  "Trust Builders",
  "Lead Generation"
];

const salesOfferCategoryOptions = [
  "Sales Letters",
  "Gumroad / Offer Pages",
  "Email Promos",
  "Webinar Scripts",
  "VSL Scripts",
  "Proposals",
  "Follow-up Sequences",
  "Objection Handling",
  "Launch Campaigns"
];

const educationCourseCategoryOptions = [
  "Course Blueprint",
  "Modules",
  "Lesson Plans",
  "Worksheets",
  "Quizzes",
  "Training Scripts",
  "Paid Community Content",
  "Student Onboarding",
  "Certification / Assessment"
];

const bookPublishingCategoryOptions = [
  "Nonfiction Books",
  "Authority Books",
  "Lead Magnet Books",
  "Kindle Books",
  "Illustrated Books",
  "Book Outlines",
  "Launch Assets",
  "Reader Worksheets",
  "Back-cover Positioning"
];

const repurposeCategoryOptions = [
  "Email Series",
  "Shorts / Reels",
  "Tweets / X Posts",
  "LinkedIn Posts",
  "Blog Posts",
  "Newsletter Issues",
  "Podcast Notes",
  "Content Calendar",
  "Multi-platform Campaign"
];

const brandStrategyCategoryOptions = [
  "Niche Positioning",
  "Audience Strategy",
  "Content Pillars",
  "Channel Naming",
  "Visual Identity",
  "Campaign Calendar",
  "Offer Ladder",
  "Keyword Strategy",
  "Launch Plan"
];

const storySourceTypeOptions = [
  "Agency knowledge, Texas market context, carrier guidelines",
  "Client FAQs and policy review notes",
  "Local SEO keywords and service pages",
  "Carrier appetite and quoting workflow",
  "Claims documentation checklist"
];

const expertSourceTypeOptions = [
  "Industry expertise and client questions",
  "FAQs, objections, and prospect concerns",
  "Case studies and proof points",
  "Regulatory/compliance-safe guidance",
  "Search questions and keyword research"
];

const localLeadSourceTypeOptions = [
  "Local SEO keywords and service pages",
  "Local customer questions",
  "Seasonal search demand",
  "Service-area pain points",
  "Reviews, testimonials, and proof points"
];

const salesOfferSourceTypeOptions = [
  "Offer details and customer objections",
  "Existing sales page or Gumroad listing",
  "Testimonials, proof, and case studies",
  "Webinar or VSL outline",
  "Email list promos and launch notes",
  "Competitor offer research"
];

const educationCourseSourceTypeOptions = [
  "Expert curriculum notes",
  "Existing lesson material",
  "Student questions and pain points",
  "Training calls and transcripts",
  "Worksheets, templates, and exercises",
  "Community discussions"
];

const bookPublishingSourceTypeOptions = [
  "Book notes and research folders",
  "Existing manuscript or outline",
  "Audience questions and reviews",
  "Kindle competitor research",
  "Lead magnet or authority framework",
  "Illustration or visual concept notes"
];

const repurposeSourceTypeOptions = [
  "Existing script, article, or book",
  "Podcast transcript",
  "YouTube transcript",
  "Newsletter archive",
  "Sales page or webinar transcript",
  "Long-form source material"
];

const brandStrategySourceTypeOptions = [
  "Audience and niche research",
  "Competitor channel research",
  "Keyword and trend research",
  "Existing brand notes",
  "Offer and audience interviews",
  "Publishing calendar goals"
];

const businessGoalOptions = [
  "Build trust and authority",
  "Generate qualified leads",
  "Rank for search questions",
  "Explain a service clearly",
  "Handle objections before the call",
  "Nurture existing prospects"
];

const contentModeOptions: Array<{
  value: ContentMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "EXPERT_AUTHORITY",
    label: "Client Education",
    description: "Plain-English insurance answers that build trust.",
    icon: ShieldCheck
  },
  {
    value: "LOCAL_LEAD_GEN",
    label: "Local SEO",
    description: "Texas and Houston-area content built for search and quote requests.",
    icon: Navigation
  },
  {
    value: "SALES_OFFER",
    label: "Quote Campaign",
    description: "Quote-ready pages, emails, call scripts, and follow-up.",
    icon: Zap
  },
  {
    value: "EDUCATION_COURSE",
    label: "Referral / Review",
    description: "Client prompts that ask for referrals, reviews, and introductions.",
    icon: BookOpen
  },
  {
    value: "REPURPOSE_MULTIPLIER",
    label: "Social / GBP Post",
    description: "Turn one insurance topic into posts, GBP updates, and short emails.",
    icon: RefreshCw
  },
  {
    value: "BRAND_CHANNEL_STRATEGY",
    label: "Renewal / Cross-Sell",
    description: "Renewal reviews, coverage gaps, companion policies, and retention.",
    icon: Globe2
  }
];

const projectFormatOptions: Array<{
  value: StoryProjectFormat;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "STANDALONE",
    label: "Video Script",
    description: "Insurance video script, Business Campaign Kit, and thumbnails.",
    icon: Play
  },
  {
    value: "PODCAST_EPISODE",
    label: "Podcast Episode",
    description: "Spoken insurance episode script with show notes.",
    icon: Mic2
  },
  {
    value: "ARTICLE",
    label: "Article",
    description: "Texas insurance article with SEO notes.",
    icon: Newspaper
  }
];

const bookIllustrationModeOptions: Array<{
  value: BookIllustrationMode;
  label: string;
  description: string;
}> = [
  {
    value: "CHAPTER_OPENERS",
    label: "Chapter openers",
    description: "One consistent illustration per major chapter."
  },
  {
    value: "KEY_SCENES",
    label: "Key scenes",
    description: "Only the strongest visual moments."
  },
  {
    value: "FULL_ILLUSTRATED",
    label: "Full illustrated",
    description: "More frequent chapter and scene artwork."
  }
];

const modelRouteFields: Array<{ key: ModelSettingKey; label: string; hint: string }> = [
  { key: "defaultModel", label: "Default Model", hint: "Fallback model when auto routing is off or a pass-specific model is unavailable." },
  { key: "discoveryModel", label: "Discovery Model", hint: "Used for idea generation, niche expansion, and research angles." },
  { key: "dossierModel", label: "Dossier Model", hint: "Used for organizing facts, timelines, source notes, and uncertainty." },
  { key: "structureModel", label: "Structure Model", hint: "Used for narrative arc, reveal order, curiosity gaps, and retention beats." },
  { key: "draftingModel", label: "Drafting Model", hint: "Used for the long-form narration draft." },
  { key: "critiqueModel", label: "Critique Model", hint: "Used to review pacing, clarity, retention risk, and weak sections." },
  { key: "rewriteModel", label: "Rewrite Model", hint: "Used to strengthen hooks, tension, transitions, and final prose." }
];

const guideTabs: GuideTab[] = ["Quick Start", "User Manual", "Advanced Protocols"];

const guidesByTab: Record<GuideTab, Array<{ title: string; body?: string; items: string[] }>> = {
  "Quick Start": [
    {
      title: "1. Pick a growth lane",
      body: "Use the top selector before creating anything.",
      items: [
        "Choose the Texas insurance niche pack you want to work inside.",
        "Ideas, projects, outputs, thumbnails, and calendar slots stay inside the active lane.",
        "Use separate lanes for carrier products, local SEO campaigns, referral pushes, and renewal campaigns."
      ]
    },
    {
      title: "2. Configure engines",
      body: "Open Settings once before production work.",
      items: [
        "Save the active growth strategy so the app has audience, tone, compliance, CTA, thumbnail, and publishing rules.",
        "Use the insurance lane catalog when you want to review fixed Texas carrier and product lanes.",
        "Switch lanes in the top bar to generate ideas inside a specific insurance focus.",
        "Add or confirm at least one text provider key: OpenRouter primary, with Anthropic and OpenAI available as direct fallbacks.",
        "Click Test beside each API key to confirm it works before running production jobs.",
        "Choose Anthropic and OpenAI fallback models from the live provider dropdowns after saving those keys.",
        "Add Runware only if you want video thumbnails, logos, or banners generated inside Baxter Growth Lab.",
        "Add DataForSEO if you want keyword metrics to improve local SEO pages, tags, and publishing descriptions.",
        "Open Model Routing, choose the models for discovery, research, drafting, critique, rewrite, and campaign kits, then click Save Model Routing.",
        "Save AI Providers saves keys and provider settings. Save Model Routing saves the routing dropdowns."
      ]
    },
    {
      title: "3. Generate and triage ideas",
      items: [
        "Open Idea Factory and choose Content Mode: Local SEO, Client Education, Quote Campaign, Referral / Review, Social / GBP Post, or Renewal / Cross-Sell.",
        "Then choose Project Type: Video Script, Podcast Episode, or Article.",
        "Then choose Niche / Focus, Tone, Category, Target Size, Source Type, and Number of Ideas.",
        "Use a saved growth-lane combination when you want the dropdowns filled with a proven insurance campaign direction.",
        "Use the Depth chip to judge whether an idea has enough source material for a useful output. Low depth is better for short social or GBP posts.",
        "Save strong ideas, reject weak ones, and start projects from ideas that fit the active channel.",
        "Duplicate prevention compares against ideas in the active channel.",
        "Delete All clears the active channel's idea list while keeping existing content projects.",
        "Use the Dashboard Pipeline Board to see ideas move into research, output, metadata, scheduled, and published stages."
      ]
    },
    {
      title: "4. Build the output",
      items: [
        "Open Content Lab, select a project, and run Fully Auto for the complete pass sequence.",
        "Use manual step buttons when you want to inspect or rerun one pass before moving forward.",
        "Video and podcast projects create spoken scripts; article projects create publication-ready prose.",
        "Use the saved agency CTA and compliance rules to keep every output pointed toward quote requests, calls, reviews, referrals, or renewal conversations.",
        "Video and podcast body passes now enforce a minimum useful length. If the model comes back too short, Baxter Growth Lab attempts one automatic expansion before saving.",
        "If Teleprompter Polish repeatedly says the final output appears incomplete, use Force Save Final only after you are willing to review the saved result manually.",
        "Use the Quality Scorecard and Compliance Check before considering content production-ready."
      ]
    },
    {
      title: "5. Package, schedule, export",
      items: [
        "Run the final pack for titles, descriptions or show notes, tags, and prospect prompts.",
        "Video descriptions and timestamps are based on the actual saved script length, not just the requested target length.",
        "Create thumbnails for video projects when Runware is configured.",
        "Download the one-click Content Pack for output, metadata, thumbnails when available, scorecard, and compliance notes.",
        "Schedule before a future release date, mark Produced when the content file is finished, and mark Published only after it is live.",
        "Use Export Vault when you need older drafts or timestamped downloadable history."
      ]
    }
  ],
  "User Manual": [
    {
      title: "Dashboard",
      body: "Dashboard is the agency production command center.",
      items: [
        "Content Pipeline Board shows where each item sits from ideas through published work.",
        "Agency Growth Readiness checks whether the workspace has outputs, packs, thumbnails, scorecards, saved strategy, and API setup.",
        "Saved Growth Strategy preview shows the active lane's audience, rhythm, and thumbnail rules."
      ]
    },
    {
      title: "Settings",
      body: "Settings has separate save buttons for separate jobs.",
      items: [
        "Channels creates, activates, restores, or deletes channel workspaces.",
        "AI Providers uses Save AI Providers for API keys, fallback models, Runware, DataForSEO, and thumbnail style guide.",
        "Model Routing uses Save Model Routing for OpenRouter model assignments and Auto Model Routing.",
        "Story Defaults uses Save Story Defaults for preferred tone, narration style, and default length."
      ]
    },
    {
      title: "Growth Lanes",
      body: "Growth lanes are separate workspaces under the same user account.",
      items: [
        "Switch lanes from the top bar.",
        "Create lanes in Settings > Growth Lanes.",
        "Every lane has its own idea list, project list, campaign calendar, duplicate pool, thumbnails, and outputs.",
        "Use Settings > Growth Pack Machine only when you want to experiment beyond the fixed insurance lanes.",
        "Save Kit creates and activates a new lane from the generated growth pack.",
        "Saved Growth Strategy is the editable saved result from a generated growth pack; you usually do not fill it manually.",
        "Use Surprise Me in Growth Pack Machine when you want a fresh insurance campaign strategy generated from scratch."
      ]
    },
    {
      title: "Idea Factory",
      items: [
        "Choose Content Mode first so the AI knows whether you are making local SEO, client education, quote campaigns, referral/review prompts, social posts, or renewal/cross-sell content.",
        "Then choose Project Type: Video Script, Podcast Episode, or Article.",
        "Generated Ideas holds new ideas for the active channel.",
        "Saved Ideas is your shortlist.",
        "Idea Queue includes saved, in-progress, and drafted ideas.",
        "Used Ideas includes produced, published, and archived ideas that should stay out of new batches.",
        "Depth shows how likely the topic is to support longer outputs without padding.",
        "Delete removes one idea; Delete All clears the current channel's ideas while keeping projects."
      ]
    },
    {
      title: "Campaign Projects",
      items: [
        "Start a project from an idea or create one through Monthly Auto.",
        "Project rows show the output type, such as Video script, Podcast episode, or Article.",
        "Delete removes the project and drafts, but the original idea can return to Saved Ideas if no other project uses it.",
        "Produced means finished but not live yet; it can still be scheduled. Published means live/final. Produced, Published, and Archived also update the linked idea for duplicate prevention.",
        "Download Content Pack from a finished project when you need a complete production bundle."
      ]
    },
    {
      title: "Content Lab",
      items: [
        "Research collects source notes and fact-checking targets.",
        "Video projects create teleprompter scripts, podcast projects create spoken episode scripts, and article projects create publication-ready prose.",
        "Intro/Outro, Podcast Intro/Outro, and Article Lead/Closing CTA are separate passes so calls to action stay controlled.",
        "Fully Auto runs the required sequence in order; manual buttons let you rerun individual passes.",
        "Quality Scorecard appears after a Quality Gate or finished output exists.",
        "Compliance Check summarizes confirmed facts, verification targets, risky claims, and do-not-say-as-fact notes.",
        "Teleprompter Polish creates the clean final video script. If the ending guard keeps blocking a result, Force Save Final reruns and saves the pass anyway.",
        "Copy copies the current output to your clipboard; Download saves the current output as a local text file.",
        "Content Pack downloads the complete output, scorecard, compliance notes, campaign kit, and video thumbnails when available."
      ]
    },
    {
      title: "Metadata Packs and Thumbnails",
      items: [
        "Business Campaign Kit creates title tests, descriptions, tags, CTAs, thumbnail prompts, and supporting campaign assets.",
        "Podcast Show Notes Pack creates three episode titles, show notes, tags, and a listener prompt.",
        "Article SEO Pack creates three headlines, SEO description, tags, and a reader prompt.",
        "When DataForSEO is configured, Business Campaign Kit can favor stronger keyword phrases in titles, descriptions, tags, and hashtags.",
        "Description follows this order: main keyword, CTA link, description part one, timestamps, description part two, CTA with link, and 3-5 hashtags.",
        "Video timestamps are rebuilt around the actual saved script duration when the generated timestamps do not fit.",
        "Use Regenerate Description in the video Description block when YouTube metadata needs a fresh pass.",
        "Thumbnail generation creates three 16:9 Runware images from the pack prompts, using Ideogram 4 by default.",
        "The Thumbnail Style Guide in Settings controls the shared video thumbnail look, headline treatment, arrows, colors, and clickability."
      ]
    },
    {
      title: "Campaign Calendar, Published, Media, Export Vault",
      items: [
        "Campaign Calendar schedules insurance videos, articles, podcast episodes, GBP posts, and seasonal campaigns.",
        "Production Status separates Produced work that is finished but still schedulable from Published work that is already live/final.",
        "Media shows project assets and thumbnails.",
        "Exports downloads Markdown or plain text content for downstream production.",
        "Export Vault lists downloadable current outputs and previous draft outputs with timestamps."
      ]
    }
  ],
  "Advanced Protocols": [
    {
      title: "Growth Lane Isolation Protocol",
      items: [
        "Switch to the correct growth lane before generating ideas or starting projects.",
        "Do not reuse one project across lanes; create separate projects so outputs, thumbnails, and calendar slots remain partitioned.",
        "Save a Growth Pack for each lane so its audience, CTA rules, thumbnail style, and publishing rhythm are explicit.",
        "Use lane-specific thumbnail style guides when carrier/product campaigns should look different."
      ]
    },
    {
      title: "Model Routing Protocol",
      items: [
        "Use OpenRouter as the primary catalog when you want the widest model selection.",
        "Use stronger drafting and final-polish models for Draft, Rewrite, and Final; use faster models for Discovery when cost matters.",
        "After changing any Model Routing dropdown, click Save Model Routing before leaving Settings.",
        "Use Save AI Providers only for API keys, fallback provider models, Runware, DataForSEO, and thumbnail style guide.",
        "If a pass repeatedly underperforms, switch only that pass model first instead of changing the whole workflow."
      ]
    },
    {
      title: "Idea Quality Protocol",
      items: [
        "Generate broad batches first, then narrow with Category and Tone once patterns emerge.",
        "Prefer ideas with urgent insurance intent, local relevance, clear CTA fit, compliance-safe framing, and enough source depth.",
        "Use Depth as an early warning. Low-depth ideas can still be useful, but they are better for short posts, GBP updates, or simple FAQ pages.",
        "Reject ideas that lack a real prospect question, seasonal trigger, coverage gap, quote intent, or enough source material."
      ]
    },
    {
      title: "Research Protocol",
      items: [
        "Paste known facts, source links, contradictions, and unanswered questions into Source Material / Notes.",
        "Run Research before structure when the story depends on chronology, disputed facts, or named people.",
        "Keep uncertainty visible in notes rather than forcing the output to overclaim."
      ]
    },
    {
      title: "Script Quality Protocol",
      items: [
        "Run Hook Lab before drafting so the best opening angle is chosen automatically.",
        "Use Critique and Fact Check before Rewrite for high-risk coverage, carrier, claims, legal, or savings language.",
        "Use Quality Gate before Final so the scorecard can identify hook, retention, clarity, emotional payoff, factual safety, and teleprompter risk.",
        "Final should remove production markers and produce clean formatting for the selected project type.",
        "If Final is rejected as incomplete, first rerun it normally. Use Force Save Final only when repeated attempts fail and you are prepared to review the saved output yourself.",
        "Check the Scorecard and Compliance Check before exporting a Content Pack."
      ]
    },
    {
      title: "Publishing Protocol",
      items: [
        "Use Monthly Auto only when the channel has at least seven unused or saved ideas.",
        "Schedule one-offs after the final output or campaign kit is ready.",
        "Download a Content Pack before sending content to production.",
        "Mark Published only after the content is live; Produced is for finished content waiting to publish."
      ]
    },
    {
      title: "Content Mode Protocol",
      items: [
        "Content Mode tells the AI what kind of insurance growth asset this is: Local SEO, Client Education, Quote Campaign, Referral / Review, Social / GBP Post, or Renewal / Cross-Sell.",
        "Project Type tells the AI what format to produce: Video Script, Podcast Episode, or Article.",
        "Use Quote Campaign for quote pages, email promos, renewal outreach, call scripts, proposals, and follow-up sequences.",
        "Use Referral / Review for client prompts, review requests, referral asks, testimonial workflows, and relationship nurturing.",
        "Use Social / GBP Post when one insurance topic needs to become GBP updates, social posts, emails, short scripts, or platform-specific campaigns.",
        "Use Renewal / Cross-Sell when the output should identify coverage gaps, companion policies, annual review prompts, and retention opportunities."
      ]
    },
    {
      title: "Thumbnail Protocol",
      items: [
        "Use one dominant visual question: face, evidence, map mark, photo, or object that makes the viewer wonder what happened.",
        "Keep image text to 2-4 huge all-caps words and make it readable at phone size.",
        "Use red arrows or circles only to point at the key mystery detail; more cues make the image feel noisy."
      ]
    },
    {
      title: "Export Vault Protocol",
      items: [
        "Use Content Pack for the clean current production bundle.",
        "Use Markdown or plain text export for a lightweight content-only handoff.",
        "Use Export Vault History when you need to recover an older draft, earlier campaign kit, or previous workflow output.",
        "Avoid copying raw Draft, Rewrite, or Final when an assembled final output exists, because it includes the opening, cleaned body, and closing."
      ]
    },
    {
      title: "Recovery Protocol",
      items: [
        "If a model returns invalid output, rerun the same pass, click Test beside each configured API key, then choose a different OpenRouter or fallback model.",
        "If a pass stalls, refresh and check whether the previous output was saved before rerunning.",
        "If generated thumbnails fail, confirm the Runware key and model, then rerun Create Thumbnails.",
        "If Teleprompter Polish keeps failing with an incomplete-output warning, use Force Save Final from the Final step, then inspect the saved script before creating the Business Campaign Kit.",
        "If model choices appear to revert, return to Settings > Model Routing, choose the models again, and click Save Model Routing."
      ]
    }
  ]
};

const sectionCopy: Record<AppSection, { title: string; subtitle: string }> = {
  dashboard: {
    title: "This Week's Money Plan",
    subtitle: "The clearest next actions for turning content into quote, review, referral, and policy-review conversations."
  },
  "campaign-builder": {
    title: "Campaign Builder",
    subtitle: "Choose a business goal, growth lane, and asset type, then generate a complete lead-focused campaign direction."
  },
  "idea-factory": {
    title: "Growth Idea Factory",
    subtitle: "Generate, score, save, triage, and protect against duplicate insurance growth ideas."
  },
  projects: {
    title: "Campaign Projects",
    subtitle: "Turn promising ideas into long-form content projects."
  },
  "script-lab": {
    title: "Content Lab",
    subtitle: "Run guided workflows for video scripts, podcast episodes, and articles."
  },
  calendar: {
    title: "Campaign Calendar",
    subtitle: "Queue local SEO pages, GBP posts, emails, renewal pushes, and video publishing dates."
  },
  published: {
    title: "Production Status",
    subtitle: "Track what is finished, scheduled, live, archived, and protected from duplicate reuse."
  },
  media: {
    title: "Assets",
    subtitle: "Prepare thumbnails, visual assets, Business Campaign Kits, and downloadable production material."
  },
  exports: {
    title: "Exports",
    subtitle: "Download finished outputs and project material when a draft is ready."
  },
  analytics: {
    title: "Analytics",
    subtitle: "Understand category mix, scoring, queue health, and production status."
  },
  guides: {
    title: "Guides",
    subtitle: "Quick start, user manual, and advanced operating protocols."
  },
  settings: {
    title: "Settings",
    subtitle: "Save business setup, growth lanes, AI providers, integrations, and content defaults."
  }
};

export function IdeaFactoryApp({ user }: { user: AppUser }) {
  const [activeSection, setActiveSection] = useState<AppSection>("dashboard");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [archivedChannels, setArchivedChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSummary | null>(null);
  const [canManageWorkspace, setCanManageWorkspace] = useState(false);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvite[]>([]);
  const [workspaceUsage, setWorkspaceUsage] = useState<WorkspaceUsage | null>(null);
  const [usageLedger, setUsageLedger] = useState<UsageLedger | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceStatusDraft, setWorkspaceStatusDraft] = useState<WorkspaceSubscriptionStatus>("ACTIVE");
  const [workspacePlanDraft, setWorkspacePlanDraft] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("MEMBER");
  const [ideas, setIdeas] = useState<StoryIdea[]>([]);
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [publishingSlots, setPublishingSlots] = useState<PublishingSlot[]>([]);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(defaultSettings);
  const [channelBlueprintDraft, setChannelBlueprintDraft] = useState<ChannelBlueprint>(defaultChannelBlueprint);
  const [channelMachineSeed, setChannelMachineSeed] = useState("");
  const [channelMachineResult, setChannelMachineResult] = useState<ChannelBlueprint | null>(null);
  const [channelMachineModel, setChannelMachineModel] = useState("");
  const [channelMachineGenerateImages, setChannelMachineGenerateImages] = useState(true);
  const [channelMachineSaveNotice, setChannelMachineSaveNotice] = useState("");
  const [hotNiches, setHotNiches] = useState<ChannelHotNiche[]>([]);
  const [hotNichesMonth, setHotNichesMonth] = useState("");
  const [hotNichesModel, setHotNichesModel] = useState("");
  const [hotNichesWarning, setHotNichesWarning] = useState("");
  const [showAllForgeRankings, setShowAllForgeRankings] = useState(false);
  const [blockedChannelIdeas, setBlockedChannelIdeas] = useState<BlockedChannelIdea[]>([]);
  const [openRouterModels, setOpenRouterModels] = useState<OpenRouterModel[]>([]);
  const [modelsFetchedAt, setModelsFetchedAt] = useState("");
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState("");
  const [anthropicModels, setAnthropicModels] = useState<FallbackProviderModel[]>([]);
  const [openAiModels, setOpenAiModels] = useState<FallbackProviderModel[]>([]);
  const [fallbackModelsFetchedAt, setFallbackModelsFetchedAt] = useState("");
  const [loadingFallbackModels, setLoadingFallbackModels] = useState(false);
  const [fallbackModelListError, setFallbackModelListError] = useState("");
  const [fallbackModelWarnings, setFallbackModelWarnings] = useState<{ anthropic?: string; openai?: string }>({});
  const [testingProvider, setTestingProvider] = useState<ApiProvider | "">("");
  const [apiTestResults, setApiTestResults] = useState<Partial<Record<ApiProvider, ApiTestResult>>>({});
  const [youtubeAnalytics, setYoutubeAnalytics] = useState<YoutubeAnalyticsPayload | null>(null);
  const [loadingYoutubeAnalytics, setLoadingYoutubeAnalytics] = useState(false);
  const [uploadPackagesByProjectId, setUploadPackagesByProjectId] = useState<Record<string, UploadReadinessPackage>>({});
  const [modelQuery, setModelQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabLabel>("Generated Ideas");
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("GUIDED");
  const [activeGuide, setActiveGuide] = useState<GuideTab>("Quick Start");
  const [filterCategory, setFilterCategory] = useState("All Categories");
  const [scoreFilter, setScoreFilter] = useState("All Scores");
  const [lengthFilter, setLengthFilter] = useState("All Lengths");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [query, setQuery] = useState("");
  const [contentMode, setContentMode] = useState<ContentMode>("LOCAL_LEAD_GEN");
  const [niche, setNiche] = useState(FORGE_NICHES[0].name);
  const [tone, setTone] = useState(FORGE_NICHES[0].tone);
  const [generateCategory, setGenerateCategory] = useState(FORGE_NICHES[0].category);
  const [desiredLength, setDesiredLength] = useState("10 minutes");
  const [sourceType, setSourceType] = useState("Agency knowledge, Texas market context, carrier guidelines");
  const [businessAudience, setBusinessAudience] = useState("Texas homeowners, drivers, families, landlords, and small-business owners, especially Houston and surrounding areas");
  const [businessOffer, setBusinessOffer] = useState("Home and auto quotes, commercial P&C, life insurance, renewal reviews, and coverage checkups from Baxter Insurance Agency, Inc.");
  const [businessLocation, setBusinessLocation] = useState("Texas, primarily Houston and surrounding areas");
  const [businessGoal, setBusinessGoal] = useState("Generate quote requests, policy reviews, cross-sells, referrals, and local SEO visibility");
  const [businessCompliance, setBusinessCompliance] = useState("Licensed for General Lines and life in Texas only. Do not promise savings, coverage, eligibility, underwriting acceptance, or claim outcomes. Coverage depends on policy terms, conditions, exclusions, limits, deductibles, endorsements, carrier appetite, underwriting, and Texas regulations.");
  const [businessCta, setBusinessCta] = useState("Call Baxter Insurance Agency, Inc. at 281-445-1381 or request a Texas insurance review.");
  const [ideaCount, setIdeaCount] = useState(10);
  const [projectFormat, setProjectFormat] = useState<StoryProjectFormat>("STANDALONE");
  const [campaignGoal, setCampaignGoal] = useState<CampaignGoalKey>("home-quotes");
  const [campaignAsset, setCampaignAsset] = useState<CampaignAssetKey>("video");
  const [campaignLaneName, setCampaignLaneName] = useState(FORGE_NICHES[0].name);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedOutputByProjectId, setSelectedOutputByProjectId] = useState<Record<string, string>>({});
  const [sourceMaterialByProjectId, setSourceMaterialByProjectId] = useState<Record<string, string>>({});
  const [sourceUrlsByProjectId, setSourceUrlsByProjectId] = useState<Record<string, string>>({});
  const [scriptIntentLocksByProjectId, setScriptIntentLocksByProjectId] = useState<Record<string, Partial<ScriptIntentLock>>>({});
  const [scriptOpeningByProjectId, setScriptOpeningByProjectId] = useState<Record<string, ScriptOpeningKey>>({});
  const [sponsorBlurbByProjectId, setSponsorBlurbByProjectId] = useState<Record<string, string>>({});
  const [sponsorLinkByProjectId, setSponsorLinkByProjectId] = useState<Record<string, string>>({});
  const [sponsorOfferUrlByProjectId, setSponsorOfferUrlByProjectId] = useState<Record<string, string>>({});
  const [bookIllustrationPlansByProjectId, setBookIllustrationPlansByProjectId] = useState<Record<string, BookIllustrationPlan>>({});
  const [bookIllustrationModeByProjectId, setBookIllustrationModeByProjectId] = useState<Record<string, BookIllustrationMode>>({});
  const [bookIllustrationMaxByProjectId, setBookIllustrationMaxByProjectId] = useState<Record<string, number>>({});
  const [bookIllustrationModelByProjectId, setBookIllustrationModelByProjectId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [workflowErrors, setWorkflowErrors] = useState<Record<string, string>>({});
  const [autoStep, setAutoStep] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [clientJobs, setClientJobs] = useState<ClientJob[]>([]);

  const applyWorkspacePayload = useCallback((payload: WorkspacePayload) => {
    setActiveWorkspace(payload.activeWorkspace);
    setWorkspaces(payload.workspaces);
    setCanManageWorkspace(payload.canManageWorkspace);
    setWorkspaceMembers(payload.members);
    setWorkspaceInvites(payload.invites);
    setWorkspaceUsage(payload.usage);
    setWorkspaceStatusDraft(payload.activeWorkspace.subscriptionStatus);
    setWorkspacePlanDraft(payload.activeWorkspace.subscriptionPlan ?? "");
  }, []);

  const loadAppData = useCallback(async (channelOverride?: string) => {
    setLoading(true);
    setMessage("");
    try {
      const workspacePayload = await fetchJson<WorkspacePayload>("/api/workspaces");
      applyWorkspacePayload(workspacePayload);
      const channelPayload = await fetchJson<{ channels: Channel[]; archivedChannels?: Channel[]; defaultChannelId: string }>("/api/channels");
      const storedChannelId = typeof window !== "undefined" ? window.localStorage.getItem("policyforge-lab-channel-id") || "" : "";
      const candidateChannelId = channelOverride || selectedChannelId || storedChannelId || channelPayload.defaultChannelId;
      const activeChannelId = channelPayload.channels.some((channel) => channel.id === candidateChannelId)
        ? candidateChannelId
        : channelPayload.defaultChannelId;
      const activeChannel = channelPayload.channels.find((channel) => channel.id === activeChannelId);
      const activeForgeNiche = forgeNicheByChannel(activeChannel);
      const activeBlueprint = parseChannelBlueprint(activeChannel?.description);
      setChannels(channelPayload.channels);
      setArchivedChannels(channelPayload.archivedChannels ?? []);
      setSelectedChannelId(activeChannelId);
      setChannelBlueprintDraft(activeBlueprint);
      setChannelMachineResult(activeBlueprint.ideaCombinations?.length || activeBlueprint.channelName ? activeBlueprint : null);
      setHotNiches([]);
      setHotNichesMonth("");
      setHotNichesModel("");
      setHotNichesWarning("");
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", activeChannelId);
      }
      const [ideasPayload, projectsPayload, calendarPayload, settingsPayload, blockedIdeasPayload, usageLedgerPayload] = await Promise.all([
        fetchJson<{ ideas: StoryIdea[] }>(channelUrl("/api/ideas", activeChannelId)),
        fetchJson<{ projects: StoryProject[] }>(channelUrl("/api/projects", activeChannelId)),
        fetchJson<{ slots: PublishingSlot[] }>(channelUrl("/api/calendar", activeChannelId)),
        fetchJson<UserSettings>("/api/settings"),
        fetchJson<{ blockedIdeas: BlockedChannelIdea[] }>("/api/channels/blocked-ideas"),
        fetchJson<UsageLedger>("/api/usage/ledger")
      ]);
      setIdeas(sortIdeas(ideasPayload.ideas));
      setProjects(projectsPayload.projects);
      setPublishingSlots(sortSlots(calendarPayload.slots));
      setBlockedChannelIdeas(blockedIdeasPayload.blockedIdeas);
      setUsageLedger(usageLedgerPayload);
      const mergedSettings = {
        ...defaultSettings,
        ...settingsPayload,
        preferredTone: normalizeOption(settingsPayload.preferredTone, toneOptions, defaultSettings.preferredTone),
        narrationStyle: normalizeOption(settingsPayload.narrationStyle, narrationStyleOptions, defaultSettings.narrationStyle),
        openRouterApiKey: "",
        anthropicApiKey: "",
        openAiApiKey: "",
        runwareApiKey: "",
        dataForSeoLogin: "",
        dataForSeoPassword: "",
        wordpressUsername: "",
        wordpressApplicationPassword: "",
        youtubeClientSecret: ""
      };
      setSettings(mergedSettings);
      setSettingsDraft(mergedSettings);
      setNiche(activeForgeNiche ? activeForgeNiche.name : mergedSettings.workspaceName || defaultSettings.workspaceName);
      setGenerateCategory(activeForgeNiche?.category || "Strange True Stories");
      setTone(activeForgeNiche?.tone || mergedSettings.preferredTone || defaultSettings.preferredTone);
      setSourceType(activeForgeNiche?.sourceType || "Agency knowledge, Texas market context, carrier guidelines");
      setDesiredLength(defaultDesiredLengthLabel(mergedSettings.defaultLengthMinutes));
      setSelectedProjectId((current) => projectsPayload.projects.some((project) => project.id === current) ? current : projectsPayload.projects[0]?.id || "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Baxter Growth Lab data.");
    } finally {
      setLoading(false);
    }
  }, [applyWorkspacePayload, selectedChannelId]);

  const loadOpenRouterModels = useCallback(async (announce = false) => {
    setLoadingModels(true);
    setModelListError("");
    try {
      const payload = await fetchJson<{ models: OpenRouterModel[]; fetchedAt: string }>("/api/openrouter/models");
      setOpenRouterModels(sortModels(payload.models));
      setModelsFetchedAt(payload.fetchedAt);
      if (announce) {
        setMessage(`Loaded ${payload.models.length} live OpenRouter text models.`);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not load OpenRouter models.";
      setModelListError(text);
      if (announce) setMessage(text);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const loadFallbackModels = useCallback(async (announce = false, draftKeys?: { anthropicApiKey?: string; openAiApiKey?: string }) => {
    setLoadingFallbackModels(true);
    setFallbackModelListError("");
    try {
      const init = draftKeys
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              anthropicApiKey: draftKeys.anthropicApiKey,
              openAiApiKey: draftKeys.openAiApiKey
            })
          }
        : undefined;
      const payload = await fetchJson<{
        anthropicModels: FallbackProviderModel[];
        openAiModels: FallbackProviderModel[];
        fetchedAt: string;
        warnings?: { anthropic?: string; openai?: string };
      }>("/api/fallback-models", init);
      setAnthropicModels(sortFallbackModels(payload.anthropicModels));
      setOpenAiModels(sortFallbackModels(payload.openAiModels));
      setFallbackModelsFetchedAt(payload.fetchedAt);
      setFallbackModelWarnings(payload.warnings ?? {});
      if (announce) {
        setMessage(`Loaded ${payload.anthropicModels.length} Anthropic and ${payload.openAiModels.length} OpenAI fallback models.`);
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not load fallback provider models.";
      setFallbackModelListError(text);
      if (announce) setMessage(text);
    } finally {
      setLoadingFallbackModels(false);
    }
  }, []);

  const loadYoutubeAnalytics = useCallback(async (channelId?: string) => {
    const targetChannelId = channelId || selectedChannelId;
    if (!targetChannelId) return;
    setLoadingYoutubeAnalytics(true);
    try {
      const payload = await fetchJson<YoutubeAnalyticsPayload>(channelUrl("/api/youtube/analytics", targetChannelId));
      setYoutubeAnalytics(payload);
    } catch (error) {
      setWorkflowErrors((current) => ({ ...current, youtube: error instanceof Error ? error.message : "Could not load YouTube analytics." }));
    } finally {
      setLoadingYoutubeAnalytics(false);
    }
  }, [selectedChannelId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadAppData();
      void loadOpenRouterModels();
      void loadFallbackModels();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadAppData, loadOpenRouterModels, loadFallbackModels]);

  useEffect(() => {
    if (!loading && (activeSection === "analytics" || activeSection === "dashboard")) {
      void loadYoutubeAnalytics(selectedChannelId);
    }
  }, [activeSection, loadYoutubeAnalytics, loading, selectedChannelId]);

  const counts = useMemo(() => {
    const usedIdeas = ideas.filter((idea) => isUsedStatus(idea.status));
    const queuedIdeas = ideas.filter((idea) => ["SAVED", "IN_PROGRESS", "DRAFTED"].includes(idea.status));
    const publishThisWeek = usedIdeas.filter((idea) => isThisWeek(idea.usedAt || idea.updatedAt)).length;
    const standaloneProtectedProjects = projects.filter((project) => !project.storyIdeaId && isIdeaProtectedProjectStatus(project.status));
    return {
      total: ideas.length,
      unused: ideas.filter((idea) => idea.status === "UNUSED").length,
      saved: ideas.filter((idea) => idea.status === "SAVED").length,
      queued: queuedIdeas.length,
      rejected: ideas.filter((idea) => idea.status === "REJECTED").length,
      used: usedIdeas.length + standaloneProtectedProjects.length,
      inProgress: ideas.filter((idea) => idea.status === "IN_PROGRESS" || idea.status === "DRAFTED").length,
      produced: ideas.filter((idea) => idea.status === "PRODUCED").length + standaloneProtectedProjects.filter((project) => project.status === "PRODUCED").length,
      published: ideas.filter((idea) => idea.status === "PUBLISHED").length + standaloneProtectedProjects.filter((project) => project.status === "PUBLISHED").length,
      archived: ideas.filter((idea) => idea.status === "ARCHIVED").length + standaloneProtectedProjects.filter((project) => project.status === "ARCHIVED").length,
      projects: projects.length,
      completedScripts: projects.filter((project) => project.status === "FINAL").length,
      scheduled: publishingSlots.filter((slot) => slot.status === "SCHEDULED").length,
      scheduledStandalone: publishingSlots.filter((slot) => slot.status === "SCHEDULED" && slot.slotType === "STANDALONE").length,
      scheduledEpisodes: publishingSlots.filter((slot) => slot.status === "SCHEDULED" && slot.slotType === "EPISODE").length,
      publishThisWeek,
      averageScore: ideas.length ? Math.round(ideas.reduce((sum, idea) => sum + idea.totalScore, 0) / ideas.length) : 0
    };
  }, [ideas, projects, publishingSlots]);

  const categoryStats = useMemo(() => {
    const byCategory = new Map<string, { label: string; count: number; average: number; scoreTotal: number }>();
    for (const idea of ideas) {
      const existing = byCategory.get(idea.category) ?? { label: idea.category, count: 0, average: 0, scoreTotal: 0 };
      existing.count += 1;
      existing.scoreTotal += idea.totalScore;
      existing.average = Math.round(existing.scoreTotal / existing.count);
      byCategory.set(idea.category, existing);
    }
    return Array.from(byCategory.values()).sort((a, b) => b.count - a.count || b.average - a.average);
  }, [ideas]);

  const filteredIdeas = useMemo(() => {
    return ideas
      .filter((idea) => {
        if (activeTab === "Saved Ideas") return idea.status === "SAVED";
        if (activeTab === "Idea Queue") return ["SAVED", "IN_PROGRESS", "DRAFTED"].includes(idea.status);
        if (activeTab === "Used Ideas") return isUsedStatus(idea.status);
        return !isUsedStatus(idea.status);
      })
      .filter((idea) => filterCategory === "All Categories" || idea.category === filterCategory)
      .filter((idea) => lengthFilter === "All Lengths" || lengthLabel(idea) === lengthFilter)
      .filter((idea) => statusFilter === "All Statuses" || displayStatus(idea.status) === statusFilter)
      .filter((idea) => (scoreFilter === "90+" ? idea.totalScore >= 90 : scoreFilter === "80+" ? idea.totalScore >= 80 : true))
      .filter((idea) => {
        const text = `${idea.title} ${idea.hook} ${idea.summary} ${idea.category} ${idea.location ?? ""} ${idea.eventName ?? ""} ${idea.episodeFit ?? ""} ${idea.bestFormat ?? ""} ${idea.episodeWhy ?? ""}`.toLowerCase();
        return text.includes(query.toLowerCase());
      });
  }, [activeTab, filterCategory, ideas, lengthFilter, query, scoreFilter, statusFilter]);

  const filteredOpenRouterModels = useMemo(() => {
    const text = modelQuery.trim().toLowerCase();
    if (!text) return openRouterModels;
    return openRouterModels.filter((model) => `${model.name} ${model.id}`.toLowerCase().includes(text));
  }, [modelQuery, openRouterModels]);
  const filteredAnthropicModels = useMemo(() => filterFallbackModels(anthropicModels, modelQuery), [anthropicModels, modelQuery]);
  const filteredOpenAiModels = useMemo(() => filterFallbackModels(openAiModels, modelQuery), [openAiModels, modelQuery]);
  const blockedChannelIdeaKeys = useMemo(() => new Set(blockedChannelIdeas.map((idea) => idea.key)), [blockedChannelIdeas]);
  const modelRoutingDirty = useMemo(() => {
    return settingsDraft.autoModelRouting !== settings.autoModelRouting ||
      modelRouteFields.some((field) => settingsDraft[field.key] !== settings[field.key]);
  }, [settings, settingsDraft]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId]
  );
  const upcomingPublishingSlots = useMemo(() => publishingSlots.filter((slot) => !isPastDate(slot.scheduledDate) || slot.status === "SCHEDULED"), [publishingSlots]);
  const sourceMaterial = selectedProject ? sourceMaterialByProjectId[selectedProject.id] ?? selectedProject.sourceMaterial ?? "" : "";
  const sourceUrls = selectedProject ? sourceUrlsByProjectId[selectedProject.id] ?? "" : "";
  const selectedProjectSupportsSponsor = selectedProject ? supportsSponsorBlurb(selectedProject.format) : false;
  const sponsorBlurb = selectedProject && selectedProjectSupportsSponsor ? normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[selectedProject.id] ?? selectedProject.sponsorBlurb ?? "", selectedProject.format) : "";
  const sponsorLink = selectedProject && selectedProjectSupportsSponsor ? sponsorLinkByProjectId[selectedProject.id] ?? selectedProject.sponsorLink ?? "" : "";
  const sponsorOfferUrl = selectedProject ? sponsorOfferUrlByProjectId[selectedProject.id] ?? sponsorLink : "";

  const scriptOutputOptions = useMemo(() => scriptOutputOptionsForProject(selectedProject), [selectedProject]);
  const selectedOutputId = selectedProject ? selectedOutputByProjectId[selectedProject.id] : "";
  const latestDraft = scriptOutputOptions.find((output) => output.id === selectedOutputId) ?? scriptOutputOptions[0];
  const alphabetizedChannels = useMemo(() => alphabetizeChannels(channels), [channels]);
  const alphabetizedArchivedChannels = useMemo(() => alphabetizeChannels(archivedChannels), [archivedChannels]);
  const currentChannel = channels.find((channel) => channel.id === selectedChannelId) || channels[0];
  const currentForgeNiche = forgeNicheByChannel(currentChannel);
  const rankedForgeCatalog = useMemo<ChannelHotNiche[]>(() => {
    return [...FORGE_NICHES]
      .sort((first, second) => {
        if (second.monetizationScore !== first.monetizationScore) {
          return second.monetizationScore - first.monetizationScore;
        }
        return first.name.localeCompare(second.name);
      })
      .map((niche, index) => ({
        title: niche.name,
        description: `${niche.title} — ${niche.description}`,
        whyHotThisMonth: `${agencyRevenueTierLabel(niche.monetizationTier)}. Prioritized by compliance fit, local demand, repeatable topics, and likely prospect intent.`,
        bestViewerPromise: niche.viewerPromise,
        monetizationRank: index + 1,
        monetizationScore: niche.monetizationScore,
        monetizationTier: niche.monetizationTier,
        monetizationRationale: niche.monetizationRationale,
        seedPrompt: forgeIdeaBrief(niche),
        nicheFocus: niche.nicheFocus,
        tone: niche.tone,
        category: niche.category,
        sourceType: niche.sourceType,
        keywords: niche.keywords,
        starterAngles: niche.starterAngles
      }));
  }, []);
  const currentForgeNicheRank = currentForgeNiche ? rankedForgeCatalog.findIndex((niche) => niche.title === currentForgeNiche.name) + 1 : 0;
  const activeChannelId = currentChannel?.id || selectedChannelId;
  const initials = initialsFor(user.name || user.email || "SF");
  const currentSection = sectionCopy[activeSection];
  const workspaceName = settings.workspaceName || defaultSettings.workspaceName;
  const workspaceTagline = settings.workspaceTagline || defaultSettings.workspaceTagline;
  const workspaceLogoUrl = settings.workspaceLogoUrl?.trim();
  const savedQueue = ideas.filter((idea) => ["SAVED", "IN_PROGRESS", "DRAFTED"].includes(idea.status));
  const usedIdeas = ideas.filter((idea) => isUsedStatus(idea.status));
  const publishableProjects = projects.filter((project) => hasPublishableScript(project) && !isUsedProjectStatus(project.status));
  const usedProjects = projects.filter((project) => isUsedProjectStatus(project.status));
  const projectIdeaIds = new Set(projects.map((project) => project.storyIdeaId).filter(Boolean));
  const usedIdeasWithoutProject = usedIdeas.filter((idea) => !projectIdeaIds.has(idea.id));

  function addClientJob(job: ClientJob) {
    setClientJobs((current) => [job, ...current].slice(0, 10));
  }

  function updateClientJob(jobId: string, patch: Partial<ClientJob>) {
    setClientJobs((current) => current.map((job) => (job.id === jobId ? { ...job, ...patch } : job)));
  }

  async function runAction(label: string, action: () => Promise<void>, options: { errorKey?: string } = {}) {
    const errorKey = options.errorKey;
    const shouldTrackJob = shouldTrackClientJob(label);
    const jobId = shouldTrackJob ? `${label}-${Date.now()}` : "";
    const jobCopy = clientJobCopy(label);
    setBusy(label);
    setMessage("");
    if (shouldTrackJob) {
      addClientJob({
        id: jobId,
        label: jobCopy.label,
        detail: jobCopy.detail,
        status: "queued",
        progress: 5,
        startedAt: new Date().toISOString()
      });
    }
    if (errorKey) {
      setWorkflowErrors((current) => withoutKey(current, errorKey));
    }
    try {
      if (shouldTrackJob) {
        updateClientJob(jobId, { status: "running", progress: 35 });
      }
      await action();
      if (shouldTrackJob) {
        updateClientJob(jobId, { status: "complete", progress: 100, detail: "Completed and saved.", finishedAt: new Date().toISOString() });
      }
      if (errorKey) {
        setWorkflowErrors((current) => withoutKey(current, errorKey));
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : "Something went wrong.";
      setMessage(text);
      if (shouldTrackJob) {
        updateClientJob(jobId, { status: "failed", progress: 100, detail: text, finishedAt: new Date().toISOString() });
      }
      if (errorKey) {
        setWorkflowErrors((current) => ({ ...current, [errorKey]: text }));
      }
    } finally {
      setBusy("");
    }
  }

  function goToSection(section: AppSection, tab?: TabLabel) {
    setActiveSection(section);
    if (tab) setActiveTab(tab);
  }

  async function switchChannel(channelId: string) {
    if (!channelId || channelId === selectedChannelId) return;
    if (archivedChannels.some((channel) => channel.id === channelId)) {
      await restoreChannel(channelId);
      return;
    }

    setSelectedProjectId("");
    setSelectedChannelId(channelId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("policyforge-lab-channel-id", channelId);
    }
    await loadAppData(channelId);
  }

  async function reloadWorkspaceData() {
    const payload = await fetchJson<WorkspacePayload>("/api/workspaces");
    applyWorkspacePayload(payload);
    return payload;
  }

  async function switchWorkspace(workspaceId: string) {
    if (!workspaceId || workspaceId === activeWorkspace?.id) return;
    await runAction("workspace-switch", async () => {
      await fetchJson<{ activeWorkspace: WorkspaceSummary }>("/api/workspaces/active", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      });
      setSelectedChannelId("");
      setSelectedProjectId("");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("policyforge-lab-channel-id");
      }
      await loadAppData("");
      setMessage("Workspace switched.");
    });
  }

  async function createWorkspace() {
    await runAction("workspace-create", async () => {
      const payload = await fetchJson<{ workspace: WorkspaceSummary }>("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWorkspaceName || "New Agency Workspace" })
      });
      setNewWorkspaceName("");
      setSelectedChannelId("");
      setSelectedProjectId("");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("policyforge-lab-channel-id");
      }
      await loadAppData("");
      setMessage(`Workspace "${payload.workspace.name}" created and activated.`);
    });
  }

  async function updateWorkspaceMeta(input: Partial<WorkspaceSummary> & { setupCompleted?: boolean }) {
    if (!activeWorkspace) return null;
    const payload = await fetchJson<{ workspace: WorkspaceSummary }>(`/api/workspaces/${activeWorkspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    await reloadWorkspaceData();
    return payload.workspace;
  }

  async function saveWorkspaceStatus() {
    if (!activeWorkspace) return;
    await runAction("workspace-status", async () => {
      const workspace = await updateWorkspaceMeta({
        subscriptionStatus: workspaceStatusDraft,
        subscriptionPlan: workspacePlanDraft
      });
      setMessage(`Workspace status saved${workspace ? `: ${workspace.subscriptionStatus}` : ""}.`);
    });
  }

  async function completeWorkspaceSetup() {
    if (!activeWorkspace) return;
    await runAction("workspace-setup", async () => {
      await updateWorkspaceMeta({ setupCompleted: true });
      setMessage("Workspace setup marked complete.");
    });
  }

  async function inviteWorkspaceMember() {
    await runAction("workspace-invite", async () => {
      const payload = await fetchJson<{ invite: WorkspaceInvite; inviteUrl: string }>("/api/workspaces/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      setInviteEmail("");
      await reloadWorkspaceData();
      await copyText(payload.inviteUrl, `Invite link copied for ${payload.invite.email}.`);
    });
  }

  async function copyInviteLink(invite: WorkspaceInvite) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://phpstack-1305612-6519184.cloudwaysapps.com";
    await copyText(`${origin}/login?invite=${invite.token}`, `Invite link copied for ${invite.email}.`);
  }

  async function deleteWorkspaceInvite(invite: WorkspaceInvite) {
    await runAction(`invite-delete-${invite.id}`, async () => {
      await fetchJson<{ deleted: boolean }>(`/api/workspaces/invites/${invite.id}`, { method: "DELETE" });
      await reloadWorkspaceData();
      setMessage(`Invite for ${invite.email} deleted.`);
    });
  }

  async function updateWorkspaceMemberRole(member: WorkspaceMember, role: WorkspaceRole) {
    await runAction(`member-role-${member.id}`, async () => {
      await fetchJson<{ member: WorkspaceMember }>(`/api/workspaces/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      await reloadWorkspaceData();
      setMessage("Member role updated.");
    });
  }

  async function removeWorkspaceMember(member: WorkspaceMember) {
    const label = member.user.name || member.user.email || "this member";
    if (!window.confirm(`Remove ${label} from this workspace?`)) return;
    await runAction(`member-remove-${member.id}`, async () => {
      await fetchJson<{ deleted: boolean }>(`/api/workspaces/members/${member.id}`, { method: "DELETE" });
      await reloadWorkspaceData();
      setMessage(`${label} removed from this workspace.`);
    });
  }

  async function createChannel() {
    await runAction("channel-create", async () => {
      const payload = await fetchJson<{ channel: Channel }>("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName })
      });
      setNewChannelName("");
      setChannels((current) => [...current.filter((channel) => channel.id !== payload.channel.id), payload.channel]);
      setSelectedProjectId("");
      setSelectedChannelId(payload.channel.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", payload.channel.id);
      }
      await loadAppData(payload.channel.id);
      setMessage(`Channel "${payload.channel.name}" created and activated. Future ideas will save to this channel.`);
    });
  }

  async function restoreChannel(channelId: string) {
    const channelToRestore = archivedChannels.find((channel) => channel.id === channelId);
    if (!channelToRestore) {
      setMessage("That archived channel is no longer available. Refreshing channels...");
      await loadAppData(activeChannelId);
      return;
    }

    await runAction(`channel-restore-${channelId}`, async () => {
      setArchivedChannels((current) => current.filter((channel) => channel.id !== channelId));
      setChannels((current) => [...current.filter((channel) => channel.id !== channelId), { ...channelToRestore, archivedAt: null }]);
      setSelectedProjectId("");
      setSelectedChannelId(channelId);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", channelId);
      }

      const payload = await fetchJson<{ channel: Channel; deletedChannelId?: string }>(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false })
      });
      setArchivedChannels((current) => current.filter((channel) => channel.id !== payload.channel.id && channel.id !== payload.deletedChannelId));
      setChannels((current) => [...current.filter((channel) => channel.id !== payload.channel.id), payload.channel]);
      setSelectedChannelId(payload.channel.id);
      await loadAppData(payload.channel.id);
      setMessage(`Channel "${payload.channel.name}" restored and activated.`);
    });
  }

  async function deleteChannel(channel: Channel) {
    const confirmed = window.confirm(
      `Delete "${channel.name}" permanently?\n\nThis removes the channel and all ideas, content projects, outputs, thumbnails, and scheduled calendar items inside it.`
    );
    if (!confirmed) return;

    await runAction(`channel-delete-${channel.id}`, async () => {
      const payload = await fetchJson<{ deleted: boolean; id: string; defaultChannelId: string }>(`/api/channels/${channel.id}`, { method: "DELETE" });
      const remainingChannels = channels.filter((item) => item.id !== channel.id);
      setChannels(remainingChannels);
      setArchivedChannels((current) => current.filter((item) => item.id !== channel.id));

      const nextChannelId = channel.id === activeChannelId || !activeChannelId ? remainingChannels[0]?.id || payload.defaultChannelId : activeChannelId;
      if (channel.id === activeChannelId || !activeChannelId) {
        setSelectedProjectId("");
        setSelectedChannelId(nextChannelId);
        if (typeof window !== "undefined") {
          window.localStorage.setItem("policyforge-lab-channel-id", nextChannelId);
        }
        await loadAppData(nextChannelId);
      } else {
        await loadAppData(activeChannelId);
      }

      setMessage(`Channel "${channel.name}" deleted.`);
    });
  }

  async function seedDemoWorkspace() {
    await runAction("demo-seed", async () => {
      const payload = await fetchJson<{ channel: Channel; projects: StoryProject[] }>("/api/demo/seed", { method: "POST" });
      setChannels((current) => [...current.filter((channel) => channel.id !== payload.channel.id), payload.channel]);
      setSelectedProjectId(payload.projects[0]?.id ?? "");
      setSelectedChannelId(payload.channel.id);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", payload.channel.id);
      }
      await loadAppData(payload.channel.id);
      setActiveSection("dashboard");
      setMessage(`Sample workspace loaded: ${payload.channel.name}.`);
    });
  }

  async function saveChannelBlueprint() {
    if (!currentChannel) {
      setMessage("Create or select a channel before saving a channel strategy.");
      return;
    }

    await runAction("channel-blueprint", async () => {
      const payload = await fetchJson<{ channel: Channel }>(`/api/channels/${currentChannel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: channelNameForPatch(channelBlueprintDraft.channelName, currentChannel.name),
          description: JSON.stringify(channelBlueprintDraft)
        })
      });
      setChannels((current) => current.map((channel) => (channel.id === payload.channel.id ? payload.channel : channel)));
      setMessage(`Saved Growth Strategy updated for "${payload.channel.name}".`);
    });
  }

  async function loadHotNiches() {
    if (!currentChannel) {
      setMessage("Create or select a channel before loading insurance lanes.");
      return;
    }

    await runAction("hot-niches", async () => {
      const payload = await fetchJson<{
        niches: ChannelHotNiche[];
        monthLabel: string;
        modelUsed: string;
        dataForSeoWarning?: string;
      }>("/api/channels/hot-niches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: currentChannel.id })
      }, { retries: 1, retryUnsafe: true });
      setHotNiches(payload.niches);
      setHotNichesMonth(payload.monthLabel);
      setHotNichesModel(payload.modelUsed);
      setHotNichesWarning(payload.dataForSeoWarning || "");
      setMessage(`Loaded ${payload.niches.length} fixed insurance lanes.`);
    }, { errorKey: "hot-niches" });
  }

  async function runChannelIdeaMachine(options: { surpriseMe?: boolean; seedOverride?: string } = {}) {
    if (!currentChannel) {
      setMessage("Create or select a growth lane before running the Growth Pack Machine.");
      return;
    }

    await runAction("channel-machine", async () => {
      setChannelMachineSaveNotice("");
      const seed = options.surpriseMe ? "" : limitChannelSeed(options.seedOverride ?? channelMachineSeed);
      if (options.surpriseMe) {
        setChannelMachineSeed("");
        setChannelMachineGenerateImages(true);
      } else if (options.seedOverride) {
        setChannelMachineSeed(seed);
      }
      const payload = await fetchJson<{ kit: ChannelBlueprint; modelUsed: string }>("/api/channels/idea-machine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channelId: currentChannel.id,
          seed,
          generateImages: options.surpriseMe ? true : channelMachineGenerateImages,
          surpriseMe: Boolean(options.surpriseMe)
        })
      }, { retries: 1, retryUnsafe: true });
      const kit = { ...defaultChannelBlueprint, ...payload.kit };
      setChannelMachineResult(kit);
      setChannelBlueprintDraft(kit);
      setChannelMachineModel(payload.modelUsed);
      setMessage(`${options.surpriseMe ? "Surprise channel kit" : "Channel kit"} generated${payload.modelUsed ? ` with ${payload.modelUsed}` : ""}. Review it, then create a new channel from it.`);
    }, { errorKey: "channel-machine" });
  }

  function applyHotNiche(niche: ChannelHotNiche) {
    if (blockedChannelIdeaKeys.has(channelIdeaKey(niche))) {
      setMessage(`"${niche.title}" is locked. Uncheck Never use again before using it.`);
      return;
    }
    setChannelMachineSeed(seedFromHotNiche(niche));
    setNiche(niche.nicheFocus);
    setGenerateCategory(niche.category);
    setTone(niche.tone);
    setSourceType(niche.sourceType);
    setMessage(`Loaded "${niche.title}" as the Growth Pack Machine direction.`);
  }

  async function updateBlockedChannelIdea(input: { key: string; title: string }, blocked: boolean) {
    const key = input.key;
    const previous = blockedChannelIdeas;
    const optimistic = blocked
      ? [
          ...previous.filter((idea) => idea.key !== key),
          { key, title: input.title, blockedAt: new Date().toISOString() }
        ]
      : previous.filter((idea) => idea.key !== key);
    setBlockedChannelIdeas(optimistic);
    setWorkflowErrors((current) => withoutKey(current, "blocked-channel-ideas"));

    try {
      const payload = await fetchJson<{ blockedIdeas: BlockedChannelIdea[] }>("/api/channels/blocked-ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, title: input.title, blocked })
      });
      setBlockedChannelIdeas(payload.blockedIdeas);
      setMessage(blocked ? `"${input.title}" will not be used again unless you uncheck it.` : `"${input.title}" is available again.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not update the channel idea lock.";
      setBlockedChannelIdeas(previous);
      setWorkflowErrors((current) => ({ ...current, "blocked-channel-ideas": text }));
      setMessage(text);
    }
  }

  async function setChannelIdeaBlocked(niche: ChannelHotNiche, blocked: boolean) {
    await updateBlockedChannelIdea({ key: channelIdeaKey(niche), title: niche.title }, blocked);
  }

  async function setChannelKitBlocked(kit: ChannelBlueprint, blocked: boolean) {
    const title = kit.channelName || currentChannel?.name || "Generated channel idea";
    await updateBlockedChannelIdea({ key: channelKitIdeaKey(kit, currentChannel?.name), title }, blocked);
  }

  async function saveChannelMachineKit(kit = channelMachineResult) {
    if (!currentChannel || !kit) {
      setMessage("Generate a channel kit before saving it.");
      return;
    }

    setChannelMachineSaveNotice("");
    await runAction("channel-blueprint", async () => {
      await createAndActivateChannelKit(kit);
    }, { errorKey: "channel-blueprint" });
  }

  async function createAndActivateChannelKit(kit: ChannelBlueprint) {
    if (!currentChannel) return;
    const channelName = channelNameForPatch(kit.channelName, "Generated Channel");
    const existingChannel = findChannelByName(channels, channelName);
    const archivedMatch = findChannelByName(archivedChannels, channelName);

    if (existingChannel) {
      const savedKit = { ...kit, channelName: existingChannel.name };
      const payload = await fetchJson<{ channel: Channel }>(`/api/channels/${existingChannel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: JSON.stringify(savedKit) })
      });
      setChannels((current) => current.map((channel) => (channel.id === payload.channel.id ? payload.channel : channel)));
      setSelectedChannelId(payload.channel.id);
      setSelectedProjectId("");
      setChannelBlueprintDraft(savedKit);
      setChannelMachineResult(savedKit);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", payload.channel.id);
      }
      await loadAppData(payload.channel.id);
      setChannelMachineSaveNotice(`Activated existing channel "${payload.channel.name}" and updated its strategy.`);
      setMessage(`Activated existing channel "${payload.channel.name}" and updated its kit.`);
      return;
    }

    if (archivedMatch) {
      const savedKit = { ...kit, channelName: archivedMatch.name };
      const payload = await fetchJson<{ channel: Channel; deletedChannelId?: string }>(`/api/channels/${archivedMatch.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false, description: JSON.stringify(savedKit) })
      });
      setArchivedChannels((current) => current.filter((channel) => channel.id !== payload.channel.id && channel.id !== payload.deletedChannelId));
      setChannels((current) => [...current.filter((channel) => channel.id !== payload.channel.id), payload.channel]);
      setSelectedChannelId(payload.channel.id);
      setSelectedProjectId("");
      setChannelBlueprintDraft(savedKit);
      setChannelMachineResult(savedKit);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("policyforge-lab-channel-id", payload.channel.id);
      }
      await loadAppData(payload.channel.id);
      setChannelMachineSaveNotice(`Restored and activated "${payload.channel.name}".`);
      setMessage(`Restored and activated "${payload.channel.name}" from this kit.`);
      return;
    }

    const payload = await fetchJson<{ channel: Channel }>("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: channelName,
        description: JSON.stringify(kit)
      })
    });
    const savedKit = { ...kit, channelName: payload.channel.name };
    setChannels((current) => [...current.filter((channel) => channel.id !== payload.channel.id), payload.channel]);
    setSelectedChannelId(payload.channel.id);
    setSelectedProjectId("");
    setChannelBlueprintDraft(savedKit);
    setChannelMachineResult(savedKit);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("policyforge-lab-channel-id", payload.channel.id);
    }
    await loadAppData(payload.channel.id);
    setChannelMachineSaveNotice(`Created and activated "${payload.channel.name}".`);
    setMessage(`New channel "${payload.channel.name}" created and activated from this kit.`);
  }

  function applyIdeaCombination(combination: ChannelIdeaCombination) {
    setNiche(combination.nicheFocus);
    setGenerateCategory(combination.category);
    setTone(combination.tone);
    setDesiredLength(combination.desiredLength);
    setSourceType(combination.sourceType);
    setIdeaCount(20);
    setActiveSection("idea-factory");
    setActiveTab("Generated Ideas");
    setMessage(`Idea Factory loaded with "${combination.category}". Generate 20 ideas when ready.`);
  }

  function updateSourceMaterial(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setSourceMaterialByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  function updateSourceUrls(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setSourceUrlsByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  function updateScriptIntentLock<K extends keyof ScriptIntentLock>(key: K, value: ScriptIntentLock[K], projectId = selectedProject?.id) {
    if (!projectId) return;
    setScriptIntentLocksByProjectId((current) => ({
      ...current,
      [projectId]: {
        ...current[projectId],
        [key]: value
      }
    }));
  }

  function resetScriptIntentLock(project = selectedProject) {
    if (!project) return;
    setScriptIntentLocksByProjectId((current) => {
      const next = { ...current };
      delete next[project.id];
      return next;
    });
    setScriptOpeningByProjectId((current) => ({ ...current, [project.id]: "texas-scenario" }));
    setMessage(`Script intent lock reset for "${project.title}".`);
  }

  function updateSponsorBlurb(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setSponsorBlurbByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  function updateSponsorLink(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setSponsorLinkByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  function updateSponsorOfferUrl(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setSponsorOfferUrlByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  async function generateSponsorBlurb(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a project before generating CTA copy.");
      return;
    }
    if (!supportsSponsorBlurb(project.format)) {
      setMessage("CTA helper copy is disabled for this project type.");
      return;
    }

    const url = (sponsorOfferUrlByProjectId[project.id] ?? sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? "").trim();
    if (!url) {
      setMessage("Enter a quote or service URL before generating CTA copy.");
      return;
    }

    await runAction(`sponsor-blurb-${project.id}`, async () => {
      const payload = await fetchJson<{ project: StoryProject; sponsorBlurb: string; sponsorLink: string; modelUsed: string }>(`/api/projects/${project.id}/sponsor-blurb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      setProjects((current) => current.map((item) => (item.id === project.id ? payload.project : item)));
      updateSponsorBlurb(normalizeSponsorBlurbForFormat(payload.sponsorBlurb, project.format), project.id);
      updateSponsorLink(payload.sponsorLink, project.id);
      updateSponsorOfferUrl(payload.sponsorLink, project.id);
      setMessage(`CTA copy generated and saved. Model: ${payload.modelUsed}.`);
    }, { errorKey: "sponsor-blurb" });
  }

  function latestDraftContentForExport() {
    if (!latestDraft) return "";
    if (latestDraft.passType !== "PUBLISHING_PACK") return latestDraft.content;
    if (selectedProject?.format === "ARTICLE" || selectedProject?.format === "PODCAST_EPISODE" || selectedProject?.format === "SHORT_BOOK" || selectedProject?.format === "LONG_BOOK") return latestDraft.content;
    return formatPublishingPackContent(latestDraft.content, {
      title: selectedProject?.title,
      sponsorBlurb,
      sponsorLink,
      summary: selectedProject?.storyIdea?.summary,
      hook: selectedProject?.storyIdea?.hook,
      targetLengthMinutes: selectedProject?.targetLengthMinutes
    });
  }

  async function copyText(text: string, success: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(success);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setMessage(success);
    }
  }

  async function copyLatestDraft() {
    if (!latestDraft) return;
    const label = latestDraft.displayLabel ?? passLabelForProject(latestDraft.passType, selectedProject?.format);
    await copyText(latestDraftContentForExport(), `${label} copied to clipboard.`);
  }

  function downloadLatestDraft() {
    if (!latestDraft || !selectedProject) return;
    downloadTextFile(
      `${safeFilename(selectedProject.title)}-${safeFilename(latestDraft.displayLabel ?? passLabelForProject(latestDraft.passType, selectedProject.format))}-${dateStamp(latestDraft.createdAt)}.txt`,
      latestDraftContentForExport()
    );
    setMessage(`${latestDraft.displayLabel ?? passLabelForProject(latestDraft.passType, selectedProject.format)} downloaded.`);
  }

  function exportScriptText(title: string, content: string) {
    const cleanTitle = title.trim() || "script";
    downloadTextFile(`${safeFilename(cleanTitle)}.txt`, content.trim());
    setMessage(`${cleanTitle} exported as text.`);
  }

  function exportLatestScriptText() {
    if (!latestDraft || !selectedProject || latestDraft.passType === "PUBLISHING_PACK") return;
    exportScriptText(selectedProject.title, latestDraft.content);
  }

  async function loadUploadPackage(project = selectedProject) {
    if (!project) {
      setMessage("Select a project before creating an upload package.");
      return;
    }
    await runAction(`upload-package-${project.id}`, async () => {
      const payload = await fetchJson<{ uploadPackage: UploadReadinessPackage }>(`/api/projects/${project.id}/upload-package`);
      setUploadPackagesByProjectId((current) => ({ ...current, [project.id]: payload.uploadPackage }));
      setMessage(`Upload package checked: ${payload.uploadPackage.status} (${payload.uploadPackage.readinessScore}/100).`);
    }, { errorKey: "upload-package" });
  }

  function downloadUploadPackage(project = selectedProject) {
    if (!project) {
      setMessage("Select a project before downloading an upload package.");
      return;
    }
    window.open(apiPath(`/api/projects/${project.id}/upload-package?format=markdown`), "_blank");
  }

  function downloadBookExport(project: StoryProject, format: BookExportFormat) {
    const authorName = promptForBookAuthor(project);
    if (!authorName) return;
    window.location.href = apiPath(bookExportUrl(project, format, authorName));
  }

  function promptForBookAuthor(project: StoryProject) {
    const storageKey = "policyforge-lab-book-author";
    const savedAuthor = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) || "" : "";
    const authorName = window.prompt(`Author name for "${project.title}"`, savedAuthor);
    if (authorName === null) return "";

    const trimmed = authorName.trim();
    if (!trimmed) {
      setMessage("Author name is required before exporting a book.");
      return "";
    }

    window.localStorage.setItem(storageKey, trimmed);
    return trimmed;
  }

  function bookExportUrl(project: StoryProject, format: BookExportFormat, authorName: string) {
    const params = new URLSearchParams({
      format,
      author: authorName
    });
    return `/api/projects/${project.id}/book-export?${params.toString()}`;
  }

  async function downloadGeneratedAsset(url: string | undefined, filename: string) {
    if (!url) {
      setMessage("No generated asset is available to download yet.");
      return;
    }

    try {
      const response = await fetch(assetDownloadPath(url, filename), { credentials: "same-origin" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(assetDownloadErrorMessage(text, response.status));
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error("The generated asset returned an empty file.");
      }

      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
      setMessage(`${filename} downloaded.`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Generated asset download failed.";
      setMessage(text);
      setWorkflowErrors((current) => ({ ...current, "asset-download": text }));
    }
  }

  function applyDraftToProject(projectId: string, draft: ScriptDraft) {
    setProjects((current) =>
      current.map((project) => {
        if (project.id !== projectId) return project;
        const drafts = [draft, ...(project.drafts ?? []).filter((item) => item.id !== draft.id)].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        return {
          ...project,
          status: projectStatusForPassClient(draft.passType),
          updatedAt: draft.createdAt,
          drafts
        };
      })
    );
  }

  type IdeaGenerationOverrides = Partial<{
    forgeNiche: typeof FORGE_NICHES[number] | null;
    niche: string;
    tone: string;
    category: string;
    desiredLength: string;
    sourceType: string;
    contentMode: ContentMode;
    businessAudience: string;
    businessOffer: string;
    businessLocation: string;
    businessGoal: string;
    businessCompliance: string;
    businessCta: string;
    projectFormat: StoryProjectFormat;
    ideaCount: number;
  }>;

  async function generateIdeas(overrides: IdeaGenerationOverrides = {}) {
    if (!activeChannelId) {
      setMessage("Create or choose a channel before generating ideas.");
      return;
    }

    await runAction("generate", async () => {
      const forgeNiche = overrides.forgeNiche === undefined ? currentForgeNiche : overrides.forgeNiche;
      const payload = await fetchJson<{ ideas: StoryIdea[]; modelUsed: string }>("/api/ideas/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: forgeNiche ? forgeIdeaBrief(forgeNiche) : overrides.niche ?? niche,
          tone: forgeNiche?.tone || overrides.tone || tone,
          category: forgeNiche?.category || (overrides.category ?? (generateCategory === "All Categories" ? "Mixed long-form true stories" : generateCategory)),
          desiredLength: overrides.desiredLength ?? desiredLength,
          sourceType: forgeNiche?.sourceType || overrides.sourceType || sourceType,
          contentMode: overrides.contentMode ?? contentMode,
          businessAudience: overrides.businessAudience ?? businessAudience,
          businessOffer: overrides.businessOffer ?? businessOffer,
          businessLocation: overrides.businessLocation ?? businessLocation,
          businessGoal: overrides.businessGoal ?? businessGoal,
          businessCompliance: overrides.businessCompliance ?? businessCompliance,
          businessCta: overrides.businessCta ?? businessCta,
          projectFormat: overrides.projectFormat ?? projectFormat,
          moneyGoal: channelBlueprintDraft.moneyGoal,
          affiliateOffer: [channelBlueprintDraft.offerDescription, channelBlueprintDraft.affiliateUrl].filter(Boolean).join(" | "),
          riskProfile: channelBlueprintDraft.riskTolerance,
          productionCapacity: `${channelBlueprintDraft.weeklyVideoTarget || 2} videos per week`,
          count: overrides.ideaCount ?? ideaCount,
          model: settings.discoveryModel,
          channelId: activeChannelId,
          save: true,
          demoFallback: true
        })
      });
      setIdeas((current) => sortIdeas(mergeIdeas(current, payload.ideas)));
      setActiveTab("Generated Ideas");
      setMessage(`${payload.ideas.length} ideas generated, scored, duplicate-checked, and saved. Model: ${payload.modelUsed}.`);
    });
  }

  function campaignBuilderContext() {
    const goal = campaignGoalOptions.find((item) => item.key === campaignGoal) ?? campaignGoalOptions[0];
    const asset = campaignAssetOptions.find((item) => item.key === campaignAsset) ?? campaignAssetOptions[0];
    const lane = FORGE_NICHES.find((item) => item.name === campaignLaneName) ?? currentForgeNiche ?? FORGE_NICHES[0];
    return { goal, asset, lane };
  }

  function applyCampaignBuilderTemplate() {
    const { goal, asset, lane } = campaignBuilderContext();
    setContentMode(asset.contentMode);
    setProjectFormat(asset.format);
    setDesiredLength(asset.length);
    setNiche(lane.nicheFocus);
    setGenerateCategory(lane.category);
    setTone(lane.tone);
    setSourceType(asset.sourceType || lane.sourceType);
    setBusinessGoal(goal.goal);
    setBusinessCta(goal.cta);
    setBusinessOffer(goal.offer);
    setBusinessAudience("Texas insurance prospects, Baxter Insurance Agency clients, homeowners, drivers, families, landlords, and small-business owners, especially Houston and surrounding areas");
    setBusinessLocation("Texas, primarily Houston and surrounding areas");
    setBusinessCompliance("Texas-only. Do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rates, discounts, or claim outcomes. Explain that coverage depends on policy terms, limits, exclusions, deductibles, endorsements, underwriting, carrier appetite, and Texas regulations.");
    setIdeaCount(10);
    setMessage(`Campaign Builder applied: ${goal.label} · ${asset.label} · ${lane.name}. Review or generate in the Idea Factory.`);
  }

  async function generateCampaignIdeas() {
    const { goal, asset, lane } = campaignBuilderContext();
    applyCampaignBuilderTemplate();
    await generateIdeas({
      forgeNiche: lane,
      niche: lane.nicheFocus,
      tone: lane.tone,
      category: lane.category,
      desiredLength: asset.length,
      sourceType: asset.sourceType || lane.sourceType,
      contentMode: asset.contentMode,
      businessAudience: "Texas insurance prospects, Baxter Insurance Agency clients, homeowners, drivers, families, landlords, and small-business owners, especially Houston and surrounding areas",
      businessOffer: goal.offer,
      businessLocation: "Texas, primarily Houston and surrounding areas",
      businessGoal: goal.goal,
      businessCompliance: "Texas-only. Do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rates, discounts, or claim outcomes. Explain that coverage depends on policy terms, limits, exclusions, deductibles, endorsements, underwriting, carrier appetite, and Texas regulations.",
      businessCta: goal.cta,
      projectFormat: asset.format,
      ideaCount: 10
    });
    setActiveSection("idea-factory");
  }

  function changeContentMode(mode: ContentMode) {
    setContentMode(mode);

    if (mode === "STORY_DOCUMENTARY") {
      setNiche(currentForgeNiche?.name || FORGE_NICHES[0].name);
      setGenerateCategory(currentForgeNiche?.category || FORGE_NICHES[0].category);
      setTone(currentForgeNiche?.tone || FORGE_NICHES[0].tone);
      setSourceType(currentForgeNiche?.sourceType || FORGE_NICHES[0].sourceType);
      return;
    }

    if (nicheFocusOptions.includes(niche)) setNiche("");
    const defaults = contentModeDefaults(mode);
    setGenerateCategory(defaults.category);
    setTone(defaults.tone);
    setSourceType(defaults.sourceType);
    setProjectFormat(defaults.projectFormat);
    setDesiredLength(defaultTargetLabelForFormat(defaults.projectFormat));
    setBusinessGoal((current) => businessGoalOptionsForContentMode(mode, current)[0] ?? current);
  }

  function updateDiscoveryModel(value: string) {
    setSettings((current) => ({ ...current, discoveryModel: value }));
    setSettingsDraft((current) => ({ ...current, discoveryModel: value }));
  }

  async function updateIdeaStatus(id: string, status: IdeaStatus, success: string) {
    await runAction(`idea-${id}-${status}`, async () => {
      const payload = await fetchJson<{ idea: StoryIdea }>(`/api/ideas/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      setIdeas((current) => sortIdeas(current.map((idea) => (idea.id === id ? payload.idea : idea))));
      setMessage(success);
    });
  }

  async function toggleSaved(idea: StoryIdea) {
    const nextStatus = idea.status === "SAVED" ? "UNUSED" : "SAVED";
    await updateIdeaStatus(
      idea.id,
      nextStatus,
      nextStatus === "SAVED" ? `"${idea.title}" saved to your queue.` : `"${idea.title}" moved back to unused.`
    );
  }

  async function markIdeaUsed(idea: StoryIdea) {
    const confirmed = window.confirm(
      `Mark "${idea.title}" as used?\n\nIt will move to Used Ideas and stay out of future idea batches. You can reactivate it later from the Used Ideas tab.`
    );
    if (!confirmed) return;

    await updateIdeaStatus(idea.id, "ARCHIVED", `"${idea.title}" marked as used and moved to Used Ideas.`);
  }

  async function reactivateIdea(idea: StoryIdea) {
    await updateIdeaStatus(idea.id, "SAVED", `"${idea.title}" reactivated and saved to your queue.`);
  }

  async function deleteIdea(idea: StoryIdea) {
    const confirmed = window.confirm(`Delete "${idea.title}" permanently?\n\nExisting content projects will stay, but this idea will be removed from the Idea Factory.`);
    if (!confirmed) return;

    await runAction(`delete-${idea.id}`, async () => {
      await fetchJson<{ deleted: boolean; id: string }>(`/api/ideas/${idea.id}`, { method: "DELETE" });
      setIdeas((current) => current.filter((item) => item.id !== idea.id));
      void loadProjectsAndIdeas().catch(() => undefined);
      setMessage(`"${idea.title}" deleted from the Idea Factory.`);
    });
  }

  async function deleteAllIdeas() {
    if (!ideas.length) return;
    const channelName = currentChannel?.name || "this channel";
    const confirmed = window.confirm(
      `Delete all ${ideas.length} ideas in "${channelName}" permanently?\n\nExisting Campaign Projects and drafts will stay, but every Idea Factory idea in this channel will be removed.`
    );
    if (!confirmed) return;

    await runAction("delete-all-ideas", async () => {
      const payload = await fetchJson<{ deleted: boolean; count: number }>(channelUrl("/api/ideas", activeChannelId), { method: "DELETE" });
      setIdeas([]);
      setActiveTab("Generated Ideas");
      void loadProjectsAndIdeas().catch(() => undefined);
      setMessage(`Deleted ${payload.count} ideas from "${channelName}". Existing projects were kept.`);
    });
  }

  async function startProject(idea: StoryIdea, formatOverride?: StoryProjectFormat) {
    const buildFormat = formatOverride || projectFormat;
    const existingProject = projects.find((project) => project.storyIdeaId === idea.id && project.format === buildFormat);
    if (existingProject) {
      setSelectedProjectId(existingProject.id);
      setActiveSection("projects");
      setMessage(`Opened the existing ${projectOutputNoun(buildFormat)} project for "${idea.title}".`);
      return;
    }
    if (!activeChannelId) {
      setMessage("Create or choose a channel before starting a content project.");
      return;
    }

    const actionKey = `project-${idea.id}-${buildFormat}`;
    await runAction(actionKey, async () => {
      const minutes = targetMinutesForProject(buildFormat, desiredLength, idea);
      const payload = await fetchJson<{ project: StoryProject; existing?: boolean }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyIdeaId: idea.id,
          channelId: activeChannelId,
          format: buildFormat,
          targetLengthMinutes: minutes,
          tone: idea.recommendedTone || tone,
          narrationStyle: idea.recommendedNarrationStyle || settings.narrationStyle
        })
      });
      setSelectedProjectId(payload.project.id);
      await loadProjectsAndIdeas();
      setActiveSection("projects");
      setMessage(payload.existing ? `Opened the existing ${projectOutputNoun(buildFormat)} project for "${idea.title}".` : `Started a ${projectOutputNoun(buildFormat)} project from "${idea.title}".`);
    });
  }

  async function deleteProject(project: StoryProject) {
    const confirmed = window.confirm(
      `Delete "${project.title}" permanently?\n\nThis removes the project and its drafts. The linked idea will be moved back to Saved Ideas if no other project is using it.`
    );
    if (!confirmed) return;

    await runAction(`delete-project-${project.id}`, async () => {
      await fetchJson<{ deleted: boolean; id: string }>(`/api/projects/${project.id}`, { method: "DELETE" });
      const payload = await loadProjectsAndIdeas();
      setSelectedProjectId((current) => (current === project.id ? payload.projects[0]?.id ?? "" : current));
      setMessage(`"${project.title}" deleted from Campaign Projects.`);
    });
  }

  async function updateProjectStatus(project: StoryProject, status: StoryProjectStatus) {
    const label = displayProjectStatus(status).toLowerCase();
    const requiresConfirmation = status === "PUBLISHED" || status === "PRODUCED" || status === "ARCHIVED";
    if (requiresConfirmation) {
      const statusMeaning =
        status === "PRODUCED"
          ? "Produced means the content file is finished, but it is not live yet. You can still schedule it in the calendar."
          : status === "PUBLISHED"
            ? "Published means the content is already live/final. Schedule it before marking it published, or reactivate it later if you need to schedule it again."
            : "Archived removes it from the active production and scheduling workflow.";
      const confirmed = window.confirm(
        `Mark "${project.title}" as ${label}?\n\n${statusMeaning}\n\nThis also updates the linked idea so duplicate prevention keeps it out of future idea batches.`
      );
      if (!confirmed) return;
    }

    await runAction(`project-status-${project.id}-${status}`, async () => {
      const payload = await fetchJson<{ project: StoryProject; idea?: StoryIdea | null }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      setProjects((current) => current.map((item) => (item.id === project.id ? payload.project : item)));
      const updatedIdea = payload.idea;
      if (updatedIdea) {
        setIdeas((current) => sortIdeas(current.map((idea) => (idea.id === updatedIdea.id ? updatedIdea : idea))));
      }
      await loadProjectsAndIdeas();
      setMessage(`"${project.title}" marked as ${label}.`);
    });
  }

  async function saveProjectInputs(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a project before saving project inputs.");
      return;
    }

    await runAction(`project-inputs-${project.id}`, async () => {
      await executeSaveProjectInputs(
        project,
        sourceMaterialByProjectId[project.id] ?? project.sourceMaterial ?? "",
        normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[project.id] ?? project.sponsorBlurb ?? "", project.format),
        sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? ""
      );
      setMessage(`Project inputs saved for "${project.title}".`);
    });
  }

  async function executeSaveProjectInputs(project: StoryProject, material: string, sponsor: string, sponsorUrl: string) {
    const sponsorAllowed = supportsSponsorBlurb(project.format);
    const normalizedSponsor = sponsorAllowed ? normalizeSponsorBlurbForFormat(sponsor, project.format) : "";
    const payload = await fetchJson<{ project: StoryProject }>(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceMaterial: material,
        sponsorBlurb: normalizedSponsor,
        sponsorLink: sponsorAllowed ? sponsorUrl : ""
      })
    });
    setProjects((current) => current.map((item) => (item.id === project.id ? payload.project : item)));
    updateSourceMaterial(payload.project.sourceMaterial ?? "", project.id);
    updateSponsorBlurb(payload.project.sponsorBlurb ?? "", project.id);
    updateSponsorLink(payload.project.sponsorLink ?? "", project.id);
    updateSponsorOfferUrl(payload.project.sponsorLink ?? "", project.id);
    return payload.project;
  }

  async function loadProjectsAndIdeas() {
    const channelId = activeChannelId;
    if (!channelId) {
      setIdeas([]);
      setProjects([]);
      setPublishingSlots([]);
      return { ideas: [], projects: [], slots: [] };
    }

    const [ideasPayload, projectsPayload, calendarPayload] = await Promise.all([
      fetchJson<{ ideas: StoryIdea[] }>(channelUrl("/api/ideas", channelId)),
      fetchJson<{ projects: StoryProject[] }>(channelUrl("/api/projects", channelId)),
      fetchJson<{ slots: PublishingSlot[] }>(channelUrl("/api/calendar", channelId))
    ]);
    const sortedIdeas = sortIdeas(ideasPayload.ideas);
    setIdeas(sortedIdeas);
    setProjects(projectsPayload.projects);
    setPublishingSlots(sortSlots(calendarPayload.slots));
    return { ideas: sortedIdeas, projects: projectsPayload.projects, slots: sortSlots(calendarPayload.slots) };
  }

  async function runMonthlyAuto() {
    const confirmed = window.confirm(
      "Create a monthly publishing batch?\n\nBaxter Growth Lab will create 6 standalone HeyGen video projects with randomized 7, 10, or 20 minute targets, plus one 5-episode series, then schedule them after any existing future calendar items."
    );
    if (!confirmed) return;
    if (!activeChannelId) {
      setMessage("Create or choose a channel before running Monthly Auto.");
      return;
    }

    await runAction("monthly-auto", async () => {
      const payload = await fetchJson<{ batchId: string; projects: StoryProject[]; slots: PublishingSlot[] }>("/api/calendar/monthly-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannelId })
      });
      await loadProjectsAndIdeas();
      setActiveSection("calendar");
      setMessage(`Monthly Auto created ${payload.projects.length} projects and scheduled ${payload.slots.length} calendar items.`);
    });
  }

  async function scheduleProjectInCalendar(project: StoryProject) {
    await runAction(`schedule-project-${project.id}`, async () => {
      const payload = await fetchJson<{ slot: PublishingSlot; alreadyScheduled: boolean }>("/api/calendar/schedule-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id })
      });
      setPublishingSlots((current) => sortSlots(mergeSlots(current, [payload.slot])));
      await loadProjectsAndIdeas();
      setActiveSection("calendar");
      setMessage(
        payload.alreadyScheduled
          ? `"${project.title}" is already scheduled for ${formatDate(payload.slot.scheduledDate)}.`
          : `"${project.title}" scheduled for ${formatDate(payload.slot.scheduledDate)}.`
      );
    });
  }

  async function updateCalendarSlotStatus(slot: PublishingSlot, status: PublishingSlotStatus) {
    const label = displaySlotStatus(status).toLowerCase();
    const statusMeaning =
      status === "PRODUCED"
        ? "Produced means the content is finished for this calendar date, but it is not live yet."
        : status === "PUBLISHED"
          ? "Published means the content is live/final for this calendar date."
          : "This updates the calendar item status.";
    const confirmed = window.confirm(`Mark "${slot.title}" as ${label}?\n\n${statusMeaning}`);
    if (!confirmed) return;

    await runAction(`slot-${slot.id}-${status}`, async () => {
      const payload = await fetchJson<{ slot: PublishingSlot }>(`/api/calendar/${slot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      setPublishingSlots((current) => sortSlots(current.map((item) => (item.id === slot.id ? payload.slot : item))));
      await loadProjectsAndIdeas();
      setMessage(`"${slot.title}" marked ${displaySlotStatus(status).toLowerCase()}.`);
    });
  }

  async function deleteCalendarSlot(slot: PublishingSlot) {
    const confirmed = window.confirm(`Remove "${slot.title}" from ${formatDate(slot.scheduledDate)}?`);
    if (!confirmed) return;

    await runAction(`delete-slot-${slot.id}`, async () => {
      await fetchJson<{ deleted: boolean; id: string }>(`/api/calendar/${slot.id}`, { method: "DELETE" });
      setPublishingSlots((current) => current.filter((item) => item.id !== slot.id));
      setMessage(`"${slot.title}" removed from the publishing calendar.`);
    });
  }

  async function generateProjectPass(passType: ScriptPassType, options: { forceSave?: boolean } = {}) {
    if (!selectedProject) {
      setMessage("Create or select a project before running a workflow pass.");
      return;
    }

    await runAction(`pass-${passType}`, async () => {
      await executeProjectPass(selectedProject, passType, sourceMaterial, options);
      setMessage(options.forceSave
        ? `Force-saved final output for "${selectedProject.title}".`
        : `${passLabelForProject(passType, selectedProject.format)} pass completed for "${selectedProject.title}".`);
    }, { errorKey: `pass-${passType}` });
  }

  function forceSaveFinalPass() {
    if (!selectedProject) return;
    const confirmed = window.confirm(
      `Force-save the Final output for "${selectedProject.title}"?\n\nThis reruns Teleprompter Polish and saves the result even if the ending still looks incomplete. Review the saved script before publishing.`
    );
    if (!confirmed) return;
    void generateProjectPass("FINAL", { forceSave: true });
  }

  async function regeneratePublishingDescription() {
    if (!selectedProject) {
      setMessage("Create or select a project before regenerating the video description.");
      return;
    }

    if (!latestDraftForPass(selectedProject, "PUBLISHING_PACK")) {
      setMessage("Create a Business Campaign Kit before regenerating the video description.");
      return;
    }

    const project = selectedProject;
    await runAction(`description-${project.id}`, async () => {
      const payload = await fetchJson<{ draft: ScriptDraft; description: string }>(`/api/projects/${project.id}/publishing-description`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsorBlurb: normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[project.id] ?? project.sponsorBlurb ?? "", project.format),
          sponsorLink: sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? ""
        })
      });
      applyDraftToProject(project.id, payload.draft);
      setSelectedOutputByProjectId((current) => ({ ...current, [project.id]: payload.draft.id }));
      await loadProjectsAndIdeas();
      setMessage(`Video description regenerated for "${project.title}".`);
    }, { errorKey: "publishing-description" });
  }

  async function runFullyAuto() {
    if (!selectedProject) {
      setMessage("Create or select a project before running fully auto mode.");
      return;
    }

    const sequence = autoScriptSequenceForProject(selectedProject);
    const longBookNote = selectedProject.format === "LONG_BOOK"
      ? "\n\nLong form books are drafted in chapter batches to protect the requested word count, so this can take significantly longer than a script or article."
      : "";
    const confirmed = window.confirm(
      `Run fully auto for "${selectedProject.title}"?\n\nBaxter Growth Lab will run the ${projectOutputNoun(selectedProject.format)} workflow in order: ${passLabelForProject("INTRO", selectedProject.format)}, Research, ${sequence.filter((passType) => passType !== "INTRO").map((passType) => passLabelForProject(passType, selectedProject.format)).join(", ")}. This can take several minutes and will use your configured models.${longBookNote}`
    );
    if (!confirmed) return;

    const project = selectedProject;
    await runAction("auto", async () => {
      try {
        let material = sourceMaterial;
        const sponsorAllowed = supportsSponsorBlurb(project.format);
        const sponsor = sponsorAllowed ? normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[project.id] ?? project.sponsorBlurb ?? "", project.format) : "";
        const sponsorUrl = sponsorAllowed ? sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? "" : "";
        setAutoStep("Saving project inputs");
        let currentProject = await executeSaveProjectInputs(project, material, sponsor, sponsorUrl);

        for (const passType of sequence) {
          if (passType === "DOSSIER") {
            setAutoStep("Research");
            material = await executeResearch(currentProject, material, sourceUrlsByProjectId[currentProject.id] ?? "");
            currentProject = (await loadProjectsAndIdeas()).projects.find((item) => item.id === project.id) ?? currentProject;
          }

          setAutoStep(passLabelForProject(passType, currentProject.format));
          currentProject = await executeProjectPass(currentProject, passType, material);
        }

        if (settings.hasRunwareApiKey && supportsSceneBackgrounds(currentProject) && sceneBackgroundPromptCount(currentProject) > sceneBackgroundAssetsForProject(currentProject).length) {
          setAutoStep("HeyGen Backgrounds");
          currentProject = (await executeSceneBackgrounds(currentProject)).project;
        }

        if (settings.hasRunwareApiKey && supportsThumbnails(currentProject)) {
          setAutoStep("Thumbnails");
          currentProject = (await executeProjectThumbnails(currentProject)).project;
        }

        setMessage(`Fully auto completed for "${project.title}".`);
      } finally {
        setAutoStep("");
      }
    }, { errorKey: "auto" });
  }

  async function runEpisodeFullyAuto() {
    if (!selectedProject) {
      setMessage("Create or select a project before running episode fully auto.");
      return;
    }
    if (!projectHasCompletedEpisodePlan(selectedProject)) {
      setMessage("Run Episodes first, then Episode Fully Auto can build the planned series.");
      return;
    }

    const sequence = episodeAutoSequenceForProject(selectedProject);
    const needsOnlyThumbnails = !sequence.length && supportsThumbnails(selectedProject) && thumbnailAssetsForProject(selectedProject).length < requiredThumbnailCountForProject(selectedProject);
    if (!sequence.length && !needsOnlyThumbnails) {
      setMessage(`Episode Fully Auto has nothing left to run for "${selectedProject.title}".`);
      return;
    }
    const confirmed = window.confirm(
      `Run Episode Fully Auto for "${selectedProject.title}"?\n\nBaxter Growth Lab will keep the completed ${episodeCountForProject(selectedProject)}-episode plan and run: ${sequence.length ? sequence.map((passType) => passLabelForProject(passType, "EPISODIC_SERIES")).join(", ") : "Thumbnails"}. This can take several minutes and will use your configured models.`
    );
    if (!confirmed) return;

    const project = selectedProject;
    await runAction("episode-auto", async () => {
      try {
        const material = sourceMaterial;
        const sponsorAllowed = supportsSponsorBlurb(project.format);
        const sponsor = sponsorAllowed ? normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[project.id] ?? project.sponsorBlurb ?? "", project.format) : "";
        const sponsorUrl = sponsorAllowed ? sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? "" : "";
        setAutoStep("Saving project inputs");
        let currentProject = await executeSaveProjectInputs(project, material, sponsor, sponsorUrl);

        for (const passType of sequence) {
          setAutoStep(passLabelForProject(passType, "EPISODIC_SERIES"));
          currentProject = await executeProjectPass(currentProject, passType, material);
        }

        if (settings.hasRunwareApiKey && supportsSceneBackgrounds(currentProject) && sceneBackgroundPromptCount(currentProject) > sceneBackgroundAssetsForProject(currentProject).length) {
          setAutoStep("HeyGen Backgrounds");
          currentProject = (await executeSceneBackgrounds(currentProject)).project;
        }

        if (settings.hasRunwareApiKey && supportsThumbnails(currentProject) && thumbnailAssetsForProject(currentProject).length < requiredThumbnailCountForProject(currentProject)) {
          setAutoStep("Thumbnails");
          currentProject = (await executeProjectThumbnails(currentProject)).project;
        }

        setMessage(`Episode Fully Auto completed for "${project.title}".`);
      } finally {
        setAutoStep("");
      }
    }, { errorKey: "episode-auto" });
  }

  async function executeProjectPass(project: StoryProject, passType: ScriptPassType, material: string, options: { forceSave?: boolean } = {}) {
    const sponsorAllowed = supportsSponsorBlurb(project.format);
    const projectSponsorBlurb = sponsorAllowed ? normalizeSponsorBlurbForFormat(sponsorBlurbByProjectId[project.id] ?? project.sponsorBlurb ?? "", project.format) : "";
    const projectSponsorLink = sponsorAllowed ? sponsorLinkByProjectId[project.id] ?? project.sponsorLink ?? "" : "";
    const intentLock = mergeScriptIntentLock(project, channelBlueprintDraft, scriptIntentLocksByProjectId[project.id]);
    const openingKey = scriptOpeningByProjectId[project.id] ?? "texas-scenario";
    const materialWithIntent = withScriptIntentMaterial(project, material, intentLock, openingKey);
    let currentProject = project;
    let continuePass = false;
    let progressMessage = "";
    let stepCount = 0;

    do {
      stepCount += 1;
      if (stepCount > 40) {
        throw new Error("Long form book generation stopped after 40 chapter requests. Please rerun Draft to continue from the last saved chapter.");
      }

      const previousLatestDraft = latestDraftForPass(currentProject, passType);
      try {
        const payload = await fetchJson<{ draft: ScriptDraft; modelUsed: string; continuePass?: boolean; progressMessage?: string }>(`/api/projects/${project.id}/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passType,
            sourceMaterial: materialWithIntent,
            sponsorBlurb: projectSponsorBlurb,
            sponsorLink: projectSponsorLink,
            forceSave: options.forceSave
          })
        });
        applyDraftToProject(project.id, payload.draft);
        continuePass = Boolean(payload.continuePass);
        progressMessage = payload.progressMessage || "";
        if (progressMessage) {
          setMessage(progressMessage);
          setAutoStep(progressMessage.replace(/\.$/, ""));
        }
        const refreshed = await loadProjectsAndIdeas();
        currentProject = refreshed.projects.find((item) => item.id === project.id) ?? currentProject;
      } catch (error) {
        if (isTransientApiError(error)) {
          const recoveredDraft = await recoverGeneratedDraft(project.id, passType, previousLatestDraft);
          if (recoveredDraft) {
            const refreshed = await loadProjectsAndIdeas();
            currentProject = refreshed.projects.find((item) => item.id === project.id) ?? currentProject;
            continuePass = isLongBookDraftProgress(recoveredDraft);
            if (continuePass) {
              setMessage("Recovered a saved long form book chapter. Continuing with the next chapter.");
              setAutoStep("Continuing long form book draft");
            }
            continue;
          }
        }
        throw error;
      }
    } while (continuePass);

    if (progressMessage) setAutoStep("");
    return currentProject;
  }

  async function generateProjectThumbnails(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a project before generating thumbnails.");
      return;
    }
    if (!supportsThumbnails(project)) {
      setMessage("Thumbnails are only generated for video projects.");
      return;
    }

    await runAction(`thumbnails-${project.id}`, async () => {
      const result = await executeProjectThumbnails(project);
      setMessage(`${result.thumbnailCount} thumbnails generated for "${project.title}".`);
    }, { errorKey: "thumbnails" });
  }

  async function generateAllMissingThumbnails() {
    const eligibleProjects = projects.filter((project) => supportsThumbnails(project) && Boolean(latestScriptDraft(project)));
    if (!eligibleProjects.length) {
      setMessage("No video projects are ready for thumbnail generation yet.");
      return;
    }
    if (!settings.hasRunwareApiKey) {
      setMessage("Add a Runware API key in Settings before batch-generating thumbnails.");
      return;
    }

    const needsWork = eligibleProjects.filter((project) => !latestDraftForPass(project, "PUBLISHING_PACK") || thumbnailAssetsForProject(project).length < requiredThumbnailCountForProject(project));
    if (!needsWork.length) {
      setMessage("Every video project already has a Business Campaign Kit and the required thumbnails.");
      return;
    }

    const confirmed = window.confirm(
      `Create missing Business Campaign Kits and thumbnails for ${needsWork.length} video project${needsWork.length === 1 ? "" : "s"}?\n\nBaxter Growth Lab will keep the shared thumbnail style across all images.`
    );
    if (!confirmed) return;

    await runAction("thumbnail-batch", async () => {
      let generated = 0;
      let packed = 0;
      try {
        for (const project of needsWork) {
          let currentProject = project;
          const material = sourceMaterialByProjectId[project.id] ?? project.sourceMaterial ?? "";

          if (!latestDraftForPass(currentProject, "PUBLISHING_PACK")) {
            setAutoStep(`Business Campaign Kit: ${project.title}`);
            currentProject = await executeProjectPass(currentProject, "PUBLISHING_PACK", material);
            packed += 1;
          }

          if (thumbnailAssetsForProject(currentProject).length < requiredThumbnailCountForProject(currentProject)) {
            setAutoStep(`Thumbnails: ${project.title}`);
            const result = await executeProjectThumbnails(currentProject);
            currentProject = result.project;
            generated += result.thumbnailCount;
          }
        }
      } finally {
        setAutoStep("");
      }
      setActiveSection("media");
      setMessage(`Batch complete: ${packed} Business Campaign Kits created and ${generated} thumbnails generated.`);
    }, { errorKey: "thumbnail-batch" });
  }

  async function executeProjectThumbnails(project: StoryProject) {
    const payload = await fetchJson<{ thumbnails: ThumbnailAsset[] }>(`/api/projects/${project.id}/thumbnails`, {
      method: "POST"
    });
    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? { ...item, thumbnails: [...payload.thumbnails, ...(item.thumbnails ?? [])] }
          : item
      )
    );
    const refreshed = await loadProjectsAndIdeas();
    return {
      project: refreshed.projects.find((item) => item.id === project.id) ?? project,
      thumbnailCount: payload.thumbnails.length
    };
  }

  async function generateSceneBackgroundsForProject(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a video project before generating HeyGen scene backgrounds.");
      return;
    }
    if (!supportsSceneBackgrounds(project)) {
      setMessage("HeyGen scene backgrounds are only generated for video projects.");
      return;
    }
    if (!latestDraftForPass(project, "SCENE_CARDS")) {
      setMessage("Create Scene Cards before generating HeyGen scene backgrounds.");
      return;
    }

    await runAction(`scene-backgrounds-${project.id}`, async () => {
      const result = await executeSceneBackgrounds(project);
      setMessage(`${result.backgroundCount} HeyGen scene background${result.backgroundCount === 1 ? "" : "s"} generated for "${project.title}".`);
    }, { errorKey: "scene-backgrounds" });
  }

  async function executeSceneBackgrounds(project: StoryProject) {
    const payload = await fetchJson<{ backgrounds: ThumbnailAsset[] }>(`/api/projects/${project.id}/scene-backgrounds`, {
      method: "POST"
    });
    setProjects((current) =>
      current.map((item) =>
        item.id === project.id
          ? { ...item, thumbnails: [...payload.backgrounds, ...(item.thumbnails ?? [])] }
          : item
      )
    );
    const refreshed = await loadProjectsAndIdeas();
    return {
      project: refreshed.projects.find((item) => item.id === project.id) ?? project,
      backgroundCount: payload.backgrounds.length
    };
  }

  function updateBookIllustrationMode(value: BookIllustrationMode, projectId = selectedProject?.id) {
    if (!projectId) return;
    setBookIllustrationModeByProjectId((current) => ({ ...current, [projectId]: value }));
    setBookIllustrationPlansByProjectId((current) => withoutKey(current, projectId));
  }

  function updateBookIllustrationMax(value: number, projectId = selectedProject?.id) {
    if (!projectId) return;
    const safeValue = Math.min(24, Math.max(1, Number.isFinite(value) ? Math.round(value) : 1));
    setBookIllustrationMaxByProjectId((current) => ({ ...current, [projectId]: safeValue }));
    setBookIllustrationPlansByProjectId((current) => withoutKey(current, projectId));
  }

  function updateBookIllustrationModel(value: string, projectId = selectedProject?.id) {
    if (!projectId) return;
    setBookIllustrationModelByProjectId((current) => ({ ...current, [projectId]: value }));
  }

  async function planBookIllustrations(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a book project before planning illustrations.");
      return;
    }
    if (!supportsBookIllustrations(project)) {
      setMessage("Illustration generation is not available for this Baxter Growth Lab project type.");
      return;
    }

    await runAction(`book-illustration-plan-${project.id}`, async () => {
      const payload = await fetchJson<{ plan: BookIllustrationPlan }>(`/api/projects/${project.id}/book-illustrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookIllustrationRequestBody(project, false))
      });
      setBookIllustrationPlansByProjectId((current) => ({ ...current, [project.id]: payload.plan }));
      setMessage(`Illustration plan ready for "${project.title}" with ${payload.plan.illustrations.length} image prompt${payload.plan.illustrations.length === 1 ? "" : "s"}.`);
    }, { errorKey: "book-illustrations" });
  }

  async function generateBookIllustrationsForProject(project = selectedProject) {
    if (!project) {
      setMessage("Create or select a book project before generating illustrations.");
      return;
    }
    if (!supportsBookIllustrations(project)) {
      setMessage("Illustration generation is not available for this Baxter Growth Lab project type.");
      return;
    }
    if (!settings.hasRunwareApiKey) {
      setMessage("Add a Runware API key in Settings before generating book illustrations.");
      return;
    }

    await runAction(`book-illustrations-${project.id}`, async () => {
      const payload = await fetchJson<{
        plan: BookIllustrationPlan;
        illustrations: ThumbnailAsset[];
        estimatedCost?: number;
        modelUsed?: string | null;
      }>(`/api/projects/${project.id}/book-illustrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookIllustrationRequestBody(project, true))
      });
      setBookIllustrationPlansByProjectId((current) => ({ ...current, [project.id]: payload.plan }));
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, thumbnails: [...payload.illustrations, ...(item.thumbnails ?? [])] }
            : item
        )
      );
      await loadProjectsAndIdeas();
      const cost = typeof payload.estimatedCost === "number" && payload.estimatedCost > 0
        ? ` Estimated Runware cost: $${payload.estimatedCost.toFixed(4)}.`
        : "";
      setMessage(`${payload.illustrations.length} book illustration${payload.illustrations.length === 1 ? "" : "s"} generated for "${project.title}".${cost}`);
    }, { errorKey: "book-illustrations" });
  }

  async function generateArticleImagesForProject(project = selectedProject) {
    if (!project) {
      setMessage("Create or select an article project before generating article images.");
      return;
    }
    if (project.format !== "ARTICLE") {
      setMessage("Article images are only available for Article projects.");
      return;
    }
    if (!settings.hasRunwareApiKey) {
      setMessage("Add a Runware API key in Settings before generating article images.");
      return;
    }

    await runAction(`article-images-${project.id}`, async () => {
      const payload = await fetchJson<{
        images: ThumbnailAsset[];
        estimatedCost?: number;
        modelUsed?: string | null;
      }>(`/api/projects/${project.id}/article-images`, { method: "POST" });
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, thumbnails: [...payload.images, ...(item.thumbnails ?? [])] }
            : item
        )
      );
      await loadProjectsAndIdeas();
      const cost = typeof payload.estimatedCost === "number" && payload.estimatedCost > 0
        ? ` Estimated Runware cost: $${payload.estimatedCost.toFixed(4)}.`
        : "";
      setMessage(`${payload.images.length} article image${payload.images.length === 1 ? "" : "s"} generated for "${project.title}".${cost}`);
    }, { errorKey: "article-images" });
  }

  async function createWordPressDraft(project = selectedProject) {
    if (!project) {
      setMessage("Create or select an article project before uploading a WordPress draft.");
      return;
    }
    if (project.format !== "ARTICLE") {
      setMessage("WordPress draft upload is only available for Article projects.");
      return;
    }
    if (!settings.hasWordPressCredentials) {
      setMessage("Add and test WordPress credentials in Settings before uploading a draft.");
      return;
    }

    await runAction(`wordpress-draft-${project.id}`, async () => {
      const payload = await fetchJson<{
        draft: {
          postId: number;
          status: string;
          link: string;
          editUrl: string;
          imageCount: number;
          tagCount: number;
        };
      }>(`/api/projects/${project.id}/wordpress-draft`, { method: "POST" });
      setMessage(`WordPress draft created for "${project.title}" with ${payload.draft.imageCount} image${payload.draft.imageCount === 1 ? "" : "s"} and ${payload.draft.tagCount} tag${payload.draft.tagCount === 1 ? "" : "s"}.`);
      if (payload.draft.editUrl) window.open(payload.draft.editUrl, "_blank", "noopener,noreferrer");
    }, { errorKey: "wordpress-draft" });
  }

  function bookIllustrationRequestBody(project: StoryProject, generateImages: boolean) {
    const mode = bookIllustrationModeByProjectId[project.id] ?? "CHAPTER_OPENERS";
    const maxImages = bookIllustrationMaxByProjectId[project.id] ?? defaultBookIllustrationMax(project.format, mode);
    const model = bookIllustrationModelByProjectId[project.id]?.trim() || DEFAULT_BOOK_ILLUSTRATION_MODEL;
    const plan = bookIllustrationPlansByProjectId[project.id];
    return {
      mode,
      maxImages,
      model,
      generateImages,
      plan: generateImages ? plan : undefined
    };
  }

  async function recoverGeneratedDraft(projectId: string, passType: ScriptPassType, previousDraft?: ScriptDraft) {
    const deadline = Date.now() + SCRIPT_PASS_RECOVERY_TIMEOUT_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
      if (attempt > 0) await sleep(SCRIPT_RECOVERY_POLL_MS);
      attempt += 1;
      try {
        const payload = await loadProjectsAndIdeas();
        const project = payload.projects.find((item) => item.id === projectId);
        const recoveredDraft = latestDraftForPass(project, passType);
        if (isNewerDraft(recoveredDraft, previousDraft)) {
          return recoveredDraft;
        }
      } catch (error) {
        if (!isTransientApiError(error)) throw error;
      }
    }
    return undefined;
  }

  async function researchSourceMaterial() {
    if (!selectedProject) {
      setMessage("Create or select a project before researching source material.");
      return;
    }

    await runAction(`research-${selectedProject.id}`, async () => {
      await executeResearch(selectedProject, sourceMaterial, sourceUrls);
      setMessage(`Research notes added for "${selectedProject.title}".`);
    }, { errorKey: "research" });
  }

  async function executeResearch(project: StoryProject, material: string, urls = sourceUrlsByProjectId[project.id] ?? "") {
    const previousMaterial = material || project.sourceMaterial || "";
    try {
      const payload = await fetchJson<{ notes: string; sourceMaterial: string; modelUsed: string }>(`/api/projects/${project.id}/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMaterial: material, sourceUrls: parseSourceUrls(urls) })
      });
      updateSourceMaterial(payload.sourceMaterial, project.id);
      await loadProjectsAndIdeas();
      return payload.sourceMaterial;
    } catch (error) {
      if (isTransientApiError(error)) {
        const recoveredMaterial = await recoverResearchMaterial(project.id, previousMaterial);
        if (recoveredMaterial) return recoveredMaterial;
      }
      throw error;
    }
  }

  async function recoverResearchMaterial(projectId: string, previousMaterial: string) {
    const deadline = Date.now() + RESEARCH_RECOVERY_TIMEOUT_MS;
    let attempt = 0;
    while (Date.now() < deadline) {
      if (attempt > 0) await sleep(SCRIPT_RECOVERY_POLL_MS);
      attempt += 1;
      try {
        const payload = await loadProjectsAndIdeas();
        const project = payload.projects.find((item) => item.id === projectId);
        const recoveredMaterial = project?.sourceMaterial ?? "";
        if (isNewerSourceMaterial(recoveredMaterial, previousMaterial)) {
          updateSourceMaterial(recoveredMaterial, projectId);
          return recoveredMaterial;
        }
      } catch (error) {
        if (!isTransientApiError(error)) throw error;
      }
    }
    return undefined;
  }

  async function saveSettings() {
    await runAction("settings", async () => {
      const payload = await fetchJson<UserSettings>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          openRouterApiKey: settingsDraft.openRouterApiKey,
          anthropicApiKey: settingsDraft.anthropicApiKey,
          openAiApiKey: settingsDraft.openAiApiKey,
          defaultModel: settingsDraft.defaultModel,
          discoveryModel: settingsDraft.discoveryModel,
          dossierModel: settingsDraft.dossierModel,
          structureModel: settingsDraft.structureModel,
          draftingModel: settingsDraft.draftingModel,
          critiqueModel: settingsDraft.critiqueModel,
          rewriteModel: settingsDraft.rewriteModel,
          anthropicModel: settingsDraft.anthropicModel,
          openAiModel: settingsDraft.openAiModel,
          runwareApiKey: settingsDraft.runwareApiKey,
          runwareModel: settingsDraft.runwareModel,
          dataForSeoLogin: settingsDraft.dataForSeoLogin,
          dataForSeoPassword: settingsDraft.dataForSeoPassword,
          wordpressSiteUrl: settingsDraft.wordpressSiteUrl,
          wordpressUsername: settingsDraft.wordpressUsername,
          wordpressApplicationPassword: settingsDraft.wordpressApplicationPassword,
          youtubeClientId: settingsDraft.youtubeClientId,
          youtubeClientSecret: settingsDraft.youtubeClientSecret,
          thumbnailStyleGuide: settingsDraft.thumbnailStyleGuide,
          workspaceName: settingsDraft.workspaceName,
          workspaceTagline: settingsDraft.workspaceTagline,
          workspaceLogoUrl: settingsDraft.workspaceLogoUrl,
          defaultSponsorCta: settingsDraft.defaultSponsorCta,
          publishingScheduleNote: settingsDraft.publishingScheduleNote,
          autoModelRouting: settingsDraft.autoModelRouting,
          preferredTone: settingsDraft.preferredTone,
          narrationStyle: settingsDraft.narrationStyle,
          defaultLengthMinutes: Number(settingsDraft.defaultLengthMinutes),
          ttsPauseMarkers: settingsDraft.ttsPauseMarkers
        })
      });
      const mergedSettings = {
        ...defaultSettings,
        ...payload,
        preferredTone: normalizeOption(payload.preferredTone, toneOptions, defaultSettings.preferredTone),
        narrationStyle: normalizeOption(payload.narrationStyle, narrationStyleOptions, defaultSettings.narrationStyle),
        openRouterApiKey: "",
        anthropicApiKey: "",
        openAiApiKey: "",
        runwareApiKey: "",
        dataForSeoLogin: "",
        dataForSeoPassword: "",
        wordpressUsername: "",
        wordpressApplicationPassword: "",
        youtubeClientSecret: ""
      };
      setSettings(mergedSettings);
      setSettingsDraft(mergedSettings);
      setTone(mergedSettings.preferredTone);
      await reloadWorkspaceData();
      void loadFallbackModels();
      setMessage("Settings saved.");
    });
  }

  async function saveModelRoutingSettings() {
    await runAction("model-routing", async () => {
      const payload = await fetchJson<UserSettings>("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: settingsDraft.defaultModel,
          discoveryModel: settingsDraft.discoveryModel,
          dossierModel: settingsDraft.dossierModel,
          structureModel: settingsDraft.structureModel,
          draftingModel: settingsDraft.draftingModel,
          critiqueModel: settingsDraft.critiqueModel,
          rewriteModel: settingsDraft.rewriteModel,
          autoModelRouting: settingsDraft.autoModelRouting
        })
      });
      const routingPatch = modelRoutingSettingsPatch(payload);
      const statusPatch = providerStatusPatch(payload);
      setSettings((current) => ({ ...current, ...statusPatch, ...routingPatch }));
      setSettingsDraft((current) => ({ ...current, ...statusPatch, ...routingPatch }));
      setMessage("Model Routing saved.");
    });
  }

  async function testApiProvider(provider: ApiProvider) {
    setTestingProvider(provider);
    setMessage("");
    try {
      const payload = await fetchJson<ApiTestResult>("/api/provider-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerTestPayload(provider))
      });

      if (provider === "anthropic" && payload.models) {
        setAnthropicModels(sortFallbackModels(payload.models));
        setFallbackModelsFetchedAt(payload.testedAt || new Date().toISOString());
        setFallbackModelWarnings((current) => ({ ...current, anthropic: undefined }));
      }
      if (provider === "openai" && payload.models) {
        setOpenAiModels(sortFallbackModels(payload.models));
        setFallbackModelsFetchedAt(payload.testedAt || new Date().toISOString());
        setFallbackModelWarnings((current) => ({ ...current, openai: undefined }));
      }

      markProviderConfigured(provider);
      setApiTestResults((current) => ({ ...current, [provider]: payload }));
      setMessage(payload.message);
    } catch (error) {
      const text = error instanceof Error ? error.message : "API test failed.";
      const failedResult: ApiTestResult = {
        ok: false,
        provider,
        message: text,
        testedAt: new Date().toISOString()
      };
      setApiTestResults((current) => ({ ...current, [provider]: failedResult }));
      setMessage(text);
    } finally {
      setTestingProvider("");
    }
  }

  function providerTestPayload(provider: ApiProvider) {
    if (provider === "openrouter") {
      return { provider, apiKey: settingsDraft.openRouterApiKey, model: settingsDraft.defaultModel };
    }
    if (provider === "anthropic") {
      return { provider, apiKey: settingsDraft.anthropicApiKey, model: settingsDraft.anthropicModel };
    }
    if (provider === "openai") {
      return { provider, apiKey: settingsDraft.openAiApiKey, model: settingsDraft.openAiModel };
    }
    if (provider === "dataforseo") {
      return {
        provider,
        dataForSeoLogin: settingsDraft.dataForSeoLogin,
        dataForSeoPassword: settingsDraft.dataForSeoPassword
      };
    }
    if (provider === "wordpress") {
      return {
        provider,
        wordpressSiteUrl: settingsDraft.wordpressSiteUrl,
        wordpressUsername: settingsDraft.wordpressUsername,
        wordpressApplicationPassword: settingsDraft.wordpressApplicationPassword
      };
    }
    return { provider, apiKey: settingsDraft.runwareApiKey, model: settingsDraft.runwareModel };
  }

  function markProviderConfigured(provider: ApiProvider) {
    const configuredPatch: Partial<UserSettings> = {};
    const secretClearPatch: Partial<UserSettings> = {};

    if (provider === "openrouter") {
      configuredPatch.hasOpenRouterApiKey = true;
      secretClearPatch.openRouterApiKey = "";
    } else if (provider === "anthropic") {
      configuredPatch.hasAnthropicApiKey = true;
      secretClearPatch.anthropicApiKey = "";
    } else if (provider === "openai") {
      configuredPatch.hasOpenAiApiKey = true;
      secretClearPatch.openAiApiKey = "";
    } else if (provider === "runware") {
      configuredPatch.hasRunwareApiKey = true;
      secretClearPatch.runwareApiKey = "";
    } else if (provider === "dataforseo") {
      configuredPatch.hasDataForSeoCredentials = true;
      secretClearPatch.dataForSeoLogin = "";
      secretClearPatch.dataForSeoPassword = "";
    } else if (provider === "wordpress") {
      configuredPatch.hasWordPressCredentials = true;
      secretClearPatch.wordpressUsername = "";
      secretClearPatch.wordpressApplicationPassword = "";
    }

    setSettings((current) => ({ ...current, ...configuredPatch, ...secretClearPatch }));
    setSettingsDraft((current) => ({ ...current, ...configuredPatch, ...secretClearPatch }));
  }

  const tabs: Array<{ label: TabLabel; count: number; icon: LucideIcon }> = [
    { label: "Generated Ideas", count: counts.total - counts.used, icon: Bookmark },
    { label: "Saved Ideas", count: counts.saved, icon: Star },
    { label: "Idea Queue", count: counts.queued, icon: ListChecks },
    { label: "Used Ideas", count: counts.used, icon: CheckCircle2 }
  ];

  return (
    <div className={cn("policyforge-app", experienceMode === "GUIDED" && "guided-mode")}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon" style={workspaceLogoUrl ? { backgroundImage: `url(${workspaceLogoUrl})` } : undefined} aria-hidden="true" />
          <div className="brand-name">
            <strong>{workspaceName}</strong>
            <span>{workspaceTagline}</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={cn("nav-item", activeSection === item.id && "active")}
              type="button"
              onClick={() => goToSection(item.id)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
            </button>
          ))}
          {user.role === "ADMIN" ? (
            <Link className="nav-item" href="/admin">
              <UserCog size={19} />
              <span>Admin</span>
            </Link>
          ) : null}
        </nav>

        <div className="sidebar-spacer" />

        <div className="weekly-progress">
          <div className="progress-header">
            <strong>{counts.publishThisWeek} used this week</strong>
            <span>{Math.min(100, counts.publishThisWeek * 25)}%</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, counts.publishThisWeek * 25)}%` }} />
          </div>
          <small>Weekly target: 4 long-form stories</small>
          <button className="text-link" type="button" onClick={() => goToSection("published")}>
            View production list
          </button>
        </div>

        <div className="profile-card">
          <div className="avatar">{initials}</div>
          <div className="profile-meta">
            <strong>{user.name || "Baxter Growth Lab User"}</strong>
            <span>{user.email || "Signed in"}</span>
          </div>
          <ChevronDown size={16} />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="page-title">
            <h1>{currentSection.title}</h1>
            <p>{currentSection.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <label className="channel-switcher">
              <span>Channel</span>
              <select
                value={currentChannel?.id || ""}
                onChange={(event) => void switchChannel(event.target.value)}
                disabled={loading || busy === "channel-create" || busy === "channel-restore"}
              >
                <optgroup label="Active Channels">
                  {alphabetizedChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </optgroup>
                {archivedChannels.length ? (
                  <optgroup label="Archived Channels - select to restore">
                    {alphabetizedArchivedChannels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name} (archived)
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
            <div className="select-pill">
              <span>Model</span>
              <strong>{settings.autoModelRouting ? "Auto routing" : settings.defaultModel}</strong>
              <ChevronDown size={15} />
            </div>
            <div className="status-pill">
              <span>API Key</span>
              <span className={cn("status-dot", !hasTextGenerationProvider(settings) && "muted")} />
              <strong>{hasTextGenerationProvider(settings) ? "Configured" : "Provider needed"}</strong>
            </div>
            <div className="mode-toggle" aria-label="Experience mode">
              {(["GUIDED", "POWER"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(experienceMode === mode && "active")}
                  onClick={() => setExperienceMode(mode)}
                  title={mode === "GUIDED" ? "Show the clearest next actions and keep advanced controls quiet." : "Show advanced controls, reruns, and deeper workflow context."}
                >
                  {mode === "GUIDED" ? "Guided" : "Power"}
                </button>
              ))}
            </div>
            <button className="icon-button" aria-label="Refresh data" type="button" onClick={() => void loadAppData()}>
              <RefreshCw size={20} />
            </button>
            <button className="icon-button" aria-label="Help" type="button" onClick={() => goToSection("guides")}>
              <HelpCircle size={20} />
            </button>
            <button className="icon-button" aria-label="Notifications" type="button">
              <Bell size={20} />
            </button>
            <button className="icon-button" aria-label="Sign out" type="button" onClick={() => void signOut({ callbackUrl: "/login" })}>
              <LogOut size={19} />
            </button>
            <div className="avatar">{initials}</div>
          </div>
        </header>

        {message ? <div className={cn("app-message", message.toLowerCase().includes("error") && "error")}>{message}</div> : null}
        {loading ? (
          <div className="panel pad loading-panel">
            <Loader2 size={18} className="spin" />
            Loading your Baxter Growth Lab workspace...
          </div>
        ) : null}

        {!loading && activeSection === "dashboard" ? renderDashboard() : null}
        {!loading && activeSection === "campaign-builder" ? renderCampaignBuilder() : null}
        {!loading && activeSection === "idea-factory" ? renderIdeaFactory() : null}
        {!loading && activeSection === "projects" ? renderProjects() : null}
        {!loading && activeSection === "script-lab" ? renderScriptLab() : null}
        {!loading && activeSection === "calendar" ? renderCalendar() : null}
        {!loading && activeSection === "published" ? renderPublished() : null}
        {!loading && activeSection === "media" ? renderMedia() : null}
        {!loading && activeSection === "exports" ? renderExports() : null}
        {!loading && activeSection === "analytics" ? renderAnalytics() : null}
        {!loading && activeSection === "guides" ? renderGuides() : null}
        {!loading && activeSection === "settings" ? renderSettings() : null}
      </main>
    </div>
  );

  function renderDashboard() {
    const boardColumns = pipelineBoard(projects, ideas, publishingSlots);
    const readiness = agencyReadinessItems(projects, settings, currentChannel, channelBlueprintDraft);
    const commandItems = commandCenterItems({ ideas, projects, slots: publishingSlots, analytics: youtubeAnalytics, blueprint: channelBlueprintDraft })
      .map((item) => ({ ...item, action: () => goToSection(item.section, item.tab) }));
    const qualityQueue = qualityGateQueue(projects).slice(0, 5);
    const packagingBank = packagingTestBank(projects).slice(0, 6);
    const ledgerRows = modelLedgerRows(usageLedger).slice(0, 6);
    const voiceChecks = channelVoiceChecklist(channelBlueprintDraft);
    const learningItems = learningLoopInsights({ analytics: youtubeAnalytics, ideas, projects }).slice(0, 5);
    const profitScore = channelProfitScore({ ideas, projects, analytics: youtubeAnalytics, blueprint: channelBlueprintDraft });
    const launchPlan = thirtyDayLaunchPlan({ ideas, projects, slots: publishingSlots, blueprint: channelBlueprintDraft });
    const moneyWarnings = doNotWasteTimeWarnings({ ideas, projects, analytics: youtubeAnalytics, blueprint: channelBlueprintDraft });
    const monetizationItems = monetizationStrategyItems(channelBlueprintDraft, projects);
    const moneyAnalytics = moneyFocusedAnalytics({ analytics: youtubeAnalytics, projects, blueprint: channelBlueprintDraft });
    const moneyPathReady = isMoneyPathReady(channelBlueprintDraft);
    const cockpitItems = creatorCockpitItems({ ideas, projects, slots: publishingSlots, analytics: youtubeAnalytics, blueprint: channelBlueprintDraft });
    const weeklyMoneyPlan = bestNextMoveItems({ ideas, projects, slots: publishingSlots, analytics: youtubeAnalytics, blueprint: channelBlueprintDraft });

    return (
      <SectionStack>
        <div className="stats-grid">
          <Metric label="Total growth ideas" value={counts.total} />
          <Metric label="Unused ideas" value={counts.unused} />
          <Metric label="In progress" value={counts.inProgress} />
          <Metric label="Completed outputs" value={counts.completedScripts} />
          <Metric label="Scheduled content" value={counts.scheduled} />
          <Metric label="Published content" value={counts.published} />
        </div>
        <div className="action-strip">
          <button className="primary-button fit" type="button" onClick={() => goToSection("campaign-builder")}>
            <Zap size={16} />
            Build Lead Campaign
          </button>
          <button className="secondary-button" type="button" onClick={() => goToSection("projects")}>
            <FolderKanban size={16} />
            Continue Content Project
          </button>
          <button className="secondary-button" type="button" onClick={() => goToSection("calendar")}>
            <CalendarDays size={16} />
            Campaign Calendar
          </button>
        </div>
        <Panel title="This Week's Money Plan">
          <div className="money-plan-list">
            {weeklyMoneyPlan.map((item, index) => (
              <button className={cn("money-plan-card", item.priority)} type="button" key={item.title} onClick={() => goToSection(item.section, item.tab)}>
                <span>{index + 1}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                  <em>{item.action}</em>
                </div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Agency Growth Cockpit">
          <div className="creator-cockpit">
            {cockpitItems.map((item) => (
              <button className={cn("creator-cockpit-card", item.level)} type="button" key={item.label} onClick={() => goToSection(item.section, item.tab)}>
                <span>{item.label}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
        </Panel>
        <ClientJobQueue jobs={clientJobs} />
        <div className="money-path-panel">
          <div>
            <span className="eyebrow">First-Run Revenue Path</span>
            <h2>{moneyPathReady ? "Growth strategy is revenue-ready" : "Finish the revenue path before scaling production"}</h2>
            <p>{moneyPathReady ? `${channelBlueprintDraft.moneyGoal} Production target: ${channelBlueprintDraft.weeklyVideoTarget || 2} content pieces per week.` : "Save a revenue goal, compliance lane, output pace, CTA, and service focus so every idea, script, pack, and warning points toward new business."}</p>
          </div>
          <div className="money-path-actions">
            <button className="primary-button fit" type="button" onClick={() => goToSection("settings")}>
              <Settings size={16} />
              Set Revenue Path
            </button>
            <button className="secondary-button compact" type="button" onClick={() => goToSection("campaign-builder")}>
              <Lightbulb size={15} />
              Generate Revenue Campaign
            </button>
          </div>
        </div>
        <div className="dashboard-grid three">
          <Panel title="Agency Revenue Score">
            <div className="money-score-card">
              <strong>{profitScore.score}</strong>
              <span>{profitScore.label}</span>
              <p>{profitScore.summary}</p>
            </div>
            <div className="profit-factor-list">
              {profitScore.factors.map((factor) => (
                <div className="profit-factor" key={factor.label}>
                  <span>{factor.label}</span>
                  <strong>{factor.value}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Best Next Move">
            <div className="producer-list">
              {weeklyMoneyPlan.map((item) => (
                <button className={cn("producer-row", item.priority)} type="button" key={item.title} onClick={() => goToSection(item.section, item.tab)}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>{item.action}</small>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Do Not Waste Time">
            <div className="money-warning-list">
              {moneyWarnings.map((warning) => (
                <div className={cn("money-warning", warning.level)} key={warning.title}>
                  <strong>{warning.title}</strong>
                  <span>{warning.detail}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="dashboard-grid two">
          <Panel title="30-Day Launch Plan">
            <div className="launch-plan-list">
              {launchPlan.map((week) => (
                <div className="launch-week" key={week.label}>
                  <strong>{week.label}</strong>
                  <span>{week.goal}</span>
                  <small>{week.action}</small>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Agency Revenue Strategy">
            <div className="money-strategy-list">
              {monetizationItems.map((item) => (
                <div className="money-strategy-item" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <Panel title="Lead-Focused Analytics">
          <div className="money-analytics-grid">
            {moneyAnalytics.map((item) => (
              <div className="money-analytics-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Agency Command Center">
          <div className="command-center-grid">
            {commandItems.map((item) => (
              <button
                className={cn("command-card", item.priority)}
                type="button"
                key={item.title}
                onClick={item.action}
              >
                <span>{item.label}</span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
        </Panel>
        <div className="dashboard-grid two">
          <Panel title="Quality Gate Queue">
            {qualityQueue.length ? (
              <div className="producer-list">
                {qualityQueue.map((item) => (
                  <button className="producer-row" type="button" key={item.project.id} onClick={() => {
                    setSelectedProjectId(item.project.id);
                    goToSection("script-lab");
                  }}>
                    <strong>{item.project.title}</strong>
                    <span>{item.status}</span>
                    <small>{item.nextAction}</small>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No quality gaps" body="Projects with scripts, packs, and final QA issues will appear here." />
            )}
          </Panel>
          <Panel title="Post-Publish Learning Loop">
            <div className="producer-list">
              {learningItems.map((item) => (
                <div className="producer-row static" key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>{item.action}</small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <div className="dashboard-grid three">
          <Panel title="Cost + Model Ledger">
            {ledgerRows.length ? (
              <div className="ledger-list">
                {ledgerRows.map((row) => (
                  <div className="ledger-row" key={`${row.label}-${row.status}`}>
                    <div>
                      <strong>{row.label}</strong>
                      <span>{row.status} · {row.generationCount} run{row.generationCount === 1 ? "" : "s"}</span>
                    </div>
                    <small>{formatCompactTokens(row.totalTokens)} · {formatCurrency(row.estimatedCost)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No generation logs yet" body="Model, token, and cost patterns appear after generated work." />
            )}
          </Panel>
          <Panel title="Title + Thumbnail Bank">
            {packagingBank.length ? (
              <div className="packaging-bank">
                {packagingBank.map((item, index) => (
                  <div className="package-memory" key={`${item.projectTitle}-${index}`}>
                    <strong>{item.title}</strong>
                    <span>{item.overlay || item.prompt}</span>
                    <small>{item.projectTitle}</small>
                  </div>
                ))}
              </div>
            ) : (
            <EmptyState title="No campaign kit memory yet" body="Create a Business Campaign Kit to collect reusable title and thumbnail tests." />
            )}
          </Panel>
          <Panel title="Channel Voice Profile">
            <div className="voice-check-grid">
              {voiceChecks.map((item) => (
                <div className={cn("voice-check", item.ready && "ready")} key={item.label}>
                  {item.ready ? <CheckCircle2 size={14} /> : <CircleSlash size={14} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="text-link" type="button" onClick={() => goToSection("settings")}>
              Edit voice profile
            </button>
          </Panel>
        </div>
        <div className="dashboard-grid two">
          <Panel title="Guided Create Flow">
            <div className="guided-create-flow">
              {[
                { label: "Choose Campaign", detail: "Pick quote campaign, client education, local SEO, renewal, review, video, podcast, article, or social/GBP content.", done: true, action: () => goToSection("campaign-builder") },
                { label: "Generate Ideas", detail: `${counts.unused} unused ideas available in this channel.`, done: counts.unused > 0, action: () => goToSection("idea-factory", "Generated Ideas") },
                { label: "Build Project", detail: `${counts.projects} project${counts.projects === 1 ? "" : "s"} created.`, done: counts.projects > 0, action: () => goToSection("projects") },
                { label: "Run Workflow", detail: `${counts.completedScripts} finished output${counts.completedScripts === 1 ? "" : "s"} ready.`, done: counts.completedScripts > 0, action: () => goToSection("script-lab") },
                { label: "Package Assets", detail: "Create campaign kits, thumbnails, article images, exports, and calls to action.", done: projects.some((project) => latestDraftForPass(project, "PUBLISHING_PACK")), action: () => goToSection("media") },
                { label: "Schedule / Publish", detail: `${counts.scheduled} scheduled item${counts.scheduled === 1 ? "" : "s"} waiting.`, done: counts.scheduled > 0 || counts.published > 0, action: () => goToSection("calendar") }
              ].map((step, index) => (
                <button className={cn("guided-step", step.done && "done")} type="button" key={step.label} onClick={step.action}>
                  <span>{step.done ? <CheckCircle2 size={16} /> : index + 1}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                </button>
              ))}
            </div>
          </Panel>
        </div>
        <Panel title="Content Pipeline Board">
          <div className="kanban-board">
            {boardColumns.map((column) => (
              <div className="kanban-column" key={column.label}>
                <div className="kanban-head">
                  <strong>{column.label}</strong>
                  <span>{column.items.length}</span>
                </div>
                <div className="kanban-items">
                  {column.items.slice(0, 4).map((item) => (
                    <button
                      className="kanban-card"
                      type="button"
                      key={item.id}
                      onClick={() => {
                        if (item.projectId) {
                          setSelectedProjectId(item.projectId);
                          goToSection("script-lab");
                        } else {
                          goToSection("idea-factory", "Idea Queue");
                        }
                      }}
                    >
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </button>
                  ))}
                  {!column.items.length ? <span className="kanban-empty">Empty</span> : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <div className="dashboard-grid two">
          <Panel title="Agency Growth Readiness">
            <div className="readiness-list">
              {readiness.map((item) => (
                <div className={cn("readiness-row", item.ready && "ready")} key={item.label}>
                  {item.ready ? <CheckCircle2 size={16} /> : <CircleSlash size={16} />}
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Saved Growth Strategy">
            <div className="blueprint-snapshot">
              <div>
                <strong>Audience</strong>
                <span>{channelBlueprintDraft.targetAudience}</span>
              </div>
              <div>
                <strong>Publishing Rhythm</strong>
                <span>{channelBlueprintDraft.publishingRhythm}</span>
              </div>
              <div>
                <strong>Thumbnail System</strong>
                <span>{channelBlueprintDraft.thumbnailStyle}</span>
              </div>
              <button className="text-link" type="button" onClick={() => goToSection("settings")}>
                Edit strategy
              </button>
            </div>
          </Panel>
        </div>
        <div className="dashboard-grid">
          <Panel title="Pipeline">
            <div className="pipeline-list">
              {[
                ["Unused", counts.unused],
                ["Saved", counts.saved],
                ["Queued", counts.queued],
                ["Produced", counts.produced],
                ["Published", counts.published],
                ["Archived", counts.archived],
                ["Rejected", counts.rejected]
              ].map(([label, value]) => (
                <div className="pipeline-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Top Categories">
            {categoryStats.length ? (
              <div className="category-list">
                {categoryStats.slice(0, 7).map((item) => (
                  <div className="category-row" key={item.label}>
                    <span>
                      {iconForCategory(item.label)}
                      {item.label}
                    </span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No category data yet" body="Generate ideas to build category insight." />
            )}
          </Panel>
          <Panel title="Recent Projects">
            {projects.length ? (
              <div className="project-mini-list">
                {projects.slice(0, 5).map((project) => (
                  <button
                    key={project.id}
                    className="project-mini"
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      goToSection("script-lab");
                    }}
                  >
                    <strong>{project.title}</strong>
                    <span>{formatProjectFormat(project.format)} · {displayProjectStatus(project.status)} · {projectTargetDisplay(project)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="No projects yet" body="Start a project from a saved or generated idea." />
            )}
          </Panel>
        </div>
      </SectionStack>
    );
  }

  function renderCampaignBuilder() {
    const { goal, asset, lane } = campaignBuilderContext();
    const rankedLanes = [...FORGE_NICHES].sort((a, b) => {
      if (b.monetizationScore !== a.monetizationScore) return b.monetizationScore - a.monetizationScore;
      return a.name.localeCompare(b.name);
    });
    const outputItems = [
      `${asset.label} generated around ${goal.label.toLowerCase()}`,
      "Business Campaign Kit with titles, description, CTA, tags, and thumbnails",
      "Macaly landing page prompt matched to the campaign angle",
      "Google Business Profile, social, email, and referral follow-up assets",
      "Texas-only compliance framing for Baxter Insurance Agency"
    ];

    return (
      <SectionStack>
        <div className="campaign-hero panel">
          <div>
            <span className="eyebrow">Guided Revenue Builder</span>
            <h2>Start with the business outcome, then let Baxter Growth Lab build the campaign around it.</h2>
            <p>
              Choose the quote, retention, referral, or local SEO outcome first. The app will carry the selected growth lane,
              asset type, CTA, audience, and Texas compliance guardrails into the Idea Factory.
            </p>
          </div>
          <div className="campaign-hero-actions">
            <button className="primary-button fit" type="button" onClick={() => void generateCampaignIdeas()} disabled={busy === "generate"}>
              {busy === "generate" ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              {busy === "generate" ? "Generating..." : "Generate Campaign Ideas"}
            </button>
            <button className="secondary-button fit" type="button" onClick={() => {
              applyCampaignBuilderTemplate();
              goToSection("idea-factory");
            }}>
              <SlidersHorizontal size={16} />
              Apply To Idea Factory
            </button>
          </div>
        </div>

        <div className="campaign-builder-grid">
          <Panel title="1. Choose The Business Goal">
            <div className="campaign-choice-list">
              {campaignGoalOptions.map((item) => (
                <button
                  className={cn("campaign-choice-card", campaignGoal === item.key && "active")}
                  key={item.key}
                  type="button"
                  onClick={() => setCampaignGoal(item.key)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  <small>{item.cta}</small>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="2. Pick The Growth Lane">
            <Field label="Texas Insurance Lane">
              <select value={campaignLaneName} onChange={(event) => setCampaignLaneName(event.target.value)}>
                {rankedLanes.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} - {item.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="campaign-lane-card">
              <div>
                <strong>{lane.name}</strong>
                <span>{lane.title}</span>
              </div>
              <div className="monetization-rank-strip forge-active-score">
                <strong>{lane.monetizationScore}/10</strong>
                <span>{agencyRevenueTierLabel(lane.monetizationTier)}</span>
              </div>
              <p>{lane.description}</p>
              <div className="keyword-cloud compact-cloud">
                {lane.keywords.slice(0, 6).map((keyword) => (
                  <span className="keyword-pill" key={keyword}>
                    <strong>{keyword}</strong>
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="3. Select The Asset">
            <div className="campaign-choice-list">
              {campaignAssetOptions.map((item) => (
                <button
                  className={cn("campaign-choice-card", campaignAsset === item.key && "active")}
                  key={item.key}
                  type="button"
                  onClick={() => setCampaignAsset(item.key)}
                >
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                  <small>{item.length}</small>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="dashboard-grid two">
          <Panel title="Business Campaign Kit Preview">
            <div className="campaign-output-list">
              {outputItems.map((item) => (
                <div className="campaign-output-item" key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Conversion Guardrails">
            <div className="business-fit-strip large">
              <span className="business-fit-chip high">Quote intent: High</span>
              <span className="business-fit-chip high">Texas only</span>
              <span className="business-fit-chip medium">Carrier fit: {lane.name}</span>
              <span className="business-fit-chip medium">CTA: Call or request quote</span>
            </div>
            <div className="campaign-summary-copy">
              <strong>{goal.goal}</strong>
              <span>{goal.offer}</span>
              <small>{goal.cta}</small>
            </div>
            <div className="inline-actions">
              <button className="primary-button fit" type="button" onClick={() => void generateCampaignIdeas()} disabled={busy === "generate"}>
                {busy === "generate" ? <Loader2 size={16} className="spin" /> : <Lightbulb size={16} />}
                Generate Ideas
              </button>
              <button className="secondary-button fit" type="button" onClick={() => goToSection("projects")}>
                <FolderKanban size={16} />
                Open Projects
              </button>
            </div>
          </Panel>
        </div>
      </SectionStack>
    );
  }

  function renderIdeaFactory() {
    const modeCopy = contentModeFormCopy(contentMode);
    const goalOptions = businessGoalOptionsForContentMode(contentMode, businessGoal);

    return (
      <div className="main-grid">
        <section className="left-stack">
          <div className="panel pad" id="project-brief">
            <h2 className="panel-title">Generate New Ideas</h2>
            <Field label="Content Mode">
              <div className="format-choice-grid">
                {contentModeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("format-choice", contentMode === option.value && "active")}
                      onClick={() => changeContentMode(option.value)}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Project Type">
              <div className="format-choice-grid">
                {projectFormatOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn("format-choice", projectFormat === option.value && "active")}
                      onClick={() => {
                        setProjectFormat(option.value);
                        setDesiredLength(defaultTargetLabelForFormat(option.value));
                      }}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="forge-lane-panel">
              <div>
                <span>Active Insurance Lane</span>
                <strong>{currentForgeNiche?.name || currentChannel?.name || niche}</strong>
              </div>
              <p>{currentForgeNiche?.description || "Ideas will be generated inside the selected growth lane."}</p>
              {currentForgeNiche ? (
                <div className="monetization-rank-strip forge-active-score">
                  <strong>{currentForgeNiche.monetizationScore}/10</strong>
                  <span>{agencyRevenueTierLabel(currentForgeNiche.monetizationTier)}</span>
                  {currentForgeNicheRank ? <small>Rank #{currentForgeNicheRank}</small> : null}
                </div>
              ) : null}
              {currentForgeNiche ? (
                <div className="keyword-cloud compact-cloud">
                  {currentForgeNiche.keywords.slice(0, 4).map((keyword) => (
                    <span className="keyword-pill" key={keyword}>
                      <strong>{keyword}</strong>
                    </span>
                  ))}
                </div>
              ) : null}
              <small>Switch the growth lane in the top bar to generate inside a different Texas insurance pack.</small>
            </div>
            <Field label={modeCopy.nicheLabel}>
              <input
                value={niche}
                onChange={(event) => setNiche(event.target.value)}
                placeholder={modeCopy.nichePlaceholder}
              />
            </Field>
            <div className="business-context-grid">
              <Field label={modeCopy.audienceLabel}>
                <input
                  value={businessAudience}
                  onChange={(event) => setBusinessAudience(event.target.value)}
                  placeholder={modeCopy.audiencePlaceholder}
                />
              </Field>
              <Field label={modeCopy.locationLabel}>
                <input
                  value={businessLocation}
                  onChange={(event) => setBusinessLocation(event.target.value)}
                  placeholder={modeCopy.locationPlaceholder}
                />
              </Field>
              <Field label={modeCopy.offerLabel}>
                <input
                  value={businessOffer}
                  onChange={(event) => setBusinessOffer(event.target.value)}
                  placeholder={modeCopy.offerPlaceholder}
                />
              </Field>
              <Field label={modeCopy.goalLabel}>
                <select value={businessGoal} onChange={(event) => setBusinessGoal(event.target.value)}>
                  {goalOptions.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label={modeCopy.ctaLabel}>
                <input
                  value={businessCta}
                  onChange={(event) => setBusinessCta(event.target.value)}
                  placeholder={modeCopy.ctaPlaceholder}
                />
              </Field>
              <Field label={modeCopy.boundariesLabel}>
                <textarea
                  className="short-textarea"
                  value={businessCompliance}
                  onChange={(event) => setBusinessCompliance(event.target.value)}
                  placeholder={modeCopy.boundariesPlaceholder}
                />
              </Field>
            </div>
            <Field label="Tone">
              <select value={tone} onChange={(event) => setTone(event.target.value)}>
                {toneOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select value={generateCategory} onChange={(event) => setGenerateCategory(event.target.value)}>
                {categoryOptionsForContentMode(contentMode, generateCategory).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label={projectFormat === "ARTICLE" || projectFormat === "SHORT_BOOK" || projectFormat === "LONG_BOOK" ? "Target Size" : "Desired Length"}>
              <select value={desiredLength} onChange={(event) => setDesiredLength(event.target.value)}>
                {targetSizeOptionsForFormat(projectFormat).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
            <Field label="Source Type">
              <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                {sourceTypeOptionsForContentMode(contentMode, sourceType).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Number of Ideas">
              <div className="count-grid">
                {[5, 10, 20, 50].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={cn("count-button", ideaCount === count && "active")}
                    onClick={() => setIdeaCount(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Discovery Model">
              <div className="field-control-row">
                <select value={settings.discoveryModel} onChange={(event) => updateDiscoveryModel(event.target.value)} disabled={loadingModels && !openRouterModels.length}>
                  {!openRouterModels.some((model) => model.id === settings.discoveryModel) ? (
                    <option value={settings.discoveryModel}>{settings.discoveryModel} (saved model ID)</option>
                  ) : null}
                  {!openRouterModels.length ? (
                    <option value={settings.discoveryModel}>{loadingModels ? "Loading OpenRouter models..." : "No OpenRouter models loaded"}</option>
                  ) : null}
                  {openRouterModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {modelOptionLabel(model)}
                    </option>
                  ))}
                </select>
                <button className="secondary-button icon-only" type="button" onClick={() => void loadOpenRouterModels(true)} disabled={loadingModels} aria-label="Refresh OpenRouter models">
                  {loadingModels ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
                </button>
              </div>
              {modelsFetchedAt ? <small className="field-hint">OpenRouter catalog refreshed {formatDateTime(modelsFetchedAt)}.</small> : null}
              {modelListError ? <small className="field-hint warning-text">{modelListError}</small> : null}
            </Field>
            <div className="toggle-row">
              <div>
                <strong>Auto Model Routing</strong>
                <span>Use saved routing defaults for each generation task</span>
              </div>
              <button
                type="button"
                className={cn("switch", settings.autoModelRouting && "on")}
                onClick={() => setSettings((current) => ({ ...current, autoModelRouting: !current.autoModelRouting }))}
                aria-label="Toggle auto model routing"
              >
                <span />
              </button>
            </div>
            <button className="primary-button" type="button" onClick={() => void generateIdeas()} disabled={busy === "generate"}>
              {busy === "generate" ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
              {busy === "generate" ? "Generating..." : "Generate Ideas"}
            </button>
            <small className="generate-time">Ideas are saved and checked against used story history.</small>
          </div>

          <Panel title="Top Categories">
            {categoryStats.length ? (
              <div className="category-list">
                {categoryStats.slice(0, 6).map((item) => (
                  <div className="category-row" key={item.label}>
                    <span>
                      {iconForCategory(item.label)}
                      {item.label}
                    </span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No ideas yet" body="Generate a batch to populate this list." />
            )}
          </Panel>
        </section>

        <section className="center-stack">
          <div className="tabs">
            {tabs.map(({ label, count, icon: Icon }) => (
              <button
                key={label}
                className={cn("tab", activeTab === label && "active")}
                onClick={() => setActiveTab(label)}
                type="button"
              >
                <Icon size={16} />
                {label}
                <span className="badge">{count}</span>
              </button>
            ))}
          </div>

          <div className="filterbar">
            <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} className="field-select">
              {categoryOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select value={scoreFilter} onChange={(event) => setScoreFilter(event.target.value)} className="field-select">
              <option>All Scores</option>
              <option>90+</option>
              <option>80+</option>
            </select>
            <select value={lengthFilter} onChange={(event) => setLengthFilter(event.target.value)} className="field-select">
              <option>All Lengths</option>
              {storyLengthOptions.map((item) => (
                <option key={item.minutes}>{item.label}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="field-select">
              <option>All Statuses</option>
              {["Unused", "Saved", "In Progress", "Drafted", "Produced", "Published", "Archived", "Rejected"].map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <div className="searchbox">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ideas..." />
              <Search size={16} />
            </div>
            <button className="filter-button" type="button" onClick={() => setMessage(`${filteredIdeas.length} ideas match the current filters.`)}>
              <Filter size={15} />
              Filters
            </button>
            <button
              className="filter-button danger-button"
              type="button"
              onClick={() => void deleteAllIdeas()}
              disabled={!ideas.length || busy === "delete-all-ideas"}
              title="Delete all ideas in this channel"
            >
              {busy === "delete-all-ideas" ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
              Delete All
            </button>
          </div>

          <div className="panel idea-table">
            <div className="idea-list-head">
              <div>Rank</div>
              <div>Story idea</div>
              <div>Details</div>
            </div>
            {filteredIdeas.length ? (
              filteredIdeas.map((idea, index) => (
                <div className="idea-row" key={idea.id}>
                  <div className="rank-cell">
                    <span className="rank-number">{index + 1}</span>
                    <button
                      type="button"
                      className={cn("star-button", idea.status === "SAVED" && "saved")}
                      onClick={() => void toggleSaved(idea)}
                      aria-label={idea.status === "SAVED" ? "Unsave idea" : "Save idea"}
                    >
                      <Star size={16} fill={idea.status === "SAVED" ? "currentColor" : "none"} />
                    </button>
                    <span className="score-cell">{idea.totalScore}</span>
                  </div>
                  <div className="idea-copy">
                    <div className="idea-title">{idea.title}</div>
                    <div className="idea-hook">{idea.hook}</div>
                    <div className="idea-recommendation">
                      <span>Best fit</span>
                      <strong>{lengthLabel(idea)}</strong>
                      <span>{idea.recommendedTone || tone}</span>
                      <span>{idea.recommendedNarrationStyle || settings.narrationStyle}</span>
                      <span className={cn("depth-chip", depthStrengthClass(idea.lengthPotentialScore))}>
                        Depth: {depthStrengthLabel(idea.lengthPotentialScore)}
                      </span>
                    </div>
                    {renderEpisodeFit(idea)}
                    <div className="business-fit-strip">
                      {businessFitBadgesForIdea(idea).map((badge) => (
                        <span className={cn("business-fit-chip", badge.level)} key={badge.label}>
                          {badge.label}
                        </span>
                      ))}
                    </div>
                    {renderIdeaPowerPack(idea)}
                  </div>
                  <div className="idea-fit-cell">
                    <span className="category-chip">
                      {iconForCategory(idea.category)}
                      {idea.category}
                    </span>
                    <span className="meta-chip">
                      <CalendarDays size={13} />
                      {lengthLabel(idea)}
                    </span>
                    <span className={cn("priority", idea.productionPriority.toLowerCase())}>
                      <span className="dot" />
                      {idea.productionPriority}
                    </span>
                  </div>
                  <div className="quality-cell" title="Originality, curiosity, emotional pull, escalation">
                    <div className="score-breakdown">
                      {[
                        ["Orig.", idea.originalityScore],
                        ["Cur.", idea.curiosityScore],
                        ["Emo.", idea.emotionalScore],
                        ["Esc.", idea.escalationScore]
                      ].map(([label, score]) => (
                        <span className="mini-score" key={`${idea.id}-${label}`}>
                          <span>{label}</span>
                          <strong>{score}</strong>
                        </span>
                      ))}
                    </div>
                    <span className={cn("status-chip", statusClass(idea.status))}>{displayStatus(idea.status)}</span>
                  </div>
                  <div className="row-actions">
                    {isUsedStatus(idea.status) ? (
                      <button
                        className="row-action reactivate-action"
                        type="button"
                        onClick={() => void reactivateIdea(idea)}
                        disabled={busy === `idea-${idea.id}-SAVED`}
                        aria-label="Reactivate idea"
                        title="Reactivate this idea and save it to your queue"
                      >
                        {busy === `idea-${idea.id}-SAVED` ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                        <span>Reactivate</span>
                      </button>
                    ) : (
                      <>
                        <button
                          className="row-action primary build-action"
                          type="button"
                          onClick={() => void startProject(idea)}
                          aria-label="Build with this idea"
                          disabled={busy === `project-${idea.id}-${projectFormat}`}
                        >
                          {busy === `project-${idea.id}-${projectFormat}` ? <Loader2 size={14} className="spin" /> : <Play size={14} fill="currentColor" />}
                          <span>Build</span>
                        </button>
                        {recommendedSeriesFormat(idea) ? (
                          <button
                            className="row-action build-action"
                            type="button"
                            onClick={() => void startProject(idea, "EPISODIC_SERIES")}
                            aria-label="Build episodic series with this idea"
                            disabled={busy === `project-${idea.id}-EPISODIC_SERIES`}
                            title={`Build as ${idea.bestFormat || "episodic series"}`}
                          >
                            {busy === `project-${idea.id}-EPISODIC_SERIES` ? <Loader2 size={14} className="spin" /> : <CalendarDays size={14} />}
                            <span>Build Series</span>
                          </button>
                        ) : null}
                        <button
                          className="row-action used-action"
                          type="button"
                          onClick={() => void markIdeaUsed(idea)}
                          disabled={busy === `idea-${idea.id}-ARCHIVED`}
                          aria-label="Mark idea as used"
                          title="Move to Used Ideas and keep out of future batches"
                        >
                          {busy === `idea-${idea.id}-ARCHIVED` ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                          <span>Mark Used</span>
                        </button>
                      </>
                    )}
                    <div className="secondary-row-actions">
                      <button
                        className="row-action"
                        type="button"
                        onClick={() => void toggleSaved(idea)}
                        aria-label={idea.status === "SAVED" ? "Unsave idea" : "Save idea"}
                        title={idea.status === "SAVED" ? "Unsave idea" : "Save idea"}
                      >
                        <Bookmark size={15} fill={idea.status === "SAVED" ? "currentColor" : "none"} />
                      </button>
                      <button className="row-action danger" type="button" onClick={() => void updateIdeaStatus(idea.id, "REJECTED", `"${idea.title}" rejected.`)} aria-label="Reject idea" title="Reject idea">
                        <CircleSlash size={15} />
                      </button>
                      <button
                        className="row-action danger"
                        type="button"
                        onClick={() => void deleteIdea(idea)}
                        disabled={busy === `delete-${idea.id}`}
                        aria-label="Delete idea"
                        title="Delete idea"
                      >
                        {busy === `delete-${idea.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <EmptyTable title="No ideas in this view" body="Generate ideas or loosen the filters to fill the table." />
            )}
            <div className="table-footer">
              <span>Showing {filteredIdeas.length} of {ideas.length} ideas</span>
              <button className="text-link" type="button" onClick={() => void loadAppData()}>
                Refresh
              </button>
            </div>
          </div>
        </section>

        <aside className="right-stack">
          <Panel
            title={
              <>
                <ShieldCheck size={18} />
                Duplicate Prevention
              </>
            }
          >
            <div className="checklist">
              <div className="check-block">
                <h3>Exact Match Check</h3>
                <div className="check-line">
                  <CheckCircle2 size={16} color="#15945f" />
                  Stored ideas are checked by title before saving.
                </div>
              </div>
              <div className="check-block">
                <h3>Used Status Check</h3>
                <div className="check-line" style={{ color: usedIdeas.length ? "#a95e00" : "#314044" }}>
                  <ShieldCheck size={16} color={usedIdeas.length ? "#e6a100" : "#15945f"} />
                  {usedIdeas.length ? `${usedIdeas.length} used ideas protected.` : "No used ideas yet."}
                </div>
                <div className="match-box">
                  <span>Default behavior</span>
                  <strong>Produced, published, and archived ideas stay out of new batches.</strong>
                  <span>Manual reactivation is available from the Used Ideas view.</span>
                </div>
                <button
                  className="disabled-action"
                  type="button"
                  disabled={!overrideEnabled}
                  onClick={() => setMessage("Manual duplicate override is enabled for review.")}
                >
                  Continue Anyway
                </button>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => {
                    setOverrideEnabled((value) => !value);
                    setMessage(overrideEnabled ? "Duplicate override disabled." : "Manual duplicate override enabled.");
                  }}
                >
                  Reactivate Similar Ideas
                </button>
              </div>
            </div>
          </Panel>

          <Panel title={`Saved Idea Queue (${savedQueue.length})`}>
            <div className="queue-list">
              {savedQueue.slice(0, 5).map((idea) => (
                <div className="queue-row" key={idea.id}>
                  <span>{idea.title}</span>
                  <span className="text-link">{displayStatus(idea.status)}</span>
                </div>
              ))}
              {!savedQueue.length ? <EmptyState title="Queue empty" body="Save ideas or start projects to build the queue." compact /> : null}
              <button className="text-link" type="button" onClick={() => goToSection("idea-factory", "Idea Queue")}>
                View full queue
              </button>
            </div>
          </Panel>

          <Panel title="Ideas This Week">
            <div className="weekly-stats">
              <div>
                <strong>{counts.total}</strong>
                <span>Total</span>
              </div>
              <div>
                <strong>{counts.saved}</strong>
                <span>Saved</span>
              </div>
              <div>
                <strong>{counts.inProgress}</strong>
                <span>Started</span>
              </div>
              <div>
                <strong>{counts.publishThisWeek}</strong>
                <span>Used</span>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
    );
  }

  function renderProjects() {
    return (
      <SectionStack>
        <div className="action-strip">
          <button className="primary-button fit" type="button" onClick={() => goToSection("idea-factory", "Saved Ideas")}>
            <Star size={16} />
            Start From Saved Idea
          </button>
          <button className="secondary-button" type="button" onClick={() => goToSection("script-lab")}>
            <FileText size={16} />
            Open Content Lab
          </button>
        </div>
        <PublishingStatusLegend />
        <div className="panel data-panel">
          <div className="data-row data-head project-row">
            <div>Project</div>
            <div>Type</div>
            <div>Status</div>
            <div>Length</div>
            <div>Latest Output</div>
            <div>Actions</div>
          </div>
          {projects.length ? (
            projects.map((project) => {
              const readiness = projectReadinessState(project, publishingSlots);
              return (
              <div className="data-row project-row" key={project.id}>
                <div>
                  <strong>{project.title}</strong>
                  <span>{project.storyIdea?.hook || "Ready for the guided workflow."}</span>
                  <div className="business-fit-strip compact">
                    {businessFitBadgesForIdea(project.storyIdea).map((badge) => (
                      <span className={cn("business-fit-chip", badge.level)} key={badge.label}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <span className={cn("format-chip", projectFormatClass(project.format))}>{formatProjectFormat(project.format)}</span>
                </div>
                <div>
                  <span className={cn("status-chip", projectStatusClass(project.status))}>{displayProjectStatus(project.status)}</span>
                  <span className={cn("readiness-pill inline", readiness.className)} title={readiness.detail}>{readiness.label}</span>
                  <small className="status-helper">{projectStatusHelp(project.status)}</small>
                </div>
                <div>{projectTargetDisplay(project)}</div>
                <div>{project.drafts?.[0] ? `${passLabelForProject(project.drafts[0].passType, project.format)} v${project.drafts[0].version}` : "No outputs yet"}</div>
                <div className="inline-actions">
                  <button
                    className="secondary-button compact"
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      goToSection("script-lab");
                    }}
                  >
                    <FileText size={15} />
                    Open Lab
                  </button>
                  <a className="secondary-button compact" href={apiPath(`/api/export/${project.id}?format=md`)}>
                    <Download size={15} />
                    Export
                  </a>
                  {hasPublishableScript(project) ? (
                    <a className="secondary-button compact" href={apiPath(`/api/projects/${project.id}/content-pack`)}>
                      <Download size={15} />
                      Content Pack
                    </a>
                  ) : null}
                  {hasPublishableScript(project) && supportsBookExport(project) ? (
                    <>
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(project, "pdf")}>
                        <BookOpen size={15} />
                        Book PDF
                      </button>
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(project, "epub")}>
                        <BookOpen size={15} />
                        Kindle EPUB
                      </button>
                    </>
                  ) : null}
                  {canScheduleOneOffProject(project, publishingSlots) ? (
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => void scheduleProjectInCalendar(project)}
                      disabled={busy === `schedule-project-${project.id}`}
                    >
                      {busy === `schedule-project-${project.id}` ? <Loader2 size={15} className="spin" /> : <CalendarDays size={15} />}
                      Schedule In Calendar
                    </button>
                  ) : project.format !== "EPISODIC_SERIES" && projectHasCalendarSlot(project, publishingSlots) ? (
                    <button className="secondary-button compact" type="button" disabled>
                      <CalendarDays size={15} />
                      Scheduled
                    </button>
                  ) : project.format !== "EPISODIC_SERIES" && project.status === "PUBLISHED" ? (
                    <button className="secondary-button compact" type="button" disabled title="Published content is already live. Reactivate it before scheduling again.">
                      <Globe2 size={15} />
                      Already Published
                    </button>
                  ) : project.format !== "EPISODIC_SERIES" && project.status === "ARCHIVED" ? (
                    <button className="secondary-button compact" type="button" disabled title="Archived content must be reactivated before scheduling.">
                      <Archive size={15} />
                      Archived
                    </button>
                  ) : null}
                  {hasPublishableScript(project) && project.status !== "PUBLISHED" && project.status !== "ARCHIVED" ? (
                    <button
                      className="secondary-button compact publish-button"
                      type="button"
                      onClick={() => void updateProjectStatus(project, "PUBLISHED")}
                      disabled={busy === `project-status-${project.id}-PUBLISHED`}
                    >
                      {busy === `project-status-${project.id}-PUBLISHED` ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
                      Mark Published
                    </button>
                  ) : null}
                  {hasPublishableScript(project) && project.status !== "PRODUCED" && project.status !== "PUBLISHED" && project.status !== "ARCHIVED" ? (
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => void updateProjectStatus(project, "PRODUCED")}
                      disabled={busy === `project-status-${project.id}-PRODUCED`}
                    >
                      {busy === `project-status-${project.id}-PRODUCED` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      Mark Produced
                    </button>
                  ) : null}
                  <button
                    className="secondary-button compact danger-button"
                    type="button"
                    onClick={() => void deleteProject(project)}
                    disabled={busy === `delete-project-${project.id}`}
                  >
                    {busy === `delete-project-${project.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                    Delete
                  </button>
                </div>
              </div>
              );
            })
          ) : (
            <EmptyTable title="No content projects yet" body="Start a project from an idea in the Idea Factory." />
          )}
        </div>
      </SectionStack>
    );
  }

  function renderScriptLab() {
    const projectDrafts = selectedProject?.drafts ?? [];
    const hasPass = (passType: ScriptPassType) => projectDrafts.some((draft) => draft.passType === passType);
    const hasIntro = hasPass("INTRO");
    const thumbnailCount = thumbnailAssetsForProject(selectedProject).length;
    const requiredThumbnailCount = selectedProject && projectHasEpisodePlan(selectedProject) ? 15 : 3;
    const hasSourceMaterial = Boolean(sourceMaterial.trim() || selectedProject?.sourceMaterial?.trim());
    const isEpisodicProject = selectedProject?.format === "EPISODIC_SERIES";
    const isArticleProject = selectedProject?.format === "ARTICLE";
    const isPodcastProject = selectedProject?.format === "PODCAST_EPISODE";
    const isShortBookProject = selectedProject?.format === "SHORT_BOOK";
    const isLongBookProject = selectedProject?.format === "LONG_BOOK";
    const isBookProject = isShortBookProject || isLongBookProject;
    const canPlanEpisodes = supportsEpisodePlanning(selectedProject);
    const canCreateThumbnails = supportsThumbnails(selectedProject);
    const canCreateBookIllustrations = supportsBookIllustrations(selectedProject);
    const bookIllustrationMode: BookIllustrationMode = selectedProject ? bookIllustrationModeByProjectId[selectedProject.id] ?? "CHAPTER_OPENERS" : "CHAPTER_OPENERS";
    const bookIllustrationMax = selectedProject ? bookIllustrationMaxByProjectId[selectedProject.id] ?? defaultBookIllustrationMax(selectedProject.format, bookIllustrationMode) : 8;
    const bookIllustrationModel = selectedProject ? bookIllustrationModelByProjectId[selectedProject.id] ?? DEFAULT_BOOK_ILLUSTRATION_MODEL : DEFAULT_BOOK_ILLUSTRATION_MODEL;
    const selectedBookIllustrationModel = getBookIllustrationModelOption(bookIllustrationModel);
    const bookIllustrationPlan = selectedProject ? bookIllustrationPlansByProjectId[selectedProject.id] : undefined;
    const bookIllustrationCount = canCreateBookIllustrations ? selectedProject?.thumbnails?.filter(isBookIllustrationAsset).length ?? 0 : 0;
    const sceneBackgroundCount = sceneBackgroundAssetsForProject(selectedProject).length;
    const requiredSceneBackgroundCount = sceneBackgroundPromptCount(selectedProject);
    const bookIllustrationReady = hasPass("FINAL");
    const workflowNumberOffset = isEpisodicProject ? 1 : 0;
    const workflowNoun = projectOutputNoun(selectedProject?.format);
    const selectedProjectCalendarSlot = selectedProject ? calendarSlotForProject(selectedProject, publishingSlots) : undefined;
    const latestPublishingPackDraft = selectedProject ? latestDraftForPass(selectedProject, "PUBLISHING_PACK") : undefined;
    const latestPublishingPackSource = latestDraft?.passType === "PUBLISHING_PACK" ? latestDraft : latestPublishingPackDraft;
    const latestPublishingPack = latestPublishingPackSource
      ? parseClientPublishingPack(latestPublishingPackSource.content, {
          title: selectedProject?.title,
          sponsorBlurb,
          sponsorLink,
          summary: selectedProject?.storyIdea?.summary,
          hook: selectedProject?.storyIdea?.hook,
          targetLengthMinutes: selectedProject?.targetLengthMinutes,
          format: selectedProject?.format
        })
      : null;
    const scriptIntentLock = selectedProject
      ? mergeScriptIntentLock(selectedProject, channelBlueprintDraft, scriptIntentLocksByProjectId[selectedProject.id])
      : null;
    const selectedOpeningKey = selectedProject ? scriptOpeningByProjectId[selectedProject.id] ?? "texas-scenario" : "texas-scenario";
    const selectedOpening = scriptOpeningOptions.find((item) => item.key === selectedOpeningKey) ?? scriptOpeningOptions[1];
    const ctaCheck = selectedProject && scriptIntentLock ? ctaStrengthCheck(selectedProject, scriptIntentLock, sponsorBlurb, sponsorLink, latestPublishingPack) : null;
    const landingPageMatch = selectedProject && scriptIntentLock ? landingPageMatchForProject(selectedProject, scriptIntentLock) : null;
    const latestEpisodeSections = selectedProject && latestDraft && latestDraft.passType !== "PUBLISHING_PACK" && projectHasEpisodePlan(selectedProject)
      ? parseEpisodeOutputSections(latestDraft.content)
      : [];
    const canCreateArticleImages = isArticleProject;
    const articleImagePlanCount = latestPublishingPack?.seoPack?.imagePlan.length ?? 0;
    const articleImageCount = isArticleProject ? selectedProject?.thumbnails?.filter(isArticleImageAsset).length ?? 0 : 0;
    const outputAssets = selectedProject ? displayAssetsForProject(selectedProject) : [];
    const selectedEpisodeCount = selectedProject ? episodeCountForProject(selectedProject) : 1;
    const outputAssetLimit = selectedProject && projectHasEpisodePlan(selectedProject) ? selectedEpisodeCount * 3 : canCreateBookIllustrations ? 12 : isArticleProject ? 8 : 6;
    const outputAssetLabel = assetResultsLabel(selectedProject);
    const qualityScorecard = selectedProject ? qualityScorecardForProject(selectedProject) : null;
    const claimLedger = selectedProject ? claimLedgerForProject(selectedProject) : null;
    const contentStrength = selectedProject ? contentStrengthProfile(selectedProject.storyIdea, selectedProject) : null;
    const episodeWorkflowStep = {
      id: "episodes",
      number: 4,
      title: "Episodes",
      description: `Plans ${selectedEpisodeCount} deep ${selectedProject?.targetLengthMinutes ?? 30}-minute episodes and under-covered angles.`,
      complete: hasPass("EPISODES"),
      enabled: Boolean(selectedProject),
      busyKey: "pass-EPISODES",
      errorKey: "pass-EPISODES",
      actionLabel: hasPass("EPISODES") ? "Rerun Episodes" : "Plan Episodes",
      action: () => void generateProjectPass("EPISODES")
    };
    const workflowSteps = [
      {
        id: "intro",
        number: 1,
        title: isArticleProject ? "Lead" : isPodcastProject ? "Podcast Intro" : isBookProject ? "Preface" : "Intro",
        description: isArticleProject ? "One strong opening paragraph with a clear agency CTA path." : isPodcastProject ? "One human opening paragraph for the listener with a clear agency CTA path." : isBookProject ? "One concise reader-facing preface." : "One human opening paragraph with a clear agency CTA path.",
        complete: hasPass("INTRO"),
        enabled: Boolean(selectedProject),
        busyKey: "pass-INTRO",
        errorKey: "pass-INTRO",
        actionLabel: hasPass("INTRO") ? `Rerun ${isArticleProject ? "Lead" : isBookProject ? "Preface" : "Intro"}` : `Write ${isArticleProject ? "Lead" : isBookProject ? "Preface" : "Intro"}`,
        action: () => void generateProjectPass("INTRO")
      },
      {
        id: "research",
        number: 2,
        title: "Research",
        description: "Source notes, open questions, and fact-checking targets.",
        complete: hasSourceMaterial,
        enabled: hasIntro,
        busyKey: selectedProject ? `research-${selectedProject.id}` : "research",
        errorKey: "research",
        actionLabel: hasSourceMaterial ? "Update Research" : "Run Research",
        action: () => void researchSourceMaterial()
      },
      {
        id: "dossier",
        number: 3,
        title: "Dossier",
        description: "Fact ledger, timeline, source leads, and uncertainty boundaries.",
        complete: hasPass("DOSSIER"),
        enabled: hasIntro && hasSourceMaterial,
        busyKey: "pass-DOSSIER",
        errorKey: "pass-DOSSIER",
        actionLabel: hasPass("DOSSIER") ? "Rerun Dossier" : "Create Dossier",
        action: () => void generateProjectPass("DOSSIER")
      },
      {
        id: "analytics-brief",
        number: 4,
        title: "Analytics Brief",
        description: "Turns connected YouTube performance into script instructions.",
        complete: hasPass("ANALYTICS_BRIEF"),
        enabled: hasPass("DOSSIER"),
        busyKey: "pass-ANALYTICS_BRIEF",
        errorKey: "pass-ANALYTICS_BRIEF",
        actionLabel: hasPass("ANALYTICS_BRIEF") ? "Rerun Analytics Brief" : "Create Analytics Brief",
        action: () => void generateProjectPass("ANALYTICS_BRIEF")
      },
      ...(isEpisodicProject ? [episodeWorkflowStep] : []),
      ...(isEpisodicProject ? [{
        id: "series-bible",
        number: 5,
        title: "Series Bible",
        description: "Season arc, continuity, episode promises, and spoiler rules.",
        complete: hasPass("SERIES_BIBLE"),
        enabled: hasPass("EPISODES"),
        busyKey: "pass-SERIES_BIBLE",
        errorKey: "pass-SERIES_BIBLE",
        actionLabel: hasPass("SERIES_BIBLE") ? "Rerun Series Bible" : "Create Series Bible",
        action: () => void generateProjectPass("SERIES_BIBLE")
      }] : []),
      {
        id: "hook-lab",
        number: 4 + workflowNumberOffset,
        title: "Hook Lab",
        description: "Scores hooks and automatically selects the strongest cold open.",
        complete: hasPass("HOOK_LAB"),
        enabled: isEpisodicProject ? hasPass("SERIES_BIBLE") : hasPass("ANALYTICS_BRIEF"),
        busyKey: "pass-HOOK_LAB",
        errorKey: "pass-HOOK_LAB",
        actionLabel: hasPass("HOOK_LAB") ? "Rerun Hook Lab" : "Pick Best Hook",
        action: () => void generateProjectPass("HOOK_LAB")
      },
      {
        id: "story-spine",
        number: 5 + workflowNumberOffset,
        title: "Story Spine",
        description: "Central question, emotional promise, main mystery, and payoff.",
        complete: hasPass("STORY_SPINE"),
        enabled: hasPass("HOOK_LAB"),
        busyKey: "pass-STORY_SPINE",
        errorKey: "pass-STORY_SPINE",
        actionLabel: hasPass("STORY_SPINE") ? "Rerun Spine" : "Lock Story Spine",
        action: () => void generateProjectPass("STORY_SPINE")
      },
      {
        id: "structure",
        number: 6 + workflowNumberOffset,
        title: "Structure",
        description: "Narrative arc, reveal order, curiosity gaps, and beat map.",
        complete: hasPass("STRUCTURE"),
        enabled: hasPass("STORY_SPINE"),
        busyKey: "pass-STRUCTURE",
        errorKey: "pass-STRUCTURE",
        actionLabel: hasPass("STRUCTURE") ? "Rerun Structure" : "Create Structure",
        action: () => void generateProjectPass("STRUCTURE")
      },
      {
        id: "retention-map",
        number: 7 + workflowNumberOffset,
        title: "Retention Map",
        description: "Open loops, mini payoffs, reversals, and pacing checkpoints.",
        complete: hasPass("RETENTION_MAP"),
        enabled: hasPass("STRUCTURE"),
        busyKey: "pass-RETENTION_MAP",
        errorKey: "pass-RETENTION_MAP",
        actionLabel: hasPass("RETENTION_MAP") ? "Rerun Retention Map" : "Map Retention Beats",
        action: () => void generateProjectPass("RETENTION_MAP")
      },
      {
        id: "length-governor",
        number: 8 + workflowNumberOffset,
        title: "Length Governor",
        description: "Sets section word budgets for the selected runtime before drafting.",
        complete: hasPass("SCRIPT_LENGTH_GOVERNOR"),
        enabled: hasPass("RETENTION_MAP"),
        busyKey: "pass-SCRIPT_LENGTH_GOVERNOR",
        errorKey: "pass-SCRIPT_LENGTH_GOVERNOR",
        actionLabel: hasPass("SCRIPT_LENGTH_GOVERNOR") ? "Rerun Length Plan" : "Plan Runtime",
        action: () => void generateProjectPass("SCRIPT_LENGTH_GOVERNOR")
      },
      {
        id: "open-loop-ledger",
        number: 9 + workflowNumberOffset,
        title: "Open Loop Ledger",
        description: "Tracks questions, payoffs, cliffhangers, and title promise delivery.",
        complete: hasPass("OPEN_LOOP_LEDGER"),
        enabled: hasPass("SCRIPT_LENGTH_GOVERNOR"),
        busyKey: "pass-OPEN_LOOP_LEDGER",
        errorKey: "pass-OPEN_LOOP_LEDGER",
        actionLabel: hasPass("OPEN_LOOP_LEDGER") ? "Rerun Loop Ledger" : "Build Loop Ledger",
        action: () => void generateProjectPass("OPEN_LOOP_LEDGER")
      },
      {
        id: "draft",
        number: 8 + workflowNumberOffset,
        title: isArticleProject ? "Article Draft" : isPodcastProject ? "Podcast Draft" : isBookProject ? "Book Draft" : "Draft",
        description: `Full ${workflowNoun} draft for the selected project.`,
        complete: hasPass("DRAFT"),
        enabled: hasPass("OPEN_LOOP_LEDGER"),
        busyKey: "pass-DRAFT",
        errorKey: "pass-DRAFT",
        actionLabel: hasPass("DRAFT") ? "Rerun Draft" : `Write ${isArticleProject ? "Article" : isPodcastProject ? "Podcast" : isBookProject ? "Book" : "Draft"}`,
        action: () => void generateProjectPass("DRAFT")
      },
      {
        id: "retention-analysis",
        number: 9 + workflowNumberOffset,
        title: "Retention Analysis",
        description: "Scores the actual draft for drop-off risk and payoff density.",
        complete: hasPass("RETENTION_ANALYSIS"),
        enabled: hasPass("DRAFT"),
        busyKey: "pass-RETENTION_ANALYSIS",
        errorKey: "pass-RETENTION_ANALYSIS",
        actionLabel: hasPass("RETENTION_ANALYSIS") ? "Rerun Analysis" : "Analyze Retention",
        action: () => void generateProjectPass("RETENTION_ANALYSIS")
      },
      {
        id: "critique",
        number: 9 + workflowNumberOffset,
        title: "Critique",
        description: "Retention risk, weak sections, clarity, and pacing notes.",
        complete: hasPass("CRITIQUE"),
        enabled: hasPass("RETENTION_ANALYSIS"),
        busyKey: "pass-CRITIQUE",
        errorKey: "pass-CRITIQUE",
        actionLabel: hasPass("CRITIQUE") ? "Rerun Critique" : "Run Critique",
        action: () => void generateProjectPass("CRITIQUE")
      },
      {
        id: "fact-check",
        number: 10 + workflowNumberOffset,
        title: "Fact Check",
        description: "Unsupported claims, continuity issues, and factual safety fixes.",
        complete: hasPass("FACT_CHECK"),
        enabled: hasPass("CRITIQUE"),
        busyKey: "pass-FACT_CHECK",
        errorKey: "pass-FACT_CHECK",
        actionLabel: hasPass("FACT_CHECK") ? "Rerun Fact Check" : "Check Facts",
        action: () => void generateProjectPass("FACT_CHECK")
      },
      {
        id: "rewrite",
        number: 11 + workflowNumberOffset,
        title: "Rewrite",
        description: `Apply critique and fact-check fixes to the ${workflowNoun}.`,
        complete: hasPass("REWRITE"),
        enabled: hasPass("FACT_CHECK"),
        busyKey: "pass-REWRITE",
        errorKey: "pass-REWRITE",
        actionLabel: hasPass("REWRITE") ? "Rerun Rewrite" : `Rewrite ${isArticleProject ? "Article" : isPodcastProject ? "Podcast" : isBookProject ? "Book" : "Script"}`,
        action: () => void generateProjectPass("REWRITE")
      },
      {
        id: "voice-polish",
        number: 12 + workflowNumberOffset,
        title: "Voice Polish",
        description: "Removes AI texture, stiff rhythm, generic phrasing, and weak transitions.",
        complete: hasPass("VOICE_POLISH"),
        enabled: hasPass("REWRITE"),
        busyKey: "pass-VOICE_POLISH",
        errorKey: "pass-VOICE_POLISH",
        actionLabel: hasPass("VOICE_POLISH") ? "Rerun Voice Polish" : "Humanize Script",
        action: () => void generateProjectPass("VOICE_POLISH")
      },
      {
        id: "quality-gate",
        number: 12 + workflowNumberOffset,
        title: "Quality Gate",
        description: "Scores hook, retention, clarity, emotion, factual safety, and readiness.",
        complete: hasPass("QUALITY_GATE"),
        enabled: hasPass("VOICE_POLISH"),
        busyKey: "pass-QUALITY_GATE",
        errorKey: "pass-QUALITY_GATE",
        actionLabel: hasPass("QUALITY_GATE") ? "Rerun Quality Gate" : "Run Quality Gate",
        action: () => void generateProjectPass("QUALITY_GATE")
      },
      {
        id: "final",
        number: 13 + workflowNumberOffset,
        title: isArticleProject ? "Final Article" : isPodcastProject ? "Final Podcast Script" : isBookProject ? projectFinalOutputLabel(selectedProject?.format) : "HeyGen Scene Script",
        description: isArticleProject ? "Publication-ready article with clean sections and a complete ending." : isBookProject ? "Publication-ready book manuscript with clear chapters and a complete ending." : "Final narration split into Scene 1, Scene 2, and clean script text only.",
        complete: hasPass("FINAL"),
        enabled: hasPass("QUALITY_GATE"),
        busyKey: "pass-FINAL",
        errorKey: "pass-FINAL",
        actionLabel: hasPass("FINAL") ? "Rerun Polish" : isArticleProject ? "Polish Article" : isPodcastProject ? "Polish Podcast" : isBookProject ? "Polish Book" : "Polish Script",
        action: () => void generateProjectPass("FINAL")
      },
      {
        id: "outro",
        number: 14 + workflowNumberOffset,
        title: isArticleProject ? "Closing CTA" : isPodcastProject ? "Podcast Outro" : isBookProject ? "Author Note" : "Outro",
        description: isArticleProject ? "Short reader closing with comment, follow, and share asks." : isPodcastProject ? "Short listener closing with follow, review, question, and share asks." : isBookProject ? "Short closing author note with review, share, and follow asks." : "Human closing paragraph with subscribe, like, comments, and share asks.",
        complete: hasPass("OUTRO"),
        enabled: hasPass("FINAL"),
        busyKey: "pass-OUTRO",
        errorKey: "pass-OUTRO",
        actionLabel: hasPass("OUTRO") ? "Rerun Outro" : `Write ${isArticleProject ? "Closing" : isBookProject ? "Author Note" : "Outro"}`,
        action: () => void generateProjectPass("OUTRO")
      },
      {
        id: "scene-cards",
        number: 15 + workflowNumberOffset,
        title: "Scene Cards",
        description: "HeyGen scenes, visual cues, on-screen text, SFX, Shorts moments, and one background prompt per scene.",
        complete: hasPass("SCENE_CARDS"),
        enabled: hasPass("OUTRO"),
        busyKey: "pass-SCENE_CARDS",
        errorKey: "pass-SCENE_CARDS",
        actionLabel: hasPass("SCENE_CARDS") ? "Rerun Scene Cards" : "Create Scene Cards",
        action: () => void generateProjectPass("SCENE_CARDS")
      },
      ...(supportsSceneBackgrounds(selectedProject) ? [{
        id: "scene-backgrounds",
        number: 16 + workflowNumberOffset,
        title: "HeyGen Backgrounds",
        description: requiredSceneBackgroundCount
          ? `Generate ${requiredSceneBackgroundCount} low-cost non-FLUX backgrounds from the Scene Cards.`
          : "Generate one low-cost non-FLUX background image per HeyGen scene.",
        complete: requiredSceneBackgroundCount > 0 && sceneBackgroundCount >= requiredSceneBackgroundCount,
        enabled: hasPass("SCENE_CARDS") && requiredSceneBackgroundCount > 0,
        busyKey: selectedProject ? `scene-backgrounds-${selectedProject.id}` : "scene-backgrounds",
        errorKey: "scene-backgrounds",
        actionLabel: sceneBackgroundCount ? "Regenerate Backgrounds" : "Create Backgrounds",
        action: () => void generateSceneBackgroundsForProject()
      }] : []),
      {
        id: "publishing-pack",
        number: 17 + workflowNumberOffset,
        title: publishingPackLabel(selectedProject?.format),
        description: isArticleProject ? "SEO metadata, image plan, Macaly prompt, and topical authority map." : isPodcastProject ? "Three episode titles, show notes, tags, and listener prompt." : isBookProject ? "Three book titles/subtitles, back-cover description, keywords, and reader prompt." : "Titles, description, CTA, tags, pinned comment, thumbnail prompts, and campaign assets.",
        complete: selectedProject && projectHasEpisodePlan(selectedProject) ? projectHasEpisodePublishingPack(selectedProject) : hasPass("PUBLISHING_PACK"),
        enabled: hasPass("SCENE_CARDS"),
        busyKey: "pass-PUBLISHING_PACK",
        errorKey: "pass-PUBLISHING_PACK",
        actionLabel: selectedProject && projectHasEpisodePlan(selectedProject) && !projectHasEpisodePublishingPack(selectedProject)
          ? "Create Episode Kits"
          : hasPass("PUBLISHING_PACK") ? "Rerun Kit" : `Create ${isArticleProject ? "Article Kit" : isPodcastProject ? "Podcast Kit" : isBookProject ? "Launch Kit" : "Campaign Kit"}`,
        action: () => void generateProjectPass("PUBLISHING_PACK")
      },
      ...(canCreateThumbnails ? [{
        id: "thumbnails",
        number: 18 + workflowNumberOffset,
        title: "Thumbnails",
        description: selectedProject && projectHasEpisodePlan(selectedProject) ? `Generate ${selectedEpisodeCount * 3} 16:9 Runware thumbnails from the ${selectedEpisodeCount} episode packs.` : "Generate three 16:9 Runware thumbnails from the pack prompts.",
        complete: thumbnailCount >= requiredThumbnailCount,
        enabled: hasPass("PUBLISHING_PACK"),
        busyKey: selectedProject ? `thumbnails-${selectedProject.id}` : "thumbnails",
        errorKey: "thumbnails",
        actionLabel: thumbnailCount >= requiredThumbnailCount ? "Regenerate Thumbnails" : "Create Thumbnails",
        action: () => void generateProjectThumbnails()
      }] : []),
      ...(canCreateArticleImages ? [{
        id: "article-images",
        number: 16 + workflowNumberOffset,
        title: "Article Images",
        description: "Generate featured and inline images from the Article SEO image plan.",
        complete: articleImagePlanCount > 0 && articleImageCount >= articleImagePlanCount,
        enabled: hasPass("PUBLISHING_PACK") && articleImagePlanCount > 0,
        busyKey: selectedProject ? `article-images-${selectedProject.id}` : "article-images",
        errorKey: "article-images",
        actionLabel: articleImageCount ? "Regenerate Article Images" : "Create Article Images",
        action: () => void generateArticleImagesForProject()
      }] : [])
    ];
    const numberedWorkflowSteps = workflowSteps.map((step, index) => ({ ...step, number: index + 1 }));
    const completedStepCount = numberedWorkflowSteps.filter((step) => step.complete).length;
    const nextWorkflowStep = numberedWorkflowSteps.find((step) => step.enabled && !step.complete);
    const selectedProjectReadiness = selectedProject ? projectReadinessState(selectedProject, publishingSlots) : null;
    const finalEpisodeSections = selectedProject && projectHasEpisodePlan(selectedProject)
      ? parseEpisodeOutputSections(latestDraftForPass(selectedProject, "FINAL")?.content || latestScriptDraft(selectedProject)?.content || "")
      : [];
    const episodeBoard = selectedProject && projectHasEpisodePlan(selectedProject)
      ? episodeBoardItems(selectedProject, latestPublishingPack, finalEpisodeSections)
      : [];
    const uploadPackage = selectedProject ? uploadPackagesByProjectId[selectedProject.id] : undefined;
    const runForecast = selectedProject ? workflowRunForecast(numberedWorkflowSteps, selectedProject) : null;

    return (
      <SectionStack>
        {selectedProject ? (
          <Panel title="Project Workspace">
            <div className="project-workspace-hub">
              <div className="workspace-brief">
                <div>
                  <span className={cn("readiness-pill", selectedProjectReadiness?.className)}>
                    {selectedProjectReadiness?.label}
                  </span>
                  <h2>{selectedProject.title}</h2>
                  <p>{selectedProject.storyIdea?.summary || selectedProject.storyIdea?.hook || "Use the workflow below to turn this project into a finished, packaged output."}</p>
                </div>
                <div className="workspace-next-action">
                  <span>Next Action</span>
                  <strong>{nextWorkflowStep ? nextWorkflowStep.title : selectedProjectReadiness?.nextAction || "Review finished output"}</strong>
                  <small>{nextWorkflowStep ? nextWorkflowStep.description : selectedProjectReadiness?.detail}</small>
                  {nextWorkflowStep ? (
                    <button
                      className="primary-button fit"
                      type="button"
                      onClick={nextWorkflowStep.action}
                      disabled={Boolean(busy)}
                      title={`Runs ${nextWorkflowStep.title}. ${nextWorkflowStep.description}`}
                    >
                      {busy === nextWorkflowStep.busyKey ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                      {busy === nextWorkflowStep.busyKey ? "Running..." : nextWorkflowStep.actionLabel}
                    </button>
                  ) : selectedProject && canScheduleOneOffProject(selectedProject, publishingSlots) ? (
                    <button className="primary-button fit" type="button" onClick={() => void scheduleProjectInCalendar(selectedProject)}>
                      <CalendarDays size={15} />
                      Schedule
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="workspace-tab-grid">
                {projectWorkspaceTabs({
                  project: selectedProject,
                  latestDraft,
                  latestPublishingPackReady: Boolean(latestPublishingPack || latestDraftForPass(selectedProject, "PUBLISHING_PACK")),
                  qualityScorecard,
                  thumbnailCount,
                  requiredThumbnailCount,
                  calendarSlot: selectedProjectCalendarSlot,
                  hasSourceMaterial
                }).map((tab) => (
                  <button
                    className={cn("workspace-tab-card", tab.state)}
                    type="button"
                    key={tab.label}
                    onClick={tab.action}
                    title={tab.explain}
                  >
                    <span>{tab.label}</span>
                    <strong>{tab.status}</strong>
                    <small>{tab.detail}</small>
                  </button>
                ))}
              </div>
              {runForecast ? (
                <div className="run-forecast">
                  <div>
                    <strong>Run Forecast</strong>
                    <span>{runForecast.remainingSteps} step{runForecast.remainingSteps === 1 ? "" : "s"} left · about {runForecast.estimatedMinutes} minutes · {runForecast.riskLabel}</span>
                  </div>
                  <small>{runForecast.detail}</small>
                </div>
              ) : null}
            </div>
          </Panel>
        ) : null}
        {selectedProject ? (
          <UploadReadinessPanel
            project={selectedProject}
            uploadPackage={uploadPackage}
            busy={busy === `upload-package-${selectedProject.id}`}
            onCheck={() => void loadUploadPackage(selectedProject)}
            onDownload={() => downloadUploadPackage(selectedProject)}
          />
        ) : null}
        <div className="script-grid">
          <div className="panel pad">
            <h2 className="panel-title">Project</h2>
            {projects.length ? (
              <Field label="Select Project">
                <select value={selectedProject?.id ?? ""} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {formatProjectFormat(project.format)} - {project.title}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <EmptyState title="No project selected" body="Create a project from an idea before running the guided workflow." />
            )}
            {selectedProject ? (
              <>
                <div className="project-summary">
                  <strong>{selectedProject.title}</strong>
                  <span className={cn("format-chip", projectFormatClass(selectedProject.format))}>{formatProjectFormat(selectedProject.format)}</span>
                  <span>{selectedProject.storyIdea?.summary || selectedProject.storyIdea?.hook || "Ready for source material and workflow passes."}</span>
                  {contentStrength ? (
                    <div className={cn("content-strength", contentStrength.className)}>
                      <strong>{contentStrength.label}</strong>
                      <span>{contentStrength.detail}</span>
                    </div>
                  ) : null}
                  {selectedProject.format !== "EPISODIC_SERIES" ? (
                    <div className="project-summary-actions">
                      {selectedProjectCalendarSlot ? (
                        <button className="secondary-button compact" type="button" disabled>
                          <CalendarDays size={15} />
                          Scheduled: {formatDate(selectedProjectCalendarSlot.scheduledDate)}
                        </button>
                      ) : canScheduleOneOffProject(selectedProject, publishingSlots) ? (
                        <button
                          className="primary-button fit"
                          type="button"
                          onClick={() => void scheduleProjectInCalendar(selectedProject)}
                          disabled={busy === `schedule-project-${selectedProject.id}`}
                        >
                          {busy === `schedule-project-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <CalendarDays size={15} />}
                          Schedule In Calendar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {scriptIntentLock ? (
                  <div className="script-intent-panel">
                    <div className="script-intent-head">
                      <div>
                        <h3>Script Intent Lock</h3>
                        <p>These fields are injected into every workflow pass so the script stays aimed at new business.</p>
                      </div>
                      <button className="secondary-button compact" type="button" onClick={() => resetScriptIntentLock(selectedProject)}>
                        <RefreshCw size={15} />
                        Reset
                      </button>
                    </div>
                    <div className="script-intent-grid">
                      <Field label="Primary Lead Goal">
                        <textarea
                          className="short-textarea"
                          value={scriptIntentLock.primaryLeadGoal}
                          onChange={(event) => updateScriptIntentLock("primaryLeadGoal", event.target.value)}
                        />
                      </Field>
                      <Field label="Target Buyer">
                        <textarea
                          className="short-textarea"
                          value={scriptIntentLock.targetBuyer}
                          onChange={(event) => updateScriptIntentLock("targetBuyer", event.target.value)}
                        />
                      </Field>
                      <Field label="Service / Carrier">
                        <textarea
                          className="short-textarea"
                          value={scriptIntentLock.serviceCarrier}
                          onChange={(event) => updateScriptIntentLock("serviceCarrier", event.target.value)}
                        />
                      </Field>
                      <Field label="CTA">
                        <textarea
                          className="short-textarea"
                          value={scriptIntentLock.cta}
                          onChange={(event) => updateScriptIntentLock("cta", event.target.value)}
                        />
                      </Field>
                      <Field label="Compliance Boundary">
                        <textarea
                          className="short-textarea"
                          value={scriptIntentLock.complianceBoundary}
                          onChange={(event) => updateScriptIntentLock("complianceBoundary", event.target.value)}
                        />
                      </Field>
                      <Field label="Opening Template">
                        <select
                          value={selectedOpeningKey}
                          onChange={(event) => setScriptOpeningByProjectId((current) => ({ ...current, [selectedProject.id]: event.target.value as ScriptOpeningKey }))}
                        >
                          {scriptOpeningOptions.map((option) => (
                            <option key={option.key} value={option.key}>{option.label}</option>
                          ))}
                        </select>
                        <small className="field-hint">{selectedOpening.detail}</small>
                      </Field>
                    </div>
                  </div>
                ) : null}
                <div className="script-guardrail-grid">
                  <div className="script-compliance-reminder">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Texas Insurance Compliance Reminder</strong>
                      <span>Do not promise savings, coverage, eligibility, claim outcomes, or carrier acceptance. Coverage depends on policy terms, underwriting, limits, exclusions, deductibles, endorsements, and Texas regulations.</span>
                    </div>
                  </div>
                  {ctaCheck ? (
                    <div className="cta-strength-card">
                      <div className="scorecard-head">
                        <div>
                          <strong>CTA Strength Check</strong>
                          <span>{ctaCheck.label}</span>
                        </div>
                        <b>{ctaCheck.score}/100</b>
                      </div>
                      <div className="cta-check-list">
                        {ctaCheck.checks.map((item) => (
                          <span className={cn(item.ready && "ready")} key={item.label} title={item.detail}>
                            {item.ready ? <CheckCircle2 size={14} /> : <CircleSlash size={14} />}
                            {item.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {landingPageMatch ? (
                    <div className={cn("landing-match-card", landingPageMatch.priority)}>
                      <div>
                        <strong>Macaly Landing Page Match</strong>
                        <span>{landingPageMatch.label}</span>
                      </div>
                      <p>{landingPageMatch.detail}</p>
                    </div>
                  ) : null}
                </div>
                <div className="field power-only">
                  <div className="field-action-row">
                    <span>Source Material / Notes</span>
                    <small>{sourceMaterial.trim() ? `${sourceMaterial.trim().length.toLocaleString()} characters` : "Empty"}</small>
                  </div>
                  <textarea value={sourceMaterial} onChange={(event) => updateSourceMaterial(event.target.value)} placeholder="Paste research notes, article excerpts, timeline details, or constraints for the next pass." />
                </div>
                <div className="field">
                  <div className="field-action-row">
                    <span>Source URLs</span>
                    <small>{parseSourceUrls(sourceUrls).length ? `${parseSourceUrls(sourceUrls).length} link${parseSourceUrls(sourceUrls).length === 1 ? "" : "s"}` : "Optional"}</small>
                  </div>
                  <textarea
                    className="short-textarea"
                    value={sourceUrls}
                    onChange={(event) => updateSourceUrls(event.target.value)}
                    placeholder="Paste source links, one per line. Research Mode will try to ingest readable excerpts."
                  />
                  <p className="field-hint">Use Source URLs for source ingestion. Use Source Material for pasted notes, transcripts, facts, or constraints.</p>
                </div>
                <div className="project-input-actions">
                  <button
                    className="secondary-button compact"
                    type="button"
                    onClick={() => void saveProjectInputs()}
                    disabled={Boolean(busy) || !selectedProject}
                  >
                    {busy === `project-inputs-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                    Save Project Inputs
                  </button>
                  <span>Fully Auto also saves these fields before it starts.</span>
                </div>
                {canCreateBookIllustrations ? (
                  <div className="book-illustration-panel power-only">
                    <div className="book-illustration-head">
                      <div>
                        <h3>Book Illustrations</h3>
                        <p>Optional artwork for finished book manuscripts. Run Fully Auto first, then plan prompts, then generate images.</p>
                      </div>
                      <span>{bookIllustrationCount} saved</span>
                    </div>
                    <div className="book-illustration-sequence" aria-label="Book illustration sequence">
                      <span className={bookIllustrationReady ? "complete" : "current"}>1. Finish manuscript</span>
                      <span className={bookIllustrationReady ? (bookIllustrationPlan ? "complete" : "current") : "locked"}>2. Plan prompts</span>
                      <span className={bookIllustrationReady && bookIllustrationPlan ? "current" : "locked"}>3. Generate images</span>
                    </div>
                    <div className="book-illustration-controls">
                      <Field label="Mode">
                        <select
                          value={bookIllustrationMode}
                          onChange={(event) => updateBookIllustrationMode(event.target.value as BookIllustrationMode)}
                        >
                          {bookIllustrationModeOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Max Images">
                        <input
                          type="number"
                          min={1}
                          max={24}
                          value={bookIllustrationMax}
                          onChange={(event) => updateBookIllustrationMax(Number(event.target.value))}
                        />
                      </Field>
                      <Field label="Image Model">
                        <select
                          value={bookIllustrationModel}
                          onChange={(event) => updateBookIllustrationModel(event.target.value)}
                        >
                          {BOOK_ILLUSTRATION_MODEL_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.recommended ? "Recommended: " : ""}{option.label} - {option.costLabel}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    {selectedBookIllustrationModel ? (
                      <div className="book-model-summary">
                        <strong>{selectedBookIllustrationModel.label}</strong>
                        <span>{selectedBookIllustrationModel.costLabel} · {selectedBookIllustrationModel.quality}</span>
                        <p>{selectedBookIllustrationModel.bestFor}</p>
                        <small>
                          {bookIllustrationMax} image{bookIllustrationMax === 1 ? "" : "s"} estimated at {formatEstimatedBookIllustrationCost(bookIllustrationModel, bookIllustrationMax)} before generation.
                          Runware returns the exact successful-job cost after image creation.
                        </small>
                      </div>
                    ) : null}
                    <p className="field-hint">
                      {bookIllustrationModeOptions.find((option) => option.value === bookIllustrationMode)?.description}
                      {" "}Z-Image Turbo is the default low-cost book-art model. FLUX models are intentionally not listed here.
                    </p>
                    {!bookIllustrationReady ? (
                      <p className="book-illustration-gate">Finish the book with Fully Auto before planning or generating illustrations.</p>
                    ) : !bookIllustrationPlan ? (
                      <p className="book-illustration-gate">Manuscript is ready. Plan Illustrations is the next step.</p>
                    ) : (
                      <p className="book-illustration-gate">Illustration prompts are ready. Review them, then generate images.</p>
                    )}
                    <div className="inline-actions">
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void planBookIllustrations()}
                        disabled={Boolean(busy) || !bookIllustrationReady}
                      >
                        {selectedProject && busy === `book-illustration-plan-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <ListChecks size={15} />}
                        Plan Illustrations
                      </button>
                      <button
                        className="primary-button fit"
                        type="button"
                        onClick={() => void generateBookIllustrationsForProject()}
                        disabled={Boolean(busy) || !bookIllustrationReady || !bookIllustrationPlan || !settings.hasRunwareApiKey}
                      >
                        {selectedProject && busy === `book-illustrations-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <ImageIcon size={15} />}
                        Generate Images
                      </button>
                    </div>
                    {!settings.hasRunwareApiKey ? (
                      <p className="field-hint">Add a Runware API key in Settings before generating images. Planning still works with your text model.</p>
                    ) : null}
                    {workflowErrors["book-illustrations"] ? (
                      <div className="workflow-step-error compact-error">
                        <CircleSlash size={15} />
                        <span>{workflowErrors["book-illustrations"]}</span>
                      </div>
                    ) : null}
                    {bookIllustrationPlan ? (
                      <div className="book-illustration-plan">
                        <div>
                          <strong>Style Bible</strong>
                          <p>{bookIllustrationPlan.styleBible}</p>
                        </div>
                        <div className="book-illustration-plan-head">
                          <strong>{bookIllustrationPlan.illustrations.length} Planned Prompts</strong>
                          <span>{bookIllustrationPlan.estimatedCostNote}</span>
                        </div>
                        <div className="book-illustration-prompt-list">
                          {bookIllustrationPlan.illustrations.map((item) => (
                            <details key={`${item.chapterNumber}-${item.title}`}>
                              <summary>Chapter {item.chapterNumber}: {item.title}</summary>
                              <p>{item.scene}</p>
                              <small>{item.prompt}</small>
                              {item.safetyNotes ? <em>{item.safetyNotes}</em> : null}
                            </details>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="workflow-header">
                  <div>
                    <h3>{isArticleProject ? "Article Workflow" : isPodcastProject ? "Podcast Workflow" : "Script Workflow"}</h3>
                    <p>Complete each step to unlock the next pass.</p>
                  </div>
                  <div className="workflow-header-actions">
                    {projectHasCompletedEpisodePlan(selectedProject) ? (
                      <button className="primary-button fit" type="button" onClick={() => void runEpisodeFullyAuto()} disabled={Boolean(busy)}>
                        {busy === "episode-auto" ? <Loader2 size={15} className="spin" /> : <CalendarDays size={15} />}
                        {busy === "episode-auto" ? "Episodes Running" : "Episode Fully Auto"}
                      </button>
                    ) : null}
                    {!projectHasCompletedEpisodePlan(selectedProject) ? (
                      <button className="primary-button fit" type="button" onClick={() => void runFullyAuto()} disabled={Boolean(busy)}>
                        {busy === "auto" ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                        {busy === "auto" ? "Auto Running" : "Fully Auto"}
                      </button>
                    ) : null}
                    <span>{completedStepCount} / {numberedWorkflowSteps.length}</span>
                  </div>
                </div>
                {busy === "auto" || busy === "episode-auto" ? (
                  <div className="workflow-auto-note">
                    <Loader2 size={15} className="spin" />
                    Running {autoStep || "next step"}...
                  </div>
                ) : null}
                <ClientJobQueue jobs={clientJobs} compact />
                {workflowErrors.auto ? (
                  <div className="workflow-step-error">
                    <CircleSlash size={15} />
                    <span>{workflowErrors.auto}</span>
                  </div>
                ) : null}
                {workflowErrors["episode-auto"] ? (
                  <div className="workflow-step-error">
                    <CircleSlash size={15} />
                    <span>{workflowErrors["episode-auto"]}</span>
                  </div>
                ) : null}
                {episodeBoard.length ? (
                  <div className="episode-production-board" id="episode-board">
                    <div className="episode-production-head">
                      <div>
                        <strong>Episode Production Board</strong>
                        <span>Each part tracks its own script, campaign kit, thumbnail set, and export actions.</span>
                      </div>
                      <button className="secondary-button compact" type="button" onClick={() => void runEpisodeFullyAuto()} disabled={Boolean(busy)}>
                        {busy === "episode-auto" ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                        Run Missing Steps
                      </button>
                    </div>
                    <div className="episode-production-grid">
                      {episodeBoard.map((episode) => (
                        <div className="episode-production-card" key={episode.partLabel}>
                          <div className="episode-production-title">
                            <span>{episode.partLabel}</span>
                            <strong>{episode.title}</strong>
                          </div>
                          <div className="episode-status-row">
                            <span className={cn("readiness-pill", episode.scriptReady ? "ready" : "blocked")}>Script</span>
                            <span className={cn("readiness-pill", episode.packReady ? "ready" : "needs-review")}>Kit</span>
                            <span className={cn("readiness-pill", episode.thumbnailReady ? "ready" : "needs-review")}>Thumbs</span>
                          </div>
                          <p>{episode.detail}</p>
                          <div className="inline-actions">
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => void copyText(episode.scriptContent || episode.packContent || episode.title, `${episode.partLabel} copied.`)}
                              disabled={!episode.scriptContent && !episode.packContent}
                            >
                              <Copy size={14} />
                              Copy
                            </button>
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => exportScriptText(`${episode.partLabel} ${episode.title}`, episode.scriptContent || episode.packContent)}
                              disabled={!episode.scriptContent && !episode.packContent}
                            >
                              <Download size={14} />
                              Export
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canPlanEpisodes && !isEpisodicProject ? (
                  <div className={cn("workflow-step optional", episodeWorkflowStep.complete && "complete", episodeWorkflowStep.enabled && !episodeWorkflowStep.complete && "current", !episodeWorkflowStep.enabled && "locked")}>
                    <div className="workflow-step-main">
                      <div className="step-number">{episodeWorkflowStep.complete ? <CheckCircle2 size={16} /> : <CalendarDays size={15} />}</div>
                      <div className="workflow-step-copy">
                        <strong>{episodeWorkflowStep.title}</strong>
                        <small>{episodeWorkflowStep.description}</small>
                      </div>
                      <span className="step-status">{episodeWorkflowStep.complete ? "Planned" : "Optional"}</span>
                    </div>
                    <button
                      className={cn(episodeWorkflowStep.enabled && !episodeWorkflowStep.complete ? "primary-button" : "secondary-button", "workflow-action")}
                      type="button"
                      onClick={episodeWorkflowStep.action}
                      disabled={!episodeWorkflowStep.enabled || Boolean(busy)}
                    >
                      {busy === episodeWorkflowStep.busyKey ? <Loader2 size={15} className="spin" /> : episodeWorkflowStep.enabled ? <Zap size={15} /> : <CircleSlash size={15} />}
                      {busy === episodeWorkflowStep.busyKey ? "Running..." : episodeWorkflowStep.actionLabel}
                    </button>
                    {workflowErrors[episodeWorkflowStep.errorKey] ? (
                      <div className="workflow-step-error">
                        <CircleSlash size={15} />
                        <span>{workflowErrors[episodeWorkflowStep.errorKey]}</span>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className={cn("workflow-steps", experienceMode === "GUIDED" && "guided-workflow-steps")}>
                  {numberedWorkflowSteps.map((step) => {
                    const isBusy = busy === step.busyKey;
                    const disabled = !step.enabled || Boolean(busy);
                    const status = step.complete ? "Done" : step.enabled ? "Ready" : "Locked";
                    const stepError = workflowErrors[step.errorKey];
                    return (
                      <div
                        className={cn("workflow-step", step.complete && "complete", step.enabled && !step.complete && "current", !step.enabled && "locked")}
                        key={step.id}
                      >
                        <div className="workflow-step-main">
                          <div className="step-number">{step.complete ? <CheckCircle2 size={16} /> : step.number}</div>
                          <div className="workflow-step-copy">
                            <strong>{step.title}</strong>
                            <small>{step.description}</small>
                          </div>
                          <span className="step-status">{status}</span>
                        </div>
                        <button
                          className={cn(step.enabled && !step.complete ? "primary-button" : "secondary-button", "workflow-action")}
                          type="button"
                          onClick={step.action}
                          disabled={disabled}
                        >
                          {isBusy ? <Loader2 size={15} className="spin" /> : step.enabled ? <Zap size={15} /> : <CircleSlash size={15} />}
                          {isBusy ? "Running..." : step.actionLabel}
                        </button>
                        {stepError ? (
                          <div className="workflow-step-error">
                            <CircleSlash size={15} />
                            <span>{stepError}</span>
                            {step.id === "final" && isFinalIncompleteError(stepError) ? (
                              <button className="secondary-button compact force-save-button" type="button" onClick={forceSaveFinalPass} disabled={Boolean(busy)}>
                                <Save size={14} />
                                Force Save Final
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {!hasSourceMaterial ? (
                  <div className="workflow-lock-note">
                    <Search size={15} />
                    Research or paste source notes to unlock the quality workflow.
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="panel pad draft-panel" id="current-output">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">Current Output</h2>
                {scriptOutputOptions.length > 1 ? (
                  <p className="field-hint">Switch between the finished output, metadata packs, and earlier workflow outputs.</p>
                ) : null}
                {selectedProject && hasPublishableScript(selectedProject) ? (
                  <p className="field-hint status-helper">{projectStatusHelp(selectedProject.status)}</p>
                ) : null}
              </div>
              {latestDraft ? (
                <div className="output-toolbar">
                  {scriptOutputOptions.length > 1 ? (
                    <label className="output-picker">
                      <span>View output</span>
                      <select
                        value={latestDraft.id}
                        onChange={(event) => {
                          if (!selectedProject) return;
                          setSelectedOutputByProjectId((current) => ({ ...current, [selectedProject.id]: event.target.value }));
                        }}
                      >
                        {scriptOutputOptions.map((output) => (
                          <option value={output.id} key={output.id}>
                            {outputOptionLabel(output)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="inline-actions">
                  <button className="secondary-button compact" type="button" onClick={() => void copyLatestDraft()}>
                    <Copy size={15} />
                    COPY
                  </button>
                  <button className="secondary-button compact" type="button" onClick={downloadLatestDraft}>
                    <Download size={15} />
                    Download
                  </button>
                  {selectedProject && hasPublishableScript(selectedProject) ? (
                    <a className="secondary-button compact" href={apiPath(`/api/projects/${selectedProject.id}/content-pack`)}>
                      <Download size={15} />
                      Content Pack
                    </a>
                  ) : null}
                  {selectedProject && selectedProject.format === "ARTICLE" && hasPublishableScript(selectedProject) ? (
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => void createWordPressDraft(selectedProject)}
                      disabled={busy === `wordpress-draft-${selectedProject.id}`}
                    >
                      {busy === `wordpress-draft-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
                      WordPress Draft
                    </button>
                  ) : null}
                  {selectedProject && hasPublishableScript(selectedProject) && supportsBookExport(selectedProject) ? (
                    <>
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(selectedProject, "pdf")}>
                        <BookOpen size={15} />
                        Book PDF
                      </button>
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(selectedProject, "epub")}>
                        <BookOpen size={15} />
                        Kindle EPUB
                      </button>
                    </>
                  ) : null}
                  {selectedProject && hasPublishableScript(selectedProject) && selectedProject.status !== "PUBLISHED" && selectedProject.status !== "ARCHIVED" ? (
                    <button
                      className="secondary-button compact publish-button"
                      type="button"
                      onClick={() => void updateProjectStatus(selectedProject, "PUBLISHED")}
                      disabled={busy === `project-status-${selectedProject.id}-PUBLISHED`}
                    >
                      {busy === `project-status-${selectedProject.id}-PUBLISHED` ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
                      Mark Published
                    </button>
                  ) : null}
                  {selectedProject && hasPublishableScript(selectedProject) && selectedProject.status !== "PRODUCED" && selectedProject.status !== "PUBLISHED" && selectedProject.status !== "ARCHIVED" ? (
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => void updateProjectStatus(selectedProject, "PRODUCED")}
                      disabled={busy === `project-status-${selectedProject.id}-PRODUCED`}
                    >
                      {busy === `project-status-${selectedProject.id}-PRODUCED` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                      Mark Produced
                    </button>
                  ) : null}
                  {selectedProject && selectedProject.format !== "EPISODIC_SERIES" ? (
                    selectedProjectCalendarSlot ? (
                      <button className="secondary-button compact" type="button" disabled>
                        <CalendarDays size={15} />
                        Scheduled
                      </button>
                    ) : canScheduleOneOffProject(selectedProject, publishingSlots) ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void scheduleProjectInCalendar(selectedProject)}
                        disabled={busy === `schedule-project-${selectedProject.id}`}
                      >
                        {busy === `schedule-project-${selectedProject.id}` ? <Loader2 size={15} className="spin" /> : <CalendarDays size={15} />}
                        Schedule In Calendar
                      </button>
                    ) : selectedProject.status === "PUBLISHED" ? (
                      <button className="secondary-button compact" type="button" disabled title="Published content is already live. Reactivate it before scheduling again.">
                        <Globe2 size={15} />
                        Already Published
                      </button>
                    ) : selectedProject.status === "ARCHIVED" ? (
                      <button className="secondary-button compact" type="button" disabled title="Archived content must be reactivated before scheduling.">
                        <Archive size={15} />
                        Archived
                      </button>
                    ) : null
                  ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            {latestDraft ? (
              <>
                <div className="draft-meta">
                  <span>{latestDraft.displayLabel ?? `${passLabelForProject(latestDraft.passType, selectedProject?.format)} v${latestDraft.version}`}</span>
                  <span>{latestDraft.wordCount.toLocaleString()} words</span>
                  <span>{latestDraft.estimatedMinutes} min</span>
                  <span>{latestDraft.modelUsed}</span>
                </div>
                {selectedProject ? (
                  <>
                    <OutputHistoryPanel
                      project={selectedProject}
                      selectedOutputId={latestDraft.id}
                      outputs={scriptOutputOptions}
                      onSelect={(outputId) => setSelectedOutputByProjectId((current) => ({ ...current, [selectedProject.id]: outputId }))}
                    />
                    <UniversalAssetLibraryPanel
                      project={selectedProject}
                      latestPublishingPackReady={Boolean(latestPublishingPack)}
                      imageCount={outputAssets.length}
                      sourceReady={hasSourceMaterial}
                    />
                  </>
                ) : null}
                {qualityScorecard ? (
                    <div className="scorecard-panel">
                      <div className="scorecard-head">
                      <strong>{isArticleProject ? "Article Quality Scorecard" : isPodcastProject ? "Podcast Quality Scorecard" : isBookProject ? "Book Quality Scorecard" : "Script Quality Scorecard"}</strong>
                      <span>{qualityScorecard.overall ? `${qualityScorecard.overall}/100` : "Quality gate pending"}</span>
                    </div>
                    <div className="scorecard-grid">
                      {qualityScorecard.scores.map((score) => (
                        <div className="scorecard-row" key={score.label}>
                          <span>{score.label}</span>
                          <div className="scorebar">
                            <div style={{ width: `${Math.min(100, Math.max(0, score.value))}%` }} />
                          </div>
                          <strong>{score.value}</strong>
                        </div>
                      ))}
                    </div>
                    {qualityScorecard.note ? <p>{qualityScorecard.note}</p> : null}
                  </div>
                ) : null}
                {claimLedger ? (
                  <div className="claim-ledger-panel">
                    <div className="claim-ledger-head">
                      <strong>Compliance Check / Coverage Claim Review</strong>
                      <span>{claimLedger.source}</span>
                    </div>
                    <div className="claim-ledger-grid">
                      {claimLedger.sections.map((section) => (
                        <div className="claim-ledger-card" key={section.label}>
                          <strong>{section.label}</strong>
                          <ul>
                            {section.items.slice(0, 4).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {latestPublishingPack && isPublishingPackOutput(latestDraft) ? (
                  <div className="publishing-pack-view">
                    {latestPublishingPack.episodePacks?.length ? (
                      <div className="episode-output-grid">
                        {latestPublishingPack.episodePacks.map((episode) => (
                          <div className="episode-output-card" key={episode.partLabel}>
                            <div className="episode-output-head">
                              <div>
                                <span>{episode.partLabel}</span>
                                <strong>Business Campaign Kit</strong>
                              </div>
                              <button
                                className="secondary-button compact"
                                type="button"
                                onClick={() => void copyText(JSON.stringify(episode, null, 2), `${episode.partLabel} campaign kit copied.`)}
                              >
                                <Copy size={14} />
                                Copy Kit
                              </button>
                            </div>
                            <div className="pack-section">
                              <strong>Title Options</strong>
                              {episode.titles.map((item, index) => (
                                <div className="pack-title-option" key={`${episode.partLabel}-${item.title}-${index}`}>
                                  <span>{index + 1}</span>
                                  <div>
                                    <b>{item.title}</b>
                                    {item.angle ? <small>{item.angle}</small> : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="pack-section">
                              <div className="pack-section-header">
                                <strong>Description</strong>
                                <button
                                  className="secondary-button compact"
                                  type="button"
                                  onClick={() => void copyText(episode.description, `${episode.partLabel} description copied.`)}
                                >
                                  <Copy size={14} />
                                  Copy Description
                                </button>
                              </div>
                              <PublishingDescriptionText text={episode.description} />
                            </div>
                            <div className="pack-section">
                              <strong>Tags</strong>
                              <div className="tag-list">
                                {episode.tags.map((tag) => (
                                  <span key={`${episode.partLabel}-${tag}`}>{tag}</span>
                                ))}
                              </div>
                            </div>
                            <div className="pack-section">
                              <strong>Thumbnail Prompts</strong>
                              {episode.thumbnailPrompts.map((item, index) => (
                                <div className="thumbnail-prompt" key={`${episode.partLabel}-${item.title}-${index}`}>
                                  <b>{item.title}</b>
                                  {item.overlayText ? <small>Overlay: {item.overlayText}</small> : null}
                                  <p>{item.prompt}</p>
                                </div>
                              ))}
                            </div>
                            {episode.sunoPrompt ? (
                              <div className="pack-section">
                                <strong>Suno Background Music Prompt</strong>
                                <div className="suno-prompt-card">
                                  {episode.sunoPrompt.title ? <b>{episode.sunoPrompt.title}</b> : null}
                                  <p>{episode.sunoPrompt.prompt}</p>
                                </div>
                              </div>
                            ) : null}
                            {episode.pinnedComment ? (
                              <div className="pack-section">
                                <strong>Pinned Comment</strong>
                                <p>{episode.pinnedComment}</p>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                    <div className="pack-section">
                      <strong>Title Options</strong>
                      {latestPublishingPack.titles.map((item, index) => (
                        <div className="pack-title-option" key={`${item.title}-${index}`}>
                          <span>{index + 1}</span>
                          <div>
                            <b>{item.title}</b>
                            {item.angle ? <small>{item.angle}</small> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="pack-section">
                      <div className="pack-section-header">
                        <strong>{isArticleProject ? "SEO Description" : isPodcastProject ? "Show Notes" : isBookProject ? "Book Description" : "Description"}</strong>
                        <div className="inline-actions">
                          <button
                            className="secondary-button compact"
                            type="button"
                            onClick={() => void copyText(latestPublishingPack.description, "Campaign description copied to clipboard.")}
                          >
                            <Copy size={14} />
                            Copy {isPodcastProject ? "Show Notes" : "Description"}
                          </button>
                          {!isArticleProject && !isPodcastProject && !isBookProject ? (
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => void regeneratePublishingDescription()}
                              disabled={!selectedProject || busy === `description-${selectedProject.id}`}
                            >
                              {selectedProject && busy === `description-${selectedProject.id}` ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                              Regenerate Description
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <PublishingDescriptionText text={latestPublishingPack.description} />
                      {workflowErrors["publishing-description"] ? (
                        <div className="workflow-step-error compact-error">
                          <CircleSlash size={15} />
                          <span>{workflowErrors["publishing-description"]}</span>
                        </div>
                      ) : null}
                    </div>
                    {isArticleProject && latestPublishingPack.seoPack ? (
                      <div className="pack-section">
                        <div className="pack-section-header">
                          <strong>Article SEO Pack</strong>
                          <div className="inline-actions">
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => void copyText(JSON.stringify(latestPublishingPack.seoPack, null, 2), "Article SEO Pack copied to clipboard.")}
                            >
                              <Copy size={14} />
                              Copy SEO
                            </button>
                            {latestPublishingPack.seoPack.imagePlan.length ? (
                              <button
                                className="secondary-button compact"
                                type="button"
                                onClick={() => void generateArticleImagesForProject()}
                                disabled={!selectedProject || busy === `article-images-${selectedProject.id}`}
                              >
                                {selectedProject && busy === `article-images-${selectedProject.id}` ? <Loader2 size={14} className="spin" /> : <ImageIcon size={14} />}
                                Generate Images
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <ArticleSeoPackView pack={latestPublishingPack.seoPack} />
                        {workflowErrors["article-images"] ? (
                          <div className="workflow-step-error compact-error">
                            <CircleSlash size={15} />
                            <span>{workflowErrors["article-images"]}</span>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {isArticleProject && latestPublishingPack.topicalAuthorityMap ? (
                      <div className="pack-section">
                        <div className="pack-section-header">
                          <strong>Topical Authority Map</strong>
                          <button
                            className="secondary-button compact"
                            type="button"
                            onClick={() => void copyText(JSON.stringify(latestPublishingPack.topicalAuthorityMap, null, 2), "Topical Authority Map copied to clipboard.")}
                          >
                            <Copy size={14} />
                            Copy Map
                          </button>
                        </div>
                        <TopicalAuthorityMapView map={latestPublishingPack.topicalAuthorityMap} />
                      </div>
                    ) : null}
                    <div className="pack-section">
                      <strong>Tags</strong>
                      <div className="tag-list">
                        {latestPublishingPack.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    {latestPublishingPack.thumbnailPrompts.length ? (
                      <div className="pack-section">
                        <strong>Thumbnail Prompts</strong>
                        {latestPublishingPack.thumbnailPrompts.map((item, index) => (
                          <div className="thumbnail-prompt" key={`${item.title}-${index}`}>
                            <b>{item.title}</b>
                            {item.overlayText ? <small>Overlay: {item.overlayText}</small> : null}
                            <p>{item.prompt}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {!isArticleProject && !isPodcastProject && !isBookProject && latestPublishingPack.sunoPrompt ? (
                      <div className="pack-section">
                        <div className="pack-section-header">
                          <strong>Suno Background Music Prompt</strong>
                          <button
                            className="secondary-button compact"
                            type="button"
                            onClick={() => void copyText(latestPublishingPack.sunoPrompt?.prompt ?? "", "Suno music prompt copied to clipboard.")}
                          >
                            <Copy size={14} />
                            Copy Prompt
                          </button>
                        </div>
                        <div className="suno-prompt-card">
                          {latestPublishingPack.sunoPrompt.title ? <b>{latestPublishingPack.sunoPrompt.title}</b> : null}
                          <p>{latestPublishingPack.sunoPrompt.prompt}</p>
                        </div>
                      </div>
                    ) : null}
                    {latestPublishingPack.pinnedComment ? (
                      <div className="pack-section">
                        <strong>{isArticleProject || isBookProject ? "Reader Prompt" : isPodcastProject ? "Listener Prompt" : "Pinned Comment"}</strong>
                        <p>{latestPublishingPack.pinnedComment}</p>
                      </div>
                    ) : null}
                    {latestPublishingPack.conversionAssets ? (
                      <div className="pack-section">
                        <div className="pack-section-header">
                          <strong>Agency Conversion Assets</strong>
                          <button
                            className="secondary-button compact"
                            type="button"
                            onClick={() => void copyText(JSON.stringify(latestPublishingPack.conversionAssets, null, 2), "Agency conversion assets copied to clipboard.")}
                          >
                            <Copy size={14} />
                            Copy Assets
                          </button>
                        </div>
                        <ConversionAssetsView assets={latestPublishingPack.conversionAssets} />
                      </div>
                    ) : null}
                      </>
                    )}
                  </div>
                ) : (
                  latestEpisodeSections.length ? (
                    <div className="episode-output-grid">
                      {latestEpisodeSections.map((episode) => (
                        <div className="episode-output-card" key={`${episode.partLabel}-${episode.title}`}>
                          <div className="episode-output-head">
                            <div>
                              <span>{episode.partLabel}</span>
                              <strong>{episode.title}</strong>
                            </div>
                            <div className="inline-actions">
                              <button
                                className="secondary-button compact"
                                type="button"
                                onClick={() => void copyText(`${episode.heading}\n\n${episode.content}`, `${episode.partLabel} copied to clipboard.`)}
                              >
                                <Copy size={14} />
                                Copy
                              </button>
                              <button
                                className="secondary-button compact"
                                type="button"
                                onClick={() => exportScriptText(`${episode.partLabel} ${episode.title}`, episode.content)}
                              >
                                <Download size={14} />
                                Export TXT
                              </button>
                            </div>
                          </div>
                          <pre>{episode.content}</pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="script-output-box">
                      <div className="script-output-head">
                        <span>{latestDraft.displayLabel ? `Script Preview: ${latestDraft.displayLabel}` : passLabelForProject(latestDraft.passType, selectedProject?.format)}</span>
                        <div className="inline-actions">
                          <button className="secondary-button compact" type="button" onClick={() => void copyLatestDraft()}>
                            <Copy size={14} />
                            {copyDraftButtonLabel(latestDraft.passType, selectedProject?.format)}
                          </button>
                          {latestDraft.passType !== "PUBLISHING_PACK" ? (
                            <button className="secondary-button compact" type="button" onClick={exportLatestScriptText}>
                              <Download size={14} />
                              Export TXT
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <pre>{latestDraft.content}</pre>
                    </div>
                  )
                )}
                {selectedProject && outputAssets.length ? (
                  <div className="asset-results-block">
                    <strong>{outputAssetLabel}</strong>
                    <div className={cn("thumbnail-results", (canCreateBookIllustrations || isArticleProject) && "book-illustration-results")}>
                      {outputAssets.slice(0, outputAssetLimit).map((thumbnail) => (
                        <div className="thumbnail-card" key={thumbnail.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumbnail.imageUrl} alt={thumbnail.title || `${outputAssetLabel} ${thumbnail.variant}`} />
                          <div>
                            <strong>{thumbnail.title || `${outputAssetLabel} ${thumbnail.variant}`}</strong>
                            <span>{thumbnail.modelUsed}</span>
                          </div>
                          <a className="secondary-button compact" href={thumbnail.imageUrl} target="_blank" rel="noreferrer">
                            <Download size={15} />
                            Open
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="No output yet" body={`Run the workflow to create planning notes and ${projectOutputNoun(selectedProject?.format)} output.`} />
            )}
          </div>
        </div>
      </SectionStack>
    );
  }

  function renderCalendar() {
    const nextSlot = upcomingPublishingSlots[0];
    const calendarTips = calendarIntelligence(projects, publishingSlots);

    return (
      <SectionStack>
        <div className="stats-grid">
          <Metric label="Scheduled content" value={counts.scheduled} />
          <Metric label="Standalone slots" value={counts.scheduledStandalone} />
          <Metric label="Series episodes" value={counts.scheduledEpisodes} />
          <Metric label="Next publish date" value={nextSlot ? formatDate(nextSlot.scheduledDate) : "—"} />
          <Metric label="Projects" value={counts.projects} />
          <Metric label="Published" value={counts.published} />
        </div>
        <div className="action-strip">
          <button className="primary-button fit" type="button" onClick={() => void runMonthlyAuto()} disabled={busy === "monthly-auto"}>
            {busy === "monthly-auto" ? <Loader2 size={16} className="spin" /> : <CalendarDays size={16} />}
            {busy === "monthly-auto" ? "Building Calendar" : "Monthly Auto"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void loadProjectsAndIdeas()}>
            <RefreshCw size={16} />
            Refresh Calendar
          </button>
        </div>
        <PublishingStatusLegend />
        <Panel title="Calendar Intelligence">
          <div className="calendar-intelligence">
            {calendarTips.map((tip) => (
              <div className={cn("calendar-tip", tip.priority)} key={tip.title}>
                <strong>{tip.title}</strong>
                <span>{tip.detail}</span>
              </div>
            ))}
          </div>
        </Panel>
        <div className="panel data-panel">
          <div className="data-row data-head calendar-row">
            <div>Date</div>
            <div>Type</div>
            <div>Content</div>
            <div>Length</div>
            <div>Status</div>
            <div>Actions</div>
          </div>
          {upcomingPublishingSlots.length ? (
            upcomingPublishingSlots.map((slot) => {
              const project = slot.storyProject ?? projects.find((item) => item.id === slot.storyProjectId);
              return (
                <div className="data-row calendar-row" key={slot.id}>
                  <div>
                    <strong>{formatDate(slot.scheduledDate)}</strong>
                    <span>{weekdayLabel(slot.scheduledDate)}</span>
                  </div>
                  <div>
                    <span className={cn("status-chip", slot.slotType === "EPISODE" ? "progress" : "saved")}>
                      {slot.slotType === "EPISODE" ? `Episode ${slot.episodeNumber ?? ""}`.trim() : "Standalone"}
                    </span>
                  </div>
                  <div>
                    <strong>{slot.title}</strong>
                    <span>{project?.storyIdea?.category || formatProjectFormat(project?.format)}</span>
                  </div>
                  <div>{slot.durationMinutes} min</div>
                  <div>
                    <span className={cn("status-chip", slotStatusClass(slot.status))}>{displaySlotStatus(slot.status)}</span>
                    <small className="status-helper">{slotStatusHelp(slot.status)}</small>
                  </div>
                  <div className="inline-actions">
                    {project ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          goToSection("script-lab");
                        }}
                      >
                        <FileText size={15} />
                        Open Lab
                      </button>
                    ) : null}
                    {slot.status === "SCHEDULED" ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void updateCalendarSlotStatus(slot, "PRODUCED")}
                        disabled={busy === `slot-${slot.id}-PRODUCED`}
                      >
                        {busy === `slot-${slot.id}-PRODUCED` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        Mark Produced
                      </button>
                    ) : null}
                    {slot.status !== "PUBLISHED" ? (
                      <button
                        className="secondary-button compact publish-button"
                        type="button"
                        onClick={() => void updateCalendarSlotStatus(slot, "PUBLISHED")}
                        disabled={busy === `slot-${slot.id}-PUBLISHED`}
                      >
                        {busy === `slot-${slot.id}-PUBLISHED` ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
                        Mark Published
                      </button>
                    ) : null}
                    <button
                      className="secondary-button compact danger-button"
                      type="button"
                      onClick={() => void deleteCalendarSlot(slot)}
                      disabled={busy === `delete-slot-${slot.id}`}
                    >
                      {busy === `delete-slot-${slot.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyTable title="No scheduled content" body="Run Monthly Auto or schedule a finished project before filling the calendar." />
          )}
        </div>
      </SectionStack>
    );
  }

  function renderPublished() {
    return (
      <SectionStack>
        <PublishingStatusLegend />
        <div className="stats-grid">
          <Metric label="Produced" value={counts.produced} />
          <Metric label="Published" value={counts.published} />
          <Metric label="Archived" value={counts.archived} />
          <Metric label="Protected used ideas" value={counts.used} />
        </div>
        <div className="panel data-panel">
          <div className="data-row data-head publish-row">
            <div>Ready Content</div>
            <div>Status</div>
            <div>Latest Output</div>
            <div>Updated</div>
            <div>Actions</div>
          </div>
          {publishableProjects.length ? (
            publishableProjects.map((project) => {
              const scriptDraft = latestScriptDraft(project);
              return (
                <div className="data-row publish-row" key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <span>{project.storyIdea?.hook || `${formatProjectFormat(project.format)} project`}</span>
                  </div>
                  <div>
                    <span className={cn("status-chip", projectStatusClass(project.status))}>{displayProjectStatus(project.status)}</span>
                    <small className="status-helper">{projectStatusHelp(project.status)}</small>
                  </div>
                  <div>{scriptDraft ? `${passLabelForProject(scriptDraft.passType, project.format)} v${scriptDraft.version} · ${scriptDraft.wordCount.toLocaleString()} words` : "No output yet"}</div>
                  <div>{formatDate(project.updatedAt)}</div>
                  <div className="inline-actions">
                    <button
                      className="secondary-button compact publish-button"
                      type="button"
                      onClick={() => void updateProjectStatus(project, "PUBLISHED")}
                      disabled={busy === `project-status-${project.id}-PUBLISHED`}
                    >
                      {busy === `project-status-${project.id}-PUBLISHED` ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
                      Mark Published
                    </button>
                    {project.status !== "PRODUCED" ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void updateProjectStatus(project, "PRODUCED")}
                        disabled={busy === `project-status-${project.id}-PRODUCED`}
                      >
                        {busy === `project-status-${project.id}-PRODUCED` ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
                        Mark Produced
                      </button>
                    ) : null}
                    {canScheduleOneOffProject(project, publishingSlots) ? (
                      <button
                        className="secondary-button compact"
                        type="button"
                        onClick={() => void scheduleProjectInCalendar(project)}
                        disabled={busy === `schedule-project-${project.id}`}
                      >
                        {busy === `schedule-project-${project.id}` ? <Loader2 size={15} className="spin" /> : <CalendarDays size={15} />}
                        Schedule In Calendar
                      </button>
                    ) : project.format !== "EPISODIC_SERIES" && projectHasCalendarSlot(project, publishingSlots) ? (
                      <button className="secondary-button compact" type="button" disabled>
                        <CalendarDays size={15} />
                        Scheduled
                      </button>
                    ) : project.format !== "EPISODIC_SERIES" && project.status === "PUBLISHED" ? (
                      <button className="secondary-button compact" type="button" disabled title="Published content is already live. Reactivate it before scheduling again.">
                        <Globe2 size={15} />
                        Already Published
                      </button>
                    ) : project.format !== "EPISODIC_SERIES" && project.status === "ARCHIVED" ? (
                      <button className="secondary-button compact" type="button" disabled title="Archived content must be reactivated before scheduling.">
                        <Archive size={15} />
                        Archived
                      </button>
                    ) : null}
                    <button
                      className="secondary-button compact"
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        goToSection("script-lab");
                      }}
                    >
                      <FileText size={15} />
                      Open Lab
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyTable title="No finished content ready to publish" body="Run at least a draft pass in Content Lab, then mark the project produced or published here." />
          )}
        </div>
        <div className="panel data-panel">
          <div className="data-row data-head publish-row">
            <div>Story</div>
            <div>Status</div>
            <div>Source</div>
            <div>Used Date</div>
            <div>Actions</div>
          </div>
          {usedProjects.length || usedIdeasWithoutProject.length ? (
            <>
              {usedProjects.map((project) => (
                <div className="data-row publish-row" key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <span>{project.storyIdea?.hook || `${formatProjectFormat(project.format)} project`}</span>
                  </div>
                  <div>
                    <span className={cn("status-chip", projectStatusClass(project.status))}>{displayProjectStatus(project.status)}</span>
                    <small className="status-helper">{projectStatusHelp(project.status)}</small>
                  </div>
                  <div>{project.storyIdea?.category || "Content Project"}</div>
                  <div>{formatDate(project.updatedAt)}</div>
                  <div className="inline-actions">
                    <button className="secondary-button compact" type="button" onClick={() => void updateProjectStatus(project, "FINAL")}>
                      <RefreshCw size={15} />
                      Reactivate
                    </button>
                    <button className="secondary-button compact" type="button" onClick={() => void updateProjectStatus(project, "ARCHIVED")}>
                      <Archive size={15} />
                      Archive
                    </button>
                  </div>
                </div>
              ))}
              {usedIdeasWithoutProject.map((idea) => (
                <div className="data-row publish-row" key={idea.id}>
                  <div>
                    <strong>{idea.title}</strong>
                    <span>{idea.hook}</span>
                  </div>
                  <div>
                    <span className={cn("status-chip", statusClass(idea.status))}>{displayStatus(idea.status)}</span>
                  </div>
                  <div>{idea.category}</div>
                  <div>{formatDate(idea.usedAt || idea.updatedAt)}</div>
                  <div className="inline-actions">
                    <button className="secondary-button compact" type="button" onClick={() => void updateIdeaStatus(idea.id, "SAVED", `"${idea.title}" reactivated.`)}>
                      <RefreshCw size={15} />
                      Reactivate
                    </button>
                    <button className="secondary-button compact" type="button" onClick={() => void updateIdeaStatus(idea.id, "ARCHIVED", `"${idea.title}" archived.`)}>
                      <Archive size={15} />
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <EmptyTable title="No used stories yet" body="Mark content as produced or published when it leaves the active pipeline." />
          )}
        </div>
      </SectionStack>
    );
  }

  function renderMedia() {
    const mediaProjects = projects.filter((project) => supportsThumbnails(project) || supportsBookIllustrations(project) || project.format === "ARTICLE");

    return (
      <SectionStack>
        <div className="action-strip">
          <button className="primary-button fit" type="button" onClick={() => void generateAllMissingThumbnails()} disabled={Boolean(busy)}>
            {busy === "thumbnail-batch" ? <Loader2 size={16} className="spin" /> : <ImageIcon size={16} />}
            {busy === "thumbnail-batch" ? "Creating Thumbnails" : "Create Missing Thumbnails"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void loadProjectsAndIdeas()}>
            <RefreshCw size={16} />
            Refresh Media
          </button>
        </div>
        {busy === "thumbnail-batch" ? (
          <div className="workflow-auto-note">
            <Loader2 size={15} className="spin" />
            Running {autoStep || "thumbnail batch"}...
          </div>
        ) : null}
        {workflowErrors["thumbnail-batch"] ? (
          <div className="workflow-step-error">
            <CircleSlash size={15} />
            <span>{workflowErrors["thumbnail-batch"]}</span>
          </div>
        ) : null}
        <div className="media-grid">
          {mediaProjects.length ? (
            mediaProjects.slice(0, 9).map((project) => {
              const assets = displayAssetsForProject(project);
              const assetLabel = assetResultsLabel(project);
              const isArticleAssetProject = project.format === "ARTICLE";
              const isBookAssetProject = supportsBookIllustrations(project);
              const visualQa = localVisualQa(project);
              return (
                <div className="panel pad media-card" key={project.id}>
                  <div className="media-card-head">
                    <ImageIcon size={20} />
                    <div>
                      <strong>{project.title}</strong>
                      <span>{assets.length ? `${assets.length} generated ${assetLabel.toLowerCase()}` : project.storyIdea?.category || `No ${assetLabel.toLowerCase()} yet`}</span>
                    </div>
                  </div>
                  {supportsThumbnails(project) ? (
                    <div className={cn("media-qa-strip", visualQa.status)}>
                      <strong>{visualQa.label}</strong>
                      <span>{visualQa.detail}</span>
                    </div>
                  ) : null}
                  {assets.length ? (
                    <div className={cn("media-thumb-strip", (isArticleAssetProject || isBookAssetProject) && "book-illustration-results")}>
                      {assets.slice(0, 3).map((asset) => (
                        <a href={asset.imageUrl} target="_blank" rel="noreferrer" key={asset.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={asset.imageUrl} alt={asset.title || `${assetLabel} ${asset.variant}`} />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div className="checklist mini">
                      {isArticleAssetProject ? (
                        <>
                          <div className="check-line">
                            <CircleSlash size={15} />
                            Run Article SEO Pack first
                          </div>
                          <div className="check-line">
                            <ImageIcon size={15} />
                            Then generate article images
                          </div>
                        </>
                      ) : isBookAssetProject ? (
                        <>
                          <div className="check-line">
                            <CircleSlash size={15} />
                            Plan illustrations in Content Lab
                          </div>
                          <div className="check-line">
                            <ImageIcon size={15} />
                            Then generate book images
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="check-line">
                            <CircleSlash size={15} />
                            Create Business Campaign Kit first
                          </div>
                          <div className="check-line">
                            <ImageIcon size={15} />
                            Then create Runware thumbnails
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    className="secondary-button compact"
                    type="button"
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      goToSection("script-lab");
                    }}
                  >
                    <FileText size={15} />
                    Content Lab
                  </button>
                </div>
              );
            })
          ) : (
            <Panel title="No media queue yet">
              <EmptyState title="No media assets yet" body="Video thumbnails, article images, and optional book illustrations appear here after you create eligible projects." />
            </Panel>
          )}
        </div>
      </SectionStack>
    );
  }

  function renderExports() {
    const vaultRows = exportVaultRows(projects);

    return (
      <SectionStack>
        <div className="action-strip">
          <button className="primary-button fit" type="button" onClick={() => selectedProject && window.open(apiPath(`/api/projects/${selectedProject.id}/content-pack`), "_blank")} disabled={!selectedProject || !hasPublishableScript(selectedProject)}>
            <Download size={16} />
            Download Selected Content Pack
          </button>
          <button className="secondary-button" type="button" onClick={() => downloadUploadPackage()} disabled={!selectedProject || !hasPublishableScript(selectedProject)}>
            <ShieldCheck size={16} />
            Download Upload Package
          </button>
          <button className="secondary-button" type="button" onClick={() => void loadProjectsAndIdeas()}>
            <RefreshCw size={16} />
            Refresh Vault
          </button>
        </div>
        <div className="panel data-panel">
          <div className="data-row data-head export-row">
            <div>Project</div>
            <div>Campaign Kit</div>
            <div>Upload Package</div>
            <div>Book PDF</div>
            <div>Kindle EPUB</div>
            <div>Markdown</div>
            <div>Plain Text</div>
          </div>
          {projects.length ? (
            projects.map((project) => {
              const body = latestScriptDraft(project);
              return (
                <div className="data-row export-row" key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <span>{formatProjectFormat(project.format)} · {displayProjectStatus(project.status)} · {body ? `${body.wordCount.toLocaleString()} words` : "No output yet"}</span>
                  </div>
                  <div>
                    {body ? (
                      <a className="primary-button compact" href={apiPath(`/api/projects/${project.id}/content-pack`)}>
                        <Download size={15} />
                        Kit
                      </a>
                    ) : (
                      "No output yet"
                    )}
                  </div>
                  <div>
                    {body ? (
                      <a className="secondary-button compact" href={apiPath(`/api/projects/${project.id}/upload-package?format=markdown`)}>
                        <ShieldCheck size={15} />
                        Upload
                      </a>
                    ) : (
                      "No output yet"
                    )}
                  </div>
                  <div>
                    {body && supportsBookExport(project) ? (
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(project, "pdf")}>
                        <BookOpen size={15} />
                        PDF
                      </button>
                    ) : (
                      "N/A"
                    )}
                  </div>
                  <div>
                    {body && supportsBookExport(project) ? (
                      <button className="secondary-button compact" type="button" onClick={() => downloadBookExport(project, "epub")}>
                        <BookOpen size={15} />
                        EPUB
                      </button>
                    ) : (
                      "N/A"
                    )}
                  </div>
                  <div>
                    <a className="secondary-button compact" href={apiPath(`/api/export/${project.id}?format=md`)}>
                      <Download size={15} />
                      .md
                    </a>
                  </div>
                  <div>
                    <a className="secondary-button compact" href={apiPath(`/api/export/${project.id}?format=txt`)}>
                      <Download size={15} />
                      .txt
                    </a>
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyTable title="Nothing to export" body="Create a project and run a draft pass first." />
          )}
        </div>
        <Panel title="Export Vault History">
          {vaultRows.length ? (
            <div className="vault-list">
              {vaultRows.map((row) => (
                <div className="vault-row" key={row.id}>
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.meta}</span>
                  </div>
                  <button
                    className="secondary-button compact"
                    type="button"
                    onClick={() => {
                      downloadTextFile(row.filename, row.content);
                      setMessage(`${row.title} downloaded.`);
                    }}
                  >
                    <Download size={15} />
                    Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No export history yet" body="Run workflow passes to build downloadable draft history." />
          )}
        </Panel>
      </SectionStack>
    );
  }

  async function syncYoutubeAnalytics(channelId = currentChannel?.id) {
    if (!channelId) return;
    await runAction(`youtube-sync-${channelId}`, async () => {
      const payload = await fetchJson<{ videosSynced: number; recommendationCount: number }>("/api/youtube/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId })
      });
      await loadYoutubeAnalytics(selectedChannelId);
      setMessage(`YouTube synced ${payload.videosSynced} videos and created ${payload.recommendationCount} recommendations.`);
    }, { errorKey: "youtube" });
  }

  async function disconnectYoutubeAnalytics(channelId = currentChannel?.id) {
    if (!channelId) return;
    await runAction(`youtube-disconnect-${channelId}`, async () => {
      await fetchJson<{ deleted: number }>("/api/youtube/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId })
      });
      await loadYoutubeAnalytics(selectedChannelId);
      setMessage("YouTube analytics disconnected for this channel.");
    }, { errorKey: "youtube" });
  }

  async function saveYoutubeCredentials() {
    await runAction("youtube-credentials", async () => {
      const payload = await fetchJson<Pick<UserSettings, "youtubeClientId" | "hasYoutubeOAuthCredentials">>("/api/youtube/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          youtubeClientId: settingsDraft.youtubeClientId,
          youtubeClientSecret: settingsDraft.youtubeClientSecret
        })
      });
      const patch = {
        youtubeClientId: payload.youtubeClientId ?? "",
        hasYoutubeOAuthCredentials: Boolean(payload.hasYoutubeOAuthCredentials),
        youtubeClientSecret: ""
      };
      setSettings((current) => ({ ...current, ...patch }));
      setSettingsDraft((current) => ({ ...current, ...patch }));
      setMessage("YouTube OAuth credentials saved. You can connect YouTube now.");
    }, { errorKey: "youtube" });
  }

  function renderAnalytics() {
    const analytics = youtubeAnalytics;
    const summary = analytics?.summary;
    const connected = Boolean(analytics?.connected);
    const youtubeConnectionsByChannel = new Map((analytics?.connections ?? []).map((connection) => [connection.channelId, connection]));

    return (
      <SectionStack>
        <div className="panel pad">
          <div className="panel-title-row">
            <div>
              <h2 className="panel-title">
                <BarChart3 size={18} />
                YouTube Growth Loop
              </h2>
              <p className="settings-note">
                {connected && analytics?.connection
                  ? `Connected to ${analytics.connection.youtubeChannelTitle}. Last sync: ${analytics.connection.lastSyncedAt ? formatDateTime(analytics.connection.lastSyncedAt) : "not synced yet"}.`
                  : "Connect the active Policyinsurance channel to YouTube, then sync weekly performance automatically."}
              </p>
            </div>
            <div className="inline-actions">
              {connected ? (
                <>
                  <button className="primary-button compact" type="button" onClick={() => void syncYoutubeAnalytics()} disabled={busy === `youtube-sync-${currentChannel?.id}`}>
                    {busy === `youtube-sync-${currentChannel?.id}` ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                    Sync Now
                  </button>
                  <button className="secondary-button compact" type="button" onClick={() => void disconnectYoutubeAnalytics()} disabled={busy === `youtube-disconnect-${currentChannel?.id}`}>
                    <CircleSlash size={15} />
                    Disconnect
                  </button>
                </>
              ) : settings.hasYoutubeOAuthCredentials && currentChannel ? (
                <a className={cn("primary-button compact", !settings.hasYoutubeOAuthCredentials && "disabled-link")} href={settings.hasYoutubeOAuthCredentials && currentChannel ? apiPath(`/api/youtube/connect?channelId=${currentChannel.id}`) : undefined}>
                  <KeyRound size={15} />
                  Connect YouTube
                </a>
              ) : (
                <button className="primary-button compact" type="button" onClick={() => setMessage("Save YouTube OAuth credentials below, then Connect YouTube.")}>
                  <KeyRound size={15} />
                  Connect YouTube
                </button>
              )}
            </div>
          </div>
          {!settings.hasYoutubeOAuthCredentials ? (
            <div className="youtube-credentials-box">
              <div className="inline-warning">Add and save a YouTube OAuth Client ID and Client Secret before connecting the channel.</div>
              <Field label="YouTube OAuth Client ID">
                <input
                  value={settingsDraft.youtubeClientId ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, youtubeClientId: event.target.value }))}
                  placeholder="Google OAuth client ID"
                />
              </Field>
              <Field label="YouTube OAuth Client Secret">
                <input
                  type="password"
                  value={settingsDraft.youtubeClientSecret ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, youtubeClientSecret: event.target.value }))}
                  placeholder="Google OAuth client secret"
                />
                <small className="field-hint">Redirect URI: {typeof window !== "undefined" ? `${window.location.origin}/api/youtube/callback` : "/api/youtube/callback"}</small>
              </Field>
              <button className="secondary-button compact" type="button" onClick={() => void saveYoutubeCredentials()} disabled={busy === "youtube-credentials"}>
                {busy === "youtube-credentials" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                Save YouTube Credentials
              </button>
            </div>
          ) : null}
          {workflowErrors.youtube ? <div className="inline-warning">{workflowErrors.youtube}</div> : null}
          {loadingYoutubeAnalytics ? <div className="inline-info">Loading YouTube analytics...</div> : null}
        </div>
        <Panel title="YouTube Channel Connections">
          <p className="settings-note">Manage one YouTube connection per Policyinsurance channel. Switch the active channel at the top to review detailed analytics for that channel.</p>
          <div className="youtube-connection-list">
            {channels.map((channel) => {
              const connection = youtubeConnectionsByChannel.get(channel.id);
              const isActive = channel.id === currentChannel?.id;
              const syncBusy = busy === `youtube-sync-${channel.id}`;
              const disconnectBusy = busy === `youtube-disconnect-${channel.id}`;
              return (
                <div className={cn("youtube-connection-row", isActive && "active")} key={channel.id}>
                  <div>
                    <strong>{channel.name}</strong>
                    <span>
                      {connection
                        ? `${connection.youtubeChannelTitle} · ${connection.lastSyncedAt ? `last synced ${formatDateTime(connection.lastSyncedAt)}` : "not synced yet"}`
                        : "No YouTube channel connected"}
                    </span>
                  </div>
                  <div className="inline-actions">
                    {!isActive ? (
                      <button className="secondary-button compact" type="button" onClick={() => void switchChannel(channel.id)}>
                        <Navigation size={15} />
                        Make Active
                      </button>
                    ) : null}
                    {connection ? (
                      <>
                        <button className="secondary-button compact" type="button" onClick={() => void syncYoutubeAnalytics(channel.id)} disabled={syncBusy}>
                          {syncBusy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                          Sync
                        </button>
                        <button className="secondary-button compact" type="button" onClick={() => void disconnectYoutubeAnalytics(channel.id)} disabled={disconnectBusy}>
                          {disconnectBusy ? <Loader2 size={15} className="spin" /> : <CircleSlash size={15} />}
                          Disconnect
                        </button>
                      </>
                    ) : settings.hasYoutubeOAuthCredentials ? (
                      <a className="primary-button compact" href={apiPath(`/api/youtube/connect?channelId=${channel.id}`)}>
                        <KeyRound size={15} />
                        Connect
                      </a>
                    ) : (
                      <span className="status-pill small">Save OAuth first</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <div className="stats-grid">
          <Metric label="7-day views" value={formatCompact(summary?.currentViews ?? 0)} />
          <Metric label="7-day watch hours" value={formatOneDecimal(summary?.currentWatchHours ?? 0)} />
          <Metric label="Audience growth" value={formatSigned(summary?.currentSubscribersNet ?? 0)} />
          <Metric label="Avg retention" value={`${formatOneDecimal(summary?.averageRetention ?? 0)}%`} />
        </div>
        <div className="stats-grid">
          <Metric label="12-month watch hours" value={formatOneDecimal(summary?.annualWatchHours ?? 0)} />
          <Metric label="Watch baseline" value={formatOneDecimal(summary?.annualWatchHours ?? 0)} />
          <Metric label="Audience baseline" value={formatCompact(summary?.currentSubscribersNet ?? 0)} />
          <Metric label="Avg CTR" value={`${formatOneDecimal(summary?.averageCtr ?? 0)}%`} />
        </div>
        <Panel title="Lead-Focused Readout">
          <div className="money-analytics-grid">
            {moneyFocusedAnalytics({ analytics, projects, blueprint: channelBlueprintDraft }).map((item) => (
              <div className="money-analytics-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </div>
            ))}
          </div>
        </Panel>
        <div className="dashboard-grid two">
          <Panel title="Recommendations">
            {analytics?.recommendations.length ? (
              <div className="recommendation-list">
                {analytics.recommendations.map((item) => (
                  <article className="recommendation-card" key={item.id}>
                    <div className="recommendation-card-head">
                      <span>{item.category}</span>
                      <strong>{item.priority}</strong>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.insight}</p>
                    <p>{item.recommendation}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No YouTube recommendations yet" body={connected ? "Run Sync Now after videos are published to generate recommendations." : "Connect YouTube to turn weekly performance into title, thumbnail, script, and topic suggestions."} />
            )}
          </Panel>
          <Panel title="Latest Synced Videos">
            {analytics?.videos.length ? (
              <div className="youtube-video-list">
                {analytics.videos.slice(0, 8).map((video) => (
                  <div className="youtube-video-row" key={video.id}>
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail URLs are external assets.
                      <img src={video.thumbnailUrl} alt="" loading="lazy" />
                    ) : null}
                    <div>
                      <strong>{video.title}</strong>
                      <span>{formatCompact(video.views)} views · {formatOneDecimal(video.watchHours)} watch hours · {formatOneDecimal(video.averageViewPercentage)}% retained · {formatSigned(video.subscribersGained)} audience growth</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No video metrics yet" body="After connecting YouTube, Sync Now will pull recent uploads and weekly performance." />
            )}
          </Panel>
        </div>
        <Panel title="Sync History">
          {analytics?.syncRuns.length ? (
            <div className="pipeline-list">
              {analytics.syncRuns.map((run) => (
                <div className="pipeline-row" key={run.id}>
                  <span>{run.status} · {formatDateTime(run.startedAt)}</span>
                  <strong>{run.videosSynced} videos</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No syncs yet" body="Manual and weekly automatic sync runs will appear here." />
          )}
        </Panel>
        <div className="stats-grid">
          <Metric label="Average idea score" value={counts.averageScore || "—"} />
          <Metric label="Queue depth" value={counts.queued} />
          <Metric label="Project count" value={counts.projects} />
          <Metric label="Duplicate-protected" value={counts.used} />
        </div>
        <div className="dashboard-grid two">
          <Panel title="Category Performance">
            {categoryStats.length ? (
              <div className="analytics-list">
                {categoryStats.map((item) => (
                  <div className="analytics-row" key={item.label}>
                    <span>{item.label}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.min(100, item.average)}%` }} />
                    </div>
                    <strong>{item.average}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No analytics yet" body="Generate ideas to calculate category performance." />
            )}
          </Panel>
          <Panel title="Status Mix">
            <div className="pipeline-list">
              {(["UNUSED", "SAVED", "IN_PROGRESS", "DRAFTED", "PRODUCED", "PUBLISHED", "ARCHIVED", "REJECTED"] as IdeaStatus[]).map((status) => (
                <div className="pipeline-row" key={status}>
                  <span>{displayStatus(status)}</span>
                  <strong>{ideas.filter((idea) => idea.status === status).length}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </SectionStack>
    );
  }

  function renderGuides() {
    return (
      <SectionStack>
        <div className="panel pad">
          <div className="panel-title-row">
            <div>
              <h2 className="panel-title">
                <BookOpen size={18} />
                Baxter Growth Lab Guides
              </h2>
              <p className="settings-note">Current channel: {currentChannel?.name || "Main Channel"}</p>
            </div>
          </div>
          <div className="tabs guide-tabs">
            {guideTabs.map((tab) => (
              <button
                className={cn("tab", activeGuide === tab && "active")}
                type="button"
                key={tab}
                onClick={() => setActiveGuide(tab)}
              >
                <BookOpen size={16} />
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="guide-grid">
          {guidesByTab[activeGuide].map((section) => (
            <article className="guide-card" key={section.title}>
              <h3>{section.title}</h3>
              {section.body ? <p>{section.body}</p> : null}
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SectionStack>
    );
  }

  function renderHotNiches(options: { compact?: boolean } = {}) {
    const catalogNiches = hotNiches.length ? hotNiches : rankedForgeCatalog;
    const visibleNiches = options.compact && !showAllForgeRankings ? catalogNiches.slice(0, 10) : catalogNiches;
    const title = hotNichesMonth ? `Insurance Lanes: ${hotNichesMonth}` : "Insurance Lane Catalog";
    const body = "These are the fixed private channel lanes. Use the top channel selector to work inside one niche.";

    return (
      <div className={cn("hot-niches-panel", options.compact && "idea-factory-rankings-panel")}>
        <div className="hot-niches-head">
          <div>
            <h3>{title}</h3>
            <p>
              {body}
              {hotNichesModel ? ` Model: ${hotNichesModel}.` : ""}
            </p>
          </div>
          <div className="inline-actions compact-actions">
            {options.compact && catalogNiches.length > 10 ? (
              <button className="secondary-button compact" type="button" onClick={() => setShowAllForgeRankings((current) => !current)}>
                <ListChecks size={15} />
              {showAllForgeRankings ? "Show Top 10" : `Show All ${catalogNiches.length}`}
              </button>
            ) : null}
            <button className="secondary-button compact" type="button" onClick={() => void loadHotNiches()} disabled={busy === "hot-niches"}>
              {busy === "hot-niches" ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
              {hotNiches.length ? "Refresh" : "Load Insurance Lanes"}
            </button>
          </div>
        </div>
        {busy === "hot-niches" ? <div className="inline-info">Loading the fixed insurance catalog...</div> : null}
        {workflowErrors["hot-niches"] ? <div className="inline-warning">{workflowErrors["hot-niches"]}</div> : null}
        {workflowErrors["blocked-channel-ideas"] ? <div className="inline-warning">{workflowErrors["blocked-channel-ideas"]}</div> : null}
        {hotNichesWarning ? <div className="inline-warning">{hotNichesWarning}</div> : null}
        {catalogNiches.length ? (
          <div className={cn("hot-niche-grid", options.compact && "ranked-niche-grid")}>
            {visibleNiches.map((niche) => {
              const ideaKey = channelIdeaKey(niche);
              const isBlocked = blockedChannelIdeaKeys.has(ideaKey);
              return (
                <article className={cn("hot-niche-card", isBlocked && "blocked-channel-idea")} key={niche.title}>
                  <div>
                    <span className="hot-niche-eyebrow">{niche.nicheFocus}</span>
                    <h4>{niche.title}</h4>
                    <p>{niche.description}</p>
                  </div>
                  {typeof niche.monetizationScore === "number" ? (
                    <div className="monetization-rank-strip">
                      <strong>{niche.monetizationScore}/10</strong>
                      <span>{agencyRevenueTierLabel(niche.monetizationTier)}</span>
                      {niche.monetizationRank ? <small>Rank #{niche.monetizationRank}</small> : null}
                    </div>
                  ) : null}
                  <label className="channel-idea-lock">
                    <input
                      type="checkbox"
                      checked={isBlocked}
                      onChange={(event) => void setChannelIdeaBlocked(niche, event.target.checked)}
                    />
                    <span>{isBlocked ? "Hidden. Uncheck to restore." : "Hide this insurance lane from this panel"}</span>
                  </label>
                  <p><strong>Why now:</strong> {niche.whyHotThisMonth}</p>
                  {niche.monetizationRationale ? <p><strong>Revenue fit:</strong> {niche.monetizationRationale}</p> : null}
                  <p><strong>Prospect promise:</strong> {niche.bestViewerPromise}</p>
                  <div className="keyword-cloud compact-cloud">
                    {niche.keywords.slice(0, 4).map((keyword) => <span className="keyword-pill" key={keyword}><strong>{keyword}</strong></span>)}
                  </div>
                  <div className="inline-actions">
                    <button className="secondary-button compact" type="button" onClick={() => applyHotNiche(niche)} disabled={isBlocked}>
                      <Lightbulb size={15} />
                      Use
                    </button>
                    <button
                      className="primary-button compact"
                      type="button"
                      onClick={() => void runChannelIdeaMachine({ seedOverride: seedFromHotNiche(niche) })}
                      disabled={busy === "channel-machine" || busy === "channel-blueprint" || isBlocked}
                    >
                      {busy === "channel-machine" ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                      Generate Growth Pack
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-inline">Click Load Insurance Lanes to review the fixed catalog.</div>
        )}
        {options.compact && catalogNiches.length > visibleNiches.length ? (
          <button className="text-link" type="button" onClick={() => setShowAllForgeRankings(true)}>
            Show the remaining {catalogNiches.length - visibleNiches.length} ranked niches
          </button>
        ) : null}
      </div>
    );
  }

  function renderChannelMachineKit(kit: ChannelBlueprint) {
    const keywords = kit.keywords ?? [];
    const combinations = kit.ideaCombinations ?? [];
    const keywordCsv = keywords.map((keyword) => keyword.keyword.trim()).filter(Boolean).join(", ");
    const keywordCharCount = keywordCsv.length;
    const descriptionText = kit.description || kit.targetAudience || "";
    const descriptionCharCount = descriptionText.length;
    const assetName = safeFilename(kit.channelName || currentChannel?.name || "channel");
    const kitIsBlocked = blockedChannelIdeaKeys.has(channelKitIdeaKey(kit, currentChannel?.name));

    return (
      <div className="channel-machine-result">
        {(kit.logoImageUrl || kit.bannerImageUrl) ? (
          <div className="channel-brand-preview">
            {kit.logoImageUrl ? (
              <figure className="channel-brand-card logo-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- Generated asset URLs are arbitrary external images and must be downloadable as-is. */}
                <img src={kit.logoImageUrl} alt={`${kit.channelName || "Channel"} logo`} loading="lazy" />
                <figcaption>Logo preview</figcaption>
                <div className="channel-brand-actions">
                  <button className="secondary-button compact" type="button" onClick={() => void downloadGeneratedAsset(kit.logoImageUrl, `${assetName}-logo.jpg`)}>
                    <Download size={15} />
                    Save Logo
                  </button>
                  <a className="secondary-button compact" href={kit.logoImageUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </figure>
            ) : null}
            {kit.bannerImageUrl ? (
              <figure className="channel-brand-card banner-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- Generated asset URLs are arbitrary external images and must be downloadable as-is. */}
                <img src={kit.bannerImageUrl} alt={`${kit.channelName || "Channel"} YouTube banner`} loading="lazy" />
                <figcaption>Banner preview. Save downloads the full 2560 x 1440 asset with text kept inside the YouTube safe area.</figcaption>
                <div className="channel-brand-actions">
                  <button className="secondary-button compact" type="button" onClick={() => void downloadGeneratedAsset(kit.bannerImageUrl, `${assetName}-banner-2560x1440.jpg`)}>
                    <Download size={15} />
                    Save Banner
                  </button>
                  <a className="secondary-button compact" href={kit.bannerImageUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              </figure>
            ) : null}
          </div>
        ) : null}
        {workflowErrors["asset-download"] ? <div className="inline-warning">{workflowErrors["asset-download"]}</div> : null}
        <label className={cn("channel-idea-lock channel-kit-lock", kitIsBlocked && "locked")}>
          <input
            type="checkbox"
            checked={kitIsBlocked}
            onChange={(event) => void setChannelKitBlocked(kit, event.target.checked)}
          />
          <span>{kitIsBlocked ? "This generated channel idea is locked. Uncheck to use it again." : "Never use this generated channel idea again"}</span>
        </label>
        <div className="channel-kit-summary">
          <div>
            <span>Channel Name</span>
            <strong>{kit.channelName || currentChannel?.name || "Untitled Channel"}</strong>
          </div>
          <div>
            <span>Tagline</span>
            <strong>{kit.tagline || "No tagline generated yet"}</strong>
          </div>
          <div>
            <span>
              Description
              {descriptionText ? <em className={cn("description-char-count", descriptionCharCount > 1000 && "over")}>{descriptionCharCount}/1000 characters</em> : null}
            </span>
            <p>{descriptionText}</p>
          </div>
        </div>
        {kit.dataForSeoWarning ? <div className="inline-warning">{kit.dataForSeoWarning}</div> : null}
        {keywords.length ? (
          <div className="channel-kit-block">
            <div className="channel-kit-block-head">
              <div>
                <h3>Keyword Targets</h3>
                <span className={cn("keyword-char-count", keywordCharCount > 500 && "over")}>{keywordCharCount}/500 characters</span>
              </div>
              <button
                className="secondary-button compact"
                type="button"
                onClick={() => void copyText(keywordCsv, "Channel keywords copied as comma-separated text.")}
              >
                <Copy size={15} />
                Copy All
              </button>
            </div>
            <p className="keyword-csv-preview">{keywordCsv}</p>
            <div className="keyword-cloud">
              {keywords.slice(0, 24).map((keyword) => (
                <span className="keyword-pill" key={keyword.keyword}>
                  <strong>{keyword.keyword}</strong>
                  {keyword.searchVolume !== undefined ? <em>{keyword.searchVolume.toLocaleString()} searches</em> : <em>{keyword.priority}</em>}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {combinations.length ? (
          <div className="channel-kit-block">
            <h3>Idea Factory Combinations</h3>
            <div className="idea-combo-list">
              {combinations.map((combination, index) => (
                <article className="idea-combo-card" key={`${combination.category}-${index}`}>
                  <div>
                    <span>Combo {index + 1}</span>
                    <strong>{combination.category}</strong>
                    <p>{combination.rationale}</p>
                  </div>
                  <dl>
                    <div><dt>Niche</dt><dd>{combination.nicheFocus}</dd></div>
                    <div><dt>Tone</dt><dd>{combination.tone}</dd></div>
                    <div><dt>Length</dt><dd>{combination.desiredLength}</dd></div>
                    <div><dt>Source</dt><dd>{combination.sourceType}</dd></div>
                  </dl>
                  {combination.sampleAngles?.length ? (
                    <ul>
                      {combination.sampleAngles.slice(0, 3).map((angle) => <li key={angle}>{angle}</li>)}
                    </ul>
                  ) : null}
                  <button className="secondary-button compact" type="button" onClick={() => applyIdeaCombination(combination)}>
                    <Lightbulb size={15} />
                    Apply
                  </button>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderSettings() {
    const setupItems = workspaceSetupItems(activeWorkspace, settings, channels, workspaceMembers);
    const isAppAdmin = user.role === "ADMIN";
    return (
      <SectionStack>
        <div className="settings-section-tabs">
          {[
            { label: "Business Setup", detail: "Workspace, team, phone, service area, and compliance defaults." },
            { label: "Growth Lanes", detail: "Texas-only carrier and product packs for ideas and campaigns." },
            { label: "AI Providers", detail: "OpenRouter, Anthropic, OpenAI, Runware, and routing fallbacks." },
            { label: "Integrations", detail: "YouTube analytics, WordPress, DataForSEO, exports, and upload checks." },
            { label: "Content Defaults", detail: "Tone, narration, CTA, sponsor language, and thumbnail style." }
          ].map((item) => (
            <div className="settings-section-card" key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
        <div className="settings-grid">
          <div className="panel pad">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">
                  <ShieldCheck size={18} />
                  Workspace Setup
                </h2>
                <p className="settings-note">Use this for each agency, brand, or operating workspace. Content stays inside the active workspace.</p>
              </div>
              {activeWorkspace ? <span className="status-pill small">{subscriptionLabel(activeWorkspace.subscriptionStatus)}</span> : null}
            </div>
            <Field label="Active Workspace">
              <select value={activeWorkspace?.id ?? ""} onChange={(event) => void switchWorkspace(event.target.value)}>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} {workspace.role ? `(${workspace.role.toLowerCase()})` : ""}
                  </option>
                ))}
              </select>
              <small className="field-hint">Switching workspace changes channels, ideas, projects, calendar, branding, and team members.</small>
            </Field>
            <div className="setup-checklist">
              {setupItems.map((item) => (
                <div className={cn("setup-check", item.done && "done")} key={item.label}>
                  <CheckCircle2 size={16} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="inline-actions">
              <input
                value={newWorkspaceName}
                onChange={(event) => setNewWorkspaceName(event.target.value)}
                placeholder="New agency workspace"
              />
              <button className="secondary-button compact" type="button" onClick={createWorkspace} disabled={busy === "workspace-create" || newWorkspaceName.trim().length < 2}>
                {busy === "workspace-create" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                Create
              </button>
            </div>
            {canManageWorkspace ? (
              <button className="primary-button" type="button" onClick={completeWorkspaceSetup} disabled={busy === "workspace-setup" || Boolean(activeWorkspace?.setupCompletedAt)}>
                {busy === "workspace-setup" ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                {activeWorkspace?.setupCompletedAt ? "Setup Complete" : "Mark Setup Complete"}
              </button>
            ) : null}
          </div>

          <div className="panel pad">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">
                  <UserCog size={18} />
                  Team Admin & Members
                </h2>
                <p className="settings-note">Invite agency admins or production members with a copyable sign-up link.</p>
              </div>
            </div>
            {canManageWorkspace ? (
              <>
                <div className="inline-actions">
                  <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="person@example.com" />
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as WorkspaceRole)}>
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="OWNER">Owner</option>
                  </select>
                  <button className="secondary-button compact" type="button" onClick={inviteWorkspaceMember} disabled={busy === "workspace-invite" || !inviteEmail.trim()}>
                    {busy === "workspace-invite" ? <Loader2 size={15} className="spin" /> : <UserCog size={15} />}
                    Invite
                  </button>
                </div>
                <div className="member-list">
                  {workspaceMembers.map((member) => (
                    <div className="member-row" key={member.id}>
                      <div>
                        <strong>{member.user.name || member.user.email || "Team member"}</strong>
                        <span>{member.user.email}</span>
                      </div>
                      <select value={member.role} onChange={(event) => void updateWorkspaceMemberRole(member, event.target.value as WorkspaceRole)} disabled={busy === `member-role-${member.id}`}>
                        <option value="OWNER">Owner</option>
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                      </select>
                      <button className="secondary-button compact danger-button" type="button" onClick={() => void removeWorkspaceMember(member)} disabled={member.userId === user.id || busy === `member-remove-${member.id}`}>
                        {busy === `member-remove-${member.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {workspaceInvites.length ? (
                  <div className="archived-channel-list">
                    <h3>Pending Invites</h3>
                    {workspaceInvites.map((invite) => (
                      <div className="channel-row archived" key={invite.id}>
                        <div className="channel-row-main static">
                          <strong>{invite.email}</strong>
                          <span>{invite.role.toLowerCase()}</span>
                        </div>
                        <div className="channel-row-actions">
                          <button className="secondary-button compact" type="button" onClick={() => void copyInviteLink(invite)}>
                            <Copy size={15} />
                            Copy Link
                          </button>
                          <button className="secondary-button compact danger-button" type="button" onClick={() => void deleteWorkspaceInvite(invite)} disabled={busy === `invite-delete-${invite.id}`}>
                            {busy === `invite-delete-${invite.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="inline-info">Only workspace owners and admins can invite or remove members.</div>
            )}
          </div>

          <div className="panel pad">
            <h2 className="panel-title">
              <BarChart3 size={18} />
              Workspace Usage
            </h2>
            <p className="settings-note">Activity tracking only. Each member still uses their own saved API keys; this is not a client billing meter.</p>
            <div className="workspace-usage-grid">
              <Metric label="Generations" value={workspaceUsage?.generationCount ?? 0} />
              <Metric label="Last 30 days" value={workspaceUsage?.recentGenerationCount ?? 0} />
              <Metric label="Tokens" value={compactNumber(workspaceUsage?.totalTokens ?? 0)} />
              <Metric label="Est. provider cost" value={formatMoney(workspaceUsage?.estimatedCost ?? 0)} />
            </div>
            {isAppAdmin && activeWorkspace ? (
              <div className="subscription-controls">
                <Field label="Subscription Status">
                  <select value={workspaceStatusDraft} onChange={(event) => setWorkspaceStatusDraft(event.target.value as WorkspaceSubscriptionStatus)}>
                    <option value="ACTIVE">Active</option>
                    <option value="TRIALING">Trialing</option>
                    <option value="PAST_DUE">Past Due</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="CANCELED">Canceled</option>
                  </select>
                </Field>
                <Field label="Plan Note">
                  <input value={workspacePlanDraft} onChange={(event) => setWorkspacePlanDraft(event.target.value)} placeholder="$997 setup + $97/mo" />
                </Field>
                <button className="secondary-button compact" type="button" onClick={saveWorkspaceStatus} disabled={busy === "workspace-status"}>
                  {busy === "workspace-status" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                  Save Status
                </button>
              </div>
            ) : null}
          </div>

          <div className="panel pad">
            <h2 className="panel-title">
              <Globe2 size={18} />
              Channels
            </h2>
            <Field label="New Channel Name">
              <input
                value={newChannelName}
                onChange={(event) => setNewChannelName(event.target.value)}
                placeholder="Channel name"
              />
            </Field>
            <button className="primary-button" type="button" onClick={createChannel} disabled={busy === "channel-create" || newChannelName.trim().length < 2}>
              {busy === "channel-create" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                  Add + Activate Lane
            </button>
            <div className="channel-list">
              {alphabetizedChannels.map((channel) => (
                <div
                  className={cn("channel-row", channel.id === selectedChannelId && "active")}
                  key={channel.id}
                >
                  <button className="channel-row-main" type="button" onClick={() => void switchChannel(channel.id)}>
                    <strong>{channel.name}</strong>
                    <span>{channel.id === selectedChannelId ? "Active" : "Switch"}</span>
                  </button>
                  <button
                    className="secondary-button compact danger-button channel-delete-button"
                    type="button"
                    onClick={() => void deleteChannel(channel)}
                    disabled={busy === `channel-delete-${channel.id}`}
                  >
                    {busy === `channel-delete-${channel.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                    Delete
                  </button>
                </div>
              ))}
            </div>
            {archivedChannels.length ? (
              <div className="archived-channel-list">
                <h3>Archived Growth Lanes</h3>
                {alphabetizedArchivedChannels.map((channel) => (
                  <div className="channel-row archived" key={channel.id}>
                    <div className="channel-row-main static">
                      <strong>{channel.name}</strong>
                      <span>Archived</span>
                    </div>
                    <div className="channel-row-actions">
                      <button className="secondary-button compact" type="button" onClick={() => void restoreChannel(channel.id)} disabled={busy === `channel-restore-${channel.id}`}>
                        {busy === `channel-restore-${channel.id}` ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                        Restore
                      </button>
                      <button
                        className="secondary-button compact danger-button channel-delete-button"
                        type="button"
                        onClick={() => void deleteChannel(channel)}
                        disabled={busy === `channel-delete-${channel.id}`}
                      >
                        {busy === `channel-delete-${channel.id}` ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="panel pad channel-machine-panel">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">
                  <Lightbulb size={18} />
                  Growth Pack Machine
                </h2>
                <p className="settings-note">The private app starts from the fixed insurance catalog. Use this only for experiments outside the saved lanes.</p>
              </div>
              {channelMachineModel ? <span className="status-pill small">Model {channelMachineModel}</span> : null}
            </div>
            {renderHotNiches()}
            <Field label="Optional Growth Direction">
              <textarea
                className="short-textarea"
                value={channelMachineSeed}
                onChange={(event) => setChannelMachineSeed(event.target.value)}
                placeholder="Example: Houston homeowners, Germania home policies, storm readiness, plain-English local expert tone..."
              />
              <small className="field-hint">Use this only when you already have a direction. Otherwise choose an insurance lane or click Surprise Me.</small>
            </Field>
            <div className="toggle-row compact-row">
              <div>
                <strong>Create Logo + Banner</strong>
                <span>Uses Runware / Ideogram 4 when a Runware key is saved</span>
              </div>
              <button
                type="button"
                className={cn("switch", channelMachineGenerateImages && "on")}
                onClick={() => setChannelMachineGenerateImages((current) => !current)}
                aria-label="Toggle channel brand image generation"
              >
                <span />
              </button>
            </div>
            <div className="inline-actions">
              <button className="primary-button compact" type="button" onClick={() => void runChannelIdeaMachine()} disabled={busy === "channel-machine"}>
                {busy === "channel-machine" ? <Loader2 size={15} className="spin" /> : <Zap size={15} />}
                Generate Growth Pack
              </button>
              <button className="secondary-button compact" type="button" onClick={() => void runChannelIdeaMachine({ surpriseMe: true })} disabled={busy === "channel-machine"}>
                {busy === "channel-machine" ? <Loader2 size={15} className="spin" /> : <Lightbulb size={15} />}
                Surprise Me
              </button>
              <button className="secondary-button compact" type="button" onClick={() => void saveChannelMachineKit()} disabled={!channelMachineResult || busy === "channel-blueprint"}>
                {busy === "channel-blueprint" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                {busy === "channel-blueprint" ? "Creating..." : channelMachineSaveNotice ? "Created + Active" : "Create & Activate Lane"}
              </button>
            </div>
            {busy === "channel-machine" ? <div className="inline-info">Building the full growth pack: name, positioning, keywords, logo/banner prompts, and Idea Factory combinations...</div> : null}
            {workflowErrors["channel-machine"] ? <div className="inline-warning">{workflowErrors["channel-machine"]}</div> : null}
            {workflowErrors["channel-blueprint"] ? <div className="inline-warning">{workflowErrors["channel-blueprint"]}</div> : null}
            {channelMachineSaveNotice ? <div className="inline-info">{channelMachineSaveNotice}</div> : null}
            {channelMachineResult ? renderChannelMachineKit(channelMachineResult) : null}
          </div>

          <div className="panel pad">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">
                  <BookOpen size={18} />
                  Saved Growth Strategy
                </h2>
                <p className="settings-note">This is the saved strategy the app uses for the active growth lane. Normally it is auto-filled when you generate and save a Growth Pack; edit manually only when you want to override the AI result.</p>
              </div>
            </div>
            <Field label="Generated Growth Lane Name">
              <input
                value={channelBlueprintDraft.channelName ?? ""}
                onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, channelName: event.target.value }))}
                placeholder={currentChannel?.name || "Growth lane name"}
              />
            </Field>
            <Field label="Generated Tagline">
              <input
                value={channelBlueprintDraft.tagline ?? ""}
                onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, tagline: event.target.value }))}
                placeholder="Short banner subtitle"
              />
            </Field>
            <Field label="Growth Lane Description">
              <textarea
                className="short-textarea"
                value={channelBlueprintDraft.description ?? ""}
                onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Saved internal lane strategy, positioning, and campaign description"
              />
              <small className="field-hint">
                {(channelBlueprintDraft.description?.length ?? 0).toLocaleString()} characters. This saved strategy can be longer than a public channel About description; generated public descriptions are compacted separately.
              </small>
            </Field>
            <Field label="Target Audience">
              <textarea className="short-textarea" value={channelBlueprintDraft.targetAudience} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, targetAudience: event.target.value }))} />
            </Field>
            <Field label="Tone Rules">
              <textarea className="short-textarea" value={channelBlueprintDraft.toneRules} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, toneRules: event.target.value }))} />
            </Field>
            <Field label="Brand Voice Profile">
              <textarea className="short-textarea" value={channelBlueprintDraft.voiceProfile} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, voiceProfile: event.target.value }))} />
            </Field>
            <Field label="Intro Style">
              <textarea className="short-textarea" value={channelBlueprintDraft.introStyle} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, introStyle: event.target.value }))} />
            </Field>
            <Field label="Formatting Rules">
              <textarea className="short-textarea" value={channelBlueprintDraft.formattingRules} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, formattingRules: event.target.value }))} />
            </Field>
            <Field label="Preferred Phrases">
              <textarea className="short-textarea" value={channelBlueprintDraft.phrasesToUse} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, phrasesToUse: event.target.value }))} />
            </Field>
            <Field label="Recurring Story Types">
              <textarea className="short-textarea" value={channelBlueprintDraft.recurringStoryTypes} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, recurringStoryTypes: event.target.value }))} />
            </Field>
            <Field label="Banned Phrases">
              <textarea className="short-textarea" value={channelBlueprintDraft.bannedPhrases} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, bannedPhrases: event.target.value }))} />
            </Field>
            <Field label="Phrases To Avoid">
              <textarea className="short-textarea" value={channelBlueprintDraft.phrasesToAvoid} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, phrasesToAvoid: event.target.value }))} />
            </Field>
            <Field label="Thumbnail Style">
              <textarea className="short-textarea" value={channelBlueprintDraft.thumbnailStyle} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, thumbnailStyle: event.target.value }))} />
            </Field>
            <Field label="CTA / Compliance Rules">
              <textarea className="short-textarea" value={channelBlueprintDraft.sponsorRules} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, sponsorRules: event.target.value }))} />
            </Field>
            <Field label="Publishing Rhythm">
              <input value={channelBlueprintDraft.publishingRhythm} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, publishingRhythm: event.target.value }))} />
            </Field>
            <div className="settings-mini-grid">
              <Field label="Revenue Goal">
                <textarea
                  className="short-textarea"
                  value={channelBlueprintDraft.moneyGoal ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, moneyGoal: event.target.value }))}
                  placeholder="Example: generate qualified Texas home and auto quote requests from Houston-area prospects."
                />
              </Field>
              <Field label="Compliance / Risk Lane">
                <textarea
                  className="short-textarea"
                  value={channelBlueprintDraft.riskTolerance ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, riskTolerance: event.target.value }))}
                  placeholder="Example: Texas-only, no guaranteed savings, explain coverage limits plainly, avoid carrier promises."
                />
              </Field>
              <Field label="Weekly Content Target">
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={channelBlueprintDraft.weeklyVideoTarget ?? 2}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, weeklyVideoTarget: Number(event.target.value) || 1 }))}
                />
              </Field>
              <Field label="Primary Quote URL">
                <input
                  value={channelBlueprintDraft.affiliateUrl ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, affiliateUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </Field>
              <Field label="Offer Description">
                <textarea
                  className="short-textarea"
                  value={channelBlueprintDraft.offerDescription ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, offerDescription: event.target.value }))}
                  placeholder="What the prospect gets, who it helps, and when they should call, request a quote, or book a review."
                />
              </Field>
              <Field label="Email Capture / Lead Magnet">
                <textarea
                  className="short-textarea"
                  value={channelBlueprintDraft.emailCapturePlan ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, emailCapturePlan: event.target.value }))}
                  placeholder="Checklist, Texas coverage guide, renewal review, quote checklist, or claims-prep resource."
                />
              </Field>
              <Field label="Primary CTA">
                <textarea
                  className="short-textarea"
                  value={channelBlueprintDraft.primaryCta ?? ""}
                  onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, primaryCta: event.target.value }))}
                  placeholder="Call 281-445-1381, request a quote, schedule a review, leave a review, or ask for a referral."
                />
              </Field>
            </div>
            <Field label="Logo Prompt">
              <textarea className="short-textarea" value={channelBlueprintDraft.logoPrompt ?? ""} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, logoPrompt: event.target.value }))} />
            </Field>
            <Field label="Banner Prompt">
              <textarea className="short-textarea" value={channelBlueprintDraft.bannerPrompt ?? ""} onChange={(event) => setChannelBlueprintDraft((current) => ({ ...current, bannerPrompt: event.target.value }))} />
            </Field>
            <button className="primary-button" type="button" onClick={() => void saveChannelBlueprint()} disabled={busy === "channel-blueprint"}>
              {busy === "channel-blueprint" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save Channel Strategy
            </button>
          </div>

          <div className="panel pad">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">
                  <KeyRound size={18} />
                  AI Providers
                </h2>
                <p className="settings-note">
                  Fallback catalogs
                  {anthropicModels.length || openAiModels.length ? ` · ${anthropicModels.length} Anthropic · ${openAiModels.length} OpenAI` : ""}
                  {fallbackModelsFetchedAt ? ` · refreshed ${formatDateTime(fallbackModelsFetchedAt)}` : ""}
                </p>
                <p className="settings-note">Saved API keys are encrypted in the database and stay in place until you enter a replacement key.</p>
              </div>
              <button
                className="secondary-button compact"
                type="button"
                onClick={() => void loadFallbackModels(true, { anthropicApiKey: settingsDraft.anthropicApiKey, openAiApiKey: settingsDraft.openAiApiKey })}
                disabled={loadingFallbackModels}
              >
                {loadingFallbackModels ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                Refresh Fallbacks
              </button>
            </div>
            {fallbackModelListError ? <div className="inline-warning">{fallbackModelListError}</div> : null}
            <Field label="OpenRouter API Key">
              <div className="inline-field-action">
                <input
                  type="password"
                  value={settingsDraft.openRouterApiKey ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, openRouterApiKey: event.target.value }))}
                  placeholder={settings.hasOpenRouterApiKey ? "Saved key is configured. Enter a new key to replace it." : "sk-or-..."}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("openrouter")} disabled={testingProvider === "openrouter"}>
                  {testingProvider === "openrouter" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <small className="field-hint">Primary text provider. If it fails or returns empty output, Baxter Growth Lab tries the fallback providers below.</small>
              <CredentialStatus configured={Boolean(settings.hasOpenRouterApiKey)} label="OpenRouter key" />
              <ApiTestLine result={apiTestResults.openrouter} />
            </Field>
            <Field label="Anthropic API Key">
              <div className="inline-field-action">
                <input
                  type="password"
                  value={settingsDraft.anthropicApiKey ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, anthropicApiKey: event.target.value }))}
                  placeholder={settings.hasAnthropicApiKey ? "Saved key is configured. Enter a new key to replace it." : "sk-ant-..."}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("anthropic")} disabled={testingProvider === "anthropic"}>
                  {testingProvider === "anthropic" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <CredentialStatus configured={Boolean(settings.hasAnthropicApiKey)} label="Anthropic key" />
              <ApiTestLine result={apiTestResults.anthropic} />
            </Field>
            <FallbackModelSelect
              label="Anthropic Fallback Model"
              hint="Used only after OpenRouter fails, or when OpenRouter is not configured."
              value={settingsDraft.anthropicModel}
              models={filteredAnthropicModels}
              allModels={anthropicModels}
              loading={loadingFallbackModels}
              warning={fallbackModelWarnings.anthropic}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, anthropicModel: value }))}
            />
            <Field label="OpenAI API Key">
              <div className="inline-field-action">
                <input
                  type="password"
                  value={settingsDraft.openAiApiKey ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, openAiApiKey: event.target.value }))}
                  placeholder={settings.hasOpenAiApiKey ? "Saved key is configured. Enter a new key to replace it." : "sk-..."}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("openai")} disabled={testingProvider === "openai"}>
                  {testingProvider === "openai" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <CredentialStatus configured={Boolean(settings.hasOpenAiApiKey)} label="OpenAI key" />
              <ApiTestLine result={apiTestResults.openai} />
            </Field>
            <FallbackModelSelect
              label="OpenAI Fallback Model"
              hint="Used after OpenRouter and Anthropic fail, or as a direct fallback when configured."
              value={settingsDraft.openAiModel}
              models={filteredOpenAiModels}
              allModels={openAiModels}
              loading={loadingFallbackModels}
              warning={fallbackModelWarnings.openai}
              onChange={(value) => setSettingsDraft((current) => ({ ...current, openAiModel: value }))}
            />
            <Field label="Runware API Key">
              <div className="inline-field-action">
                <input
                  type="password"
                  value={settingsDraft.runwareApiKey ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, runwareApiKey: event.target.value }))}
                  placeholder={settings.hasRunwareApiKey ? "Saved key is configured. Enter a new key to replace it." : "Runware API key"}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("runware")} disabled={testingProvider === "runware"}>
                  {testingProvider === "runware" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <CredentialStatus configured={Boolean(settings.hasRunwareApiKey)} label="Runware key" />
              <ApiTestLine result={apiTestResults.runware} />
            </Field>
            <Field label="Runware Thumbnail Model">
              <input
                value={settingsDraft.runwareModel}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, runwareModel: event.target.value }))}
                placeholder="ideogram:4@0"
              />
              <small className="field-hint">Used for 16:9 thumbnail image generation. Ideogram 4 is the default for strong text and layout control.</small>
            </Field>
            <Field label="DataForSEO Login">
              <div className="inline-field-action">
                <input
                  value={settingsDraft.dataForSeoLogin ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, dataForSeoLogin: event.target.value }))}
                  placeholder={settings.hasDataForSeoCredentials ? "Saved login is configured. Enter a new login to replace it." : "DataForSEO API login"}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("dataforseo")} disabled={testingProvider === "dataforseo"}>
                  {testingProvider === "dataforseo" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <small className="field-hint">Optional keyword metrics for Growth Pack Machine, publishing descriptions, tags, and search targeting.</small>
            </Field>
            <Field label="DataForSEO Password">
              <input
                type="password"
                value={settingsDraft.dataForSeoPassword ?? ""}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, dataForSeoPassword: event.target.value }))}
                placeholder={settings.hasDataForSeoCredentials ? "Saved password is configured. Enter a new password to replace it." : "DataForSEO API password"}
              />
              <ApiTestLine result={apiTestResults.dataforseo} />
              <CredentialStatus configured={Boolean(settings.hasDataForSeoCredentials)} label="DataForSEO credentials" />
            </Field>
            <Field label="WordPress Site URL">
              <input
                value={settingsDraft.wordpressSiteUrl ?? ""}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, wordpressSiteUrl: event.target.value }))}
                placeholder="https://your-site.com"
              />
              <small className="field-hint">Used for Article projects only. Baxter Growth Lab creates draft posts through the WordPress REST API.</small>
            </Field>
            <Field label="WordPress Username">
              <input
                value={settingsDraft.wordpressUsername ?? ""}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, wordpressUsername: event.target.value }))}
                placeholder={settings.hasWordPressCredentials ? "Saved username is configured. Enter a new username to replace it." : "WordPress username"}
              />
            </Field>
            <Field label="WordPress Application Password">
              <div className="inline-field-action">
                <input
                  type="password"
                  value={settingsDraft.wordpressApplicationPassword ?? ""}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, wordpressApplicationPassword: event.target.value }))}
                  placeholder={settings.hasWordPressCredentials ? "Saved application password is configured. Enter a new password to replace it." : "xxxx xxxx xxxx xxxx xxxx xxxx"}
                />
                <button className="secondary-button compact" type="button" onClick={() => void testApiProvider("wordpress")} disabled={testingProvider === "wordpress"}>
                  {testingProvider === "wordpress" ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
                  Test
                </button>
              </div>
              <small className="field-hint">Create this inside WordPress under Users → Profile → Application Passwords.</small>
              <ApiTestLine result={apiTestResults.wordpress} />
              <CredentialStatus configured={Boolean(settings.hasWordPressCredentials)} label="WordPress credentials" />
            </Field>
            <Field label="YouTube OAuth Client ID">
              <input
                value={settingsDraft.youtubeClientId ?? ""}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, youtubeClientId: event.target.value }))}
                placeholder={settings.hasYoutubeOAuthCredentials ? "Saved client ID is configured." : "Google OAuth client ID"}
              />
              <small className="field-hint">Use an OAuth web client from Google Cloud. Add this redirect URI: {typeof window !== "undefined" ? `${window.location.origin}/api/youtube/callback` : "/api/youtube/callback"}</small>
            </Field>
            <Field label="YouTube OAuth Client Secret">
              <input
                type="password"
                value={settingsDraft.youtubeClientSecret ?? ""}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, youtubeClientSecret: event.target.value }))}
                placeholder={settings.hasYoutubeOAuthCredentials ? "Saved client secret is configured. Enter a new secret to replace it." : "Google OAuth client secret"}
              />
              <CredentialStatus configured={Boolean(settings.hasYoutubeOAuthCredentials)} label="YouTube OAuth credentials" />
              <small className="field-hint">Scopes requested: YouTube readonly and YouTube Analytics readonly. These power weekly subscriber, watch-time, CTR, and retention analysis.</small>
            </Field>
            <Field label="Thumbnail Style Guide">
              <textarea
                className="short-textarea"
                value={settingsDraft.thumbnailStyleGuide}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, thumbnailStyleGuide: event.target.value }))}
                placeholder={DEFAULT_THUMBNAIL_STYLE_GUIDE}
              />
              <small className="field-hint">Applied to every Business Campaign Kit prompt and every Runware thumbnail request.</small>
            </Field>
            <button className="primary-button" type="button" onClick={saveSettings} disabled={busy === "settings"}>
              {busy === "settings" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save AI Providers
            </button>
          </div>

          <div className="panel pad">
            <div className="panel-title-row">
              <div>
                <h2 className="panel-title">Model Routing</h2>
                <p className="settings-note">
                  Live OpenRouter catalog
                  {openRouterModels.length ? ` · ${openRouterModels.length} text models` : ""}
                  {modelsFetchedAt ? ` · refreshed ${formatDateTime(modelsFetchedAt)}` : ""}
                </p>
              </div>
              <div className="panel-title-actions">
                <button className="secondary-button compact" type="button" onClick={() => void loadOpenRouterModels(true)} disabled={loadingModels}>
                  {loadingModels ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />}
                  Refresh
                </button>
                <button className="primary-button compact" type="button" onClick={() => void saveModelRoutingSettings()} disabled={busy === "model-routing"}>
                  {busy === "model-routing" ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                  Save Model Routing
                </button>
              </div>
            </div>
            {modelRoutingDirty ? <div className="inline-warning">Unsaved model routing changes. Click Save Model Routing before generating new content.</div> : null}
            <Field label="Filter Model Dropdowns">
              <input
                value={modelQuery}
                onChange={(event) => setModelQuery(event.target.value)}
                placeholder="Search provider, model name, or model ID..."
              />
            </Field>
            {modelListError ? <div className="inline-warning">{modelListError}</div> : null}
            <div className="toggle-row routing-toggle-row">
              <div>
                <strong>Auto Model Routing</strong>
                <span>Use the saved model below for each generation task.</span>
              </div>
              <button
                type="button"
                className={cn("switch", settingsDraft.autoModelRouting && "on")}
                onClick={() => setSettingsDraft((current) => ({ ...current, autoModelRouting: !current.autoModelRouting }))}
                aria-label="Toggle model routing from the Model Routing panel"
              >
                <span />
              </button>
            </div>
            {modelRouteFields.map((field) => (
              <ModelSelect
                key={field.key}
                label={field.label}
                hint={field.hint}
                value={settingsDraft[field.key]}
                models={filteredOpenRouterModels}
                allModels={openRouterModels}
                loading={loadingModels}
                onChange={(value) => setSettingsDraft((current) => ({ ...current, [field.key]: value }))}
              />
            ))}
          </div>

          <div className="panel pad">
            <h2 className="panel-title">Story Defaults</h2>
            <Field label="Preferred Tone">
              <select
                value={settingsDraft.preferredTone}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, preferredTone: event.target.value }))}
              >
                {toneOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Narration Style">
              <select
                value={settingsDraft.narrationStyle}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, narrationStyle: event.target.value }))}
              >
                {narrationStyleOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Default Length Minutes">
              <select
                value={settingsDraft.defaultLengthMinutes}
                onChange={(event) => setSettingsDraft((current) => ({ ...current, defaultLengthMinutes: Number(event.target.value) }))}
              >
                {storyLengthOptions.map((item) => (
                  <option key={item.minutes} value={item.minutes}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <button className="primary-button" type="button" onClick={saveSettings} disabled={busy === "settings"}>
              {busy === "settings" ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Save Story Defaults
            </button>
          </div>
        </div>
      </SectionStack>
    );
  }
}

function SectionStack({ children }: { children: ReactNode }) {
  return <div className="section-stack">{children}</div>;
}

function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="right-panel-header">
        <h2>{title}</h2>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="metric-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PublishingStatusLegend() {
  return (
    <div className="workflow-auto-note publishing-status-note">
      <strong>Production flow:</strong>
      <span>
        <b>Produced</b> means finished but not live yet, so it can still be scheduled. <b>Published</b> means already live/final, so scheduling is locked unless you reactivate it.
      </span>
    </div>
  );
}

function EmptyState({ title, body, compact = false }: { title: string; body: string; compact?: boolean }) {
  return (
    <div className={cn("empty-state", compact && "compact")}>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  );
}

function EmptyTable({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-table">
      <EmptyState title={title} body={body} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ClientJobQueue({ jobs, compact = false }: { jobs: ClientJob[]; compact?: boolean }) {
  if (!jobs.length) return null;
  const visibleJobs = jobs.slice(0, compact ? 3 : 5);
  return (
    <div className={cn("client-job-queue", compact && "compact")}>
      <div className="client-job-head">
        <strong>Run Queue</strong>
        <span>{jobs.filter((job) => job.status === "queued" || job.status === "running" || job.status === "saving").length} active</span>
      </div>
      <div className="client-job-list">
        {visibleJobs.map((job) => (
          <div className={cn("client-job", job.status)} key={job.id}>
            <div>
              <strong>{job.label}</strong>
              <span>{job.detail}</span>
            </div>
            <small>{jobStatusLabel(job.status)}</small>
            <div className="client-job-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(5, Math.min(100, job.progress))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OutputHistoryPanel({
  project,
  outputs,
  selectedOutputId,
  onSelect
}: {
  project: StoryProject;
  outputs: CurrentScriptOutput[];
  selectedOutputId: string;
  onSelect: (outputId: string) => void;
}) {
  const drafts = outputs.filter((output) => !output.id.startsWith("complete-script-")).slice(0, 8);
  if (!drafts.length) return null;
  return (
    <div className="output-history-panel">
      <div className="mini-section-head">
        <strong>Output History</strong>
        <span>Prompt System v2 · {drafts.length} saved pass{drafts.length === 1 ? "" : "es"}</span>
      </div>
      <div className="output-history-list">
        {drafts.map((draft) => (
          <button className={cn("output-history-item", selectedOutputId === draft.id && "active")} type="button" key={draft.id} onClick={() => onSelect(draft.id)}>
            <strong>{passLabelForProject(draft.passType, project.format)} v{draft.version}</strong>
            <span>{draft.wordCount.toLocaleString()} words · {draft.modelUsed}</span>
            <small>{formatDateTime(draft.createdAt)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function UniversalAssetLibraryPanel({
  project,
  latestPublishingPackReady,
  imageCount,
  sourceReady
}: {
  project: StoryProject;
  latestPublishingPackReady: boolean;
  imageCount: number;
  sourceReady: boolean;
}) {
  const finalReady = hasPublishableScript(project);
  const assets = [
    { label: "Source Pack", ready: sourceReady, detail: sourceReady ? "Research and source notes saved" : "Add notes or source URLs" },
    { label: "Draft History", ready: Boolean(project.drafts?.length), detail: `${project.drafts?.length ?? 0} saved output${project.drafts?.length === 1 ? "" : "s"}` },
    { label: "Final Output", ready: finalReady, detail: finalReady ? projectFinalOutputLabel(project.format) : "Run workflow to finish" },
    { label: "Campaign Kit", ready: latestPublishingPackReady, detail: latestPublishingPackReady ? publishingPackLabel(project.format) : "Create the final campaign kit" },
    { label: "Images", ready: imageCount > 0, detail: imageCount ? `${imageCount} generated image${imageCount === 1 ? "" : "s"}` : "No image assets yet" },
    { label: "Exports", ready: finalReady, detail: finalReady ? "Content pack and downloads ready" : "Finish output first" }
  ];
  return (
    <div className="asset-library-panel">
      <div className="mini-section-head">
        <strong>Universal Asset Library</strong>
        <span>{formatProjectFormat(project.format)}</span>
      </div>
      <div className="asset-library-grid">
        {assets.map((asset) => (
          <div className={cn("asset-library-item", asset.ready && "ready")} key={asset.label}>
            {asset.ready ? <CheckCircle2 size={14} /> : <CircleSlash size={14} />}
            <div>
              <strong>{asset.label}</strong>
              <span>{asset.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UploadReadinessPanel({
  project,
  uploadPackage,
  busy,
  onCheck,
  onDownload
}: {
  project: StoryProject;
  uploadPackage?: UploadReadinessPackage;
  busy: boolean;
  onCheck: () => void;
  onDownload: () => void;
}) {
  const localReadyItems = [
    { label: "Script", ready: hasPublishableScript(project), detail: hasPublishableScript(project) ? "Final output is available." : "Run the workflow first." },
    { label: "Campaign Kit", ready: Boolean(latestDraftForPass(project, "PUBLISHING_PACK")), detail: latestDraftForPass(project, "PUBLISHING_PACK") ? "Campaign metadata exists." : "Create Business Campaign Kit." },
    { label: "Images", ready: !supportsThumbnails(project) || thumbnailAssetsForProject(project).length >= requiredThumbnailCountForProject(project), detail: supportsThumbnails(project) ? `${thumbnailAssetsForProject(project).length}/${requiredThumbnailCountForProject(project)} thumbnails.` : "No thumbnail requirement." }
  ];
  return (
    <Panel title="Ready-To-Use Campaign Package">
      <div className="upload-readiness-panel">
        <div className="upload-readiness-summary">
          <div>
            <span className={cn("readiness-pill", uploadPackage?.status === "Ready" ? "ready" : uploadPackage?.status === "Blocked" ? "blocked" : "needs-review")}>
              {uploadPackage ? `${uploadPackage.status} · ${uploadPackage.readinessScore}/100` : "Not checked"}
            </span>
            <h3>{project.title}</h3>
            <p>{uploadPackage ? "Download a paste-ready package with script, YouTube metadata, Shorts, source notes, visual QA, and performance memory." : "Run a quick readiness check before upload so missing assets, weak sources, and image issues are visible."}</p>
          </div>
          <div className="inline-actions">
            <button className="primary-button fit" type="button" onClick={onCheck} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />}
              {busy ? "Checking" : "Check Readiness"}
            </button>
            <button className="secondary-button compact" type="button" onClick={onDownload} disabled={!hasPublishableScript(project)}>
              <Download size={15} />
              Download Upload Pack
            </button>
          </div>
        </div>
        <div className="upload-check-grid">
          {(uploadPackage?.uploadChecklist ?? localReadyItems).map((item) => (
            <div className={cn("upload-check", item.ready && "ready")} key={item.label}>
              {item.ready ? <CheckCircle2 size={15} /> : <CircleSlash size={15} />}
              <div>
                <strong>{item.label}</strong>
                <span>{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
        {uploadPackage ? (
          <div className="upload-intelligence-grid">
            <div className="upload-intelligence-card">
              <strong>Source Intelligence</strong>
              <span>{uploadPackage.sourceIntelligence.status} · {uploadPackage.sourceIntelligence.score}/100</span>
              <p>{uploadPackage.sourceIntelligence.summary}</p>
            </div>
            <div className="upload-intelligence-card">
              <strong>Image QA</strong>
              <span>{uploadPackage.visualQa.status} · {uploadPackage.visualQa.score}/100</span>
              <p>{uploadPackage.visualQa.checks.find((check) => !check.ready)?.detail || "Visual set passes the current checks."}</p>
            </div>
            <div className="upload-intelligence-card">
              <strong>Performance Memory</strong>
              <span>{uploadPackage.performanceMemory.matches.length} match{uploadPackage.performanceMemory.matches.length === 1 ? "" : "es"}</span>
              <p>{uploadPackage.performanceMemory.summary}</p>
            </div>
            <div className="upload-intelligence-card">
              <strong>Shorts Engine</strong>
              <span>{uploadPackage.shorts.length} candidate{uploadPackage.shorts.length === 1 ? "" : "s"}</span>
              <p>{uploadPackage.shorts[0]?.hook || "Run Scene Cards or finish the script to extract Shorts."}</p>
            </div>
          </div>
        ) : null}
        {uploadPackage?.blockers.length || uploadPackage?.warnings.length ? (
          <div className="upload-warning-list">
            {[...(uploadPackage.blockers ?? []), ...(uploadPackage.warnings ?? [])].map((item) => (
              <div className="money-warning medium" key={item}>
                <strong>Review</strong>
                <span>{item}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ApiTestLine({ result }: { result?: ApiTestResult }) {
  if (!result) return null;
  return (
    <small className={cn("api-test-line", result.ok ? "ok" : "error")}>
      {result.ok ? <CheckCircle2 size={13} /> : <CircleSlash size={13} />}
      {result.message}
    </small>
  );
}

function CredentialStatus({ configured, label }: { configured: boolean; label: string }) {
  return (
    <small className={cn("credential-status", configured ? "ok" : "missing")}>
      {configured ? <CheckCircle2 size={13} /> : <CircleSlash size={13} />}
      {configured ? `${label} saved and retained until replaced.` : `${label} not saved yet.`}
    </small>
  );
}

function ModelSelect({
  label,
  hint,
  value,
  models,
  allModels,
  loading,
  onChange
}: {
  label: string;
  hint: string;
  value: string;
  models: OpenRouterModel[];
  allModels: OpenRouterModel[];
  loading: boolean;
  onChange: (value: string) => void;
}) {
  const selected = allModels.find((model) => model.id === value);
  const selectedVisible = models.some((model) => model.id === value);
  const options = selected && !selectedVisible ? [selected, ...models] : models;

  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={loading && !options.length}>
        {!selected ? <option value={value}>{value} (saved model ID)</option> : null}
        {!options.length ? <option value={value}>{loading ? "Loading OpenRouter models..." : "No matching models found"}</option> : null}
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {modelOptionLabel(model)}
          </option>
        ))}
      </select>
      <small className="field-hint">{hint}</small>
    </Field>
  );
}

function FallbackModelSelect({
  label,
  hint,
  value,
  models,
  allModels,
  loading,
  warning,
  onChange
}: {
  label: string;
  hint: string;
  value: string;
  models: FallbackProviderModel[];
  allModels: FallbackProviderModel[];
  loading: boolean;
  warning?: string;
  onChange: (value: string) => void;
}) {
  const selected = allModels.find((model) => model.id === value);
  const selectedVisible = models.some((model) => model.id === value);
  const savedModel = selected ? selected : { id: value, name: value, provider: "openai" as const, source: "default" as const };
  const options = dedupeFallbackModels(selectedVisible ? models : [savedModel, ...models]);

  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={loading && !options.length}>
        {!options.length ? <option value={value}>{loading ? "Loading fallback models..." : "No matching models found"}</option> : null}
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {fallbackModelOptionLabel(model)}
          </option>
        ))}
      </select>
      <small className="field-hint">{hint}</small>
      {warning ? <small className="field-hint">{warning}</small> : null}
    </Field>
  );
}

class TransientApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TransientApiError";
    this.status = status;
    Object.setPrototypeOf(this, TransientApiError.prototype);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit, options: FetchJsonOptions = {}): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const retryableMethod = method === "GET" || method === "HEAD" || options.retryUnsafe;
  const maxAttempts = retryableMethod ? (options.retries ?? DEFAULT_API_RETRIES) + 1 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response: Response;
    let text: string;

    try {
      response = await fetch(apiPath(url), init);
      text = await response.text();
    } catch {
      const error = new TransientApiError("Network connection interrupted. Please try again.");
      if (attempt < maxAttempts) {
        await sleep(apiRetryDelay(attempt, options));
        continue;
      }
      throw error;
    }

    let payload: { error?: string } = {};
    if (text) {
      try {
        payload = JSON.parse(text) as { error?: string };
      } catch {
        const message = apiResponseMessage(response, text);
        const error = shouldRetryApiResponse(response.status, text) ? new TransientApiError(message, response.status) : new Error(message);
        if (attempt < maxAttempts && shouldRetryApiResponse(response.status, text)) {
          await sleep(apiRetryDelay(attempt, options));
          continue;
        }
        throw error;
      }
    }

    if (!response.ok) {
      const message = payload.error || response.statusText;
      const error = shouldRetryApiResponse(response.status, text) ? new TransientApiError(message, response.status) : new Error(message);
      if (attempt < maxAttempts && shouldRetryApiResponse(response.status, text)) {
        await sleep(apiRetryDelay(attempt, options));
        continue;
      }
      throw error;
    }

    return payload as T;
  }

  throw new TransientApiError("Baxter Growth Lab could not complete the request. Please try again.");
}

function channelUrl(path: string, channelId?: string) {
  if (!channelId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}channelId=${encodeURIComponent(channelId)}`;
}

function isTransientApiError(error: unknown) {
  return error instanceof TransientApiError;
}

function apiRetryDelay(attempt: number, options: FetchJsonOptions) {
  return (options.retryDelayMs ?? DEFAULT_API_RETRY_DELAY_MS) * attempt;
}

function shouldRetryApiResponse(status: number, text: string) {
  const normalized = text.toLowerCase();
  return [502, 503, 504].includes(status) || normalized.includes("policyforge lab is starting");
}

function apiResponseMessage(response: Response, text: string) {
  const preview = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  return response.ok
    ? `Server returned a non-JSON response. ${preview || "Please try again."}`
    : `Server returned ${response.status} instead of JSON. ${preview || response.statusText}`;
}

function mergeIdeas(current: StoryIdea[], incoming: StoryIdea[]) {
  const byId = new Map(current.map((idea) => [idea.id, idea]));
  for (const idea of incoming) {
    byId.set(idea.id, idea);
  }
  return Array.from(byId.values());
}

function mergeSlots(current: PublishingSlot[], incoming: PublishingSlot[]) {
  const byId = new Map(current.map((slot) => [slot.id, slot]));
  for (const slot of incoming) {
    byId.set(slot.id, slot);
  }
  return Array.from(byId.values());
}

function sortModels(models: OpenRouterModel[]) {
  return [...models].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" })
  );
}

function sortFallbackModels(models: FallbackProviderModel[]) {
  return [...models].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" })
  );
}

function filterFallbackModels(models: FallbackProviderModel[], query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return models;
  return models.filter((model) => `${model.name} ${model.id} ${model.provider}`.toLowerCase().includes(text));
}

function dedupeFallbackModels(models: FallbackProviderModel[]) {
  return Array.from(new Map(models.map((model) => [model.id, model])).values());
}

function sortIdeas(ideas: StoryIdea[]) {
  return [...ideas].sort((a, b) => b.totalScore - a.totalScore || new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

function sortSlots(slots: PublishingSlot[]) {
  return [...slots].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
}

function shouldTrackClientJob(label: string) {
  return label === "auto" ||
    label === "episode-auto" ||
    label === "monthly-auto" ||
    label === "channel-machine" ||
    label === "thumbnail-batch" ||
    label.startsWith("pass-") ||
    label.startsWith("research-") ||
    label.includes("thumbnails") ||
    label.includes("scene-backgrounds") ||
    label.includes("article-images") ||
    label.includes("book-illustration");
}

function clientJobCopy(label: string) {
  if (label === "auto") return { label: "Fully Auto Workflow", detail: "Running each unlocked production step in order." };
  if (label === "episode-auto") return { label: "Episode Fully Auto", detail: "Building the episode series from the saved episode plan." };
  if (label === "monthly-auto") return { label: "Monthly Auto", detail: "Creating projects and assigning calendar slots." };
  if (label === "channel-machine") return { label: "Growth Pack", detail: "Generating positioning, keywords, visuals, and idea lanes." };
  if (label === "thumbnail-batch") return { label: "Batch Thumbnails", detail: "Creating missing packs and thumbnails." };
  if (label.startsWith("research-")) return { label: "Research Mode", detail: "Building source notes and verification targets." };
  if (label.includes("article-images")) return { label: "Article Images", detail: "Generating featured and inline article visuals." };
  if (label.includes("scene-backgrounds")) return { label: "HeyGen Backgrounds", detail: "Generating low-cost non-FLUX scene backgrounds." };
  if (label.includes("book-illustration")) return { label: "Book Illustrations", detail: "Planning or generating manuscript artwork." };
  if (label.includes("thumbnails")) return { label: "Thumbnails", detail: "Generating visual assets." };
  if (label.startsWith("pass-")) {
    const passType = label.replace(/^pass-/, "") as ScriptPassType;
    return { label: passLabel(passType), detail: "Running one workflow pass and saving the result." };
  }
  return { label: "Baxter Growth Lab Job", detail: "Running and saving changes." };
}

function jobStatusLabel(status: ClientJobStatus) {
  if (status === "queued") return "Queued";
  if (status === "running") return "Running";
  if (status === "saving") return "Saving";
  if (status === "complete") return "Complete";
  return "Failed";
}

function parseSourceUrls(value: string) {
  return value
    .split(/[\n,\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item))
    .slice(0, 8);
}

function contentStrengthProfile(idea: StoryIdea | null | undefined, project: StoryProject) {
  const lengthScore = idea?.lengthPotentialScore ?? Math.min(95, Math.max(45, Math.round((project.targetWordCount / 1000) + 55)));
  const researchDifficulty = idea?.researchDifficultyScore ?? 68;
  const sourceScore = project.sourceMaterial?.trim() ? Math.min(100, 64 + Math.round(project.sourceMaterial.trim().length / 900)) : 44;
  const targetPressure = project.targetWordCount >= 50000 ? 18 : project.targetWordCount >= 20000 ? 12 : project.targetWordCount >= 9000 ? 8 : 0;
  const score = Math.max(0, Math.min(100, Math.round((lengthScore * 0.45) + ((100 - researchDifficulty) * 0.2) + (sourceScore * 0.35) - targetPressure)));
  const label = score >= 82 ? `High strength (${score})` : score >= 64 ? `Medium strength (${score})` : `Low strength (${score})`;
  const className = score >= 82 ? "high" : score >= 64 ? "medium" : "low";
  const detail = score >= 82
    ? "This topic should support the selected format if the source notes stay strong."
    : score >= 64
      ? "This can work, but add more source material before pushing for a long output."
      : "This topic is likely too thin for the current target. Add sources or choose a shorter format.";
  return { score, label, className, detail };
}

function localVisualQa(project: StoryProject) {
  const assets = displayAssetsForProject(project);
  const required = requiredThumbnailCountForProject(project);
  if (!supportsThumbnails(project)) return { status: "ready", label: "No video thumbnail QA", detail: "This format does not require a YouTube thumbnail set." };
  if (assets.length < required) return { status: "blocked", label: "Images missing", detail: `${assets.length}/${required} thumbnails generated.` };
  const textSignals = assets.filter((asset) => /\b(overlay|text|part\s+\d|headline|readable|mobile|all caps)\b/i.test(`${asset.title || ""} ${asset.prompt}`)).length;
  const partSignals = projectHasEpisodePlan(project)
    ? assets.filter((asset) => /\bpart\s+[1-5]\b/i.test(`${asset.title || ""} ${asset.prompt}`)).length
    : required;
  if (projectHasEpisodePlan(project) && partSignals < 10) {
    return { status: "warn", label: "Episode labels need review", detail: `${partSignals} thumbnails mention Part labels.` };
  }
  if (textSignals < Math.ceil(required * 0.7)) {
    return { status: "warn", label: "Mobile readability risk", detail: `${textSignals}/${required} thumbnail prompts mention readable overlay or mobile text.` };
  }
  return { status: "ready", label: "Image QA looks strong", detail: "Count, text cues, and episode labels pass the basic checks." };
}

function workflowRunForecast(
  steps: Array<{ complete: boolean; enabled: boolean; id: string }>,
  project: StoryProject
) {
  const imageStepIds = new Set(["thumbnails", "article-images", "scene-backgrounds"]);
  const remainingSteps = steps.filter((step) => !step.complete && !imageStepIds.has(step.id)).length;
  const imageSteps = steps.filter((step) => !step.complete && imageStepIds.has(step.id)).length;
  const baseMinutes = remainingSteps * (project.format === "EPISODIC_SERIES" ? 3 : 2) + imageSteps * 2;
  const longOutputPenalty = project.targetLengthMinutes >= 30 ? 4 : project.targetLengthMinutes >= 20 ? 2 : 0;
  const estimatedMinutes = Math.max(1, baseMinutes + longOutputPenalty);
  const heavyRun = project.format === "EPISODIC_SERIES" || remainingSteps >= 8 || project.targetLengthMinutes >= 30;
  return {
    remainingSteps,
    estimatedMinutes,
    riskLabel: heavyRun ? "run in chunks if the server feels slow" : "safe to run normally",
    detail: heavyRun
      ? "For long series or long-form scripts, rerun from the next unlocked step if a gateway timeout interrupts the queue."
      : "This project has a short enough queue for normal manual or fully-auto production."
  };
}

function calendarIntelligence(projects: StoryProject[], slots: PublishingSlot[]) {
  const scheduledProjectIds = new Set(slots.map((slot) => slot.storyProjectId));
  const readyUnscheduled = projects.filter((project) => hasPublishableScript(project) && !scheduledProjectIds.has(project.id) && !isUsedProjectStatus(project.status));
  const unfinished = projects.filter((project) => !hasPublishableScript(project) && !isUsedProjectStatus(project.status));
  const futureSlots = slots.filter((slot) => !isPastDate(slot.scheduledDate) && slot.status === "SCHEDULED");
  const tips: Array<{ title: string; detail: string; priority: "good" | "warn" | "neutral" }> = [];

  tips.push({
    title: readyUnscheduled.length ? "Ready To Schedule" : "No Finished Backlog",
    detail: readyUnscheduled.length
      ? `${readyUnscheduled.length} finished output${readyUnscheduled.length === 1 ? "" : "s"} can be scheduled without creating duplicate dates.`
      : "Finish at least one project before using the calendar as a production queue.",
    priority: readyUnscheduled.length ? "good" : "neutral"
  });

  tips.push({
    title: futureSlots.length >= 4 ? "Calendar Has Buffer" : "Calendar Buffer Is Thin",
    detail: futureSlots.length >= 4
      ? `${futureSlots.length} future slot${futureSlots.length === 1 ? "" : "s"} are already scheduled.`
      : "Try to keep at least two weeks of Monday/Thursday content scheduled.",
    priority: futureSlots.length >= 4 ? "good" : "warn"
  });

  tips.push({
    title: unfinished.length ? "Next Production Focus" : "Production Queue Clear",
    detail: unfinished.length
      ? `Push "${unfinished[0].title}" through the workflow next, or archive projects you will not use.`
      : "Every active project has a finished output or has been cleared.",
    priority: unfinished.length ? "neutral" : "good"
  });

  return tips;
}

function autoScriptSequenceForProject(project: StoryProject) {
  if (!projectHasEpisodePlan(project)) return AUTO_SCRIPT_SEQUENCE;
  const sequence = [...AUTO_SCRIPT_SEQUENCE];
  const hookIndex = sequence.indexOf("HOOK_LAB");
  sequence.splice(hookIndex, 0, "EPISODES");
  return sequence;
}

function episodeAutoSequenceForProject(project: StoryProject) {
  return EPISODE_AUTO_SEQUENCE.filter((passType) => {
    if (passType === "PUBLISHING_PACK") return !projectHasEpisodePublishingPack(project);
    return !latestDraftForPass(project, passType);
  });
}

function projectHasEpisodePlan(project?: StoryProject | null) {
  return project?.format === "EPISODIC_SERIES" || Boolean(project?.drafts?.some((draft) => draft.passType === "EPISODES"));
}

function projectHasCompletedEpisodePlan(project?: StoryProject | null) {
  return Boolean(project?.drafts?.some((draft) => draft.passType === "EPISODES"));
}

function projectHasEpisodePublishingPack(project?: StoryProject | null) {
  const packDraft = latestDraftForPass(project || undefined, "PUBLISHING_PACK");
  if (!packDraft) return false;
  try {
    return (parsePublishingPack(packDraft.content).episodePacks?.length ?? 0) === episodeCountForProject(project);
  } catch {
    return false;
  }
}

function requiredThumbnailCountForProject(project?: StoryProject | null) {
  return projectHasEpisodePlan(project) ? episodeCountForProject(project) * 3 : 3;
}

function isUsedStatus(status: IdeaStatus) {
  return status === "PRODUCED" || status === "PUBLISHED" || status === "ARCHIVED";
}

function isIdeaProtectedProjectStatus(status: StoryProjectStatus) {
  return status === "PRODUCED" || status === "PUBLISHED" || status === "ARCHIVED";
}

function isUsedProjectStatus(status: StoryProjectStatus) {
  return status === "PUBLISHED" || status === "ARCHIVED";
}

function hasPublishableScript(project: StoryProject) {
  return Boolean(latestScriptDraft(project));
}

function projectHasCalendarSlot(project: StoryProject, slots: PublishingSlot[]) {
  return Boolean(calendarSlotForProject(project, slots));
}

function calendarSlotForProject(project: StoryProject, slots: PublishingSlot[]) {
  return [...(project.publishingSlots ?? []), ...slots]
    .filter((slot) => slot.storyProjectId === project.id)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];
}

function canScheduleOneOffProject(project: StoryProject, slots: PublishingSlot[]) {
  return project.format !== "EPISODIC_SERIES" && project.status !== "PUBLISHED" && project.status !== "ARCHIVED" && !projectHasCalendarSlot(project, slots);
}

function latestScriptDraft(project: StoryProject | undefined) {
  return project?.drafts?.find((draft) => draft.passType === "FINAL" || draft.passType === "VOICE_POLISH" || draft.passType === "REWRITE" || draft.passType === "DRAFT");
}

function scriptOutputOptionsForProject(project: StoryProject | undefined): CurrentScriptOutput[] {
  if (!project) return [];
  const outputs: CurrentScriptOutput[] = [];
  const intro = latestDraftForPass(project, "INTRO");
  const body = latestScriptDraft(project);
  const outro = latestDraftForPass(project, "OUTRO");
  if (body) {
    const projectSponsorBlurb = supportsSponsorBlurb(project.format) ? normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format) : null;
    const assembledContent = projectHasEpisodePlan(project)
      ? assembleEpisodeReviewContent(project, intro?.content, body.content, outro?.content, projectSponsorBlurb)
      : [
          intro ? normalizeSponsorLanguageForFormat(ensureIntroSponsorPlacement(intro.content, projectSponsorBlurb), project.format) : undefined,
          normalizeSponsorLanguageForFormat(stripSponsorCopyFromBody(body.content, projectSponsorBlurb), project.format),
          outro ? normalizeSponsorLanguageForFormat(ensureOutroSponsorPlacement(outro.content, projectSponsorBlurb), project.format) : undefined
        ].filter(Boolean).join("\n\n");
    const content = shouldFormatAsHeyGenScenes(project.format)
      ? formatHeyGenSceneScript(assembledContent)
      : assembledContent;
    const words = countWords(content);
    outputs.push({
      ...body,
      id: `complete-script-${project.id}-${body.id}-${intro?.id ?? "no-intro"}-${outro?.id ?? "no-outro"}`,
      content,
      wordCount: words,
      estimatedMinutes: Math.max(1, Math.round(words / 160)),
      displayLabel: projectFinalOutputLabel(project.format)
    });
  }
  outputs.push(...(project.drafts ?? []));
  return outputs;
}

function outputOptionLabel(output: CurrentScriptOutput) {
  const label = output.displayLabel ?? `${passLabel(output.passType)} v${output.version}`;
  return `${label} - ${output.wordCount.toLocaleString()} words`;
}

function isPublishingPackOutput(output?: CurrentScriptOutput) {
  return Boolean(output && output.passType === "PUBLISHING_PACK" && !output.id.startsWith("complete-script-"));
}

function isThisWeek(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return date >= start;
}

function displayStatus(status: IdeaStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function displayProjectStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function projectStatusHelp(status: StoryProjectStatus) {
  if (status === "PRODUCED") return "Finished, not live yet. You can still schedule it or mark it published later.";
  if (status === "PUBLISHED") return "Already live/final. Reactivate before scheduling it again.";
  if (status === "ARCHIVED") return "Archived and removed from the active schedule/publish workflow.";
  if (status === "FINAL") return "Final output exists. Schedule it, mark it produced, or mark it published after it goes live.";
  return "Still being built in Content Lab.";
}

function slotStatusHelp(status: PublishingSlotStatus) {
  if (status === "PRODUCED") return "Finished for this scheduled date, but not live yet.";
  if (status === "PUBLISHED") return "Live/final for this scheduled date.";
  if (status === "SKIPPED") return "Skipped date.";
  return "Waiting for production or publication.";
}

function statusClass(status: IdeaStatus) {
  if (status === "SAVED") return "saved";
  if (status === "REJECTED") return "rejected";
  if (status === "PRODUCED" || status === "PUBLISHED" || status === "ARCHIVED") return "used";
  if (status === "IN_PROGRESS" || status === "DRAFTED") return "progress";
  return "new";
}

function projectStatusClass(status: StoryProjectStatus) {
  if (status === "PRODUCED") return "produced";
  if (status === "PUBLISHED" || status === "ARCHIVED") return "used";
  if (status === "FINAL") return "saved";
  return "progress";
}

function subscriptionLabel(status: WorkspaceSubscriptionStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatCompact(value: number) {
  return compactNumber(Math.round(value));
}

function formatOneDecimal(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

function formatSigned(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString()}`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: value >= 10 ? 0 : 2 }).format(value);
}

function workspaceSetupItems(
  workspace: WorkspaceSummary | null,
  settings: UserSettings,
  channels: Channel[],
  members: WorkspaceMember[]
) {
  return [
    { label: "Workspace brand saved", done: Boolean(workspace?.name && workspace?.tagline) },
    { label: "At least one channel exists", done: channels.length > 0 },
    { label: "Text API provider configured", done: hasTextGenerationProvider(settings) },
    { label: "Team access ready", done: members.length > 0 },
    { label: "Subscription active", done: Boolean(workspace && (workspace.subscriptionStatus === "ACTIVE" || workspace.subscriptionStatus === "TRIALING")) }
  ];
}

function renderIdeaPowerPack(idea: StoryIdea) {
  const pack = ideaPowerPackForIdea(idea);
  if (!pack) return null;
  const riskLevel = pack.monetizationRisk?.riskLevel ?? "Medium";
  const verdict = ideaPowerVerdict(pack);
  const titleTests = pack.titleThumbnailPretest?.titles?.filter((item) => item.title).slice(0, 3) ?? [];
  const thumbnailTests = pack.titleThumbnailPretest?.thumbnailPrompts?.filter((item) => item.overlayText || item.visualHook).slice(0, 3) ?? [];
  const bestTitle = titleTests[0]?.title;
  const bestOverlay = thumbnailTests[0]?.overlayText;
  const followUps = pack.ideaCluster?.followUpIdeas?.filter(Boolean).slice(0, 4) ?? [];
  const shorts = pack.ideaCluster?.shorts?.filter(Boolean).slice(0, 4) ?? [];
  const revenueWarnings = pack.monetizationStrategy?.revenueWarnings?.filter(Boolean).slice(0, 3) ?? [];

  return (
    <div className="idea-power-panel">
      <div className={cn("idea-verdict", verdict.className)} title={verdict.explain}>
        <strong>{verdict.label}</strong>
        <span>{verdict.detail}</span>
      </div>
      <div className="idea-power-metrics">
        <span className="idea-power-chip market" title="Prospect intent, local demand, packaging strength, repeatability, and agency revenue potential.">Market {formatPowerScore(pack.ideaMarketScore)}</span>
        <span className="idea-power-chip visual" title={pack.thumbnailFirstFit?.hardToVisualizeWarning || "How easily this idea can be sold with one clear thumbnail visual."}>Visual {formatPowerScore(pack.thumbnailFirstFit?.visualClarityScore)}</span>
        <span className="idea-power-chip depth" title="Estimated source depth and ability to sustain the selected runtime without padding.">Source {formatPowerScore(pack.sourceDepthPreflight?.depthScore)}</span>
        <span className="idea-power-chip analytics" title="Fit against connected YouTube performance guidance or general retention patterns.">Analytics {formatPowerScore(pack.analyticsFit?.fitScore)}</span>
        <span className="idea-power-chip whitespace" title="How fresh the under-covered angle is compared with the current idea library.">White Space {formatPowerScore(pack.whiteSpace?.whiteSpaceScore)}</span>
        <span className={cn("idea-power-chip risk", riskLevel.toLowerCase())} title={pack.monetizationRisk?.saferFraming}>Risk {riskLevel}</span>
        {pack.monetizationStrategy?.primaryRevenuePath ? <span className="idea-power-chip revenue" title={pack.monetizationStrategy.primaryRevenuePath}>Revenue fit</span> : null}
      </div>
      {bestTitle || bestOverlay ? (
        <div className="idea-best-test">
          {bestTitle ? <span><strong>Best title:</strong> {bestTitle}</span> : null}
          {bestOverlay ? <span><strong>Overlay:</strong> {bestOverlay}</span> : null}
        </div>
      ) : null}
      <details className="idea-power-details">
        <summary>Idea power details</summary>
        <div className="idea-power-grid">
          <div>
            <h4>Title + Thumbnail Test</h4>
            <ul>
              {titleTests.map((item, index) => (
                <li key={`${idea.id}-title-${index}`}>
                  <strong>{item.title}</strong>
                  {item.angle ? <span>{item.angle}</span> : null}
                </li>
              ))}
              {thumbnailTests.map((item, index) => (
                <li key={`${idea.id}-thumb-${index}`}>
                  <strong>{item.overlayText || "Thumbnail"}</strong>
                  {item.visualHook ? <span>{item.visualHook}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Source Preflight</h4>
            <p>{pack.sourceDepthPreflight?.thinRisk || "Run a dossier pass before scripting."}</p>
            <p><strong>Best length:</strong> {pack.sourceDepthPreflight?.bestLengthMinutes || idea.recommendedLengthMinutes || 7} min</p>
            {pack.sourceDepthPreflight?.mustVerify?.length ? <p><strong>Verify:</strong> {pack.sourceDepthPreflight.mustVerify.slice(0, 3).join(", ")}</p> : null}
          </div>
          <div>
            <h4>Thumbnail-First Fit</h4>
            <p>{pack.thumbnailFirstFit?.coreImage || "Define one clear visual before scripting."}</p>
            {pack.thumbnailFirstFit?.titleThumbnailMatch ? <p><strong>Match:</strong> {pack.thumbnailFirstFit.titleThumbnailMatch}</p> : null}
            {pack.thumbnailFirstFit?.firstFrameExpectation ? <p><strong>First 5 sec:</strong> {pack.thumbnailFirstFit.firstFrameExpectation}</p> : null}
            {pack.thumbnailFirstFit?.hardToVisualizeWarning ? <p><strong>Warning:</strong> {pack.thumbnailFirstFit.hardToVisualizeWarning}</p> : null}
          </div>
          <div>
            <h4>Analytics Fit</h4>
            <p>{pack.analyticsFit?.whyItFits || "Uses general channel-growth patterns until analytics are synced."}</p>
            <p><strong>Use:</strong> {pack.analyticsFit?.patternToUse || "Fast promise, clear escalation, strong payoff."}</p>
          </div>
          <div>
            <h4>Cluster</h4>
            <p><strong>{pack.ideaCluster?.clusterName || idea.category}</strong>{pack.ideaCluster?.role ? ` - ${pack.ideaCluster.role}` : ""}</p>
            {followUps.length ? <p><strong>Follow-ups:</strong> {followUps.join("; ")}</p> : null}
            {shorts.length ? <p><strong>Shorts:</strong> {shorts.join("; ")}</p> : null}
          </div>
          <div>
            <h4>Revenue / Compliance Risk</h4>
            <p>{pack.monetizationRisk?.saferFraming || "Frame as plain-English insurance education with clear limitations."}</p>
            {pack.monetizationRisk?.concerns?.length ? <p><strong>Watch:</strong> {pack.monetizationRisk.concerns.slice(0, 3).join(", ")}</p> : null}
          </div>
          <div>
            <h4>Revenue Strategy</h4>
            <p>{pack.monetizationStrategy?.primaryRevenuePath || "Use the saved agency revenue path when this becomes a project."}</p>
            {pack.monetizationStrategy?.affiliateAngle ? <p><strong>Offer angle:</strong> {pack.monetizationStrategy.affiliateAngle}</p> : null}
            {pack.monetizationStrategy?.cta ? <p><strong>CTA:</strong> {pack.monetizationStrategy.cta}</p> : null}
            {revenueWarnings.length ? <p><strong>Warnings:</strong> {revenueWarnings.join(", ")}</p> : null}
          </div>
          <div>
            <h4>White Space</h4>
            <p>{pack.whiteSpace?.underCoveredAngle || "Find a less-covered evidence angle."}</p>
            <p><strong>Avoid:</strong> {pack.whiteSpace?.overdoneAngleToAvoid || "Generic overview."}</p>
          </div>
        </div>
      </details>
    </div>
  );
}

function renderEpisodeFit(idea: StoryIdea) {
  const fit = idea.episodeFit ? normalizeEpisodeFitLabel(idea.episodeFit) : deriveEpisodeFitForIdea(idea);
  const bestFormat = idea.bestFormat || fallbackBestFormatForIdea(idea);
  const arc = episodeArcItems(idea.episodeArc);
  const why = idea.episodeWhy || fallbackEpisodeWhyForIdea(idea, fit, bestFormat);
  const businessValue = idea.episodeBusinessValue || fallbackEpisodeBusinessValueForIdea(fit, bestFormat);

  return (
    <div className={cn("episode-fit-panel", fit.toLowerCase())}>
      <div className="episode-fit-main">
        <span className={cn("episode-fit-badge", fit.toLowerCase())}>Episode Fit: {fit}</span>
        <strong>{bestFormat}</strong>
        <span>{why}</span>
      </div>
      {arc.length || businessValue ? (
        <details className="episode-fit-details">
          <summary>Episode strategy</summary>
          {businessValue ? <p><strong>Business value:</strong> {businessValue}</p> : null}
          {arc.length ? (
            <ol>
              {arc.map((item, index) => (
                <li key={`${idea.id}-episode-arc-${index}`}>
                  <strong>{item.part || `Part ${index + 1}`}: {item.title || "Episode angle"}</strong>
                  {item.promise ? <span>{item.promise}</span> : null}
                </li>
              ))}
            </ol>
          ) : <p>Keep this as one tight video unless the dossier reveals separate buyer stages or examples.</p>}
        </details>
      ) : null}
    </div>
  );
}

function ideaPowerPackForIdea(idea: StoryIdea): IdeaPowerPack | null {
  const sourceUrls = asClientRecord(idea.sourceUrls);
  const pack = asClientRecord(sourceUrls?.ideaPowerPack) ?? asClientRecord(sourceUrls?.idea_power_pack);
  return pack ? (pack as IdeaPowerPack) : null;
}

function normalizeEpisodeFitLabel(value?: string | null): "Low" | "Medium" | "High" {
  const normalized = value?.toLowerCase() || "";
  if (normalized.includes("high")) return "High";
  if (normalized.includes("medium") || normalized.includes("moderate")) return "Medium";
  if (normalized.includes("low")) return "Low";
  return "Low";
}

function deriveEpisodeFitForIdea(idea: StoryIdea): "Low" | "Medium" | "High" {
  const weighted = (idea.lengthPotentialScore * 0.45) + (idea.escalationScore * 0.35) + (idea.curiosityScore * 0.2);
  if (weighted >= 84) return "High";
  if (weighted >= 70) return "Medium";
  return "Low";
}

function fallbackBestFormatForIdea(idea: StoryIdea) {
  const fit = idea.episodeFit ? normalizeEpisodeFitLabel(idea.episodeFit) : deriveEpisodeFitForIdea(idea);
  if (fit === "High" && idea.lengthPotentialScore >= 88) return "5-Part Series";
  if (fit === "High" || fit === "Medium") return "3-Part Series";
  return "Single Video";
}

function recommendedSeriesFormat(idea: StoryIdea) {
  const bestFormat = idea.bestFormat || fallbackBestFormatForIdea(idea);
  return /series/i.test(bestFormat) && normalizeEpisodeFitLabel(idea.episodeFit || deriveEpisodeFitForIdea(idea)) !== "Low";
}

function fallbackEpisodeWhyForIdea(idea: StoryIdea, fit: "Low" | "Medium" | "High", bestFormat: string) {
  if (fit === "High") return `Enough depth and escalation for a ${bestFormat}.`;
  if (fit === "Medium") return "Possible short series if source depth supports separate parts.";
  return "Best as one focused video.";
}

function fallbackEpisodeBusinessValueForIdea(fit: "Low" | "Medium" | "High", bestFormat: string) {
  if (fit === "High") return `${bestFormat} can create multiple quote/review touchpoints, follow-up emails, Shorts, and local SEO angles.`;
  if (fit === "Medium") return "Test the first video, then expand if the audience response or source depth supports it.";
  return "Use one clear CTA-driven video to answer the main question and move viewers toward a quote or review.";
}

function episodeArcItems(value: unknown): EpisodeArcItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asClientRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, index) => ({
      part: typeof item.part === "string" ? item.part : `Part ${index + 1}`,
      title: typeof item.title === "string" ? item.title : "",
      promise: typeof item.promise === "string" ? item.promise : ""
    }))
    .filter((item) => item.title || item.promise)
    .slice(0, 5);
}

function ideaPowerVerdict(pack: IdeaPowerPack) {
  const market = pack.ideaMarketScore ?? 0;
  const sourceDepth = pack.sourceDepthPreflight?.depthScore ?? 0;
  const visual = pack.thumbnailFirstFit?.visualClarityScore ?? 75;
  const whiteSpace = pack.whiteSpace?.whiteSpaceScore ?? 0;
  const risk = pack.monetizationRisk?.riskLevel ?? "Medium";
  if (market >= 85 && sourceDepth >= 78 && visual >= 70 && risk !== "High") {
    return {
      label: "Build Candidate",
      className: "ready",
      detail: "Strong upside, visual clarity, and source depth.",
      explain: "High market score, useful source depth, clear thumbnail-first fit, and manageable revenue/compliance risk."
    };
  }
  if (visual < 60) {
    return {
      label: "Package First",
      className: "needs-review",
      detail: "The idea needs a clearer thumbnail visual before scripting.",
      explain: "Thumbnail-first fit is low enough that the idea may not earn clicks unless the visual anchor improves."
    };
  }
  if (risk === "High") {
    return {
      label: "Needs Safer Frame",
      className: "needs-review",
      detail: "Good idea only if the documentary framing is careful.",
      explain: "Risk is high enough that the title, thumbnail, and script should avoid sensational or instructional framing."
    };
  }
  if (sourceDepth < 60) {
    return {
      label: "Research First",
      className: "blocked",
      detail: "Promising only if the dossier finds enough material.",
      explain: "Source depth is low, so this may collapse into padding without more evidence."
    };
  }
  if (whiteSpace >= 82) {
    return {
      label: "Fresh Angle",
      className: "ready",
      detail: "The angle looks differentiated from the current library.",
      explain: "White-space score is strong, so this may help the channel avoid repetitive topic lanes."
    };
  }
  return {
    label: "Worth Testing",
    className: "progress",
    detail: "Solid, but compare against stronger market/depth ideas first.",
    explain: "The idea has usable signals but not enough to make it an automatic first pick."
  };
}

function businessFitBadgesForIdea(idea?: StoryIdea | null) {
  if (!idea) {
    return [
      { label: "Quote intent: Unknown", level: "medium" as const },
      { label: "Local fit: Needs review", level: "medium" as const }
    ];
  }

  const pack = ideaPowerPackForIdea(idea);
  const haystack = [idea.title, idea.hook, idea.summary, idea.category, idea.location, idea.sourceType, idea.suggestedAngle].filter(Boolean).join(" ");
  const hasCarrier = /germania|travelers|swyfft|progressive|geico/i.test(haystack);
  const hasLocalSignal = /texas|houston|spring|woodlands|katy|cypress|humble|conroe|pasadena|pearland|sugar land|near me|local/i.test(haystack);
  const hasQuoteIntent = /quote|home|auto|bundle|renewal|policy|coverage|claim|deductible|liability|insurance/i.test(haystack);
  const risk = pack?.monetizationRisk?.riskLevel ?? "Medium";
  const quoteLevel = hasQuoteIntent || idea.totalScore >= 82 ? "High" : idea.totalScore >= 70 ? "Medium" : "Low";

  return [
    {
      label: `Quote intent: ${quoteLevel}`,
      level: quoteLevel === "High" ? "high" as const : quoteLevel === "Medium" ? "medium" as const : "low" as const
    },
    {
      label: `Local fit: ${hasLocalSignal ? "Texas/Houston" : "General Texas"}`,
      level: hasLocalSignal ? "high" as const : "medium" as const
    },
    {
      label: hasCarrier ? "Carrier fit: Named" : "Carrier fit: Service",
      level: hasCarrier ? "high" as const : "medium" as const
    },
    {
      label: `Risk: ${risk}`,
      level: risk === "Low" ? "high" as const : risk === "High" ? "low" as const : "medium" as const
    }
  ];
}

function asClientRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function formatPowerScore(score?: number) {
  return typeof score === "number" && Number.isFinite(score) ? Math.round(score) : "-";
}

function lengthLabel(idea: StoryIdea) {
  if (idea.estimatedLengthPotential) return idea.estimatedLengthPotential;
  const matched = storyLengthOptions.find((item) => item.minutes === idea.recommendedLengthMinutes);
  if (matched) return matched.label;
  if (idea.lengthPotentialScore >= 92) return "20 min";
  if (idea.lengthPotentialScore >= 80) return "10 min";
  return "7 min";
}

function depthStrengthLabel(score: number) {
  if (score >= 86) return `High (${score})`;
  if (score >= 68) return `Medium (${score})`;
  return `Low (${score})`;
}

function depthStrengthClass(score: number) {
  if (score >= 86) return "high";
  if (score >= 68) return "medium";
  return "low";
}

function displaySlotStatus(status: PublishingSlotStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slotStatusClass(status: PublishingSlotStatus) {
  if (status === "PRODUCED") return "produced";
  if (status === "PUBLISHED") return "used";
  if (status === "SKIPPED") return "rejected";
  return "progress";
}

function formatProjectFormat(format?: StoryProjectFormat) {
  if (format === "EPISODIC_SERIES") return "Episodic video series";
  if (format === "PODCAST_EPISODE") return "Podcast episode";
  if (format === "ARTICLE") return "Article";
  if (format === "SHORT_BOOK") return "Short book";
  if (format === "LONG_BOOK") return "Long form book";
  return "Video script";
}

function projectFormatClass(format?: StoryProjectFormat) {
  if (format === "EPISODIC_SERIES") return "episode";
  if (format === "PODCAST_EPISODE") return "podcast";
  if (format === "ARTICLE") return "article";
  if (format === "SHORT_BOOK") return "short-book";
  if (format === "LONG_BOOK") return "long-book";
  return "video";
}

function projectOutputNoun(format?: StoryProjectFormat) {
  if (format === "ARTICLE") return "article";
  if (format === "PODCAST_EPISODE") return "podcast script";
  if (format === "SHORT_BOOK") return "short book manuscript";
  if (format === "LONG_BOOK") return "long form book manuscript";
  return "script";
}

function copyDraftButtonLabel(passType?: ScriptPassType, format?: StoryProjectFormat) {
  if (passType && passType !== "DRAFT" && passType !== "FINAL") return "Copy Output";
  if (format === "ARTICLE") return "Copy Article";
  if (format === "SHORT_BOOK" || format === "LONG_BOOK") return "Copy Manuscript";
  return "Copy Script";
}

function projectFinalOutputLabel(format?: StoryProjectFormat) {
  if (format === "ARTICLE") return "Final Article";
  if (format === "PODCAST_EPISODE") return "Final Podcast Script";
  if (format === "SHORT_BOOK") return "Final Legacy Manuscript";
  if (format === "LONG_BOOK") return "Final Legacy Manuscript";
  return "Complete Script";
}

function supportsThumbnails(project?: StoryProject | null) {
  return project?.format === "STANDALONE" || project?.format === "EPISODIC_SERIES";
}

function supportsSceneBackgrounds(project?: StoryProject | null) {
  return project?.format === "STANDALONE" || project?.format === "EPISODIC_SERIES";
}

function supportsBookIllustrations(project?: StoryProject | null) {
  return project?.format === "SHORT_BOOK" || project?.format === "LONG_BOOK";
}

function supportsBookExport(project?: StoryProject | null) {
  return project?.format === "SHORT_BOOK" || project?.format === "LONG_BOOK";
}

function isArticleImageAsset(asset: ThumbnailAsset) {
  return /^Article image \d+:/i.test(asset.title || "") || /^Article image placement:/im.test(asset.prompt || "");
}

function isBookIllustrationAsset(asset: ThumbnailAsset) {
  return /^Chapter \d+:/i.test(asset.title || "") || /^Book illustration mode:/im.test(asset.prompt || "");
}

function isSceneBackgroundAsset(asset: ThumbnailAsset) {
  return /^HeyGen Scene \d+ Background:/i.test(asset.title || "") || /^HeyGen scene background/im.test(asset.prompt || "");
}

function thumbnailAssetsForProject(project?: StoryProject | null) {
  return (project?.thumbnails ?? []).filter((asset) => !isArticleImageAsset(asset) && !isBookIllustrationAsset(asset) && !isSceneBackgroundAsset(asset));
}

function sceneBackgroundAssetsForProject(project?: StoryProject | null) {
  return (project?.thumbnails ?? []).filter(isSceneBackgroundAsset);
}

function sceneBackgroundPromptCount(project?: StoryProject | null) {
  const sceneCards = latestDraftForPass(project || undefined, "SCENE_CARDS")?.content || "";
  const matches = sceneCards.match(/Scene\s+\d{1,2}\s+Background\s+Prompt\s*:/gi);
  return matches?.length ?? 0;
}

function displayAssetsForProject(project: StoryProject) {
  const assets = project.thumbnails ?? [];
  if (project.format === "ARTICLE") return assets.filter(isArticleImageAsset);
  if (supportsBookIllustrations(project)) return assets.filter(isBookIllustrationAsset);
  return assets.filter((asset) => !isArticleImageAsset(asset) && !isBookIllustrationAsset(asset));
}

function assetResultsLabel(project?: StoryProject | null) {
  if (project?.format === "ARTICLE") return "Article Images";
  if (supportsBookIllustrations(project)) return "Book Illustrations";
  return "HeyGen Video Assets";
}

function defaultBookIllustrationMax(format: StoryProjectFormat, mode: BookIllustrationMode) {
  if (mode === "KEY_SCENES") return format === "LONG_BOOK" ? 10 : 6;
  if (mode === "FULL_ILLUSTRATED") return format === "LONG_BOOK" ? 20 : 12;
  return format === "LONG_BOOK" ? 14 : 8;
}

function supportsEpisodePlanning(project?: StoryProject | null) {
  return project?.format === "STANDALONE" || project?.format === "EPISODIC_SERIES";
}

function contentModeDefaults(mode: ContentMode): {
  category: string;
  tone: string;
  sourceType: string;
  projectFormat: Exclude<StoryProjectFormat, "EPISODIC_SERIES">;
} {
  if (mode === "LOCAL_LEAD_GEN") {
    return {
      category: "Local SEO",
      tone: "Investigative",
      sourceType: "Local SEO keywords and service pages",
      projectFormat: "ARTICLE"
    };
  }
  if (mode === "SALES_OFFER") {
    return {
      category: "Sales Letters",
      tone: "Urgent",
      sourceType: "Offer details and customer objections",
      projectFormat: "ARTICLE"
    };
  }
  if (mode === "EDUCATION_COURSE") {
    return {
      category: "Course Blueprint",
      tone: "Measured documentary",
      sourceType: "Expert curriculum notes",
      projectFormat: "ARTICLE"
    };
  }
  if (mode === "BOOK_PUBLISHING") {
    return {
      category: "Authority Books",
      tone: "Reflective",
      sourceType: "Book notes and research folders",
      projectFormat: "SHORT_BOOK"
    };
  }
  if (mode === "REPURPOSE_MULTIPLIER") {
    return {
      category: "Multi-platform Campaign",
      tone: "Measured documentary",
      sourceType: "Existing script, article, or book",
      projectFormat: "ARTICLE"
    };
  }
  if (mode === "BRAND_CHANNEL_STRATEGY") {
    return {
      category: "Niche Positioning",
      tone: "Investigative",
      sourceType: "Audience and niche research",
      projectFormat: "ARTICLE"
    };
  }
  return {
    category: "Educational Guides",
    tone: "Measured documentary",
    sourceType: "Industry expertise and client questions",
    projectFormat: "ARTICLE"
  };
}

function categoryOptionsForContentMode(mode: ContentMode, current?: string) {
  const base = (() => {
    if (mode === "EXPERT_AUTHORITY") return expertCategoryOptions;
    if (mode === "LOCAL_LEAD_GEN") return localLeadCategoryOptions;
    if (mode === "SALES_OFFER") return salesOfferCategoryOptions;
    if (mode === "EDUCATION_COURSE") return educationCourseCategoryOptions;
    if (mode === "BOOK_PUBLISHING") return bookPublishingCategoryOptions;
    if (mode === "REPURPOSE_MULTIPLIER") return repurposeCategoryOptions;
    if (mode === "BRAND_CHANNEL_STRATEGY") return brandStrategyCategoryOptions;
    return categoryOptions.filter((item) => item !== "All Categories");
  })();
  return uniqueOptionList(current ? [current, ...base] : base);
}

function sourceTypeOptionsForContentMode(mode: ContentMode, current?: string) {
  const base = (() => {
    if (mode === "EXPERT_AUTHORITY") return expertSourceTypeOptions;
    if (mode === "LOCAL_LEAD_GEN") return localLeadSourceTypeOptions;
    if (mode === "SALES_OFFER") return salesOfferSourceTypeOptions;
    if (mode === "EDUCATION_COURSE") return educationCourseSourceTypeOptions;
    if (mode === "BOOK_PUBLISHING") return bookPublishingSourceTypeOptions;
    if (mode === "REPURPOSE_MULTIPLIER") return repurposeSourceTypeOptions;
    if (mode === "BRAND_CHANNEL_STRATEGY") return brandStrategySourceTypeOptions;
    return storySourceTypeOptions;
  })();
  return uniqueOptionList(current ? [current, ...base] : base);
}

function businessGoalOptionsForContentMode(mode: ContentMode, current?: string) {
  const base = (() => {
    if (mode === "SALES_OFFER") {
      return [
        "Sell the offer",
        "Increase conversions",
        "Handle objections",
        "Promote a launch",
        "Book sales calls",
        "Revive cold leads"
      ];
    }
    if (mode === "EDUCATION_COURSE") {
      return [
        "Build a paid course",
        "Create lesson material",
        "Improve student outcomes",
        "Build worksheets and quizzes",
        "Train a team",
        "Feed a paid community"
      ];
    }
    if (mode === "BOOK_PUBLISHING") {
      return [
        "Create a book manuscript",
        "Build authority",
        "Generate leads with a book",
        "Launch on Kindle",
        "Create an illustrated book",
        "Package a framework"
      ];
    }
    if (mode === "REPURPOSE_MULTIPLIER") {
      return [
        "Create a content campaign",
        "Fill a social calendar",
        "Create email content",
        "Create platform-specific posts",
        "Turn long form into short form",
        "Build newsletter issues"
      ];
    }
    if (mode === "BRAND_CHANNEL_STRATEGY") {
      return [
        "Define positioning",
        "Choose content pillars",
        "Plan the publishing calendar",
        "Develop visual identity",
        "Map keyword themes",
        "Launch a channel"
      ];
    }
    return businessGoalOptions;
  })();
  return uniqueOptionList(current ? [current, ...base] : base);
}

function contentModeFormCopy(mode: ContentMode) {
  if (mode === "LOCAL_LEAD_GEN") {
    return {
      nicheLabel: "Business / Service Niche",
      nichePlaceholder: "Example: Texas insurance agent, family dentist, roofing company",
      audienceLabel: "Target Audience",
      audiencePlaceholder: "Example: homeowners in Austin, first-time drivers, small business owners",
      locationLabel: "Market / Location",
      locationPlaceholder: "Example: Dallas-Fort Worth, Houston suburbs, Central Texas",
      offerLabel: "Offer / Service",
      offerPlaceholder: "Example: home insurance, emergency plumbing, personal injury consults",
      goalLabel: "Content Goal",
      ctaLabel: "Call To Action",
      ctaPlaceholder: "Example: request a quote, book a local consultation",
      boundariesLabel: "Compliance / Boundaries",
      boundariesPlaceholder: "Example: avoid guarantees, avoid legal advice, include licensed-professional disclaimer, do not mention competitors by name"
    };
  }
  if (mode === "SALES_OFFER") {
    return {
      nicheLabel: "Offer / Product",
      nichePlaceholder: "Example: $997 course, Gumroad template pack, consulting audit, webinar offer",
      audienceLabel: "Prospect / Audience",
      audiencePlaceholder: "Example: agency owners, new creators, exhausted parents, local contractors",
      locationLabel: "Market / Channel",
      locationPlaceholder: "Example: Gumroad, email list, webinar, cold leads, U.S. market",
      offerLabel: "Core Offer",
      offerPlaceholder: "Example: setup package, digital product, proposal, membership, paid workshop",
      goalLabel: "Sales Goal",
      ctaLabel: "Sales CTA",
      ctaPlaceholder: "Example: buy now, book a call, join the webinar, reply for details",
      boundariesLabel: "Proof / Boundaries",
      boundariesPlaceholder: "Example: available proof, claims to avoid, guarantee wording, price, bonuses, urgency rules"
    };
  }
  if (mode === "EDUCATION_COURSE") {
    return {
      nicheLabel: "Course / Training Topic",
      nichePlaceholder: "Example: beginner AI workflows, insurance sales training, strength fundamentals",
      audienceLabel: "Learners",
      audiencePlaceholder: "Example: beginners, new hires, paid community members, advanced practitioners",
      locationLabel: "Delivery Context",
      locationPlaceholder: "Example: paid community, cohort course, employee onboarding, self-paced training",
      offerLabel: "Course / Asset",
      offerPlaceholder: "Example: mini-course, flagship course, worksheet pack, training module",
      goalLabel: "Learning Goal",
      ctaLabel: "Next Step",
      ctaPlaceholder: "Example: complete worksheet, take quiz, enroll, ask questions in community",
      boundariesLabel: "Teaching Boundaries",
      boundariesPlaceholder: "Example: prerequisite knowledge, what not to teach, disclaimers, assessment standards"
    };
  }
  if (mode === "BOOK_PUBLISHING") {
    return {
      nicheLabel: "Book Topic / Promise",
      nichePlaceholder: "Example: AI for local businesses, forgotten maritime mysteries, founder operating system",
      audienceLabel: "Reader Audience",
      audiencePlaceholder: "Example: beginners, executives, fans of narrative nonfiction, future customers",
      locationLabel: "Market / Shelf",
      locationPlaceholder: "Example: Kindle, lead magnet funnel, authority book, internal training library",
      offerLabel: "Book Type",
      offerPlaceholder: "Example: nonfiction book, authority book, illustrated book, Kindle short read",
      goalLabel: "Publishing Goal",
      ctaLabel: "Reader CTA",
      ctaPlaceholder: "Example: download resource, join list, leave review, book a consult",
      boundariesLabel: "Publishing Boundaries",
      boundariesPlaceholder: "Example: no medical advice, cite sources, keep it evergreen, avoid hard-sell language"
    };
  }
  if (mode === "REPURPOSE_MULTIPLIER") {
    return {
      nicheLabel: "Source Asset / Topic",
      nichePlaceholder: "Example: webinar transcript, long video script, book chapter, article series",
      audienceLabel: "Target Audience",
      audiencePlaceholder: "Example: Houston homeowners, Texas drivers, renewal clients, email subscribers",
      locationLabel: "Target Platforms",
      locationPlaceholder: "Example: email, LinkedIn, X, Shorts, blog, podcast notes",
      offerLabel: "Original Asset",
      offerPlaceholder: "Example: paste the source in Content Lab notes, existing article, sales page, podcast transcript",
      goalLabel: "Repurpose Goal",
      ctaLabel: "CTA / Conversion Path",
      ctaPlaceholder: "Example: read full article, join list, watch video, book call, download guide",
      boundariesLabel: "Reuse Rules",
      boundariesPlaceholder: "Example: preserve voice, avoid repeating hook, no new claims, adapt per platform"
    };
  }
  if (mode === "BRAND_CHANNEL_STRATEGY") {
    return {
      nicheLabel: "Brand / Channel Idea",
      nichePlaceholder: "Example: premium true crime channel, AI for agencies, local insurance education",
      audienceLabel: "Target Audience",
      audiencePlaceholder: "Example: serious documentary viewers, small business owners, creators, prospects",
      locationLabel: "Market / Platform",
      locationPlaceholder: "Example: YouTube, newsletter, podcast, local market, Kindle ecosystem",
      offerLabel: "Service / Revenue Goal",
      offerPlaceholder: "Example: home quote, auto quote, bundle review, commercial policy review",
      goalLabel: "Strategy Goal",
      ctaLabel: "Audience Action",
      ctaPlaceholder: "Example: subscribe, join list, request consult, watch next episode",
      boundariesLabel: "Brand Rules",
      boundariesPlaceholder: "Example: tone, topics to avoid, visual style, claims, audience sophistication"
    };
  }
  return {
    nicheLabel: "Expert Niche / Focus",
    nichePlaceholder: "Example: retirement planning, fitness coaching, B2B SaaS founder",
    audienceLabel: "Target Audience",
    audiencePlaceholder: "Example: high-income professionals, agency owners, parents, beginners",
    locationLabel: "Market / Location (optional)",
    locationPlaceholder: "Example: U.S., Texas, online, local service area",
    offerLabel: "Offer / Service",
    offerPlaceholder: "Example: consultation, audit, course, service, newsletter",
    goalLabel: "Content Goal",
    ctaLabel: "Call To Action",
    ctaPlaceholder: "Example: book a call, download the guide, join the email list",
    boundariesLabel: "Compliance / Boundaries",
    boundariesPlaceholder: "Example: avoid guarantees, avoid legal advice, include licensed-professional disclaimer, do not mention competitors by name"
  };
}

function uniqueOptionList(values: string[]) {
  return values.filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);
}

function targetSizeOptionsForFormat(format: StoryProjectFormat) {
  if (format === "ARTICLE") return ["Short article - about 1,200 words", "Feature article - about 2,000 words", "Long article - about 3,000 words"];
  if (format === "SHORT_BOOK") return ["Compact short book - about 10,000 words", "Standard short book - about 15,000 words", "Deep short book - about 20,000 words"];
  if (format === "LONG_BOOK") return ["Starter long form book - about 40,000 words", "Standard long form book - about 60,000 words", "Deep long form book - about 80,000 words"];
  return storyLengthOptions.map((item) => defaultDesiredLengthLabel(item.minutes));
}

function defaultTargetLabelForFormat(format: StoryProjectFormat) {
  if (format === "SHORT_BOOK") return "Standard short book - about 15,000 words";
  if (format === "LONG_BOOK") return "Standard long form book - about 60,000 words";
  return format === "ARTICLE" ? "Feature article - about 2,000 words" : "7 minutes";
}

function targetMinutesForProject(format: StoryProjectFormat, label: string, idea?: StoryIdea) {
  if (format === "ARTICLE" || format === "SHORT_BOOK") {
    if (/short/i.test(label)) return 30;
    if (/long|deep/i.test(label)) return 60;
    return 45;
  }
  if (format === "LONG_BOOK") {
    if (/starter|40,?000/i.test(label)) return 30;
    if (/deep|80,?000/i.test(label)) return 60;
    return 45;
  }
  if (label.includes("7")) return 7;
  if (label.includes("10")) return 10;
  if (label.includes("20")) return 20;
  if (label.includes("30")) return 30;
  return Math.min(30, Math.max(7, idea?.recommendedLengthMinutes || 7));
}

function projectTargetDisplay(project: StoryProject) {
  if (project.format === "ARTICLE" || project.format === "SHORT_BOOK" || project.format === "LONG_BOOK") return `${project.targetWordCount.toLocaleString()} words`;
  if (project.format === "EPISODIC_SERIES" || project.drafts?.some((draft) => draft.passType === "EPISODES")) {
    const targetWords = project.format === "EPISODIC_SERIES" ? project.targetWordCount : project.targetWordCount * 5;
    return `5 x ${project.targetLengthMinutes} min / ${targetWords.toLocaleString()} words`;
  }
  return `${project.targetLengthMinutes} min / ${project.targetWordCount.toLocaleString()} words`;
}

function publishingPackLabel(format?: StoryProjectFormat) {
  if (format === "ARTICLE") return "Article Campaign Kit";
  if (format === "PODCAST_EPISODE") return "Podcast Campaign Kit";
  if (format === "SHORT_BOOK" || format === "LONG_BOOK") return "Book Launch Pack";
  return "Business Campaign Kit";
}

function weekdayLabel(value?: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(new Date(value));
}

function isPastDate(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function normalizeOption(value: string | undefined, options: string[], fallback: string) {
  if (!value) return fallback;
  return options.find((option) => option.toLowerCase() === value.toLowerCase()) ?? value;
}

function defaultDesiredLengthLabel(minutes: number) {
  const matched = storyLengthOptions.find((item) => item.minutes === minutes);
  return matched?.label.includes("min") ? matched.label.replace(" min", " minutes").replace(" max", " max") : "7 minutes";
}

function passLabel(passType: ScriptPassType) {
  const labels: Record<ScriptPassType, string> = {
    INTRO: "Intro",
    DOSSIER: "Dossier",
    ANALYTICS_BRIEF: "Analytics Brief",
    EPISODES: "Episodes",
    SERIES_BIBLE: "Series Bible",
    HOOK_LAB: "Hook Lab",
    STORY_SPINE: "Story Spine",
    STRUCTURE: "Structure",
    RETENTION_MAP: "Retention Map",
    SCRIPT_LENGTH_GOVERNOR: "Length Governor",
    OPEN_LOOP_LEDGER: "Open Loop Ledger",
    DRAFT: "Draft",
    RETENTION_ANALYSIS: "Retention Analysis",
    CRITIQUE: "Critique",
    FACT_CHECK: "Fact Check",
    REWRITE: "Rewrite",
    VOICE_POLISH: "Voice Polish",
    QUALITY_GATE: "Quality Gate",
    FINAL: "Teleprompter Polish",
    OUTRO: "Outro",
    SCENE_CARDS: "Scene Cards",
    PUBLISHING_PACK: "Business Campaign Kit"
  };
  return labels[passType];
}

function passLabelForProject(passType: ScriptPassType, format?: StoryProjectFormat) {
  if (passType === "INTRO") {
    if (format === "ARTICLE") return "Lead";
    if (format === "PODCAST_EPISODE") return "Podcast Intro";
    if (format === "SHORT_BOOK" || format === "LONG_BOOK") return "Book Preface";
  }
  if (passType === "DRAFT") {
    if (format === "ARTICLE") return "Article Draft";
    if (format === "PODCAST_EPISODE") return "Podcast Draft";
    if (format === "SHORT_BOOK" || format === "LONG_BOOK") return "Book Draft";
  }
  if (passType === "FINAL") {
    if (format === "ARTICLE") return "Final Article";
    if (format === "PODCAST_EPISODE") return "Final Podcast Script";
  if (format === "SHORT_BOOK") return "Final Legacy Manuscript";
  if (format === "LONG_BOOK") return "Final Legacy Manuscript";
  }
  if (passType === "OUTRO") {
    if (format === "ARTICLE") return "Closing CTA";
    if (format === "PODCAST_EPISODE") return "Podcast Outro";
    if (format === "SHORT_BOOK" || format === "LONG_BOOK") return "Closing Author Note";
  }
  if (passType === "PUBLISHING_PACK") return publishingPackLabel(format);
  return passLabel(passType);
}

function latestDraftForPass(project: StoryProject | undefined, passType: ScriptPassType) {
  return [...(project?.drafts ?? [])]
    .filter((draft) => draft.passType === passType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function parseEpisodeOutputSections(content: string): EpisodeOutputSection[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const headingPattern = /^(Episode\s+(One|Two|Three|Four|Five|1|2|3|4|5)(?:\s*:\s*|\s+-\s+|\s+)([^\n]*?)?)\s*$/gim;
  const matches = Array.from(normalized.matchAll(headingPattern));
  if (matches.length < 2) return [];

  const sections = matches.map((match, index) => {
    const heading = match[1].trim();
    const episodeNumber = episodeNumberFromLabel(match[2]);
    const nextIndex = matches[index + 1]?.index ?? normalized.length;
    const startIndex = (match.index ?? 0) + match[0].length;
    const contentBlock = normalized.slice(startIndex, nextIndex).trim();
    const rawTitle = (match[3] || "").trim();
    const title = rawTitle || heading.replace(/^Episode\s+(?:One|Two|Three|Four|Five|1|2|3|4|5)\s*:?\s*/i, "").trim() || `Episode ${episodeNumber}`;
    return {
      episodeNumber,
      partLabel: `Part ${episodeNumber}`,
      heading,
      title,
      content: contentBlock
    };
  });

  const uniqueByEpisode = new Map<number, EpisodeOutputSection>();
  for (const section of sections) {
    if (section.episodeNumber >= 1 && section.episodeNumber <= 5 && section.content) {
      uniqueByEpisode.set(section.episodeNumber, section);
    }
  }
  return Array.from(uniqueByEpisode.values()).sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function assembleEpisodeReviewContent(
  project: StoryProject,
  introContent: string | undefined,
  bodyContent: string,
  outroContent: string | undefined,
  sponsorBlurb: string | null
) {
  const introSections = parseEpisodeOutputSections(introContent || "");
  const bodySections = parseEpisodeOutputSections(bodyContent);
  const outroSections = parseEpisodeOutputSections(outroContent || "");
  if (!introSections.length && !bodySections.length && !outroSections.length) {
    return normalizeSponsorLanguageForFormat(stripSponsorCopyFromBody(bodyContent, sponsorBlurb), project.format);
  }

  const sections: string[] = [];
  const episodeCount = episodeCountForProject(project);
  for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber += 1) {
    const intro = introSections.find((section) => section.episodeNumber === episodeNumber);
    const body = bodySections.find((section) => section.episodeNumber === episodeNumber);
    const outro = outroSections.find((section) => section.episodeNumber === episodeNumber);
    const pieces = [
      intro?.content ? ensureIntroSponsorPlacement(intro.content, sponsorBlurb) : undefined,
      body?.content ? stripSponsorCopyFromBody(body.content, sponsorBlurb) : undefined,
      outro?.content ? ensureOutroSponsorPlacement(outro.content, sponsorBlurb) : undefined
    ].filter(Boolean).map((piece) => normalizeSponsorLanguageForFormat(piece || "", project.format));
    if (!pieces.length) continue;
    const title = body?.title || intro?.title || outro?.title || `Episode ${episodeNumber}`;
    sections.push(`Episode ${episodeWord(episodeNumber)}: ${title}\n\n${pieces.join("\n\n")}`);
  }

  return sections.join("\n\n");
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

function episodeWord(value: number) {
  if (value === 1) return "One";
  if (value === 2) return "Two";
  if (value === 3) return "Three";
  if (value === 4) return "Four";
  if (value === 5) return "Five";
  return String(value);
}

function isLongBookDraftProgress(draft?: ScriptDraft) {
  return draft?.passType === "DRAFT" && draft.modelUsed.includes("segmented-long-book-progress:");
}

function parseClientPublishingPack(
  content: string,
  input: {
    title?: string | null;
    sponsorBlurb?: string | null;
    sponsorLink?: string | null;
    summary?: string | null;
    hook?: string | null;
    targetLengthMinutes?: number | null;
    format?: StoryProjectFormat | null;
  } = {}
): ClientPublishingPack | null {
  try {
    const parsed = parsePublishingPack(content);
    const tags = parsed.tags;
    return {
      titles: parsed.titles,
      description: input.format === "ARTICLE" || input.format === "PODCAST_EPISODE" || input.format === "SHORT_BOOK" || input.format === "LONG_BOOK"
        ? parsed.description
        : formatYoutubeDescription({
            ...input,
            description: parsed.description,
            tags
          }),
      tags,
      thumbnailPrompts: parsed.thumbnailPrompts,
      sunoPrompt: parsed.sunoPrompt,
      pinnedComment: parsed.pinnedComment,
      seoPack: parsed.seoPack,
      topicalAuthorityMap: parsed.topicalAuthorityMap,
      conversionAssets: parsed.conversionAssets,
      episodePacks: parsed.episodePacks
    };
  } catch {
    return null;
  }
}

function scrollToWorkspaceTarget(targetId: string) {
  document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function projectWorkspaceTabs(input: {
  project: StoryProject;
  latestDraft?: ScriptDraft | null;
  latestPublishingPackReady: boolean;
  qualityScorecard: ReturnType<typeof qualityScorecardForProject>;
  thumbnailCount: number;
  requiredThumbnailCount: number;
  calendarSlot?: PublishingSlot;
  hasSourceMaterial: boolean;
}) {
  const scriptReady = Boolean(latestScriptDraft(input.project));
  const qualityReady = Boolean(input.qualityScorecard && latestDraftForPass(input.project, "QUALITY_GATE"));
  const thumbnailsNeeded = supportsThumbnails(input.project);
  const thumbnailsReady = !thumbnailsNeeded || input.thumbnailCount >= input.requiredThumbnailCount;
  const exportReady = hasPublishableScript(input.project);
  const episodeCount = episodeCountForProject(input.project);
  return [
    {
      label: "Brief",
      status: input.hasSourceMaterial ? "Ready" : "Needs sources",
      detail: input.hasSourceMaterial ? "Source material is saved." : "Add notes or source links before deeper passes.",
      explain: "The brief controls source material, CTA details, and project constraints.",
      state: input.hasSourceMaterial ? "ready" : "needs-review",
      action: () => scrollToWorkspaceTarget("project-brief")
    },
    {
      label: "Episodes",
      status: projectHasEpisodePlan(input.project) ? "Planned" : supportsEpisodePlanning(input.project) ? "Available" : "N/A",
      detail: projectHasEpisodePlan(input.project) ? `${episodeCount}-part series plan is present.` : supportsEpisodePlanning(input.project) ? "Turn this project into a series." : "This format does not use episodes.",
      explain: "Episode cards track each part's script, pack, thumbnail, and export readiness.",
      state: projectHasEpisodePlan(input.project) ? "ready" : supportsEpisodePlanning(input.project) ? "needs-review" : "muted",
      action: () => scrollToWorkspaceTarget("episode-board")
    },
    {
      label: "Script",
      status: scriptReady ? "Written" : "Not ready",
      detail: input.latestDraft ? `${passLabelForProject(input.latestDraft.passType, input.project.format)} is selected.` : "Run the workflow to create the first output.",
      explain: "The script tab is the current selected output and output history.",
      state: scriptReady ? "ready" : "blocked",
      action: () => scrollToWorkspaceTarget("current-output")
    },
    {
      label: "Quality",
      status: qualityReady ? `${input.qualityScorecard?.overall ?? "-"} / 100` : "Needs gate",
      detail: qualityReady ? "Quality scorecard is available." : "Run Quality Gate before final decisions.",
      explain: "Quality Gate checks hook, retention, clarity, emotion, factual safety, and readiness.",
      state: qualityReady ? "ready" : scriptReady ? "needs-review" : "blocked",
      action: () => scrollToWorkspaceTarget("current-output")
    },
    {
      label: "Campaign Kit",
      status: input.latestPublishingPackReady ? "Ready" : "Missing",
      detail: input.latestPublishingPackReady ? "Titles, description, tags, CTA, and prompts are available." : "Create the kit after the final production passes.",
      explain: "Business Campaign Kits hold title tests, descriptions, tags, comments, CTAs, thumbnail prompts, and supporting assets.",
      state: input.latestPublishingPackReady ? "ready" : scriptReady ? "needs-review" : "blocked",
      action: () => scrollToWorkspaceTarget("current-output")
    },
    {
      label: "Thumbnails",
      status: thumbnailsNeeded ? `${input.thumbnailCount} / ${input.requiredThumbnailCount}` : "N/A",
      detail: thumbnailsNeeded ? (thumbnailsReady ? "Thumbnail set is complete." : "Generate missing thumbnail assets.") : "This format does not require thumbnails.",
      explain: "Thumbnail readiness is based on the expected visual asset count for the project.",
      state: thumbnailsReady ? "ready" : "needs-review",
      action: () => scrollToWorkspaceTarget("current-output")
    },
    {
      label: "Export",
      status: exportReady ? "Available" : "Locked",
      detail: exportReady ? "Copy, TXT, content pack, and format exports are available." : "Exports unlock after a publishable script exists.",
      explain: "Export actions include plain text, content pack, article/book outputs, and current-output copy.",
      state: exportReady ? "ready" : "blocked",
      action: () => scrollToWorkspaceTarget("current-output")
    }
  ];
}

function projectReadinessState(project: StoryProject, slots: PublishingSlot[]) {
  const body = latestScriptDraft(project);
  const pack = latestDraftForPass(project, "PUBLISHING_PACK");
  const quality = latestDraftForPass(project, "QUALITY_GATE");
  const requiredThumbnails = requiredThumbnailCountForProject(project);
  const thumbnailCount = thumbnailAssetsForProject(project).length;
  if (!body) {
    return { label: "Needs Script", className: "blocked", detail: "No publishable output exists yet.", nextAction: "Run the workflow" };
  }
  if (!quality) {
    return { label: "Needs Review", className: "needs-review", detail: "Script exists but Quality Gate has not run.", nextAction: "Run Quality Gate" };
  }
  if (!pack) {
    return { label: "Needs Kit", className: "needs-review", detail: "Quality pass exists but campaign metadata is missing.", nextAction: "Create Business Campaign Kit" };
  }
  if (supportsThumbnails(project) && thumbnailCount < requiredThumbnails) {
    return { label: "Needs Thumbnail", className: "needs-review", detail: `${thumbnailCount}/${requiredThumbnails} thumbnails are saved.`, nextAction: "Create Thumbnails" };
  }
  if (!projectHasCalendarSlot(project, slots) && !isUsedProjectStatus(project.status)) {
    return { label: "Ready", className: "ready", detail: "Output, quality, pack, and assets are ready.", nextAction: "Schedule it" };
  }
  if (project.status === "PUBLISHED") {
    return { label: "Published", className: "ready", detail: "This project is marked live.", nextAction: "Review analytics" };
  }
  return { label: "Scheduled", className: "ready", detail: "This project is already on the calendar or protected.", nextAction: "Monitor status" };
}

function episodeBoardItems(project: StoryProject, publishingPack: ClientPublishingPack | null, sections: EpisodeOutputSection[]) {
  const packs = publishingPack?.episodePacks ?? [];
  const thumbnails = project.thumbnails ?? [];
  const episodeCount = episodeCountForProject(project);
  return Array.from({ length: episodeCount }, (_, index) => {
    const episodeNumber = index + 1;
    const partLabel = `Part ${episodeNumber}`;
    const section = sections.find((item) => item.episodeNumber === episodeNumber);
    const pack = packs[index];
    const matchingThumbnails = thumbnails.filter((asset) =>
      new RegExp(`(part\\s*${episodeNumber}|episode\\s*${episodeNumber})`, "i").test(`${asset.title ?? ""} ${asset.prompt}`)
    );
    const thumbnailReady = matchingThumbnails.length >= 3 || thumbnails.length >= episodeNumber * 3;
    const packTitle = pack?.titles?.[0]?.title;
    const title = section?.title || packTitle || `Episode ${episodeNumber}`;
    const scriptContent = section ? `${section.heading}\n\n${section.content}` : "";
    const packContent = pack ? JSON.stringify(pack, null, 2) : "";
    return {
      episodeNumber,
      partLabel,
      title,
      scriptReady: Boolean(section?.content),
      packReady: Boolean(pack),
      thumbnailReady,
      scriptContent,
      packContent,
      detail: section?.content
        ? `${countWords(section.content).toLocaleString()} script words${pack ? ", campaign kit ready" : ""}.`
        : pack
          ? "Campaign kit is ready; final script output is not selected yet."
          : "Run Episode Fully Auto to build this part out."
    };
  });
}

function isMoneyPathReady(blueprint: ChannelBlueprint) {
  return Boolean(
    blueprint.moneyGoal?.trim() &&
    blueprint.riskTolerance?.trim() &&
    blueprint.weeklyVideoTarget &&
    blueprint.primaryCta?.trim()
  );
}

function channelProfitScore(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  analytics: YoutubeAnalyticsPayload | null;
  blueprint: ChannelBlueprint;
}) {
  const powerIdeas = input.ideas
    .map((idea) => ideaPowerPackForIdea(idea))
    .filter((pack): pack is IdeaPowerPack => Boolean(pack));
  const avgMarket = powerIdeas.length ? Math.round(powerIdeas.reduce((sum, pack) => sum + (pack.ideaMarketScore ?? 70), 0) / powerIdeas.length) : Math.round(input.ideas.reduce((sum, idea) => sum + idea.totalScore, 0) / Math.max(1, input.ideas.length || 1));
  const completed = input.projects.filter((project) => hasPublishableScript(project)).length;
  const packed = input.projects.filter((project) => latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const analyticsLift = input.analytics?.connected ? 12 : 0;
  const moneyPathLift = isMoneyPathReady(input.blueprint) ? 14 : -6;
  const packCoverage = input.projects.length ? Math.round((packed / input.projects.length) * 18) : 0;
  const productionCoverage = input.projects.length ? Math.round((completed / input.projects.length) * 12) : 0;
  const riskPenalty = powerIdeas.filter((pack) => pack.monetizationRisk?.riskLevel === "High").length * 3;
  const score = Math.max(0, Math.min(100, Math.round(avgMarket * 0.44 + analyticsLift + moneyPathLift + packCoverage + productionCoverage - riskPenalty)));

  return {
    score,
    label: score >= 85 ? "Strong agency revenue setup" : score >= 70 ? "Promising but tighten the path" : score >= 55 ? "Build foundation first" : "Too early to scale",
    summary: score >= 70
      ? "The channel has enough audience promise to keep producing while improving packaging, CTA clarity, and analytics feedback."
      : "The next leverage is strategy clarity, stronger ideas, completed packs, and YouTube data before increasing output volume.",
    factors: [
      { label: "Idea demand", value: powerIdeas.length ? `${avgMarket}/100` : input.ideas.length ? `${avgMarket}/100` : "No ideas" },
      { label: "Revenue path", value: isMoneyPathReady(input.blueprint) ? "Saved" : "Incomplete" },
      { label: "Publishable outputs", value: `${completed}/${input.projects.length || 0}` },
      { label: "Publishing packs", value: `${packed}/${input.projects.length || 0}` },
      { label: "Analytics loop", value: input.analytics?.connected ? "Connected" : "Not connected" }
    ]
  };
}

function bestNextMoveItems(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  slots: PublishingSlot[];
  analytics: YoutubeAnalyticsPayload | null;
  blueprint: ChannelBlueprint;
}) {
  const strongestIdea = [...input.ideas]
    .filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED")
    .sort((a, b) => b.totalScore - a.totalScore)[0];
  const qualityItem = qualityGateQueue(input.projects)[0];
  const readyUnscheduled = input.projects.find((project) => hasPublishableScript(project) && !projectHasCalendarSlot(project, input.slots) && !isUsedProjectStatus(project.status));
  const items: Array<{ title: string; detail: string; action: string; priority: "high" | "medium" | "low"; section: AppSection; tab?: TabLabel }> = [];

  if (!isMoneyPathReady(input.blueprint)) {
    items.push({
      title: "Complete the agency revenue path",
      detail: "Revenue goal, compliance lane, production pace, and CTA are not fully saved.",
      action: "Save the agency revenue path before scaling new output.",
      priority: "high",
      section: "settings"
    });
  }

  if (strongestIdea) {
    items.push({
      title: `Build: ${strongestIdea.title}`,
      detail: `${strongestIdea.totalScore}/100 score with ${strongestIdea.recommendedLengthMinutes || 7} minute potential.`,
      action: "Turn the highest-upside queued idea into the next project.",
      priority: "high",
      section: "idea-factory",
      tab: "Idea Queue"
    });
  } else {
    items.push({
      title: "Generate the next lead-aware idea batch",
      detail: "The production queue needs new ideas scored against the saved agency revenue path.",
      action: "Use the Idea Factory with the active insurance lane and saved growth strategy.",
      priority: "medium",
      section: "idea-factory",
      tab: "Generated Ideas"
    });
  }

  if (qualityItem) {
    items.push({
      title: qualityItem.project.title,
      detail: qualityItem.status,
      action: qualityItem.nextAction,
      priority: qualityItem.rank <= 2 ? "high" : "medium",
      section: "script-lab"
    });
  }

  if (readyUnscheduled) {
    items.push({
      title: "Schedule the next finished upload",
      detail: readyUnscheduled.title,
      action: "Put completed work on the calendar so the channel compounds weekly.",
      priority: "medium",
      section: "calendar"
    });
  }

  if (!input.analytics?.connected) {
    items.push({
      title: "Connect YouTube analytics",
      detail: "The app can improve weekly once it sees CTR, retention, views, calls-to-action, and audience growth.",
      action: "Connect the active channel and sync after publishing.",
      priority: "medium",
      section: "analytics"
    });
  }

  return items.slice(0, 4);
}

function thirtyDayLaunchPlan(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  slots: PublishingSlot[];
  blueprint: ChannelBlueprint;
}) {
  const weeklyTarget = Math.max(1, Math.min(14, input.blueprint.weeklyVideoTarget || 2));
  const readyIdeas = input.ideas.filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED").length;
  const publishable = input.projects.filter((project) => hasPublishableScript(project)).length;
  const packed = input.projects.filter((project) => latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const scheduled = input.slots.filter((slot) => slot.status === "SCHEDULED").length;

  return [
    {
      label: "Week 1",
      goal: "Lock the channel promise and first winners.",
      action: `Save the revenue path, generate ${Math.max(10, weeklyTarget * 5)} ideas, and choose the top ${weeklyTarget * 2}. Current ready ideas: ${readyIdeas}.`
    },
    {
      label: "Week 2",
      goal: "Produce the first publishing-ready batch.",
      action: `Build ${weeklyTarget} full scripts with quality gates, packs, thumbnails, and compliance-safe CTAs. Publishable now: ${publishable}.`
    },
    {
      label: "Week 3",
      goal: "Create a repeatable upload rhythm.",
      action: `Package and schedule at least ${weeklyTarget * 2} uploads, then create Shorts from the strongest open loops. Packs ready: ${packed}.`
    },
    {
      label: "Week 4",
      goal: "Let data pick the next lane.",
      action: `Sync YouTube, compare CTR, retention, comments, and CTA fit, then clone the winning promise. Scheduled now: ${scheduled}.`
    }
  ];
}

function monetizationStrategyItems(blueprint: ChannelBlueprint, projects: StoryProject[]) {
  const latestProject = [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  return [
    {
      label: "Primary revenue path",
      detail: blueprint.moneyGoal?.trim() || "Set whether this lane is chasing quote requests, calls, policy reviews, referrals, Google reviews, or renewal saves first."
    },
    {
      label: "Offer fit",
      detail: blueprint.offerDescription?.trim() || "Add the insurance service focus so the app can prefer topics where the CTA feels earned, not bolted on."
    },
    {
      label: "CTA system",
      detail: blueprint.primaryCta?.trim() || "Save the recurring prospect action. Scripts and packs can then keep the CTA consistent across uploads."
    },
    {
      label: "Lead capture",
      detail: blueprint.emailCapturePlan?.trim() || "Add a lead magnet for prospects who are interested but not ready to request a quote."
    },
    {
      label: "Current project angle",
      detail: latestProject ? projectMonetizationHint(latestProject, blueprint) : "Create a project and this panel will show the CTA angle for the current production."
    }
  ];
}

function doNotWasteTimeWarnings(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  analytics: YoutubeAnalyticsPayload | null;
  blueprint: ChannelBlueprint;
}) {
  const warnings: Array<{ title: string; detail: string; level: "high" | "medium" | "low" }> = [];
  const readyIdeas = input.ideas.filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED").length;
  const unfinishedProjects = input.projects.filter((project) => !hasPublishableScript(project)).length;
  const scriptsWithoutPacks = input.projects.filter((project) => hasPublishableScript(project) && !latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const highRiskIdeas = input.ideas.filter((idea) => ideaPowerPackForIdea(idea)?.monetizationRisk?.riskLevel === "High").length;

  if (!isMoneyPathReady(input.blueprint)) {
    warnings.push({ title: "Do not scale without a revenue path", detail: "More scripts will not fix unclear CTA, service fit, compliance lane, or publishing pace.", level: "high" });
  }
  if (readyIdeas > 20 && input.projects.length < 3) {
    warnings.push({ title: "Too much ideation, not enough production", detail: `${readyIdeas} ideas are waiting. Build the best few instead of generating another large batch.`, level: "medium" });
  }
  if (unfinishedProjects >= 5) {
    warnings.push({ title: "Finish before starting more", detail: `${unfinishedProjects} projects are not publishable yet. Complete the closest one and package it.`, level: "medium" });
  }
  if (scriptsWithoutPacks >= 2) {
    warnings.push({ title: "Scripts without packs do not convert", detail: `${scriptsWithoutPacks} finished scripts still need titles, descriptions, tags, thumbnails, and CTA packaging.`, level: "high" });
  }
  if (highRiskIdeas >= 3) {
    warnings.push({ title: "Risk is clustering", detail: `${highRiskIdeas} ideas have high revenue or compliance risk. Use safer insurance education framing before scripting.`, level: "medium" });
  }
  if (input.analytics?.connected && (input.analytics.summary.averageRetention || 0) > 0 && input.analytics.summary.averageRetention < 35) {
    warnings.push({ title: "Retention is the bottleneck", detail: "Do not chase more topics until hooks, pacing, and payoff structure improve.", level: "high" });
  }

  return warnings.length ? warnings.slice(0, 4) : [{ title: "No major waste detected", detail: "Keep producing, packaging, publishing, and syncing analytics on a weekly rhythm.", level: "low" as const }];
}

function moneyFocusedAnalytics(input: {
  analytics: YoutubeAnalyticsPayload | null;
  projects: StoryProject[];
  blueprint: ChannelBlueprint;
}) {
  const publishable = input.projects.filter((project) => hasPublishableScript(project)).length;
  const packed = input.projects.filter((project) => latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const weeklyTarget = Math.max(1, input.blueprint.weeklyVideoTarget || 2);
  const estimatedWeeksToTenUploads = Math.max(0, Math.ceil((10 - publishable) / weeklyTarget));

  return [
    {
      label: "Lead path",
      value: input.blueprint.primaryCta?.trim() ? "CTA saved" : "CTA missing",
      detail: input.blueprint.primaryCta?.trim() || "Save the quote, call, review, referral, or renewal action this lane should drive."
    },
    {
      label: "Output runway",
      value: `${publishable} scripts`,
      detail: `${packed} have campaign kits. Aim for at least 10 packaged assets before judging the lane.`
    },
    {
      label: "Pace to 10 uploads",
      value: `${estimatedWeeksToTenUploads} weeks`,
      detail: `Based on ${weeklyTarget} saved weekly video target${weeklyTarget === 1 ? "" : "s"}.`
    },
    {
      label: "Quote CTA readiness",
      value: input.blueprint.offerDescription?.trim() || input.blueprint.affiliateUrl?.trim() ? "Ready" : "Missing",
      detail: input.blueprint.offerDescription?.trim() ? firstSentence(input.blueprint.offerDescription) || "Service focus saved." : "Add the service focus, quote URL, and CTA before scaling production."
    }
  ];
}

function projectMonetizationHint(project: StoryProject, blueprint: ChannelBlueprint) {
  const offer = blueprint.offerDescription?.trim();
  const cta = blueprint.primaryCta?.trim();
  if (!offer && !cta) return "Save the service focus and primary CTA before this project is packaged.";
  if (project.format === "EPISODIC_SERIES") return "Use the CTA lightly in each episode description and make the strongest offer push in the final part.";
  if (supportsSponsorBlurb(project.format)) return `Use the saved CTA/compliance rules and keep the body script value-first. ${cta || offer || ""}`;
  return "Keep conversion language in the description, notes, or supporting assets unless this format naturally supports a CTA.";
}

function commandCenterItems(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  slots: PublishingSlot[];
  analytics: YoutubeAnalyticsPayload | null;
  blueprint: ChannelBlueprint;
}) {
  const readyIdeas = input.ideas.filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED").length;
  const scriptsWithoutPacks = input.projects.filter((project) => latestScriptDraft(project) && !latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const packsWithoutAssets = input.projects.filter((project) => latestDraftForPass(project, "PUBLISHING_PACK") && (!supportsThumbnails(project) || thumbnailAssetsForProject(project).length < requiredThumbnailCountForProject(project))).length;
  const readyUnscheduled = input.projects.filter((project) => hasPublishableScript(project) && !projectHasCalendarSlot(project, input.slots) && !isUsedProjectStatus(project.status)).length;
  const needsQuality = qualityGateQueue(input.projects).length;
  const voiceReady = channelVoiceChecklist(input.blueprint).filter((item) => item.ready).length;
  const analyticsConnected = Boolean(input.analytics?.connected);

  return [
    {
      label: "Next best move",
      title: readyIdeas ? "Build the strongest queued idea" : "Generate a new idea batch",
      detail: readyIdeas ? `${readyIdeas} usable ideas are waiting for production.` : "The queue is empty enough that ideation is the bottleneck.",
      priority: readyIdeas ? "high" : "medium",
      section: readyIdeas ? "idea-factory" : "idea-factory",
      tab: readyIdeas ? "Idea Queue" : "Generated Ideas"
    },
    {
      label: "Quality control",
      title: needsQuality ? "Run quality gates before finalizing" : "Quality queue is clear",
      detail: needsQuality ? `${needsQuality} project${needsQuality === 1 ? "" : "s"} need scorecards, packs, or asset checks.` : "Current projects have no obvious QA bottleneck.",
      priority: needsQuality ? "high" : "low",
      section: "script-lab",
      tab: undefined
    },
    {
      label: "Packaging",
      title: packsWithoutAssets ? "Create missing thumbnails/assets" : scriptsWithoutPacks ? "Create campaign kits" : "Packaging is moving",
      detail: packsWithoutAssets ? `${packsWithoutAssets} packed project${packsWithoutAssets === 1 ? "" : "s"} need visuals.` : scriptsWithoutPacks ? `${scriptsWithoutPacks} script${scriptsWithoutPacks === 1 ? "" : "s"} need metadata and thumbnail prompts.` : "No major packaging gap detected.",
      priority: packsWithoutAssets || scriptsWithoutPacks ? "medium" : "low",
      section: packsWithoutAssets ? "media" : "script-lab",
      tab: undefined
    },
    {
      label: "Publishing",
      title: readyUnscheduled ? "Schedule ready content" : "Calendar is caught up",
      detail: readyUnscheduled ? `${readyUnscheduled} finished output${readyUnscheduled === 1 ? "" : "s"} can be scheduled.` : "Finished work is either scheduled, live, or still needs finalization.",
      priority: readyUnscheduled ? "medium" : "low",
      section: "calendar",
      tab: undefined
    },
    {
      label: "Learning loop",
      title: analyticsConnected ? "Analytics feedback is active" : "Connect YouTube analytics",
      detail: analyticsConnected ? "Weekly stats can now shape ideas, scripts, and packaging choices." : "Connect YouTube so the app can learn from CTR, retention, views, and audience growth.",
      priority: analyticsConnected ? "low" : "medium",
      section: analyticsConnected ? "analytics" : "settings",
      tab: undefined
    },
    {
      label: "Brand system",
      title: voiceReady >= 6 ? "Voice profile is strong" : "Tighten channel voice rules",
      detail: `${voiceReady}/8 channel voice fields are production-ready.`,
      priority: voiceReady >= 6 ? "low" : "medium",
      section: "settings",
      tab: undefined
    }
  ] satisfies Array<{
    label: string;
    title: string;
    detail: string;
    priority: "high" | "medium" | "low";
    section: AppSection;
    tab?: TabLabel;
  }>;
}

function creatorCockpitItems(input: {
  ideas: StoryIdea[];
  projects: StoryProject[];
  slots: PublishingSlot[];
  analytics: YoutubeAnalyticsPayload | null;
  blueprint: ChannelBlueprint;
}) {
  const readyIdeas = input.ideas.filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED").length;
  const activeProjects = input.projects.filter((project) => !isUsedProjectStatus(project.status));
  const readyToUpload = input.projects.filter((project) => hasPublishableScript(project) && latestDraftForPass(project, "PUBLISHING_PACK")).length;
  const needsUploadPackage = input.projects.filter((project) => hasPublishableScript(project) && latestDraftForPass(project, "PUBLISHING_PACK") && (!supportsThumbnails(project) || thumbnailAssetsForProject(project).length >= requiredThumbnailCountForProject(project))).length;
  const analyticsConnected = Boolean(input.analytics?.connected);
  return [
    {
      label: "1. Channel",
      title: input.blueprint.channelName || "Lock the channel strategy",
      detail: isMoneyPathReady(input.blueprint) ? "Revenue path, CTA, rhythm, and positioning are saved." : "Save the agency revenue path before scaling content.",
      level: isMoneyPathReady(input.blueprint) ? "ready" : "warn",
      section: "settings" as const
    },
    {
      label: "2. Ideas",
      title: readyIdeas ? `${readyIdeas} ideas ready` : "Generate a winning batch",
      detail: readyIdeas ? "Pick from scored ideas with source, thumbnail, and revenue/compliance preflight." : "The growth lane needs fresh candidates before production.",
      level: readyIdeas ? "ready" : "warn",
      section: "idea-factory" as const,
      tab: readyIdeas ? "Idea Queue" as const : "Generated Ideas" as const
    },
    {
      label: "3. Build",
      title: activeProjects.length ? `${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}` : "Start the first project",
      detail: activeProjects.length ? "Use the next action in Content Lab to push one project through the line." : "Save an idea and create a project.",
      level: activeProjects.length ? "ready" : "warn",
      section: activeProjects.length ? "script-lab" as const : "projects" as const
    },
    {
      label: "4. Upload",
      title: readyToUpload ? `${readyToUpload} packed output${readyToUpload === 1 ? "" : "s"}` : "No upload package yet",
      detail: needsUploadPackage ? "Download a ready-to-upload package before publishing." : "Finish script, pack, and thumbnails first.",
      level: needsUploadPackage ? "ready" : "neutral",
      section: "exports" as const
    },
    {
      label: "5. Learn",
      title: analyticsConnected ? "YouTube learning loop active" : "Connect YouTube",
      detail: analyticsConnected ? "Synced results can improve the next idea, script, and package." : "Weekly sync turns uploads into recommendations.",
      level: analyticsConnected ? "ready" : "warn",
      section: analyticsConnected ? "analytics" as const : "settings" as const
    }
  ];
}

function qualityGateQueue(projects: StoryProject[]) {
  return projects
    .map((project) => {
      const script = latestScriptDraft(project);
      const quality = qualityScorecardForProject(project);
      const pack = latestDraftForPass(project, "PUBLISHING_PACK");
      const thumbnailCount = thumbnailAssetsForProject(project).length;
      const requiredThumbnails = requiredThumbnailCountForProject(project);
      if (!script) {
        return { project, status: "Waiting for script", nextAction: "Run the script workflow before QA.", rank: 5 };
      }
      if (!quality || !latestDraftForPass(project, "QUALITY_GATE")) {
        return { project, status: `${script.wordCount.toLocaleString()} words ready`, nextAction: "Run Quality Gate before treating this as final.", rank: 1 };
      }
      if (quality.overall < 82) {
        return { project, status: `Quality score ${quality.overall}`, nextAction: "Rewrite or polish before packaging.", rank: 2 };
      }
      if (!pack) {
        return { project, status: `Quality score ${quality.overall}`, nextAction: `Create ${publishingPackLabel(project.format)}.`, rank: 3 };
      }
      if (supportsThumbnails(project) && thumbnailCount < requiredThumbnails) {
        return { project, status: `${thumbnailCount}/${requiredThumbnails} thumbnails`, nextAction: "Generate the missing thumbnail set.", rank: 4 };
      }
      return null;
    })
    .filter((item): item is { project: StoryProject; status: string; nextAction: string; rank: number } => Boolean(item))
    .sort((a, b) => a.rank - b.rank || new Date(b.project.updatedAt).getTime() - new Date(a.project.updatedAt).getTime());
}

function defaultScriptIntentLock(project: StoryProject, blueprint: ChannelBlueprint): ScriptIntentLock {
  const idea = project.storyIdea;
  const carrierMatch = [project.title, idea?.title, idea?.summary, idea?.hook].filter(Boolean).join(" ").match(/Germania|Travelers|Swyfft|Progressive|Geico/i)?.[0];
  return {
    primaryLeadGoal: blueprint.moneyGoal?.trim() || "Generate qualified Texas insurance quote requests, policy reviews, renewal conversations, referrals, or Google review opportunities.",
    targetBuyer: blueprint.targetAudience?.trim() || "Texas insurance prospects, especially Houston-area homeowners, drivers, families, landlords, and small-business owners.",
    serviceCarrier: carrierMatch || blueprint.offerDescription?.trim() || idea?.category || "Texas home, auto, commercial, life, flood, or carrier-specific insurance education.",
    cta: blueprint.primaryCta?.trim() || "Call Baxter Insurance Agency, Inc. at 281-445-1381 or request a Texas insurance review.",
    complianceBoundary: blueprint.sponsorRules?.trim() || "Texas-only. Do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rates, discounts, or claim outcomes. Coverage depends on policy terms, limits, exclusions, deductibles, endorsements, underwriting, carrier appetite, and Texas regulations."
  };
}

function mergeScriptIntentLock(project: StoryProject, blueprint: ChannelBlueprint, override?: Partial<ScriptIntentLock>): ScriptIntentLock {
  const fallback = defaultScriptIntentLock(project, blueprint);
  return {
    primaryLeadGoal: override?.primaryLeadGoal?.trim() || fallback.primaryLeadGoal,
    targetBuyer: override?.targetBuyer?.trim() || fallback.targetBuyer,
    serviceCarrier: override?.serviceCarrier?.trim() || fallback.serviceCarrier,
    cta: override?.cta?.trim() || fallback.cta,
    complianceBoundary: override?.complianceBoundary?.trim() || fallback.complianceBoundary
  };
}

function scriptIntentMaterialBlock(project: StoryProject, intent: ScriptIntentLock, openingKey: ScriptOpeningKey) {
  const opening = scriptOpeningOptions.find((item) => item.key === openingKey) ?? scriptOpeningOptions[0];
  return [
    "SCRIPT INTENT LOCK",
    `Primary lead goal: ${intent.primaryLeadGoal}`,
    `Target buyer: ${intent.targetBuyer}`,
    `Service/carrier: ${intent.serviceCarrier}`,
    `CTA: ${intent.cta}`,
    `Compliance boundary: ${intent.complianceBoundary}`,
    `Opening style: ${opening.label} - ${opening.instruction}`,
    `Project format: ${formatProjectFormat(project.format)}`,
    supportsSceneBackgrounds(project)
      ? "Video production target: HeyGen.com. Keep script runtime under 30 minutes; default toward 7-10 minutes. Write clean presenter narration and preserve clear scene breaks for background generation."
      : ""
  ].filter(Boolean).join("\n");
}

function withScriptIntentMaterial(project: StoryProject, material: string, intent: ScriptIntentLock, openingKey: ScriptOpeningKey) {
  return [scriptIntentMaterialBlock(project, intent, openingKey), material.trim()].filter(Boolean).join("\n\n");
}

function ctaStrengthCheck(project: StoryProject, intent: ScriptIntentLock, sponsorBlurb: string, sponsorLink: string, latestPack: ClientPublishingPack | null) {
  const text = [intent.cta, sponsorBlurb, sponsorLink, latestPack?.description, latestPack?.pinnedComment].filter(Boolean).join(" ");
  const checks = [
    { label: "Clear next step", ready: /call|request|quote|review|schedule|contact|refer|leave/i.test(text), detail: "Names the action a prospect should take." },
    { label: "Phone number included", ready: /281[\s.-]?445[\s.-]?1381/.test(text), detail: "Uses Baxter's phone number for high-intent viewers." },
    { label: "Baxter named", ready: /Baxter Insurance/i.test(text), detail: "Connects the content to the agency, not generic advice." },
    { label: "Texas-only framed", ready: /Texas|Houston/i.test(text), detail: "Keeps the CTA inside the licensed market." },
    { label: "Not too salesy", ready: !/guaranteed|save \$|lowest rate|best rate|approved|covered no matter what/i.test(text), detail: "Avoids promises and hype language." },
    { label: "Matched to topic", ready: text.toLowerCase().includes(intent.serviceCarrier.split(/[,&/|]/)[0]?.trim().toLowerCase() || ""), detail: "CTA ties back to the selected service or carrier." }
  ];
  const score = Math.round((checks.filter((item) => item.ready).length / checks.length) * 100);
  const label = score >= 84 ? "Strong CTA" : score >= 67 ? "Usable CTA" : "CTA needs work";
  return { score, label, checks };
}

function landingPageMatchForProject(project: StoryProject, intent: ScriptIntentLock) {
  const haystack = [project.title, project.storyIdea?.title, project.storyIdea?.summary, project.storyIdea?.hook, intent.primaryLeadGoal, intent.serviceCarrier].filter(Boolean).join(" ");
  const lower = haystack.toLowerCase();
  if (/review|referral|google review|refer/i.test(haystack)) {
    return { label: "Review / Referral Page", priority: "medium" as const, detail: "Use Macaly for a simple page that requests reviews, referrals, and client check-ins." };
  }
  if (/germania|travelers|swyfft|progressive|geico/i.test(haystack)) {
    return { label: "Carrier Page", priority: "high" as const, detail: "Create a carrier-focused page with Texas-only wording, eligibility caveats, quote CTA, FAQs, and Baxter contact info." };
  }
  if (/quote|renewal|bundle|home insurance|auto insurance|commercial|business|life insurance|flood/i.test(lower)) {
    return { label: "Quote Landing Page", priority: "high" as const, detail: "Create a focused quote page with one lead form, call button, FAQs, trust signals, and compliance-safe copy." };
  }
  if (/faq|question|what|why|how|does|should/i.test(lower)) {
    return { label: "FAQ Page", priority: "medium" as const, detail: "Create a helpful FAQ page that answers the topic and routes readers to a policy review." };
  }
  if (project.format === "ARTICLE") {
    return { label: "Article / Service Page", priority: "medium" as const, detail: "Use a page that can rank locally and link to quote or service pages." };
  }
  return { label: "No dedicated page yet", priority: "low" as const, detail: "Use the campaign kit first. Build a landing page after the topic proves interest or has direct quote intent." };
}

function packagingTestBank(projects: StoryProject[]) {
  const rows: Array<{ projectTitle: string; title: string; overlay?: string; prompt: string }> = [];
  for (const project of projects) {
    const packDraft = latestDraftForPass(project, "PUBLISHING_PACK");
    if (!packDraft) continue;
    const pack = parseClientPublishingPack(packDraft.content, {
      title: project.title,
      sponsorBlurb: project.sponsorBlurb,
      sponsorLink: project.sponsorLink,
      summary: project.storyIdea?.summary,
      hook: project.storyIdea?.hook,
      targetLengthMinutes: project.targetLengthMinutes,
      format: project.format
    });
    for (const title of pack?.titles?.slice(0, 2) ?? []) {
      rows.push({ projectTitle: project.title, title: title.title, prompt: title.angle || "Saved title test" });
    }
    for (const thumb of pack?.thumbnailPrompts?.slice(0, 2) ?? []) {
      rows.push({
        projectTitle: project.title,
        title: thumb.title || project.title,
        overlay: thumb.overlayText,
        prompt: thumb.prompt
      });
    }
  }
  return rows;
}

function modelLedgerRows(ledger: UsageLedger | null) {
  if (!ledger) return [];
  return ledger.byModel
    .map((row) => ({
      label: row.modelUsed.replace(/^openrouter:/, "").replace(/^anthropic:/, "").replace(/^openai:/, ""),
      status: displayStatusText(row.status),
      generationCount: row.generationCount,
      totalTokens: row.totalTokens,
      estimatedCost: row.estimatedCost
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost || b.totalTokens - a.totalTokens);
}

function channelVoiceChecklist(blueprint: ChannelBlueprint) {
  const checks = [
    ["Audience", blueprint.targetAudience, "who the channel is for"],
    ["Voice", blueprint.voiceProfile, "narration personality and credibility rules"],
    ["Intro rhythm", blueprint.introStyle, "how openings should feel"],
    ["CTA style", blueprint.sponsorRules, "CTA and compliance language"],
    ["Thumbnail style", blueprint.thumbnailStyle, "visual system and overlay rules"],
    ["Forbidden phrases", blueprint.bannedPhrases || blueprint.phrasesToAvoid, "phrases and claims to avoid"],
    ["Recurring lanes", blueprint.recurringStoryTypes, "repeatable series formats"],
    ["Publishing rhythm", blueprint.publishingRhythm, "how often to release"]
  ] as const;
  return checks.map(([label, value, purpose]) => ({
    label,
    ready: Boolean(value?.trim() && value.trim().length >= 20),
    detail: value?.trim() ? firstSentence(value.trim()) || purpose : `Add ${purpose}.`
  }));
}

function learningLoopInsights(input: {
  analytics: YoutubeAnalyticsPayload | null;
  ideas: StoryIdea[];
  projects: StoryProject[];
}) {
  if (!input.analytics?.connected) {
    return [
      {
        title: "No connected YouTube stats yet",
        detail: "The idea machine will use general retention and packaging rules until analytics syncs.",
        action: "Connect YouTube and let the weekly sync collect CTR, retention, views, and audience growth."
      },
      {
        title: "Use idea scores as baseline",
        detail: `${input.ideas.length} ideas can still be ranked by market score, source depth, white space, and risk.`,
        action: "After publishing, compare actual videos against these scores to see what predicts growth."
      }
    ];
  }

  const videos = input.analytics.videos;
  const topWatch = [...videos].sort((a, b) => b.watchHours - a.watchHours)[0];
  const topCtr = [...videos].filter((video) => video.impressions >= 100).sort((a, b) => b.impressionCtr - a.impressionCtr)[0];
  const topRetention = [...videos].filter((video) => video.views >= 50).sort((a, b) => b.averageViewPercentage - a.averageViewPercentage)[0];
  const rec = input.analytics.recommendations[0];
  const items = [
    topWatch ? {
      title: "Watch-time winner",
      detail: `${topWatch.title} produced ${topWatch.watchHours.toFixed(1)} watch hours.`,
      action: "Generate follow-up ideas in the same promise, pacing style, and viewer question."
    } : null,
    topCtr ? {
      title: "Packaging winner",
      detail: `${topCtr.title} has ${topCtr.impressionCtr.toFixed(1)}% CTR.`,
      action: "Save its title/thumbnail pattern as a packaging reference for the next batch."
    } : null,
    topRetention ? {
      title: "Retention winner",
      detail: `${topRetention.title} held ${topRetention.averageViewPercentage.toFixed(1)}% average viewed.`,
      action: "Use its hook timing, reveal spacing, and payoff rhythm as the next script model."
    } : null,
    rec ? {
      title: rec.title,
      detail: rec.insight,
      action: rec.recommendation
    } : null,
    {
      title: "Score calibration",
      detail: `${input.projects.filter((project) => project.status === "PUBLISHED").length} projects are marked published in Baxter Growth Lab.`,
      action: "After each weekly sync, compare published project topics against actual CTR, retention, likes, watch hours, and subscriber gain."
    }
  ];
  return items.filter((item): item is { title: string; detail: string; action: string } => Boolean(item));
}

function displayStatusText(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function firstSentence(value: string) {
  return value.split(/(?<=[.!?])\s+/)[0]?.trim();
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function agencyRevenueTierLabel(value?: string | null) {
  return (value || "Agency revenue fit").replace(/monetization/gi, "agency revenue");
}

function formatCompactTokens(value: number) {
  return `${compactNumber(value)} tokens`;
}

function pipelineBoard(projects: StoryProject[], ideas: StoryIdea[], slots: PublishingSlot[]): PipelineColumn[] {
  const slotProjectIds = new Set(slots.map((slot) => slot.storyProjectId));
  const ideaItems: PipelineItem[] = ideas
    .filter((idea) => idea.status === "UNUSED" || idea.status === "SAVED")
    .slice(0, 8)
    .map((idea) => ({ id: idea.id, title: idea.title, meta: `${displayStatus(idea.status)} · ${idea.totalScore} score` }));
  const researchItems: PipelineItem[] = projects
    .filter((project) => latestDraftForPass(project, "DOSSIER") && !latestScriptDraft(project))
    .slice(0, 8)
    .map((project) => ({ id: project.id, projectId: project.id, title: project.title, meta: "Research/Dossier ready" }));
  const scriptItems: PipelineItem[] = projects
    .filter((project) => latestScriptDraft(project) && !latestDraftForPass(project, "PUBLISHING_PACK"))
    .slice(0, 8)
    .map((project) => ({ id: project.id, projectId: project.id, title: project.title, meta: latestScriptDraft(project) ? `${latestScriptDraft(project)?.wordCount.toLocaleString()} words` : `${projectOutputNoun(project.format)} ready` }));
  const packItems: PipelineItem[] = projects
    .filter((project) => latestDraftForPass(project, "PUBLISHING_PACK") && (!supportsThumbnails(project) || thumbnailAssetsForProject(project).length < requiredThumbnailCountForProject(project)))
    .slice(0, 8)
    .map((project) => ({ id: project.id, projectId: project.id, title: project.title, meta: `${publishingPackLabel(project.format)} ready` }));
  const thumbnailItems: PipelineItem[] = projects
    .filter((project) => supportsThumbnails(project) && thumbnailAssetsForProject(project).length >= requiredThumbnailCountForProject(project) && !slotProjectIds.has(project.id))
    .slice(0, 8)
    .map((project) => ({ id: project.id, projectId: project.id, title: project.title, meta: `${thumbnailAssetsForProject(project).length} thumbnails` }));
  const scheduledItems: PipelineItem[] = slots
    .filter((slot) => slot.status === "SCHEDULED")
    .slice(0, 8)
    .map((slot) => ({ id: slot.id, projectId: slot.storyProjectId, title: slot.title, meta: formatDate(slot.scheduledDate) }));
  const publishedItems: PipelineItem[] = projects
    .filter((project) => project.status === "PRODUCED" || project.status === "PUBLISHED")
    .slice(0, 8)
    .map((project) => ({ id: project.id, projectId: project.id, title: project.title, meta: displayProjectStatus(project.status) }));

  return [
    { label: "Ideas", items: ideaItems },
    { label: "Research", items: researchItems },
    { label: "Output", items: scriptItems },
    { label: "Metadata", items: packItems },
    { label: "Thumbnails", items: thumbnailItems },
    { label: "Scheduled", items: scheduledItems },
    { label: "Produced / Live", items: publishedItems }
  ];
}

function agencyReadinessItems(projects: StoryProject[], settings: UserSettings, channel: Channel | undefined, blueprint: ChannelBlueprint) {
  const completedScript = projects.some((project) => Boolean(latestScriptDraft(project)));
  const publishingPack = projects.some((project) => Boolean(latestDraftForPass(project, "PUBLISHING_PACK")));
  const videoProjects = projects.filter((project) => supportsThumbnails(project));
  const thumbnailSet = videoProjects.some((project) => thumbnailAssetsForProject(project).length >= requiredThumbnailCountForProject(project));
  const qualityGate = projects.some((project) => Boolean(latestDraftForPass(project, "QUALITY_GATE")));
  const blueprintReady = Boolean(channel?.description && blueprint.targetAudience.trim() && blueprint.thumbnailStyle.trim());

  return [
    { label: "Campaign content started", ready: projects.length >= 3, detail: `${projects.length} project${projects.length === 1 ? "" : "s"} in this growth lane` },
    { label: "Final output available", ready: completedScript, detail: completedScript ? "A producer can copy or export finished content." : "Run Fully Auto on one project." },
    { label: "One-click campaign package", ready: publishingPack, detail: publishingPack ? "Campaign metadata is ready to package." : "Create the final Business Campaign Kit after Outro or Closing CTA." },
    { label: "Video thumbnail set", ready: videoProjects.length ? thumbnailSet : true, detail: videoProjects.length ? (thumbnailSet ? "At least one video project has three thumbnails." : "Generate thumbnails for the strongest video project.") : "No video projects need thumbnails." },
    { label: "Quality scorecard", ready: qualityGate, detail: qualityGate ? "Quality gate data is visible." : "Run Quality Gate before Final." },
    { label: "Growth lane blueprint", ready: blueprintReady, detail: blueprintReady ? `${channel?.name} has a saved operating strategy.` : "Save audience, style, CTA, and rhythm rules." },
    { label: "API setup", ready: hasTextGenerationProvider(settings), detail: hasTextGenerationProvider(settings) ? "At least one text generation provider is configured." : "Add OpenRouter, Anthropic, or OpenAI before production work." }
  ];
}

function hasTextGenerationProvider(settings: UserSettings) {
  return Boolean(settings.hasOpenRouterApiKey || settings.hasAnthropicApiKey || settings.hasOpenAiApiKey);
}

function isFinalIncompleteError(message: string) {
  return /final script output appeared incomplete/i.test(message);
}

function modelRoutingSettingsPatch(settings: UserSettings): Pick<UserSettings, ModelSettingKey | "autoModelRouting"> {
  return {
    defaultModel: settings.defaultModel,
    discoveryModel: settings.discoveryModel,
    dossierModel: settings.dossierModel,
    structureModel: settings.structureModel,
    draftingModel: settings.draftingModel,
    critiqueModel: settings.critiqueModel,
    rewriteModel: settings.rewriteModel,
    autoModelRouting: settings.autoModelRouting
  };
}

function providerStatusPatch(settings: UserSettings): Pick<UserSettings, "hasOpenRouterApiKey" | "hasAnthropicApiKey" | "hasOpenAiApiKey" | "hasRunwareApiKey" | "hasDataForSeoCredentials" | "hasWordPressCredentials"> {
  return {
    hasOpenRouterApiKey: settings.hasOpenRouterApiKey,
    hasAnthropicApiKey: settings.hasAnthropicApiKey,
    hasOpenAiApiKey: settings.hasOpenAiApiKey,
    hasRunwareApiKey: settings.hasRunwareApiKey,
    hasDataForSeoCredentials: settings.hasDataForSeoCredentials,
    hasWordPressCredentials: settings.hasWordPressCredentials
  };
}

function qualityScorecardForProject(project: StoryProject) {
  const quality = latestDraftForPass(project, "QUALITY_GATE");
  const body = latestScriptDraft(project);
  if (!quality && !body) return null;

  const content = quality?.content ?? "";
  const scoreLabels = [
    ["Quote Intent", "Quote Intent Score"],
    ["Trust", "Trust Score"],
    ["Clarity", "Clarity Score"],
    ["Compliance", "Compliance Safety Score"],
    ["Local Relevance", "Texas Local Relevance Score"],
    ["CTA Strength", "CTA Strength Score"],
    ["Objections", "Objection Handling Score"],
    ["Coverage Safety", "Coverage Promise Safety Score"]
  ] as const;
  const fallbackBase = body ? Math.min(94, Math.max(72, Math.round(body.wordCount / Math.max(1, project.targetWordCount) * 88))) : 0;
  const scores = scoreLabels.map(([label, key], index) => ({
    label,
    value: extractScore(content, key) ?? Math.max(0, Math.min(100, fallbackBase + (index % 2 === 0 ? 2 : -1)))
  }));
  const overall = extractScore(content, "Overall Score") ?? Math.round(scores.reduce((sum, score) => sum + score.value, 0) / scores.length);

  return {
    overall,
    scores,
    note: quality ? firstMeaningfulLine(content, "Must Fix Before Final") : "Run Quality Gate for model-reviewed scores. These preview scores are based on workflow completion."
  };
}

function claimLedgerForProject(project: StoryProject) {
  const dossier = latestDraftForPass(project, "DOSSIER");
  const source = dossier ? "Dossier" : project.sourceMaterial?.trim() ? "Source notes" : "";
  const content = dossier?.content || project.sourceMaterial || "";
  if (!content.trim()) return null;

  const sections = [
    { label: "Confirmed", items: extractLedgerItems(content, ["Confirmed Facts", "CONFIRMED FACTS TO VERIFY"]) },
    { label: "Needs Verification", items: extractLedgerItems(content, ["Likely But Needs Verification", "SOURCE LEADS", "Source Leads"]) },
    { label: "Coverage Warnings", items: extractLedgerItems(content, ["Coverage Promise Warnings", "Carrier Statement Warnings", "Claim Outcome Warnings", "Overstatement Risks"]) },
    { label: "Do Not Say As Fact", items: extractLedgerItems(content, ["Do Not Say As Fact", "Unsupported Claims", "Legal Tax Or Professional Advice Warnings"]) }
  ].map((section) => ({
    ...section,
    items: section.items.length ? section.items : ["No items extracted yet."]
  }));

  return { source, sections };
}

function exportVaultRows(projects: StoryProject[]) {
  return projects.flatMap((project) => {
    const rows: Array<{ id: string; title: string; meta: string; filename: string; content: string }> = [];
    const complete = scriptOutputOptionsForProject(project)[0];
    if (complete?.id.startsWith("complete-script-")) {
      rows.push({
        id: `${project.id}-complete`,
        title: `${project.title} - ${complete.displayLabel ?? projectFinalOutputLabel(project.format)}`,
        meta: `${complete.wordCount.toLocaleString()} words · assembled ${formatDate(project.updatedAt)}`,
        filename: `${safeFilename(project.title)}-${safeFilename(complete.displayLabel ?? projectFinalOutputLabel(project.format))}-${dateStamp(project.updatedAt)}.txt`,
        content: complete.content
      });
    }

    for (const draft of project.drafts ?? []) {
      rows.push({
        id: draft.id,
        title: `${project.title} - ${passLabelForProject(draft.passType, project.format)} v${draft.version}`,
        meta: `${draft.wordCount.toLocaleString()} words · ${formatDateTime(draft.createdAt)}`,
        filename: `${safeFilename(project.title)}-${safeFilename(passLabelForProject(draft.passType, project.format))}-v${draft.version}-${dateStamp(draft.createdAt)}.txt`,
        content: draft.content
      });
    }

    return rows;
  }).sort((a, b) => b.meta.localeCompare(a.meta)).slice(0, 80);
}

function extractScore(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`${escaped}\\s*:?\\s*(\\d{1,3})`, "i"));
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, value));
}

function firstMeaningfulLine(content: string, afterHeading?: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const start = afterHeading ? Math.max(0, lines.findIndex((line) => line.toLowerCase().includes(afterHeading.toLowerCase())) + 1) : 0;
  return lines.slice(start).find((line) => !/score\s*:/i.test(line) && !/^[A-Z][A-Za-z\s]+$/.test(line)) || "";
}

function extractLedgerItems(content: string, headings: string[]) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => headings.some((heading) => normalizeHeading(line) === normalizeHeading(heading) || normalizeHeading(line).includes(normalizeHeading(heading))));
  if (start < 0) return [];
  const items: string[] = [];
  for (const rawLine of lines.slice(start + 1)) {
    const line = rawLine.trim();
    if (!line) {
      if (items.length) break;
      continue;
    }
    if (items.length && /^[A-Z][A-Za-z\s]+$/.test(line) && line.length < 60) break;
    if (/^={3,}/.test(line)) break;
    const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
    if (cleaned && !headings.some((heading) => normalizeHeading(cleaned).includes(normalizeHeading(heading)))) items.push(cleaned);
    if (items.length >= 6) break;
  }
  return items;
}

function normalizeHeading(value: string) {
  return value.replace(/^#+\s*/, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function parseChannelBlueprint(description?: string | null): ChannelBlueprint {
  if (!description?.trim()) return defaultChannelBlueprint;
  try {
    const parsed = JSON.parse(description) as Partial<ChannelBlueprint>;
    return { ...defaultChannelBlueprint, ...parsed };
  } catch {
    return { ...defaultChannelBlueprint, targetAudience: description };
  }
}

function channelNameForPatch(value: string | undefined, fallback: string) {
  const clean = (value || fallback).replace(/\s+/g, " ").trim() || fallback;
  return clean.length > 80 ? clean.slice(0, 80).trim() : clean;
}

function findChannelByName(channels: Channel[], name: string) {
  const normalized = normalizeChannelName(name);
  return channels.find((channel) => normalizeChannelName(channel.name) === normalized);
}

function alphabetizeChannels(channels: Channel[]) {
  return [...channels].sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }));
}

function normalizeChannelName(value: string) {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

function seedFromHotNiche(niche: ChannelHotNiche) {
  return limitChannelSeed([
    `Monthly niche: ${niche.title}`,
    niche.description,
    `Viewer promise: ${niche.bestViewerPromise}`,
    typeof niche.monetizationScore === "number"
      ? `Revenue rank: ${niche.monetizationScore}/10 (${agencyRevenueTierLabel(niche.monetizationTier)}). ${niche.monetizationRationale || ""}`
      : "",
    `Why now: ${niche.whyHotThisMonth}`,
    `Idea Factory defaults: Niche / Focus ${niche.nicheFocus}; Tone ${niche.tone}; Category ${niche.category}; Source Type ${niche.sourceType}.`,
    niche.keywords.length ? `Keyword targets: ${niche.keywords.slice(0, 8).join(", ")}` : "",
    niche.starterAngles.length ? `Starter angles: ${niche.starterAngles.slice(0, 4).join("; ")}` : "",
    "Create a complete YouTube channel kit for this exact insurance lane. Do not reuse the currently active channel name or theme unless it matches this niche."
  ].filter(Boolean).join("\n"));
}

function limitChannelSeed(value: string) {
  const clean = value.replace(/\s+/g, " ").replace(/\s+\n/g, "\n").trim();
  if (clean.length <= CHANNEL_IDEA_MACHINE_SEED_LIMIT) return clean;
  return `${clean.slice(0, CHANNEL_IDEA_MACHINE_SEED_LIMIT - 24).trim()}... [seed compacted]`;
}

function channelIdeaKey(niche: Pick<ChannelHotNiche, "title" | "seedPrompt">) {
  return safeFilename(niche.title).slice(0, 120);
}

function channelKitIdeaKey(kit: Pick<ChannelBlueprint, "channelName" | "description">, fallback?: string) {
  return safeFilename(kit.channelName || fallback || kit.description || "generated-channel-idea").slice(0, 120);
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function assetDownloadPath(url: string, filename: string) {
  return apiPath(`/api/assets/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`);
}

function assetDownloadErrorMessage(text: string, status: number) {
  if (text) {
    try {
      const payload = JSON.parse(text) as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      const plain = text.replace(/\s+/g, " ").trim();
      if (plain) return plain.slice(0, 220);
    }
  }
  return `Generated asset download failed with status ${status}.`;
}

function safeFilename(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "policyforge-export";
}

function dateStamp(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function isNewerDraft(candidate: ScriptDraft | undefined, previous: ScriptDraft | undefined) {
  if (!candidate) return false;
  if (!previous) return true;
  if (candidate.id === previous.id) return false;
  if (candidate.version > previous.version) return true;
  return new Date(candidate.createdAt).getTime() > new Date(previous.createdAt).getTime();
}

function isNewerSourceMaterial(candidate: string, previous: string) {
  const current = candidate.trim();
  const prior = previous.trim();
  return current.length > prior.length && current !== prior;
}

function projectStatusForPassClient(passType: ScriptPassType): StoryProjectStatus {
  if (passType === "DOSSIER") return "DOSSIER";
  if (passType === "INTRO" || passType === "ANALYTICS_BRIEF" || passType === "EPISODES" || passType === "SERIES_BIBLE" || passType === "HOOK_LAB" || passType === "STORY_SPINE" || passType === "STRUCTURE" || passType === "RETENTION_MAP" || passType === "SCRIPT_LENGTH_GOVERNOR" || passType === "OPEN_LOOP_LEDGER") return "OUTLINE";
  if (passType === "DRAFT") return "DRAFTING";
  if (passType === "RETENTION_ANALYSIS" || passType === "CRITIQUE" || passType === "FACT_CHECK") return "CRITIQUE";
  if (passType === "REWRITE" || passType === "VOICE_POLISH" || passType === "QUALITY_GATE") return "REWRITE";
  return "FINAL";
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function initialsFor(value: string) {
  const parts = value.replace(/@.*/, "").split(/\s+|[._-]/).filter(Boolean);
  return (parts[0]?.[0] || "S").toUpperCase() + (parts[1]?.[0] || parts[0]?.[1] || "F").toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function modelOptionLabel(model: OpenRouterModel) {
  const meta = [
    model.id,
    model.contextLength ? `${formatContext(model.contextLength)} ctx` : null,
    model.pricing ? formatPricing(model.pricing) : null
  ].filter(Boolean);
  return `${model.name} (${meta.join(" · ")})`;
}

function fallbackModelOptionLabel(model: FallbackProviderModel) {
  const meta = [
    model.id,
    model.contextLength ? `${formatContext(model.contextLength)} ctx` : null,
    model.maxTokens ? `${formatContext(model.maxTokens)} max` : null,
    model.source === "default" ? "saved/default" : null
  ].filter(Boolean);
  return `${model.name} (${meta.join(" · ")})`;
}

function formatContext(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return `${value}`;
}

function formatPricing(pricing: OpenRouterModel["pricing"]) {
  const prompt = Number(pricing?.prompt);
  const completion = Number(pricing?.completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) return "dynamic price";
  return `$${(prompt * 1_000_000).toFixed(2)}/$${(completion * 1_000_000).toFixed(2)} per 1M`;
}

function iconForCategory(category: string) {
  if (category.includes("Maritime")) return <Anchor size={15} />;
  if (category.includes("Aviation")) return <Navigation size={15} />;
  if (category.includes("Survival")) return <ShieldCheck size={15} />;
  if (category.includes("History") || category.includes("Historical")) return <CalendarDays size={15} />;
  if (category.includes("Courtroom")) return <FileText size={15} />;
  return <Search size={15} />;
}
