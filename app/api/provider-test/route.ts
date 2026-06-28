import crypto from "node:crypto";
import { z } from "zod";
import { jsonError } from "@/lib/http";
import { getOpenRouterModelsWithKey } from "@/lib/openrouter";
import { fetchAnthropicModels, fetchOpenAiModels } from "@/lib/provider-models";
import {
  getAnthropicApiKey,
  getDataForSeoCredentials,
  getOpenAiApiKey,
  getOpenRouterApiKey,
  getRunwareApiKey,
  getWordPressCredentials,
  normalizeWordPressSiteUrl,
  saveUserSettings
} from "@/lib/settings";
import { requireUser } from "@/lib/session";

const ProviderTestSchema = z.object({
  provider: z.enum(["openrouter", "anthropic", "openai", "runware", "dataforseo", "wordpress"]),
  apiKey: z.string().optional(),
  dataForSeoLogin: z.string().optional(),
  dataForSeoPassword: z.string().optional(),
  wordpressSiteUrl: z.string().optional(),
  wordpressUsername: z.string().optional(),
  wordpressApplicationPassword: z.string().optional(),
  model: z.string().optional()
});

type RunwareModelSearchResponse = {
  data?: Array<{
    results?: unknown[];
    totalResults?: number;
  }>;
  errors?: Array<{ message?: string }>;
};

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = ProviderTestSchema.parse(await request.json());

    if (input.provider === "openrouter") {
      const apiKey = input.apiKey?.trim() || await getOpenRouterApiKey(user.id);
      if (!apiKey) return Response.json({ ok: false, provider: input.provider, message: "Add an OpenRouter API key before testing." }, { status: 400 });

      const models = await getOpenRouterModelsWithKey(apiKey);
      const selectedModelAvailable = input.model ? models.some((model) => model.id === input.model) : undefined;
      const testModel = selectedModelAvailable && input.model ? input.model : models[0]?.id || "openai/gpt-4o-mini";
      await testOpenRouterGeneration(apiKey, testModel);
      const saved = Boolean(input.apiKey?.trim());
      if (saved) await saveUserSettings(user.id, { openRouterApiKey: apiKey });
      return Response.json({
        ok: true,
        provider: input.provider,
        modelCount: models.length,
        selectedModelAvailable,
        testedAt: new Date().toISOString(),
        message: selectedModelMessage(saved ? "OpenRouter key works and was saved" : "OpenRouter key works", models.length, input.model, selectedModelAvailable)
      });
    }

    if (input.provider === "anthropic") {
      const apiKey = input.apiKey?.trim() || await getAnthropicApiKey(user.id);
      if (!apiKey) return Response.json({ ok: false, provider: input.provider, message: "Add an Anthropic API key before testing." }, { status: 400 });

      const models = await fetchAnthropicModels(apiKey);
      const selectedModelAvailable = input.model ? models.some((model) => model.id === input.model) : undefined;
      const testModel = input.model || models[0]?.id || "claude-opus-4-8";
      await testAnthropicGeneration(apiKey, testModel);
      const saved = Boolean(input.apiKey?.trim());
      if (saved) await saveUserSettings(user.id, { anthropicApiKey: apiKey });
      return Response.json({
        ok: true,
        provider: input.provider,
        models,
        modelCount: models.length,
        selectedModelAvailable,
        testedAt: new Date().toISOString(),
        message: selectedModelMessage(saved ? "Anthropic key works and was saved" : "Anthropic key works", models.length, input.model, selectedModelAvailable)
      });
    }

    if (input.provider === "openai") {
      const apiKey = input.apiKey?.trim() || await getOpenAiApiKey(user.id);
      if (!apiKey) return Response.json({ ok: false, provider: input.provider, message: "Add an OpenAI API key before testing." }, { status: 400 });

      const models = await fetchOpenAiModels(apiKey);
      const selectedModelAvailable = input.model ? models.some((model) => model.id === input.model) : undefined;
      const testModel = input.model || models[0]?.id || "gpt-5.4";
      await testOpenAiGeneration(apiKey, testModel);
      const saved = Boolean(input.apiKey?.trim());
      if (saved) await saveUserSettings(user.id, { openAiApiKey: apiKey });
      return Response.json({
        ok: true,
        provider: input.provider,
        models,
        modelCount: models.length,
        selectedModelAvailable,
        testedAt: new Date().toISOString(),
        message: selectedModelMessage(saved ? "OpenAI key works and was saved" : "OpenAI key works", models.length, input.model, selectedModelAvailable)
      });
    }

    if (input.provider === "dataforseo") {
      const savedCredentials = await getDataForSeoCredentials(user.id);
      const credentials = {
        login: input.dataForSeoLogin?.trim() || savedCredentials?.login || "",
        password: input.dataForSeoPassword?.trim() || savedCredentials?.password || ""
      };
      if (!credentials.login || !credentials.password) {
        return Response.json({ ok: false, provider: input.provider, message: "Add DataForSEO login and password before testing." }, { status: 400 });
      }

      const resultCount = await testDataForSeoCredentials(credentials.login, credentials.password);
      const saved = Boolean(input.dataForSeoLogin?.trim() && input.dataForSeoPassword?.trim());
      if (saved) {
        await saveUserSettings(user.id, {
          dataForSeoLogin: credentials.login,
          dataForSeoPassword: credentials.password
        });
      }
      return Response.json({
        ok: true,
        provider: input.provider,
        modelCount: resultCount,
        testedAt: new Date().toISOString(),
        message: `DataForSEO credentials work${saved ? " and were saved" : ""}. Keyword lookup returned ${resultCount.toLocaleString()} result${resultCount === 1 ? "" : "s"}.`
      });
    }

    if (input.provider === "wordpress") {
      const savedCredentials = await getWordPressCredentials(user.id);
      const credentials = {
        siteUrl: normalizeWordPressSiteUrl(input.wordpressSiteUrl?.trim() || savedCredentials?.siteUrl || ""),
        username: input.wordpressUsername?.trim() || savedCredentials?.username || "",
        applicationPassword: input.wordpressApplicationPassword?.trim() || savedCredentials?.applicationPassword || ""
      };
      if (!credentials.siteUrl || !credentials.username || !credentials.applicationPassword) {
        return Response.json({ ok: false, provider: input.provider, message: "Add WordPress site URL, username, and application password before testing." }, { status: 400 });
      }

      const userName = await testWordPressCredentials(credentials);
      const saved = Boolean(input.wordpressSiteUrl?.trim() && input.wordpressUsername?.trim() && input.wordpressApplicationPassword?.trim());
      if (saved) {
        await saveUserSettings(user.id, {
          wordpressSiteUrl: credentials.siteUrl,
          wordpressUsername: credentials.username,
          wordpressApplicationPassword: credentials.applicationPassword
        });
      }
      return Response.json({
        ok: true,
        provider: input.provider,
        testedAt: new Date().toISOString(),
        message: `WordPress connection works${saved ? " and was saved" : ""}. Connected as ${userName}.`
      });
    }

    const apiKey = input.apiKey?.trim() || await getRunwareApiKey(user.id);
    if (!apiKey) return Response.json({ ok: false, provider: input.provider, message: "Add a Runware API key before testing." }, { status: 400 });

    const resultCount = await testRunwareKey(apiKey);
    const saved = Boolean(input.apiKey?.trim());
    if (saved) await saveUserSettings(user.id, { runwareApiKey: apiKey });
    return Response.json({
      ok: true,
      provider: input.provider,
      modelCount: resultCount,
      testedAt: new Date().toISOString(),
      message: `Runware key works${saved ? " and was saved" : ""}. Public model search returned ${resultCount.toLocaleString()} matching thumbnail models.`
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function testDataForSeoCredentials(login: string, password: string) {
  const response = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        location_code: 2840,
        language_code: "en",
        keywords: ["true crime documentary", "history documentary"]
      }
    ])
  });

  const payload = (await response.json().catch(() => ({}))) as {
    tasks?: Array<{ status_code?: number; status_message?: string; result?: unknown[] | null }>;
    status_message?: string;
  };
  if (!response.ok) throw new Error(payload.status_message || `DataForSEO test failed with status ${response.status}.`);
  const failedTask = payload.tasks?.find((task) => task.status_code && task.status_code >= 40000);
  if (failedTask) throw new Error(failedTask.status_message || "DataForSEO keyword lookup failed.");
  return payload.tasks?.reduce((sum, task) => sum + (task.result?.length ?? 0), 0) ?? 0;
}

