import type { ScriptDraft, StoryIdea, StoryProject, ThumbnailAsset } from "@prisma/client";
import { formatHeyGenSceneScript, shouldFormatAsHeyGenScenes } from "@/lib/heygen-scenes";
import { parsePublishingPack } from "@/lib/publishing-pack";
import { normalizeSponsorBlurbForFormat, normalizeSponsorLanguageForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { ensureIntroSponsorPlacement, ensureOutroSponsorPlacement, stripSponsorCopyFromBody } from "@/lib/sponsor-placement";
import { wordCount } from "@/lib/utils";
import { formatYoutubeDescription } from "@/lib/youtube-description";

type ProjectWithAssets = StoryProject & {
  storyIdea?: StoryIdea | null;
  drafts: ScriptDraft[];
  thumbnails: ThumbnailAsset[];
};

export function latestDraftForPass(drafts: ScriptDraft[], passType: ScriptDraft["passType"]) {
  return [...drafts]
    .filter((draft) => draft.passType === passType)
    .sort((a, b) => b.version - a.version || b.createdAt.getTime() - a.createdAt.getTime())[0];
}

export function latestBodyDraft(drafts: ScriptDraft[]) {
  return latestDraftForPass(drafts, "FINAL") ?? latestDraftForPass(drafts, "VOICE_POLISH") ?? latestDraftForPass(drafts, "REWRITE") ?? latestDraftForPass(drafts, "DRAFT");
}

export function completeScriptForProject(project: Pick<StoryProject, "format" | "sponsorBlurb"> & { drafts: ScriptDraft[] }) {
  const intro = latestDraftForPass(project.drafts, "INTRO");
  const body = latestBodyDraft(project.drafts);
  const outro = latestDraftForPass(project.drafts, "OUTRO");
  const sponsorBlurb = supportsSponsorBlurb(project.format) ? normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format) : null;
  const assembled = (project.format === "EPISODIC_SERIES" || latestDraftForPass(project.drafts, "EPISODES")) && body
    ? assembleEpisodeScriptForExport(project.format, intro?.content, body.content, outro?.content, sponsorBlurb)
    : [
        intro ? normalizeSponsorLanguageForFormat(ensureIntroSponsorPlacement(intro.content, sponsorBlurb), project.format) : undefined,
        body ? normalizeSponsorLanguageForFormat(stripSponsorCopyFromBody(body.content, sponsorBlurb), project.format) : undefined,
        outro ? normalizeSponsorLanguageForFormat(ensureOutroSponsorPlacement(outro.content, sponsorBlurb), project.format) : undefined
      ].filter(Boolean).join("\n\n");

  return shouldFormatAsHeyGenScenes(project.format)
    ? formatHeyGenSceneScript(assembled)
    : assembled;
}

function assembleEpisodeScriptForExport(
  format: StoryProject["format"],
  introContent: string | undefined,
  bodyContent: string,
  outroContent: string | undefined,
  sponsorBlurb: string | null
) {
  const introSections = parseEpisodeOutputSections(introContent || "");
  const bodySections = parseEpisodeOutputSections(bodyContent);
  const outroSections = parseEpisodeOutputSections(outroContent || "");
  if (!introSections.length && !bodySections.length && !outroSections.length) {
    return normalizeSponsorLanguageForFormat(stripSponsorCopyFromBody(bodyContent, sponsorBlurb), format);
  }
  const sections: string[] = [];
  const episodeCount = Math.max(
    1,
    ...introSections.map((section) => section.episodeNumber),
    ...bodySections.map((section) => section.episodeNumber),
    ...outroSections.map((section) => section.episodeNumber)
  );
  for (let episodeNumber = 1; episodeNumber <= episodeCount; episodeNumber += 1) {
    const intro = introSections.find((section) => section.episodeNumber === episodeNumber);
    const body = bodySections.find((section) => section.episodeNumber === episodeNumber);
    const outro = outroSections.find((section) => section.episodeNumber === episodeNumber);
    const pieces = [
      intro?.content ? ensureIntroSponsorPlacement(intro.content, sponsorBlurb) : undefined,
      body?.content ? stripSponsorCopyFromBody(body.content, sponsorBlurb) : undefined,
      outro?.content ? ensureOutroSponsorPlacement(outro.content, sponsorBlurb) : undefined
    ].filter(Boolean).map((piece) => normalizeSponsorLanguageForFormat(piece || "", format));
    if (!pieces.length) continue;
    const title = body?.title || intro?.title || outro?.title || `Episode ${episodeNumber}`;
    sections.push(`Episode ${episodeWord(episodeNumber)}: ${title}\n\n${pieces.join("\n\n")}`);
  }
  return sections.join("\n\n");
}

