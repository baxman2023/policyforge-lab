import "server-only";
import crypto from "node:crypto";
import { DEFAULT_BOOK_ILLUSTRATION_MODEL, getBookIllustrationModelOption } from "@/lib/book-illustration-models";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserSettings, getRunwareApiKey } from "@/lib/settings";
import type { BookIllustrationMode } from "@/lib/story-prompts";
import type { ArticleImagePlan, ThumbnailPrompt } from "@/lib/publishing-pack";
import { DEFAULT_THUMBNAIL_STYLE_GUIDE } from "@/lib/thumbnail-style";

const RUNWARE_ENDPOINT = "https://api.runware.ai/v1";
export const DEFAULT_RUNWARE_MODEL = "ideogram:4@0";
export const DEFAULT_SCENE_BACKGROUND_MODEL = "runware:z-image@turbo";
const DEFAULT_THUMBNAIL_DIMENSIONS = { width: 1024, height: 576 };
const IDEOGRAM_THUMBNAIL_DIMENSIONS = { width: 2560, height: 1440 };
const CHANNEL_BANNER_DIMENSIONS = { width: 2560, height: 1440 };
const CHANNEL_BANNER_SAFE_AREA = {
  xMin: 507,
  xMax: 2053,
  yMin: 508,
  yMax: 931,
  width: 1546,
  height: 423
};
const THUMBNAIL_NEGATIVE_PROMPT =
  "low quality, blurry, distorted face, extra fingers, gore, graphic injury, sensationalized violence, fake blood, illegible typography, misspelled headline text, random letters, tiny text, watermark, logo, copied layout, cluttered composition, too many arrows, UI chrome";
const BOOK_ILLUSTRATION_NEGATIVE_PROMPT =
  "low quality, blurry, cropped, distorted anatomy, extra fingers, gore, graphic injury, fake blood, horror poster, YouTube thumbnail, text, typography, label, caption, watermark, logo, UI chrome, meme, advertisement, modern stock-photo look";
const ARTICLE_IMAGE_NEGATIVE_PROMPT =
  "low quality, blurry, cropped, distorted anatomy, gore, graphic injury, fake blood, YouTube thumbnail, text, typography, label, caption, watermark, logo, UI chrome, meme, advertisement, clickbait arrows, stock-photo cliche";
const SCENE_BACKGROUND_NEGATIVE_PROMPT =
  "low quality, blurry, cropped, distorted anatomy, gore, graphic injury, fake blood, YouTube thumbnail, poster, advertisement, text, typography, caption, label, watermark, logo, UI chrome, social media layout, clickbait arrows, cluttered foreground, busy background, readable words, letters, numbers, signage, brand names, HeyGen text, hook text, title card, lower third, checklist text, document text, license plate text, fake text, gibberish characters, random characters";

type RunwareImageResponse = {
  data?: Array<{
    taskUUID?: string;
    imageUUID?: string;
    imageURL?: string;
    cost?: number | string;
  }>;
  errors?: Array<{ message?: string }>;
};

export class RunwareConfigurationError extends Error {
  constructor(message = "Add a Runware API key in Settings before generating thumbnails.") {
    super(message);
    this.name = "RunwareConfigurationError";
  }
}

