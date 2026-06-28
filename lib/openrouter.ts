import "server-only";
import type { GenerationLog, Prisma, ScriptPassType } from "@prisma/client";
import { GenerationStatus } from "@prisma/client";
import { jsonrepair } from "jsonrepair";
import { prisma } from "@/lib/prisma";
import { getAnthropicApiKey, getOpenRouterApiKey, getOpenAiApiKey, getOrCreateUserSettings } from "@/lib/settings";
import { routeModelForPass } from "@/lib/story-prompts";

type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GenerateInput = {
  userId: string;
  workspaceId?: string | null;
  storyProjectId?: string;
  passType: ScriptPassType | "DISCOVERY" | "RESEARCH";
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
};

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  error?: {
    message?: string;
  };
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type ProviderAttempt = {
  id: "openrouter" | "anthropic" | "openai";
  apiKey: string;
  model: string;
  label: string;
};

type ProviderResult = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost?: number;
};

export class OpenRouterConfigurationError extends Error {
  constructor(message = "Add an OpenRouter, Anthropic, or OpenAI API key in Settings before generating AI output.") {
    super(message);
    this.name = "OpenRouterConfigurationError";
  }
}

export async function generateText(input: GenerateInput) {
  const settings = await getOrCreateUserSettings(input.userId);
  const providers = await providerAttempts(input, settings);
  if (!providers.length) throw new OpenRouterConfigurationError();

  let lastError: unknown;
  for (const provider of providers) {
    const maxAttempts = provider.id === "openrouter" && (input.passType === "DRAFT" || input.passType === "DISCOVERY") ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await callProvider(provider, input);
        const content = result.content.trim();
        if (!content) throw new Error(`${providerName(provider)} returned an empty response.`);

        const log = await createGenerationLog({
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          storyProjectId: input.storyProjectId,
          passType: input.passType === "DISCOVERY" || input.passType === "RESEARCH" ? undefined : input.passType,
          modelUsed: provider.label,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          estimatedCost: estimateTokenCost({ total_tokens: result.totalTokens, cost: result.estimatedCost }),
          status: GenerationStatus.SUCCESS
        });

        return { content, model: provider.label, log };
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts && shouldRetryProviderError(error)) continue;

        await createGenerationLog({
          userId: input.userId,
          workspaceId: input.workspaceId ?? null,
          storyProjectId: input.storyProjectId,
          passType: input.passType === "DISCOVERY" || input.passType === "RESEARCH" ? undefined : input.passType,
          modelUsed: provider.label,
          status: GenerationStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : `Unknown ${providerName(provider)} error.`
        });
        break;
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "Unknown provider error.";
  throw new Error(`All configured AI providers failed. Last error: ${detail}`);
}

export async function generateJson<T>(input: GenerateInput): Promise<{ data: T; model: string; log: GenerationLog | null }> {
  const result = await generateText({
    ...input,
    messages: [
      {
        role: "system",
        content: "You return strict JSON only. Do not include Markdown fences, commentary, or prose outside JSON."
      },
      ...input.messages
    ]
  });

  return {
    data: parseJson<T>(result.content),
    model: result.model,
    log: result.log
  };
}

async function providerAttempts(input: GenerateInput, settings: Awaited<ReturnType<typeof getOrCreateUserSettings>>): Promise<ProviderAttempt[]> {
  const [openRouterKey, anthropicKey, openAiKey] = await Promise.all([
    getOpenRouterApiKey(input.userId),
    getAnthropicApiKey(input.userId),
    getOpenAiApiKey(input.userId)
  ]);
  const openRouterModel = routeModelForPass(settings, input.passType, input.model);
  const attempts: ProviderAttempt[] = [];

  if (openRouterKey) {
    attempts.push({
      id: "openrouter",
      apiKey: openRouterKey,
      model: openRouterModel,
      label: `openrouter:${openRouterModel}`
    });
  }
  if (anthropicKey) {
    const model = settings.anthropicModel || process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
    attempts.push({
      id: "anthropic",
      apiKey: anthropicKey,
      model,
      label: `anthropic:${model}`
    });
  }
  if (openAiKey) {
    const model = settings.openAiModel || process.env.OPENAI_MODEL || "gpt-5.4";
    attempts.push({
      id: "openai",
      apiKey: openAiKey,
      model,
      label: `openai:${model}`
    });
  }

  return attempts;
}

async function callProvider(provider: ProviderAttempt, input: GenerateInput): Promise<ProviderResult> {
  if (provider.id === "anthropic") return callAnthropic(provider, input);
  if (provider.id === "openai") return callOpenAi(provider, input);
  return callOpenRouter(provider, input);
}