export function buildContentPackMarkdown(project: ProjectWithAssets) {
  const script = completeScriptForProject(project);
  const packDraft = latestDraftForPass(project.drafts, "PUBLISHING_PACK");
  const qualityDraft = latestDraftForPass(project.drafts, "QUALITY_GATE");
  const dossierDraft = latestDraftForPass(project.drafts, "DOSSIER");
  const pack = packDraft ? safeParsePack(packDraft.content) : null;
  const scorecard = qualityDraft ? qualityDraft.content.trim() : "No quality gate has been generated yet.";
  const claimLedger = dossierDraft ? dossierDraft.content.trim() : project.sourceMaterial?.trim() || "No dossier or source material has been saved yet.";
  const scriptWords = wordCount(script);

  const lines = [
    `# ${project.title}`,
    "",
    "## Project Summary",
    "",
    `Status: ${project.status}`,
    `Format: ${contentFormatLabel(project.format)}`,
    project.format === "ARTICLE" || project.format === "SHORT_BOOK" || project.format === "LONG_BOOK" ? `Target size: ${project.targetWordCount.toLocaleString()} words` : `Target length: ${project.targetLengthMinutes} minutes`,
    `${project.format === "ARTICLE" ? "Article" : project.format === "PODCAST_EPISODE" ? "Podcast script" : project.format === "SHORT_BOOK" ? "Short book manuscript" : project.format === "LONG_BOOK" ? "Long form book manuscript" : "Script"} length: ${scriptWords.toLocaleString()} words`,
    `Tone: ${project.tone}`,
    `Narration style: ${project.narrationStyle}`,
    project.storyIdea?.hook ? `Hook: ${project.storyIdea.hook}` : "",
    project.storyIdea?.summary ? `Summary: ${project.storyIdea.summary}` : "",
    "",
    `## Final ${project.format === "ARTICLE" ? "Article" : project.format === "PODCAST_EPISODE" ? "Podcast Script" : project.format === "SHORT_BOOK" ? "Short Book" : project.format === "LONG_BOOK" ? "Long Form Book" : "Teleprompter Script"}`,
    "",
    script || "No output yet.",
    "",
    "## Quality Scorecard",
    "",
    scorecard,
    "",
    "## Research Confidence And Claim Ledger",
    "",
    claimLedger,
    "",
    `## ${project.format === "ARTICLE" ? "Article SEO Pack" : project.format === "PODCAST_EPISODE" ? "Podcast Show Notes Pack" : project.format === "SHORT_BOOK" || project.format === "LONG_BOOK" ? "Book Launch Pack" : "YouTube Publishing Pack"}`,
    ""
  ];

  if (pack) {
    if (pack.episodePacks?.length) {
      pack.episodePacks.forEach((episode) => {
        lines.push(`### ${episode.partLabel} Publishing Pack`, "", "#### Title Options", "");
        episode.titles.forEach((item, index) => {
          lines.push(`${index + 1}. ${item.title}`);
          if (item.angle) lines.push(`   ${item.angle}`);
        });
        lines.push("", "#### Description", "", episode.description, "", "#### Tags", "", episode.tags.join(", "));
        if (episode.thumbnailPrompts.length) {
          lines.push("", "#### Thumbnail Prompts", "");
          episode.thumbnailPrompts.forEach((item, index) => {
            lines.push(`${index + 1}. ${item.title}`);
            if (item.overlayText) lines.push(`   Overlay text: ${item.overlayText}`);
            lines.push(`   Prompt: ${item.prompt}`);
          });
        }
        if (episode.sunoPrompt) {
          lines.push("", "#### Suno Background Music Prompt", "");
          if (episode.sunoPrompt.title) lines.push(`Track idea: ${episode.sunoPrompt.title}`, "");
          lines.push(episode.sunoPrompt.prompt);
        }
        if (episode.pinnedComment) lines.push("", "#### Pinned Comment", "", episode.pinnedComment);
        lines.push("");
      });
    } else {
      lines.push("### Title Options", "");
      pack.titles.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.title}`);
        if (item.angle) lines.push(`   ${item.angle}`);
      });
      lines.push(
        "",
        "### Description",
        "",
        project.format === "ARTICLE" || project.format === "PODCAST_EPISODE" || project.format === "SHORT_BOOK" || project.format === "LONG_BOOK"
          ? normalizeSponsorLanguageForFormat(pack.description, project.format)
          : formatYoutubeDescription({
              title: project.title,
              description: pack.description,
              tags: pack.tags,
              sponsorBlurb: normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format),
              sponsorLink: project.sponsorLink,
              summary: project.storyIdea?.summary,
              hook: project.storyIdea?.hook,
              targetLengthMinutes: project.targetLengthMinutes
            }),
        "",
        "### Tags",
        "",
        pack.tags.join(", ")
      );
      if (pack.thumbnailPrompts.length) {
        lines.push("", "### Thumbnail Prompts", "");
        pack.thumbnailPrompts.forEach((item, index) => {
          lines.push(`${index + 1}. ${item.title}`);
          if (item.overlayText) lines.push(`   Overlay text: ${item.overlayText}`);
          lines.push(`   Prompt: ${item.prompt}`);
        });
      }
      if ((project.format === "STANDALONE" || project.format === "EPISODIC_SERIES") && pack.sunoPrompt) {
        lines.push("", "### Suno Background Music Prompt", "");
        if (pack.sunoPrompt.title) lines.push(`Track idea: ${pack.sunoPrompt.title}`, "");
        lines.push(pack.sunoPrompt.prompt);
      }
      if (pack.pinnedComment) lines.push("", "### Pinned Comment", "", pack.pinnedComment);
    }
    if (project.format === "ARTICLE" && pack.seoPack) {
      lines.push("", "### Article SEO Pack", "");
      lines.push(...articleSeoPackMarkdown(pack.seoPack));
    }
    if (project.format === "ARTICLE" && pack.topicalAuthorityMap) {
      lines.push("", "### Topical Authority Map", "");
      lines.push(...topicalAuthorityMapMarkdown(pack.topicalAuthorityMap));
    }
  } else {
    lines.push("No Publishing Pack has been generated yet.");
  }

  const assets = contentPackAssets(project);
  if (assets.length) {
    const assetLabel = project.format === "ARTICLE"
      ? "Article Image Assets"
      : project.format === "SHORT_BOOK" || project.format === "LONG_BOOK"
        ? "Book Illustration Assets"
        : "Thumbnail Assets";
    const assetLimit = project.format === "SHORT_BOOK" || project.format === "LONG_BOOK" ? 24 : project.format === "ARTICLE" ? 12 : 12;
    lines.push("", `## ${assetLabel}`, "");
    assets.slice(0, assetLimit).forEach((thumbnail, index) => {
      lines.push(`${index + 1}. ${thumbnail.title || `${assetLabel.slice(0, -1)} ${thumbnail.variant}`}`);
      lines.push(`   URL: ${thumbnail.imageUrl}`);
      lines.push(`   Prompt: ${thumbnail.prompt}`);
    });
  }

  if (supportsSponsorBlurb(project.format)) {
    lines.push("", "## Sponsor Blurb", "", normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format) || "No sponsor blurb saved.");
    lines.push("", "## Sponsor Link", "", project.sponsorLink?.trim() || "No sponsor link saved.");
  }

  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
}