export async function generateProjectThumbnails(input: {
  userId: string;
  storyProjectId: string;
  scriptDraftId?: string;
  prompts: ThumbnailPrompt[];
}) {
  const settings = await getOrCreateUserSettings(input.userId);
  const apiKey = await getRunwareApiKey(input.userId);
  if (!apiKey) throw new RunwareConfigurationError();

  const model = settings.runwareModel || DEFAULT_RUNWARE_MODEL;
  const styleGuide = settings.thumbnailStyleGuide || DEFAULT_THUMBNAIL_STYLE_GUIDE;
  const taskMap = new Map<string, ThumbnailPrompt & { variant: number }>();
  const tasks = input.prompts.map((prompt, index) => {
    const taskUUID = crypto.randomUUID();
    const dimensions = thumbnailDimensions(model);
    taskMap.set(taskUUID, { ...prompt, variant: index + 1 });
    const task = {
      taskType: "imageInference",
      taskUUID,
      model,
      positivePrompt: thumbnailPositivePrompt(prompt, styleGuide),
      width: dimensions.width,
      height: dimensions.height,
      numberResults: 1,
      outputType: "URL",
      outputFormat: "JPG",
      outputQuality: 95,
      includeCost: true
    };

    return supportsNegativePrompt(model)
      ? { ...task, negativePrompt: THUMBNAIL_NEGATIVE_PROMPT }
      : task;
  });

  const response = await fetch(RUNWARE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tasks)
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareImageResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware request failed with status ${response.status}.`);
  }

  const created = [];
  for (const item of payload.data ?? []) {
    if (!item.taskUUID || !item.imageURL) continue;
    const prompt = taskMap.get(item.taskUUID);
    if (!prompt) continue;
    created.push(
      await prisma.thumbnailAsset.create({
        data: {
          storyProjectId: input.storyProjectId,
          scriptDraftId: input.scriptDraftId,
          variant: prompt.variant,
          title: prompt.title,
          prompt: prompt.prompt,
          imageUrl: item.imageURL,
          imageUUID: item.imageUUID,
          taskUUID: item.taskUUID,
          modelUsed: model,
          estimatedCost: Number(item.cost ?? 0)
        }
      })
    );
  }

  if (!created.length) {
    throw new Error("Runware did not return any thumbnail image URLs.");
  }

  return created;
}

export type BookIllustrationPrompt = {
  chapterNumber: number;
  title: string;
  scene: string;
  prompt: string;
  safetyNotes?: string;
};

export async function generateBookIllustrations(input: {
  userId: string;
  storyProjectId: string;
  scriptDraftId?: string;
  mode: BookIllustrationMode;
  styleBible: string;
  prompts: BookIllustrationPrompt[];
  model?: string;
}) {
  const apiKey = await getRunwareApiKey(input.userId);
  if (!apiKey) throw new RunwareConfigurationError("Add a Runware API key in Settings before generating book illustrations.");

  const requestedModel = (input.model?.trim() || DEFAULT_BOOK_ILLUSTRATION_MODEL).trim();
  const modelOption = getBookIllustrationModelOption(requestedModel);
  if (!modelOption) {
    throw new Error("Choose one of the available book illustration image models.");
  }

  const model = modelOption.id;
  if (/flux/i.test(model)) {
    throw new Error("Book illustrations are set to avoid FLUX. Choose one of the available non-FLUX book illustration models.");
  }

  const taskMap = new Map<string, BookIllustrationPrompt & { variant: number }>();
  const tasks = input.prompts.slice(0, 24).map((prompt, index) => {
    const taskUUID = crypto.randomUUID();
    const dimensions = modelOption.dimensions;
    const variant = Number.isFinite(prompt.chapterNumber) ? Math.max(1, Math.round(prompt.chapterNumber)) : index + 1;
    taskMap.set(taskUUID, { ...prompt, variant });
    const task = {
      taskType: "imageInference",
      taskUUID,
      model,
      positivePrompt: bookIllustrationPositivePrompt(prompt, input.styleBible, input.mode),
      width: dimensions.width,
      height: dimensions.height,
      numberResults: 1,
      outputType: "URL",
      outputFormat: "JPG",
      outputQuality: 92,
      includeCost: true
    };

    return supportsNegativePrompt(model)
      ? { ...task, negativePrompt: BOOK_ILLUSTRATION_NEGATIVE_PROMPT }
      : task;
  });

  const response = await fetch(RUNWARE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tasks)
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareImageResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware request failed with status ${response.status}.`);
  }

  const created = [];
  for (const item of payload.data ?? []) {
    if (!item.taskUUID || !item.imageURL) continue;
    const prompt = taskMap.get(item.taskUUID);
    if (!prompt) continue;
    created.push(
      await prisma.thumbnailAsset.create({
        data: {
          storyProjectId: input.storyProjectId,
          scriptDraftId: input.scriptDraftId,
          variant: prompt.variant,
          title: `Chapter ${prompt.variant}: ${prompt.title}`,
          prompt: [
            `Book illustration mode: ${input.mode}`,
            `Scene: ${prompt.scene}`,
            `Safety notes: ${prompt.safetyNotes || "No special notes."}`,
            `Prompt: ${prompt.prompt}`
          ].join("\n"),
          imageUrl: item.imageURL,
          imageUUID: item.imageUUID,
          taskUUID: item.taskUUID,
          modelUsed: model,
          estimatedCost: Number(item.cost ?? modelOption.costPerImage)
        }
      })
    );
  }

  if (!created.length) {
    throw new Error("Runware did not return any book illustration image URLs.");
  }

  return created;
}

