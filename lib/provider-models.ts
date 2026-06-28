import "server-only";
import { getAnthropicApiKey, getOpenAiApiKey } from "@/lib/settings";

export type FallbackProvider = "anthropic" | "openai";

export type FallbackProviderModel = {
  id: string;
  name: string;
  provider: FallbackProvider;
  created?: number;
  contextLength?: number;
  maxTokens?: number;
  source: "live" | "default";
};

type ProviderCatalog = {
  models: FallbackProviderModel[];
  warning?: string;
};

type FallbackCatalogs = {
  anthropicModels: FallbackProviderModel[];
  openAiModels: FallbackProviderModel[];
  warnings: {
    anthropic?: string;
    openai?: string;
  };
};

type FallbackCatalogKeyOverrides = {
  anthropicApiKey?: string;
  openAiApiKey?: string;
};

type AnthropicModelsResponse = {
  data?: Array<{
    id?: string;
    display_name?: string;
    created_at?: string;
    max_input_tokens?: number;
    max_tokens?: number;
    type?: string;
  }>;
  has_more?: boolean;
  last_id?: string;
  error?: {
    message?: string;
  };
};

type OpenAiModelsResponse = {
  data?: Array<{
    id?: string;
    created?: number;
    object?: string;
    owned_by?: string;
  }>;
  error?: {
    message?: string;
  };
};

const defaultAnthropicModels: FallbackProviderModel[] = [
  { id: "claude-opus-4-8", name: "Claude Opus 4.8", provider: "anthropic", source: "default" }
];

const defaultOpenAiModels: FallbackProviderModel[] = [
  { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", source: "default" }
];

export async function getFallbackModelCatalogs(userId: string, overrides: FallbackCatalogKeyOverrides = {}): Promise<FallbackCatalogs> {
  const [savedAnthropicKey, savedOpenAiKey] = await Promise.all([getAnthropicApiKey(userId), getOpenAiApiKey(userId)]);
  const anthropicKey = overrides.anthropicApiKey?.trim() || savedAnthropicKey;
  const openAiKey = overrides.openAiApiKey?.trim() || savedOpenAiKey;
  const [anthropic, openai] = await Promise.all([getAnthropicModels(anthropicKey), getOpenAiModels(openAiKey)]);

  return {
    anthropicModels: sortFallbackModels(anthropic.models),
    openAiModels: sortFallbackModels(openai.models),
    warnings: {
      anthropic: anthropic.warning,
      openai: openai.warning
    }
  };
}

async function getAnthropicModels(apiKey: string | null): Promise<ProviderCatalog> {
  if (!apiKey) {
    return {
      models: defaultAnthropicModels,
      warning: "Save an Anthropic API key to load live Anthropic model choices."
    };
  }

  try {
    const models = await fetchAnthropicModels(apiKey);
    return models.length ? { models } : { models: defaultAnthropicModels, warning: "Anthropic returned no text model choices." };
  } catch (error) {
    return {
      models: defaultAnthropicModels,
      warning: error instanceof Error ? error.message : "Anthropic model list is unavailable right now."
    };
  }
}

export async function fetchAnthropicModels(apiKey: string) {
  const models: FallbackProviderModel[] = [];
  let afterId = "";

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ limit: "1000" });
    if (afterId) params.set("after_id", afterId);

    const response = await fetch(`https://api.anthropic.com/v1/models?${params.toString()}`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      cache: "no-store"
    });
    const payload = (await response.json().catch(() => ({}))) as AnthropicModelsResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message || `Anthropic model list failed with status ${response.status}.`);
    }

    for (const model of payload.data ?? []) {
      if (!model.id) continue;
      models.push({
        id: model.id,
        name: model.display_name || model.id,
        provider: "anthropic",
        created: timestampFromDate(model.created_at),
        contextLength: positiveNumber(model.max_input_tokens),
        maxTokens: positiveNumber(model.max_tokens),
        source: "live"
      });
    }

    if (!payload.has_more || !payload.last_id) break;
    afterId = payload.last_id;
  }

  return dedupeFallbackModels(models);
}

async function getOpenAiModels(apiKey: string | null): Promise<ProviderCatalog> {
  if (!apiKey) {
    return {
      models: defaultOpenAiModels,
      warning: "Save an OpenAI API key to load live OpenAI model choices."
    };
  }

  try {
    const models = await fetchOpenAiModels(apiKey);
    return models.length ? { models } : { models: defaultOpenAiModels, warning: "OpenAI returned no compatible text model choices." };
  } catch (error) {
    return {
      models: defaultOpenAiModels,
      warning: error instanceof Error ? error.message : "OpenAI model list is unavailable right now."
    };
  }
}

export async function fetchOpenAiModels(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAiModelsResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI model list failed with status ${response.status}.`);
  }

  return dedupeFallbackModels(
    (payload.data ?? [])
      .filter((model) => model.id && isLikelyOpenAiTextModel(model.id))
      .map((model) => ({
        id: model.id as string,
        name: model.id as string,
        provider: "openai" as const,
        created: positiveNumber(model.created),
        source: "live" as const
      }))
  );
}

function isLikelyOpenAiTextModel(modelId: string) {
  const id = modelId.toLowerCase();
  const excluded = ["audio", "dall-e", "embedding", "image", "moderation", "realtime", "sora", "speech", "transcribe", "tts", "video", "whisper"];
  if (excluded.some((term) => id.includes(term))) return false;
  return id.startsWith("gpt-") || id.startsWith("chatgpt-") || /^o\d/.test(id) || id.startsWith("ft:gpt-") || /^ft:o\d/.test(id);
}

function sortFallbackModels(models: FallbackProviderModel[]) {
  return [...models].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id, undefined, { sensitivity: "base" })
  );
}

function dedupeFallbackModels(models: FallbackProviderModel[]) {
  return Array.from(new Map(models.map((model) => [model.id, model])).values());
}

function timestampFromDate(value?: string) {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.round(time / 1000) : undefined;
}

function positiveNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
