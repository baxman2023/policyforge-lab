import type { ScriptDraft, StoryIdea, StoryProject, ThumbnailAsset, YoutubeVideoMetric } from "@prisma/client";
import { completeScriptForProject, latestDraftForPass } from "@/lib/content-pack";
import { parsePublishingPack } from "@/lib/publishing-pack";
import { wordCount } from "@/lib/utils";
import { formatYoutubeDescription } from "@/lib/youtube-description";

type ProjectBundle = StoryProject & {
  storyIdea?: StoryIdea | null;
  drafts: ScriptDraft[];
  thumbnails: ThumbnailAsset[];
};

type MetricBundle = Pick<YoutubeVideoMetric,
  "title" |
  "views" |
  "estimatedMinutesWatched" |
  "averageViewPercentage" |
  "impressionCtr" |
  "subscribersGained" |
  "subscribersLost"
>;

export type UploadReadinessPackage = {
  title: string;
  format: StoryProject["format"];
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
  uploadAssets: Array<{
    label: string;
    value: string;
  }>;
  markdown: string;
};

export function buildUploadReadinessPackage(project: ProjectBundle, metrics: MetricBundle[] = []): UploadReadinessPackage {
  const packDraft = latestDraftForPass(project.drafts, "PUBLISHING_PACK");
  const pack = packDraft ? safeParsePack(packDraft.content) : null;
  const finalScript = completeScriptForProject(project);
  const scriptWords = wordCount(finalScript);
  const source = sourceIntelligence(project);
  const visualQa = visualQuality(project);
  const performanceMemory = packagingMemory(project, metrics);
  const shorts = shortsFromProject(project, finalScript);
  const hasScript = scriptWords > 300;
  const hasPack = Boolean(pack);
  const thumbnailNeed = project.format === "EPISODIC_SERIES" ? 15 : project.format === "STANDALONE" ? 3 : 0;
  const hasImages = thumbnailNeed ? project.thumbnails.length >= thumbnailNeed : true;
  const checklist = [
    { label: "Final script", ready: hasScript, detail: hasScript ? `${scriptWords.toLocaleString()} words assembled.` : "Run the script workflow before upload." },
    { label: "Publishing pack", ready: hasPack, detail: hasPack ? "Titles, description, tags, thumbnail prompts, and pinned comment are ready." : "Run Publishing Pack." },
    { label: "Images", ready: hasImages, detail: thumbnailNeed ? `${project.thumbnails.length}/${thumbnailNeed} thumbnail images saved.` : "No YouTube thumbnail set required for this format." },
    { label: "Source strength", ready: source.score >= 62, detail: source.summary },
    { label: "Visual QA", ready: visualQa.score >= 70, detail: `${visualQa.status} visual readiness.` },
    { label: "Shorts plan", ready: shorts.length >= 3, detail: `${shorts.length} Shorts candidates available.` }
  ];
  const blockers = checklist.filter((item) => !item.ready && ["Final script", "Publishing pack", "Images"].includes(item.label)).map((item) => item.detail);
  const warnings = checklist.filter((item) => !item.ready && !["Final script", "Publishing pack", "Images"].includes(item.label)).map((item) => item.detail);
  const readinessScore = Math.round(checklist.reduce((sum, item) => sum + (item.ready ? 100 : 35), 0) / checklist.length);
  const status = blockers.length ? "Blocked" : readinessScore >= 82 ? "Ready" : "Needs Review";
  const uploadAssets = uploadAssetRows(project, finalScript, pack);
  const draft: UploadReadinessPackage = {
    title: project.title,
    format: project.format,
    readinessScore,
    status,
    blockers,
    warnings,
    uploadChecklist: checklist,
    sourceIntelligence: source,
    visualQa,
    performanceMemory,
    shorts,
    uploadAssets,
    markdown: ""
  };
  draft.markdown = uploadPackageMarkdown(project, draft);
  return draft;
}