export async function generateArticleImages(input: {
  userId: string;
  storyProjectId: string;
  scriptDraftId?: string;
  images: ArticleImagePlan[];
}) {
  const settings = await getOrCreateUserSettings(input.userId);
  const apiKey = await getRunwareApiKey(input.userId);
  if (!apiKey) throw new RunwareConfigurationError("Add a Runware API key in Settings before generating article images.");

  const model = settings.runwareModel || DEFAULT_RUNWARE_MODEL;
  const taskMap = new Map<string, ArticleImagePlan & { variant: number }>();
  const tasks = input.images.slice(0, 6).map((image, index) => {
    const taskUUID = crypto.randomUUID();
    const dimensions = thumbnailDimensions(model);
    taskMap.set(taskUUID, { ...image, variant: index + 1 });
    const task = {
      taskType: "imageInference",
      taskUUID,
      model,
      positivePrompt: articleImagePositivePrompt(image),
      width: dimensions.width,
      height: dimensions.height,
      numberResults: 1,
      outputType: "URL",
      outputFormat: "JPG",
      outputQuality: 92,
      includeCost: true
    };

    return supportsNegativePrompt(model)
      ? { ...task, negativePrompt: ARTICLE_IMAGE_NEGATIVE_PROMPT }
      : task;
  });

  const response = await fetch(RUNWARE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tasks)
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareImageResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware request failed with status ${response.status}.`);
  }

  const created = [];
  for (const item of payload.data ?? []) {
    if (!item.taskUUID || !item.imageURL) continue;
    const image = taskMap.get(item.taskUUID);
    if (!image) continue;
    created.push(
      await prisma.thumbnailAsset.create({
        data: {
          storyProjectId: input.storyProjectId,
          scriptDraftId: input.scriptDraftId,
          variant: image.variant,
          title: `Article image ${image.variant}: ${image.placement}`,
          prompt: [
            `Article image placement: ${image.placement}`,
            `Alt text: ${image.altText || ""}`,
            `Caption: ${image.caption || ""}`,
            `Prompt: ${image.prompt}`
          ].join("\n"),
          imageUrl: item.imageURL,
          imageUUID: item.imageUUID,
          taskUUID: item.taskUUID,
          modelUsed: model,
          estimatedCost: Number(item.cost ?? 0)
        }
      })
    );
  }

  if (!created.length) {
    throw new Error("Runware did not return any article image URLs.");
  }

  return created;
}

export type SceneBackgroundPrompt = {
  sceneNumber: number;
  title: string;
  prompt: string;
};

export async function generateSceneBackgrounds(input: {
  userId: string;
  storyProjectId: string;
  scriptDraftId?: string;
  prompts: SceneBackgroundPrompt[];
}) {
  const apiKey = await getRunwareApiKey(input.userId);
  if (!apiKey) throw new RunwareConfigurationError("Add a Runware API key in Settings before generating HeyGen scene backgrounds.");

  const model = DEFAULT_SCENE_BACKGROUND_MODEL;
  const taskMap = new Map<string, SceneBackgroundPrompt & { variant: number }>();
  const tasks = input.prompts.slice(0, 40).map((prompt, index) => {
    const taskUUID = crypto.randomUUID();
    const variant = Number.isFinite(prompt.sceneNumber) ? Math.max(1, Math.round(prompt.sceneNumber)) : index + 1;
    taskMap.set(taskUUID, { ...prompt, variant });
    return {
      taskType: "imageInference",
      taskUUID,
      model,
      positivePrompt: sceneBackgroundPositivePrompt(prompt),
      width: DEFAULT_THUMBNAIL_DIMENSIONS.width,
      height: DEFAULT_THUMBNAIL_DIMENSIONS.height,
      numberResults: 1,
      outputType: "URL",
      outputFormat: "JPG",
      outputQuality: 90,
      includeCost: true,
      negativePrompt: SCENE_BACKGROUND_NEGATIVE_PROMPT
    };
  });

  const response = await fetch(RUNWARE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tasks)
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareImageResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware request failed with status ${response.status}.`);
  }

  const created = [];
  for (const item of payload.data ?? []) {
    if (!item.taskUUID || !item.imageURL) continue;
    const prompt = taskMap.get(item.taskUUID);
    if (!prompt) continue;
    created.push(
      await prisma.thumbnailAsset.create({
        data: {
          storyProjectId: input.storyProjectId,
          scriptDraftId: input.scriptDraftId,
          variant: prompt.variant,
          title: `HeyGen Scene ${String(prompt.variant).padStart(2, "0")} Background: ${prompt.title}`,
          prompt: [
            "HeyGen scene background",
            `Scene: ${String(prompt.variant).padStart(2, "0")}`,
            `Prompt: ${prompt.prompt}`
          ].join("\n"),
          imageUrl: item.imageURL,
          imageUUID: item.imageUUID,
          taskUUID: item.taskUUID,
          modelUsed: model,
          estimatedCost: Number(item.cost ?? 0.0006)
        }
      })
    );
  }

  if (!created.length) {
    throw new Error("Runware did not return any HeyGen scene background image URLs.");
  }

  return created;
}

