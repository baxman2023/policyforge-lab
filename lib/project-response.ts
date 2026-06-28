import { normalizeSponsorBlurbForFormat, normalizeSponsorLanguageForFormat, supportsSponsorBlurb } from "@/lib/project-formats";
import { formatPublishingPackContent } from "@/lib/youtube-description";

type DraftLike = {
  passType: string;
  content: string;
};

type ProjectLike = {
  title: string;
  format?: string | null;
  sponsorBlurb?: string | null;
  sponsorLink?: string | null;
  targetLengthMinutes?: number | null;
  storyIdea?: {
    summary?: string | null;
    hook?: string | null;
  } | null;
  drafts?: DraftLike[];
};

export function formatProjectForResponse<T extends ProjectLike>(project: T): T {
  const normalizedProject = {
    ...project,
    sponsorBlurb: supportsSponsorBlurb(project.format) ? normalizeSponsorBlurbForFormat(project.sponsorBlurb, project.format) || null : null,
    sponsorLink: supportsSponsorBlurb(project.format) ? project.sponsorLink ?? null : null
  };
  if (!project.drafts?.length) return normalizedProject;
  return {
    ...normalizedProject,
    drafts: project.drafts.map((draft) => formatDraftForResponse(draft, normalizedProject))
  };
}

export function formatDraftForResponse<T extends DraftLike>(draft: T, project: ProjectLike): T {
  const normalizedDraft = {
    ...draft,
    content: normalizeSponsorLanguageForFormat(draft.content, project.format)
  };
  if (draft.passType !== "PUBLISHING_PACK") return normalizedDraft;
  if (project.format === "ARTICLE" || project.format === "PODCAST_EPISODE" || project.format === "SHORT_BOOK" || project.format === "LONG_BOOK") return normalizedDraft;
  return {
    ...normalizedDraft,
    content: normalizeSponsorLanguageForFormat(formatPublishingPackContent(normalizedDraft.content, {
      title: project.title,
      sponsorBlurb: project.sponsorBlurb,
      sponsorLink: project.sponsorLink,
      summary: project.storyIdea?.summary,
      hook: project.storyIdea?.hook,
      targetLengthMinutes: project.targetLengthMinutes
    }), project.format)
  };
}
