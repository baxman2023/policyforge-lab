import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

export async function getOrCreateUserSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });
}

export async function saveUserSettings(
  userId: string,
  input: {
    openRouterApiKey?: string;
    anthropicApiKey?: string;
    openAiApiKey?: string;
    defaultModel?: string;
    discoveryModel?: string;
    dossierModel?: string;
    structureModel?: string;
    draftingModel?: string;
    critiqueModel?: string;
    rewriteModel?: string;
    anthropicModel?: string;
    openAiModel?: string;
    runwareApiKey?: string;
    runwareModel?: string;
    dataForSeoLogin?: string;
    dataForSeoPassword?: string;
    wordpressSiteUrl?: string;
    wordpressUsername?: string;
    wordpressApplicationPassword?: string;
    youtubeClientId?: string;
    youtubeClientSecret?: string;
    thumbnailStyleGuide?: string;
    workspaceName?: string;
    workspaceTagline?: string;
    workspaceLogoUrl?: string;
    defaultSponsorCta?: string;
    publishingScheduleNote?: string;
    autoModelRouting?: boolean;
    preferredTone?: string;
    narrationStyle?: string;
    defaultLengthMinutes?: number;
    ttsPauseMarkers?: boolean;
    alwaysFinishScripts?: boolean;
    monthlyRunBudgetUsd?: number;
  }
) {
  const encryptedKey = input.openRouterApiKey?.trim()
    ? encryptSecret(input.openRouterApiKey.trim())
    : undefined;
  const encryptedAnthropicKey = input.anthropicApiKey?.trim()
    ? encryptSecret(input.anthropicApiKey.trim())
    : undefined;
  const encryptedOpenAiKey = input.openAiApiKey?.trim()
    ? encryptSecret(input.openAiApiKey.trim())
    : undefined;
  const encryptedRunwareKey = input.runwareApiKey?.trim()
    ? encryptSecret(input.runwareApiKey.trim())
    : undefined;
  const encryptedDataForSeoLogin = input.dataForSeoLogin?.trim()
    ? encryptSecret(input.dataForSeoLogin.trim())
    : undefined;
  const encryptedDataForSeoPassword = input.dataForSeoPassword?.trim()
    ? encryptSecret(input.dataForSeoPassword.trim())
    : undefined;
  const encryptedWordPressUsername = input.wordpressUsername?.trim()
    ? encryptSecret(input.wordpressUsername.trim())
    : undefined;
  const encryptedWordPressPassword = input.wordpressApplicationPassword?.trim()
    ? encryptSecret(input.wordpressApplicationPassword.trim())
    : undefined;
  const encryptedYoutubeClientSecret = input.youtubeClientSecret?.trim()
    ? encryptSecret(input.youtubeClientSecret.trim())
    : undefined;

  const secretFields: Array<keyof typeof input> = [
    "openRouterApiKey",
    "anthropicApiKey",
    "openAiApiKey",
    "runwareApiKey",
    "dataForSeoLogin",
    "dataForSeoPassword",
    "wordpressUsername",
    "wordpressApplicationPassword",
    "youtubeClientSecret"
  ];

  return prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      ...(encryptedKey ? { openRouterApiKeyEncrypted: encryptedKey } : {}),
      ...(encryptedAnthropicKey ? { anthropicApiKeyEncrypted: encryptedAnthropicKey } : {}),
      ...(encryptedOpenAiKey ? { openAiApiKeyEncrypted: encryptedOpenAiKey } : {}),
      ...(encryptedRunwareKey ? { runwareApiKeyEncrypted: encryptedRunwareKey } : {}),
      ...(encryptedDataForSeoLogin ? { dataForSeoLoginEncrypted: encryptedDataForSeoLogin } : {}),
      ...(encryptedDataForSeoPassword ? { dataForSeoPasswordEncrypted: encryptedDataForSeoPassword } : {}),
      ...(encryptedWordPressUsername ? { wordpressUsernameEncrypted: encryptedWordPressUsername } : {}),
      ...(encryptedWordPressPassword ? { wordpressPasswordEncrypted: encryptedWordPressPassword } : {}),
      ...(encryptedYoutubeClientSecret ? { youtubeClientSecretEncrypted: encryptedYoutubeClientSecret } : {}),
      ...withoutUndefined(input, secretFields)
    },
    update: {
      ...(encryptedKey ? { openRouterApiKeyEncrypted: encryptedKey } : {}),
      ...(encryptedAnthropicKey ? { anthropicApiKeyEncrypted: encryptedAnthropicKey } : {}),
      ...(encryptedOpenAiKey ? { openAiApiKeyEncrypted: encryptedOpenAiKey } : {}),
      ...(encryptedRunwareKey ? { runwareApiKeyEncrypted: encryptedRunwareKey } : {}),
      ...(encryptedDataForSeoLogin ? { dataForSeoLoginEncrypted: encryptedDataForSeoLogin } : {}),
      ...(encryptedDataForSeoPassword ? { dataForSeoPasswordEncrypted: encryptedDataForSeoPassword } : {}),
      ...(encryptedWordPressUsername ? { wordpressUsernameEncrypted: encryptedWordPressUsername } : {}),
      ...(encryptedWordPressPassword ? { wordpressPasswordEncrypted: encryptedWordPressPassword } : {}),
      ...(encryptedYoutubeClientSecret ? { youtubeClientSecretEncrypted: encryptedYoutubeClientSecret } : {}),
      ...withoutUndefined(input, secretFields)
    }
  });
}