export async function generateChannelBrandImages(input: {
  userId: string;
  logoPrompt: string;
  bannerPrompt: string;
}) {
  const settings = await getOrCreateUserSettings(input.userId);
  const apiKey = await getRunwareApiKey(input.userId);
  if (!apiKey) throw new RunwareConfigurationError("Add a Runware API key in Settings before generating channel brand images.");

  const model = settings.runwareModel || DEFAULT_RUNWARE_MODEL;
  const tasks = [
    {
      key: "logo" as const,
      taskUUID: crypto.randomUUID(),
      width: isIdeogramModel(model) ? 2048 : 1024,
      height: isIdeogramModel(model) ? 2048 : 1024,
      prompt: channelBrandPrompt(input.logoPrompt, "square channel logo")
    },
    {
      key: "banner" as const,
      taskUUID: crypto.randomUUID(),
      width: CHANNEL_BANNER_DIMENSIONS.width,
      height: CHANNEL_BANNER_DIMENSIONS.height,
      prompt: channelBannerPrompt(input.bannerPrompt)
    }
  ];
  const taskMap = new Map<string, (typeof tasks)[number]>(tasks.map((task) => [task.taskUUID, task]));

  const response = await fetch(RUNWARE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(tasks.map((task) => ({
        taskType: "imageInference",
        taskUUID: task.taskUUID,
        model,
        positivePrompt: task.prompt,
        width: task.width,
        height: task.height,
        numberResults: 1,
        outputType: "URL",
        outputFormat: "JPG",
        outputQuality: 95
      })))
  });

  const payload = (await response.json().catch(() => ({}))) as RunwareImageResponse;
  if (!response.ok || payload.errors?.length) {
    const messages = [...new Set(payload.errors?.map((error) => error.message).filter(Boolean))];
    throw new Error(messages.join(" ") || `Runware request failed with status ${response.status}.`);
  }

  const output: { logoImageUrl?: string; bannerImageUrl?: string; modelUsed: string; estimatedCost: number } = {
    modelUsed: model,
    estimatedCost: 0
  };
  for (const item of payload.data ?? []) {
    if (!item.taskUUID || !item.imageURL) continue;
    const task = taskMap.get(item.taskUUID);
    if (!task) continue;
    output.estimatedCost += Number(item.cost ?? 0);
    if (task.key === "logo") output.logoImageUrl = item.imageURL;
    if (task.key === "banner") output.bannerImageUrl = item.imageURL;
  }

  return output;
}