async function callOpenRouter(provider: ProviderAttempt, input: GenerateInput) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: openRouterHeaders(provider.apiKey),
    body: JSON.stringify({
      model: provider.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 2500
    })
  });

  const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenRouter request failed with status ${response.status}.`);
  }

  const content = payload.choices?.[0]?.message?.content ?? "";
  return {
    content,
    promptTokens: payload.usage?.prompt_tokens ?? 0,
    completionTokens: payload.usage?.completion_tokens ?? 0,
    totalTokens: payload.usage?.total_tokens ?? 0,
    estimatedCost: payload.usage?.cost
  };
}

async function callAnthropic(provider: ProviderAttempt, input: GenerateInput) {
  const { system, messages } = splitSystemMessages(input.messages);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: input.maxTokens ?? 2500,
      ...(system ? { system } : {}),
      messages: normalizeAnthropicMessages(messages)
    })
  });

  const payload = (await response.json().catch(() => ({}))) as AnthropicResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic request failed with status ${response.status}.`);
  }

  const content = (payload.content ?? [])
    .filter((item) => item.type === "text" || item.text)
    .map((item) => item.text || "")
    .join("")
    .trim();
  const promptTokens = payload.usage?.input_tokens ?? 0;
  const completionTokens = payload.usage?.output_tokens ?? 0;

  return {
    content,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens
  };
}

async function callOpenAi(provider: ProviderAttempt, input: GenerateInput) {
  const { system, messages } = splitSystemMessages(input.messages);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: provider.model,
      ...(system ? { instructions: system } : {}),
      input: transcriptForResponseInput(messages),
      max_output_tokens: input.maxTokens ?? 2500,
      temperature: input.temperature ?? 0.7,
      store: false,
      safety_identifier: input.userId
    })
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
  }

  const content = payload.output_text || outputTextFromOpenAi(payload);
  const promptTokens = payload.usage?.input_tokens ?? 0;
  const completionTokens = payload.usage?.output_tokens ?? 0;

  return {
    content,
    promptTokens,
    completionTokens,
    totalTokens: payload.usage?.total_tokens ?? promptTokens + completionTokens
  };
}

export async function getAvailableModels(userId: string) {
  const apiKey = await getOpenRouterApiKey(userId);
  return getOpenRouterModelsWithKey(apiKey);
}

export async function getOpenRouterModelsWithKey(apiKey?: string | null) {
  const response = await fetch("https://openrouter.ai/api/v1/models?output_modalities=text", {
    headers: apiKey ? openRouterHeaders(apiKey) : publicOpenRouterHeaders(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("OpenRouter model list is unavailable right now.");
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id: string;
      name: string;
      created?: number;
      context_length?: number;
      architecture?: { modality?: string; output_modalities?: string[] };
      pricing?: { prompt?: string; completion?: string };
    }>;
  };

  return (payload.data ?? [])
    .filter((model) => model.architecture?.output_modalities?.includes("text") ?? true)
    .map((model) => ({
      id: model.id,
      name: model.name,
      created: model.created,
      contextLength: model.context_length,
      modality: model.architecture?.modality,
      pricing: model.pricing
    }));
}

export function estimateTokenCost(usage?: { total_tokens?: number; cost?: number }) {
  if (typeof usage?.cost === "number") return usage.cost;
  return ((usage?.total_tokens ?? 0) / 1_000_000) * 1.5;
}

async function createGenerationLog(data: Prisma.GenerationLogUncheckedCreateInput) {
  try {
    return await prisma.generationLog.create({ data });
  } catch {
    return null;
  }
}

function openRouterHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://phpstack-1305612-6519184.cloudwaysapps.com",
    "X-Title": "Baxter Growth Lab"
  };
}

function publicOpenRouterHeaders() {
  return {
    Accept: "application/json",
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://phpstack-1305612-6519184.cloudwaysapps.com",
    "X-Title": "Baxter Growth Lab"
  };
}

function providerName(provider: ProviderAttempt) {
  if (provider.id === "openai") return "OpenAI";
  if (provider.id === "anthropic") return "Anthropic";
  return "OpenRouter";
}

function shouldRetryProviderError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("empty response") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("terminated") ||
    message.includes("status 5")
  );
}

function splitSystemMessages(messages: OpenRouterMessage[]) {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const rest = messages.filter((message) => message.role !== "system");
  return {
    system,
    messages: rest.length ? rest : [{ role: "user" as const, content: system || "Continue." }]
  };
}

function normalizeAnthropicMessages(messages: OpenRouterMessage[]) {
  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = message.content.trim();
    if (!content) continue;
    const previous = normalized[normalized.length - 1];
    if (previous?.role === role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      normalized.push({ role, content });
    }
  }
  return normalized.length ? normalized : [{ role: "user" as const, content: "Continue." }];
}

function transcriptForResponseInput(messages: OpenRouterMessage[]) {
  return messages
    .map((message) => `${message.role.toUpperCase()}:\n${message.content.trim()}`)
    .filter((line) => !line.endsWith(":\n"))
    .join("\n\n---\n\n") || "Continue.";
}

function outputTextFromOpenAi(payload: OpenAiResponse) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.text)
    .map((item) => item.text || "")
    .join("")
    .trim();
}

function parseJson<T>(content: string): T {
  const candidates = jsonCandidates(content);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      try {
        return JSON.parse(jsonrepair(candidate)) as T;
      } catch {
        // Try the next candidate.
      }
    }
  }

  const preview = content.replace(/\s+/g, " ").slice(0, 240);
  throw new Error(`AI response was not valid JSON. Response began: ${preview}`);
}

function jsonCandidates(content: string) {
  const trimmed = content.trim();
  const candidates = new Set<string>([trimmed]);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.add(fenced[1].trim());

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.add(trimmed.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.add(trimmed.slice(arrayStart, arrayEnd + 1));
  }

  return Array.from(candidates);
}