async function testWordPressCredentials(credentials: {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}) {
  const response = await fetch(`${credentials.siteUrl}/wp-json/wp/v2/users/me?context=edit`, {
    headers: {
      Authorization: wordpressAuthHeader(credentials.username, credentials.applicationPassword),
      Accept: "application/json"
    }
  });
  const payload = (await response.json().catch(() => ({}))) as { name?: string; slug?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.message || `WordPress test failed with status ${response.status}.`);
  }
  return payload.name || payload.slug || credentials.username;
}

function wordpressAuthHeader(username: string, applicationPassword: string) {
  return `Basic ${Buffer.from(`${username}:${applicationPassword}`).toString("base64")}`;
}

function selectedModelMessage(prefix: string, modelCount: number, selectedModel?: string, selectedModelAvailable?: boolean) {
  const base = `${prefix}. Loaded ${modelCount.toLocaleString()} available model${modelCount === 1 ? "" : "s"}.`;
  if (!selectedModel) return base;
  if (selectedModelAvailable) return `${base} Selected model "${selectedModel}" is available.`;
  return `${base} Selected model "${selectedModel}" is not listed for this key; choose one from the dropdown.`;
}

async function testRunwareKey(apiKey: string) {
  const response = await fetch("https://api.runware.ai/v1", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([
      {
        taskType: "modelSearch",
        taskUUID: crypto.randomUUID(),
        search: "ideogram",
        visibility: "public",
        limit: 1,
        offset: 0
      }
    ])
  });
  const payload = (await response.json().catch(() => ({}))) as RunwareModelSearchResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware test failed with status ${response.status}.`);
  }

  return payload.data?.[0]?.totalResults ?? payload.data?.[0]?.results?.length ?? 0;
}

async function testOpenRouterGeneration(apiKey: string, model: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://phpstack-1305612-6519184.cloudwaysapps.com",
      "X-Title": "PolicyForge LAB"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Return strict JSON only: {\"ok\":true}" }],
      temperature: 0,
      max_tokens: 30
    })
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok || !payload.choices?.[0]?.message?.content) {
    throw new Error(payload.error?.message || `OpenRouter generation test failed with status ${response.status}.`);
  }
}

async function testAnthropicGeneration(apiKey: string, model: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 30,
      messages: [{ role: "user", content: "Return strict JSON only: {\"ok\":true}" }]
    })
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; content?: Array<{ text?: string }> };
  if (!response.ok || !payload.content?.some((item) => item.text?.trim())) {
    throw new Error(payload.error?.message || `Anthropic generation test failed with status ${response.status}.`);
  }
}

async function testOpenAiGeneration(apiKey: string, model: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: "Return strict JSON only: {\"ok\":true}",
      max_output_tokens: 30,
      temperature: 0,
      store: false
    })
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; output_text?: string; output?: unknown[] };
  if (!response.ok || (!payload.output_text && !payload.output?.length)) {
    throw new Error(payload.error?.message || `OpenAI generation test failed with status ${response.status}.`);
  }
}