export async function getOpenRouterApiKey(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  if (settings.openRouterApiKeyEncrypted) {
    return decryptSecret(settings.openRouterApiKeyEncrypted);
  }

  return null;
}

export async function getAnthropicApiKey(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  if (settings.anthropicApiKeyEncrypted) {
    return decryptSecret(settings.anthropicApiKeyEncrypted);
  }

  return null;
}

export async function getOpenAiApiKey(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  if (settings.openAiApiKeyEncrypted) {
    return decryptSecret(settings.openAiApiKeyEncrypted);
  }

  return null;
}

export async function getRunwareApiKey(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  if (settings.runwareApiKeyEncrypted) {
    return decryptSecret(settings.runwareApiKeyEncrypted);
  }

  return null;
}

export async function getDataForSeoCredentials(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  const savedLogin = settings.dataForSeoLoginEncrypted
    ? decryptSecret(settings.dataForSeoLoginEncrypted)
    : null;
  const savedPassword = settings.dataForSeoPasswordEncrypted
    ? decryptSecret(settings.dataForSeoPasswordEncrypted)
    : null;

  const login = savedLogin || null;
  const password = savedPassword || null;

  if (!login || !password) return null;
  return { login, password };
}

export async function getWordPressCredentials(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  const savedUsername = settings.wordpressUsernameEncrypted
    ? decryptSecret(settings.wordpressUsernameEncrypted)
    : null;
  const savedPassword = settings.wordpressPasswordEncrypted
    ? decryptSecret(settings.wordpressPasswordEncrypted)
    : null;

  const siteUrl = normalizeWordPressSiteUrl(settings.wordpressSiteUrl || "");
  const username = savedUsername || null;
  const applicationPassword = savedPassword || null;

  if (!siteUrl || !username || !applicationPassword) return null;
  return { siteUrl, username, applicationPassword };
}

export async function getYoutubeOAuthCredentials(userId: string) {
  const settings = await getOrCreateUserSettings(userId);
  const clientId = (settings.youtubeClientId || process.env.YOUTUBE_CLIENT_ID || "").trim();
  const savedClientSecret = settings.youtubeClientSecretEncrypted
    ? decryptSecret(settings.youtubeClientSecretEncrypted)
    : null;
  const clientSecret = (savedClientSecret || process.env.YOUTUBE_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function normalizeWordPressSiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

function withoutUndefined<T extends Record<string, unknown>>(input: T, omit: Array<keyof T>) {
  return Object.fromEntries(
    Object.entries(input).filter(([key, value]) => value !== undefined && !omit.includes(key as keyof T))
  );
}