export function contentPackFilename(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "content-pack";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-content-pack-${stamp}.md`;
}

function contentFormatLabel(format: StoryProject["format"]) {
  if (format === "EPISODIC_SERIES") return "Episodic video series";
  if (format === "PODCAST_EPISODE") return "Podcast episode";
  if (format === "ARTICLE") return "Article";
  if (format === "SHORT_BOOK") return "Short book";
  if (format === "LONG_BOOK") return "Long form book";
  return "Video script";
}

function parseEpisodeOutputSections(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const headingPattern = /^(Episode\s+(One|Two|Three|Four|Five|1|2|3|4|5)(?:\s*:\s*|\s+-\s+|\s+)([^\n]*?)?)\s*$/gim;
  const matches = Array.from(normalized.matchAll(headingPattern));
  if (matches.length < 2) return [];
  return matches.map((match, index) => {
    const episodeNumber = episodeNumberFromLabel(match[2]);
    const nextIndex = matches[index + 1]?.index ?? normalized.length;
    const startIndex = (match.index ?? 0) + match[0].length;
    return {
      episodeNumber,
      title: (match[3] || "").trim() || `Episode ${episodeNumber}`,
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

function episodeWord(value: number) {
  if (value === 1) return "One";
  if (value === 2) return "Two";
  if (value === 3) return "Three";
  if (value === 4) return "Four";
  if (value === 5) return "Five";
  return String(value);
}

function safeParsePack(content: string) {
  try {
    return parsePublishingPack(content);
  } catch {
    return null;
  }
}

function articleSeoPackMarkdown(pack: NonNullable<ReturnType<typeof safeParsePack>>["seoPack"]) {
  if (!pack) return [];
  const lines: string[] = [];
  if (pack.primaryKeyword) lines.push(`Primary keyword: ${pack.primaryKeyword}`);
  if (pack.searchIntent) lines.push(`Search intent: ${pack.searchIntent}`);
  if (pack.seoTitle) lines.push(`SEO title: ${pack.seoTitle}`);
  if (pack.metaDescription) lines.push(`Meta description: ${pack.metaDescription}`);
  if (pack.urlSlug) lines.push(`URL slug: ${pack.urlSlug}`);
  if (pack.h1) lines.push(`H1: ${pack.h1}`);
  if (pack.schemaRecommendation) lines.push(`Schema: ${pack.schemaRecommendation}`);
  if (pack.featuredSnippetTarget) lines.push(`Featured snippet target: ${pack.featuredSnippetTarget}`);
  if (pack.secondaryKeywords.length) lines.push("", "Secondary keywords:", ...pack.secondaryKeywords.map((item) => `- ${item}`));
  if (pack.h2Outline.length) lines.push("", "H2 outline:", ...pack.h2Outline.map((item) => `- ${item}`));
  if (pack.faq.length) {
    lines.push("", "FAQ:", ...pack.faq.flatMap((item) => [`- ${item.question}`, `  ${item.answer}`]));
  }
  if (pack.internalLinkSuggestions.length) lines.push("", "Internal link suggestions:", ...pack.internalLinkSuggestions.map((item) => `- ${item}`));
  if (pack.externalSourceSuggestions.length) lines.push("", "External source suggestions:", ...pack.externalSourceSuggestions.map((item) => `- ${item}`));
  if (pack.imagePlan.length) {
    lines.push("", "Article image plan:");
    pack.imagePlan.forEach((image) => {
      lines.push(`- ${image.placement}: ${image.prompt}`);
      if (image.altText) lines.push(`  Alt text: ${image.altText}`);
      if (image.caption) lines.push(`  Caption: ${image.caption}`);
    });
  }
  return lines;
}

function topicalAuthorityMapMarkdown(map: NonNullable<ReturnType<typeof safeParsePack>>["topicalAuthorityMap"]) {
  if (!map) return [];
  const lines: string[] = [];
  if (map.pillarTopic) lines.push(`Pillar topic: ${map.pillarTopic}`);
  if (map.audience) lines.push(`Audience: ${map.audience}`);
  if (map.authorityGoal) lines.push(`Authority goal: ${map.authorityGoal}`);
  if (map.recommendedNextArticles.length) {
    lines.push("", "Recommended next articles:");
    map.recommendedNextArticles.forEach((article) => {
      lines.push(`- ${article.title}`);
      if (article.primaryKeyword) lines.push(`  Keyword: ${article.primaryKeyword}`);
      if (article.intent) lines.push(`  Intent: ${article.intent}`);
      if (article.funnelStage) lines.push(`  Funnel stage: ${article.funnelStage}`);
      if (article.priority) lines.push(`  Priority: ${article.priority}`);
      if (article.angle) lines.push(`  Angle: ${article.angle}`);
      if (article.internalLinks.length) lines.push(`  Links to: ${article.internalLinks.join(", ")}`);
    });
  }
  if (map.clusters.length) {
    lines.push("", "Clusters:");
    map.clusters.forEach((cluster) => {
      lines.push(`- ${cluster.clusterName}`);
      if (cluster.pillarArticle) lines.push(`  Pillar article: ${cluster.pillarArticle}`);
      cluster.supportingArticles.forEach((article) => {
        lines.push(`  - ${article.title}`);
        if (article.primaryKeyword) lines.push(`    Keyword: ${article.primaryKeyword}`);
        if (article.intent) lines.push(`    Intent: ${article.intent}`);
        if (article.funnelStage) lines.push(`    Funnel stage: ${article.funnelStage}`);
        if (article.priority) lines.push(`    Priority: ${article.priority}`);
        if (article.angle) lines.push(`    Angle: ${article.angle}`);
        if (article.internalLinks.length) lines.push(`    Links to: ${article.internalLinks.join(", ")}`);
      });
    });
  }
  return lines;
}

function contentPackAssets(project: ProjectWithAssets) {
  if (project.format === "ARTICLE") return project.thumbnails.filter(isArticleImageAsset);
  if (project.format === "SHORT_BOOK" || project.format === "LONG_BOOK") return project.thumbnails.filter(isBookIllustrationAsset);
  return project.thumbnails.filter((asset) => !isArticleImageAsset(asset) && !isBookIllustrationAsset(asset));
}

function isArticleImageAsset(asset: ThumbnailAsset) {
  return /^Article image \d+:/i.test(asset.title || "") || /^Article image placement:/im.test(asset.prompt || "");
}

function isBookIllustrationAsset(asset: ThumbnailAsset) {
  return /^Chapter \d+:/i.test(asset.title || "") || /^Book illustration mode:/im.test(asset.prompt || "");
}