function channelBrandPrompt(prompt: string, format: string) {
  return [
    `Premium ${format} for a serious documentary YouTube channel.`,
    clampText(prompt, 1600),
    "Modern high-contrast design, clear brand identity, cinematic documentary mood, readable channel name text when requested, no fake platform UI, no watermarks, no copied logos, no clutter."
  ].join(" ").slice(0, 3000);
}

function channelBannerPrompt(prompt: string) {
  return [
    "Premium YouTube channel banner for a serious documentary YouTube channel.",
    `Canvas must be exactly ${CHANNEL_BANNER_DIMENSIONS.width} x ${CHANNEL_BANNER_DIMENSIONS.height} pixels.`,
    `Strict YouTube safe area rule: all readable text, channel name, tagline, logo, initials, symbols, and brand marks must stay entirely inside the centered safe rectangle ${CHANNEL_BANNER_SAFE_AREA.width} x ${CHANNEL_BANNER_SAFE_AREA.height} pixels, from x=${CHANNEL_BANNER_SAFE_AREA.xMin} to x=${CHANNEL_BANNER_SAFE_AREA.xMax} and y=${CHANNEL_BANNER_SAFE_AREA.yMin} to y=${CHANNEL_BANNER_SAFE_AREA.yMax}.`,
    "Do not place any letters, words, numbers, signature, watermark, logo, icon, or important subject outside that safe rectangle. The outer desktop/tablet regions may contain only background texture, atmosphere, maps, archive imagery, gradients, or abstract documentary visuals with no text.",
    "Center the channel name and tagline in the safe area with generous margins. Keep text large, readable, uncropped, and horizontal. Leave padding around all safe-area text so it cannot be cut off on mobile, tablet, or desktop.",
    clampText(prompt, 1600),
    "Modern high-contrast design, clear brand identity, cinematic documentary mood, premium true-story brand system, no fake platform UI, no watermarks, no copied logos, no clutter."
  ].join(" ").slice(0, 3600);
}

function thumbnailPositivePrompt(prompt: ThumbnailPrompt, styleGuide: string) {
  const overlayText = thumbnailOverlayText(prompt);
  return [
    "High-CTR YouTube documentary thumbnail, clickbait-style curiosity while staying truthful, designed to stop a mobile scroll, 16:9 composition.",
    clampText(styleGuide, 1200),
    `Include large readable in-image headline text exactly: "${overlayText}". Use 2-4 words, all caps, huge thick lettering, white or yellow fill, black stroke, subtle drop shadow, readable at 120px wide.`,
    "Add one or two thick red arrows or red circles pointing at the key evidence, mystery object, hidden detail, face, map location, or anomaly. Keep only 2-3 visual elements total.",
    clampText(prompt.prompt, 1400),
    "Sharp close-cropped focal point, dramatic expression or impossible detail, strong color contrast, electric yellow/red/cyan accents, realistic lighting, premium true-story documentary style. No extra words beyond the exact headline text. Avoid gore, fake blood, watermarks, logos, copied layouts, clutter, tiny text, and misleading imagery."
  ].join(" ").slice(0, 3400);
}