function safeParsePack(content: string) {
  try {
    return parsePublishingPack(content);
  } catch {
    return null;
  }
}

function sourceIntelligence(project: ProjectBundle): UploadReadinessPackage["sourceIntelligence"] {
  const dossier = latestDraftForPass(project.drafts, "DOSSIER");
  const research = latestDraftForPass(project.drafts, "FACT_CHECK") ?? latestDraftForPass(project.drafts, "QUALITY_GATE");
  const sourceMaterial = [project.sourceMaterial, dossier?.content, research?.content].filter(Boolean).join("\n\n");
  const urlCount = (sourceMaterial.match(/https?:\/\/\S+/g) ?? []).length;
  const sourceWordCount = wordCount(sourceMaterial);
  const ledgerSignals = ["Confirmed Facts", "Source Leads", "Fact Ledger", "Do Not Say As Fact"].filter((label) => sourceMaterial.toLowerCase().includes(label.toLowerCase())).length;
  const score = Math.max(0, Math.min(100, Math.round(30 + Math.min(35, sourceWordCount / 120) + Math.min(15, urlCount * 3) + ledgerSignals * 5)));
  const status = score >= 78 ? "Strong" : score >= 58 ? "Usable" : "Thin";
  return {
    score,
    status,
    summary: status === "Strong"
      ? "Source notes and claim boundaries look strong enough for production."
      : status === "Usable"
        ? "Source notes are usable, but verify the risky claims before recording."
        : "Source base is thin. Add URLs, records, or a dossier before upload.",
    mustVerify: extractSectionItems(sourceMaterial, ["Must Verify", "Likely But Needs Verification", "Unverified Or Risky Claims"]).slice(0, 6),
    sourceLeads: extractSectionItems(sourceMaterial, ["Source Leads", "Primary source leads", "Secondary source leads"]).slice(0, 6)
  };
}

function visualQuality(project: ProjectBundle): UploadReadinessPackage["visualQa"] {
  const assets = project.thumbnails;
  const needed = project.format === "EPISODIC_SERIES" ? 15 : project.format === "STANDALONE" ? 3 : 0;
  const textSignals = assets.filter((asset) => /\b(overlay|text|part\s+\d|all caps|headline)\b/i.test(`${asset.title || ""} ${asset.prompt}`)).length;
  const focalSignals = assets.filter((asset) => /\b(one|single|dominant|focal|subject|face|object|map|document)\b/i.test(asset.prompt)).length;
  const mobileSignals = assets.filter((asset) => /\b(mobile|readable|large|huge|simple|uncluttered)\b/i.test(asset.prompt)).length;
  const partSignals = project.format === "EPISODIC_SERIES"
    ? assets.filter((asset) => /\bpart\s+[1-5]\b/i.test(`${asset.title || ""} ${asset.prompt}`)).length
    : needed;
  const checks = [
    { label: "Asset count", ready: needed ? assets.length >= needed : true, detail: needed ? `${assets.length}/${needed} generated thumbnails.` : "No thumbnail set required." },
    { label: "Readable text", ready: !needed || textSignals >= Math.min(needed, assets.length), detail: `${textSignals} asset prompts mention overlay/readable text.` },
    { label: "Mobile clarity", ready: !needed || mobileSignals >= Math.ceil(Math.max(1, assets.length) * 0.6), detail: `${mobileSignals} prompts include mobile/simple/readable guidance.` },
    { label: "Single focal subject", ready: !needed || focalSignals >= Math.ceil(Math.max(1, assets.length) * 0.6), detail: `${focalSignals} prompts identify a clear focal element.` },
    { label: "Episode labels", ready: project.format !== "EPISODIC_SERIES" || partSignals >= 10, detail: project.format === "EPISODIC_SERIES" ? `${partSignals} assets include Part labels.` : "Standalone project." }
  ];
  const score = Math.round(checks.reduce((sum, check) => sum + (check.ready ? 100 : 35), 0) / checks.length);
  return {
    score,
    status: !needed || !assets.length ? "Missing" : score >= 82 ? "Strong" : "Review",
    checks
  };
}

