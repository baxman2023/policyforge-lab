import { z } from "zod";
import { jsonError } from "@/lib/http";
import { getOrCreateUserSettings, saveUserSettings } from "@/lib/settings";
import { requireWorkspace, workspacePatch } from "@/lib/workspaces";
import { prisma } from "@/lib/prisma";
import { narrationStyleOptions, toneOptions } from "@/lib/story-options";
import { DEFAULT_THUMBNAIL_STYLE_GUIDE } from "@/lib/thumbnail-style";

const SettingsSchema = z.object({
  openRouterApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  openAiApiKey: z.string().optional(),
  defaultModel: z.string().optional(),
  discoveryModel: z.string().optional(),
  dossierModel: z.string().optional(),
  structureModel: z.string().optional(),
  draftingModel: z.string().optional(),
  critiqueModel: z.string().optional(),
  rewriteModel: z.string().optional(),
  anthropicModel: z.string().trim().min(2).optional(),
  openAiModel: z.string().trim().min(2).optional(),
  runwareApiKey: z.string().optional(),
  runwareModel: z.string().optional(),
  dataForSeoLogin: z.string().optional(),
  dataForSeoPassword: z.string().optional(),
  wordpressSiteUrl: z.string().optional(),
  wordpressUsername: z.string().optional(),
  wordpressApplicationPassword: z.string().optional(),
  youtubeClientId: z.string().optional(),
  youtubeClientSecret: z.string().optional(),
  thumbnailStyleGuide: z.string().optional(),
  workspaceName: z.string().trim().min(2).max(80).optional(),
  workspaceTagline: z.string().trim().min(2).max(80).optional(),
  workspaceLogoUrl: z.string().trim().optional(),
  defaultSponsorCta: z.string().optional(),
  publishingScheduleNote: z.string().trim().min(2).max(180).optional(),
  autoModelRouting: z.boolean().optional(),
  preferredTone: z.string().refine((value) => toneOptions.includes(value), "Choose a supported tone.").optional(),
  narrationStyle: z.string().refine((value) => narrationStyleOptions.includes(value), "Choose a supported narration style.").optional(),
  defaultLengthMinutes: z.number().int().min(10).max(60).optional(),
  ttsPauseMarkers: z.boolean().optional()
});

export async function GET() {
  try {
    const { user, workspace } = await requireWorkspace({ allowInactive: true });
    const settings = await getOrCreateUserSettings(user.id);
    return Response.json({
      ...settings,
      workspaceName: workspace.name,
      workspaceTagline: workspace.tagline,
      workspaceLogoUrl: workspace.logoUrl,
      thumbnailStyleGuide: settings.thumbnailStyleGuide || DEFAULT_THUMBNAIL_STYLE_GUIDE,
      openRouterApiKeyEncrypted: undefined,
      anthropicApiKeyEncrypted: undefined,
      openAiApiKeyEncrypted: undefined,
      runwareApiKeyEncrypted: undefined,
      dataForSeoLoginEncrypted: undefined,
      dataForSeoPasswordEncrypted: undefined,
      wordpressUsernameEncrypted: undefined,
      wordpressPasswordEncrypted: undefined,
      youtubeClientSecretEncrypted: undefined,
      wordpressSiteUrl: settings.wordpressSiteUrl ?? "",
      youtubeClientId: settings.youtubeClientId ?? "",
      hasOpenRouterApiKey: Boolean(settings.openRouterApiKeyEncrypted),
      hasAnthropicApiKey: Boolean(settings.anthropicApiKeyEncrypted || process.env.ANTHROPIC_API_KEY),
      hasOpenAiApiKey: Boolean(settings.openAiApiKeyEncrypted || process.env.OPENAI_API_KEY),
      hasRunwareApiKey: Boolean(settings.runwareApiKeyEncrypted || process.env.RUNWARE_API_KEY),
      hasDataForSeoCredentials: Boolean(
        (settings.dataForSeoLoginEncrypted && settings.dataForSeoPasswordEncrypted) ||
          (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
      ),
      hasWordPressCredentials: Boolean(
        (settings.wordpressSiteUrl && settings.wordpressUsernameEncrypted && settings.wordpressPasswordEncrypted) ||
          (process.env.WORDPRESS_SITE_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APPLICATION_PASSWORD)
      ),
      hasYoutubeOAuthCredentials: Boolean(
        (settings.youtubeClientId && settings.youtubeClientSecretEncrypted) ||
          (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
      )
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user, workspace } = await requireWorkspace({ allowInactive: true });
    const input = SettingsSchema.parse(await request.json());
    const settings = await saveUserSettings(user.id, input);
    if (input.workspaceName !== undefined || input.workspaceTagline !== undefined || input.workspaceLogoUrl !== undefined) {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: workspacePatch({
          name: input.workspaceName,
          tagline: input.workspaceTagline,
          logoUrl: input.workspaceLogoUrl
        })
      });
    }
    const updatedWorkspace =
      input.workspaceName !== undefined || input.workspaceTagline !== undefined || input.workspaceLogoUrl !== undefined
        ? await prisma.workspace.findUnique({ where: { id: workspace.id } })
        : workspace;
    return Response.json({
      ...settings,
      workspaceName: updatedWorkspace?.name ?? workspace.name,
      workspaceTagline: updatedWorkspace?.tagline ?? workspace.tagline,
      workspaceLogoUrl: updatedWorkspace?.logoUrl ?? workspace.logoUrl,
      thumbnailStyleGuide: settings.thumbnailStyleGuide || DEFAULT_THUMBNAIL_STYLE_GUIDE,
      openRouterApiKeyEncrypted: undefined,
      anthropicApiKeyEncrypted: undefined,
      openAiApiKeyEncrypted: undefined,
      runwareApiKeyEncrypted: undefined,
      dataForSeoLoginEncrypted: undefined,
      dataForSeoPasswordEncrypted: undefined,
      wordpressUsernameEncrypted: undefined,
      wordpressPasswordEncrypted: undefined,
      youtubeClientSecretEncrypted: undefined,
      wordpressSiteUrl: settings.wordpressSiteUrl ?? "",
      youtubeClientId: settings.youtubeClientId ?? "",
      hasOpenRouterApiKey: Boolean(settings.openRouterApiKeyEncrypted),
      hasAnthropicApiKey: Boolean(settings.anthropicApiKeyEncrypted || process.env.ANTHROPIC_API_KEY),
      hasOpenAiApiKey: Boolean(settings.openAiApiKeyEncrypted || process.env.OPENAI_API_KEY),
      hasRunwareApiKey: Boolean(settings.runwareApiKeyEncrypted || process.env.RUNWARE_API_KEY),
      hasDataForSeoCredentials: Boolean(
        (settings.dataForSeoLoginEncrypted && settings.dataForSeoPasswordEncrypted) ||
          (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD)
      ),
      hasWordPressCredentials: Boolean(
        (settings.wordpressSiteUrl && settings.wordpressUsernameEncrypted && settings.wordpressPasswordEncrypted) ||
          (process.env.WORDPRESS_SITE_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APPLICATION_PASSWORD)
      ),
      hasYoutubeOAuthCredentials: Boolean(
        (settings.youtubeClientId && settings.youtubeClientSecretEncrypted) ||
          (process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
      )
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