function bookIllustrationPositivePrompt(prompt: BookIllustrationPrompt, styleBible: string, mode: BookIllustrationMode) {
  const modeText = mode === "KEY_SCENES"
    ? "key scene illustration"
    : mode === "FULL_ILLUSTRATED"
      ? "full illustrated edition interior art"
      : "chapter opener illustration";

  return [
    `Premium ${modeText} for a serious nonfiction narrative book.`,
    "Book-interior illustration, cinematic but restrained, no text, no typography, no labels, no watermark, no logo.",
    clampText(styleBible, 1300),
    `Chapter ${prompt.chapterNumber}: ${prompt.title}.`,
    `Scene: ${clampText(prompt.scene, 700)}`,
    `Image prompt: ${clampText(prompt.prompt, 1400)}`,
    prompt.safetyNotes ? `Accuracy and restraint notes: ${clampText(prompt.safetyNotes, 400)}` : "",
    "Historically grounded visual details, respectful tone, polished composition, rich atmosphere, coherent lighting, print-quality detail. Avoid gore, cheap horror, fake evidence, thumbnail graphics, captions, and sensationalized imagery."
  ].filter(Boolean).join(" ").slice(0, 3600);
}

function articleImagePositivePrompt(image: ArticleImagePlan) {
  return [
    "Premium editorial image for a published web article, natural documentary style, 16:9 composition, polished but not clickbait.",
    "No text, no typography, no labels, no watermarks, no logos, no UI, no arrows, no social media thumbnail styling.",
    `Placement in article: ${image.placement}.`,
    image.altText ? `SEO alt text goal: ${image.altText}.` : "",
    image.caption ? `Caption context: ${image.caption}.` : "",
    `Image prompt: ${clampText(image.prompt, 1700)}`,
    "Make the image support the article's section visually and respectfully. Use credible objects, locations, people from behind or silhouettes when appropriate, documents, maps, environmental context, or service/business visuals when relevant. Avoid fabricated evidence, sensational imagery, and cheap stock-photo poses."
  ].filter(Boolean).join(" ").slice(0, 3200);
}

function sceneBackgroundPositivePrompt(prompt: SceneBackgroundPrompt) {
  return [
    "Clean 16:9 wordless background image for a presenter-led insurance education video, designed to sit behind or beside a talking-head avatar.",
    "Absolutely no words or readable characters anywhere: no text overlays, no signs, no titles, no labels, no logos, no UI, no document text, no captions, no watermarks, no arrows, no lower thirds, no brand names.",
    "Do not render the words HeyGen, hook, scene, insurance, Baxter, phone numbers, addresses, or any other letters or numbers.",
    "Leave safe negative space on one side for a presenter. Keep the scene visually useful but not busy.",
    `Visual brief: ${clampText(prompt.prompt, 1700)}`,
    "If documents, screens, permits, checklists, papers, street signs, or license plates appear, they must be blank, abstract, blurred, turned away, or unreadable with no visible letters or numbers.",
    "Use credible Texas/Houston, home, auto, business, policy document, storm, renewal, family, or service-context visuals when relevant. Polished documentary/editorial lighting, realistic, trustworthy, compliance-safe, no sensationalism."
  ].join(" ").slice(0, 3200);
}

function supportsNegativePrompt(model: string) {
  const normalized = model.trim().toLowerCase();
  if (isIdeogramModel(normalized)) return false;
  return normalized.startsWith("runware:z-image") || normalized.startsWith("alibaba:qwen-image");
}

function thumbnailDimensions(model: string) {
  return isIdeogramModel(model) ? IDEOGRAM_THUMBNAIL_DIMENSIONS : DEFAULT_THUMBNAIL_DIMENSIONS;
}

function isIdeogramModel(model: string) {
  return model.trim().toLowerCase().startsWith("ideogram:");
}

function thumbnailOverlayText(prompt: ThumbnailPrompt) {
  const direct = cleanOverlayText(prompt.overlayText);
  if (direct) return direct;

  const title = /^thumbnail concept/i.test(prompt.title) ? undefined : cleanOverlayText(prompt.title);
  if (title) return title;

  return "WHAT HAPPENED?";
}

function cleanOverlayText(value?: string) {
  const text = value
    ?.replace(/[“”]/g, "\"")
    .replace(/[^a-zA-Z0-9!?'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || /optional|overlay|suggested|thumbnail concept|not required/i.test(text)) return undefined;

  return text
    .split(/\s+/)
    .slice(0, 4)
    .join(" ")
    .toUpperCase();
}

function clampText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}