function packagingMemory(project: ProjectBundle, metrics: MetricBundle[]): UploadReadinessPackage["performanceMemory"] {
  const titlePool = [
    project.title,
    project.storyIdea?.title,
    project.storyIdea?.category,
    ...project.drafts
      .filter((draft) => draft.passType === "PUBLISHING_PACK")
      .flatMap((draft) => {
        const pack = safeParsePack(draft.content);
        return [
          ...(pack?.titles ?? []).map((item) => item.title),
          ...(pack?.episodePacks ?? []).flatMap((episode) => episode.titles.map((item) => item.title))
        ];
      })
  ].filter((item): item is string => Boolean(item));
  const matches = metrics
    .map((metric) => {
      const matchScore = Math.max(...titlePool.map((title) => similarity(title, metric.title)), 0);
      return { metric, matchScore };
    })
    .filter((item) => item.matchScore >= 0.2)
    .sort((a, b) => b.matchScore - a.matchScore || b.metric.estimatedMinutesWatched - a.metric.estimatedMinutesWatched)
    .slice(0, 5)
    .map(({ metric, matchScore }) => ({
      title: metric.title,
      matchScore: Math.round(matchScore * 100),
      views: metric.views,
      watchHours: Math.round(metric.estimatedMinutesWatched / 60),
      ctr: metric.impressionCtr,
      retention: metric.averageViewPercentage,
      netSubscribers: metric.subscribersGained - metric.subscribersLost,
      lesson: metric.impressionCtr >= 4 && metric.averageViewPercentage < 35
        ? "Strong click promise, but the intro should pay it off faster."
        : metric.averageViewPercentage >= 40
          ? "Retention pattern is worth copying in structure and pacing."
          : "Use directionally, but do not over-weight this result yet."
    }));
  return {
    summary: matches.length
      ? "Matched this project against synced YouTube titles so future packaging can learn from real results."
      : "No similar synced YouTube videos found yet. Publish and sync to build a real winner library.",
    matches
  };
}

function shortsFromProject(project: ProjectBundle, script: string) {
  const sceneCards = latestDraftForPass(project.drafts, "SCENE_CARDS")?.content || "";
  const explicit = extractSectionItems(sceneCards, ["Shorts Clip Candidates"]).slice(0, 10);
  if (explicit.length) {
    return explicit.map((item, index) => ({
      title: `Short ${index + 1}: ${shorten(item, 54)}`,
      hook: firstClause(item),
      sourceMoment: item,
      captionAngle: "Turn the strongest unanswered question into a concise caption.",
      cta: "Watch the full story for the context this clip leaves open."
    }));
  }
  const sentences = script.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter((item) => item.length > 70);
  const candidates = sentences.filter((sentence) => /\b(never|first|last|why|how|secret|evidence|found|vanished|survived|real|true)\b/i.test(sentence)).slice(0, 8);
  return candidates.slice(0, 6).map((sentence, index) => ({
    title: `Short ${index + 1}: ${shorten(sentence, 54)}`,
    hook: shorten(sentence, 115),
    sourceMoment: `Pull this from the finished script around: "${shorten(sentence, 150)}"`,
    captionAngle: "Open with the curiosity gap, then resolve only one layer.",
    cta: "Watch the full video for the complete timeline."
  }));
}

function uploadAssetRows(project: ProjectBundle, script: string, pack: ReturnType<typeof safeParsePack>) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "Script TXT", value: `${project.title}.txt` },
    { label: "Script words", value: wordCount(script).toLocaleString() }
  ];
  if (pack?.episodePacks?.length) {
    for (const episode of pack.episodePacks) {
      rows.push({ label: `${episode.partLabel} title`, value: episode.titles[0]?.title || `${project.title} ${episode.partLabel}` });
      rows.push({ label: `${episode.partLabel} description`, value: episode.description });
      rows.push({ label: `${episode.partLabel} tags`, value: episode.tags.join(", ") });
    }
  } else if (pack) {
    rows.push({ label: "Primary title", value: pack.titles[0]?.title || project.title });
    rows.push({
      label: "YouTube description",
      value: project.format === "STANDALONE"
        ? formatYoutubeDescription({
            title: project.title,
            description: pack.description,
            tags: pack.tags,
            sponsorBlurb: project.sponsorBlurb,
            sponsorLink: project.sponsorLink,
            summary: project.storyIdea?.summary,
            hook: project.storyIdea?.hook,
            targetLengthMinutes: project.targetLengthMinutes
          })
        : pack.description
    });
    rows.push({ label: "Tags", value: pack.tags.join(", ") });
    if (pack.pinnedComment) rows.push({ label: "Pinned comment", value: pack.pinnedComment });
  }
  for (const asset of project.thumbnails.slice(0, 15)) {
    rows.push({ label: `Thumbnail ${asset.variant}`, value: asset.imageUrl });
  }
  return rows;
}

function uploadPackageMarkdown(project: ProjectBundle, pack: Omit<UploadReadinessPackage, "markdown">) {
  const lines = [
    `# ${project.title} Upload Package`,
    "",
    `Readiness: ${pack.status} (${pack.readinessScore}/100)`,
    "",
    "## Upload Checklist",
    ...pack.uploadChecklist.map((item) => `- ${item.ready ? "[x]" : "[ ]"} ${item.label}: ${item.detail}`),
    "",
    "## Source Intelligence",
    `Score: ${pack.sourceIntelligence.score}/100 (${pack.sourceIntelligence.status})`,
    pack.sourceIntelligence.summary,
    "",
    "Must verify:",
    ...(pack.sourceIntelligence.mustVerify.length ? pack.sourceIntelligence.mustVerify.map((item) => `- ${item}`) : ["- No verification targets extracted."]),
    "",
    "Source leads:",
    ...(pack.sourceIntelligence.sourceLeads.length ? pack.sourceIntelligence.sourceLeads.map((item) => `- ${item}`) : ["- No source leads extracted."]),
    "",
    "## Visual QA",
    `Score: ${pack.visualQa.score}/100 (${pack.visualQa.status})`,
    ...pack.visualQa.checks.map((item) => `- ${item.ready ? "[x]" : "[ ]"} ${item.label}: ${item.detail}`),
    "",
    "## Performance Memory",
    pack.performanceMemory.summary,
    ...pack.performanceMemory.matches.map((item) => `- ${item.title}: ${item.views.toLocaleString()} views, ${item.watchHours} watch hours, ${item.ctr.toFixed(1)}% CTR, ${item.retention.toFixed(1)}% retention. ${item.lesson}`),
    "",
    "## Shorts",
    ...pack.shorts.map((item, index) => `${index + 1}. ${item.hook}\n   Caption: ${item.captionAngle}\n   CTA: ${item.cta}`),
    "",
    "## Upload Assets",
    ...pack.uploadAssets.map((item) => `### ${item.label}\n${item.value}`)
  ];
  return lines.join("\n");
}

function extractSectionItems(content: string, headings: string[]) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => headings.some((heading) => normalizeHeading(line).includes(normalizeHeading(heading))));
  if (start < 0) return [];
  const items: string[] = [];
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (!line) {
      if (items.length) break;
      continue;
    }
    if (items.length && /^[A-Z][A-Za-z\s/]+$/.test(line) && line.length < 70) break;
    const cleaned = line.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim();
    if (cleaned) items.push(cleaned);
    if (items.length >= 10) break;
  }
  return items;
}

function normalizeHeading(value: string) {
  return value.replace(/^#+\s*/, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}

function similarity(a: string, b: string) {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function tokenSet(value: string) {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((item) => item.length > 3));
}

function firstClause(value: string) {
  return shorten(value.split(/[.;:]/)[0] || value, 115);
}

function shorten(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1).trim()}...` : normalized;
}
