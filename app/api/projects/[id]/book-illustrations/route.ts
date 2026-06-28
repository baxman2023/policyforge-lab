import { ScriptPassType, StoryProjectFormat, type ScriptDraft, type StoryProject } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import {
  DEFAULT_BOOK_ILLUSTRATION_MODEL,
  estimateBookIllustrationCost,
  formatEstimatedBookIllustrationCost,
  getBookIllustrationModelOption
} from "@/lib/book-illustration-models";
import { jsonError } from "@/lib/http";
import { generateJson } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { generateBookIllustrations, type BookIllustrationPrompt } from "@/lib/runware";
import { bookIllustrationPlanPrompt, type BookIllustrationMode } from "@/lib/story-prompts";
import { requireActiveWorkspace } from "@/lib/workspaces";

const BookIllustrationModeSchema = z.enum(["CHAPTER_OPENERS", "KEY_SCENES", "FULL_ILLUSTRATED"]);

const IllustrationPromptSchema = z.object({
  chapterNumber: z.number().int().min(1).max(99),
  title: z.string().min(1).max(180),
  scene: z.string().min(1).max(1200),
  prompt: z.string().min(1).max(2400),
  safetyNotes: z.string().max(800).optional()
});

const BookIllustrationPlanSchema = z.object({
  mode: BookIllustrationModeSchema,
  styleBible: z.string().min(1).max(5000),
  estimatedImageCount: z.number().int().min(1).max(24),
  estimatedCostNote: z.string().min(1).max(800),
  illustrations: z.array(IllustrationPromptSchema).min(1).max(24)
});

const RequestSchema = z.object({
  mode: BookIllustrationModeSchema.default("CHAPTER_OPENERS"),
  maxImages: z.number().int().min(1).max(24).optional(),
  model: z.string().trim().max(160).optional(),
  generateImages: z.boolean().default(false),
  plan: BookIllustrationPlanSchema.optional()
});

type BookIllustrationPlan = z.infer<typeof BookIllustrationPlanSchema>;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = RequestSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 80 }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format !== StoryProjectFormat.SHORT_BOOK && project.format !== StoryProjectFormat.LONG_BOOK) {
      return Response.json({ error: "Book illustrations are only available for Short Book and Long Form Book projects." }, { status: 400 });
    }

    const maxImages = input.maxImages ?? defaultImageCap(project.format, input.mode);
    const model = input.model?.trim() || DEFAULT_BOOK_ILLUSTRATION_MODEL;
    const modelOption = getBookIllustrationModelOption(model);
    if (!modelOption || /flux/i.test(modelOption.id)) {
      return Response.json({ error: "Choose one of the available non-FLUX book illustration image models." }, { status: 400 });
    }

    const plan = input.plan
      ? normalizeExistingPlan(input.plan, input.mode, maxImages, modelOption.id)
      : await createBookIllustrationPlan({
          userId: user.id,
          workspaceId: workspace.id,
          project,
          mode: input.mode,
          maxImages,
          model: modelOption.id
        });

    if (!input.generateImages) {
      return Response.json({ plan });
    }

    const latestScript = latestDraft(project.drafts, ScriptPassType.FINAL)
      ?? latestDraft(project.drafts, ScriptPassType.VOICE_POLISH)
      ?? latestDraft(project.drafts, ScriptPassType.REWRITE)
      ?? latestDraft(project.drafts, ScriptPassType.DRAFT)
      ?? latestDraft(project.drafts, ScriptPassType.STRUCTURE);

    const illustrations = await generateBookIllustrations({
      userId: user.id,
      storyProjectId: project.id,
      scriptDraftId: latestScript?.id,
      mode: plan.mode,
      styleBible: plan.styleBible,
      prompts: plan.illustrations,
      model: modelOption.id
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.book_illustrations_generated",
      metadata: { projectId: project.id, count: illustrations.length, mode: plan.mode, model: modelOption.id }
    });

    const actualCost = illustrations.reduce((sum, item) => sum + Number(item.estimatedCost ?? 0), 0);
    return Response.json({
      plan,
      illustrations,
      estimatedCost: actualCost || estimateBookIllustrationCost(modelOption.id, illustrations.length),
      modelUsed: illustrations[0]?.modelUsed ?? modelOption.id
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function createBookIllustrationPlan(input: {
  userId: string;
  workspaceId: string;
  project: StoryProject & {
    storyIdea?: { hook?: string | null; summary?: string | null } | null;
    drafts: ScriptDraft[];
  };
  mode: BookIllustrationMode;
  maxImages: number;
  model: string;
}) {
  const prompt = bookIllustrationPlanPrompt({
    title: input.project.title,
    hook: input.project.storyIdea?.hook,
    summary: input.project.storyIdea?.summary,
    format: input.project.format,
    targetWordCount: input.project.targetWordCount,
    tone: input.project.tone,
    narrationStyle: input.project.narrationStyle,
    sourceMaterial: input.project.sourceMaterial,
    passContext: bookContext(input.project.drafts),
    mode: input.mode,
    maxImages: input.maxImages
  });

  const result = await generateJson<unknown>({
    userId: input.userId,
    workspaceId: input.workspaceId,
    storyProjectId: input.project.id,
    passType: ScriptPassType.STRUCTURE,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.55,
    maxTokens: 5000
  });

  return normalizePlan(result.data, input.mode, input.maxImages, input.project, input.model);
}

function normalizeExistingPlan(plan: BookIllustrationPlan, mode: BookIllustrationMode, maxImages: number, model: string): BookIllustrationPlan {
  const illustrations = plan.illustrations.slice(0, maxImages);
  return {
    mode,
    styleBible: plan.styleBible.trim(),
    estimatedImageCount: Math.min(maxImages, illustrations.length),
    estimatedCostNote: defaultCostNote(illustrations.length || maxImages, model),
    illustrations
  };
}

function normalizePlan(raw: unknown, mode: BookIllustrationMode, maxImages: number, project: StoryProject, model: string): BookIllustrationPlan {
  const object = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawIllustrations = Array.isArray(object.illustrations)
    ? object.illustrations
    : Array.isArray(object.prompts)
      ? object.prompts
      : [];

  const illustrations = rawIllustrations
    .map((item, index) => normalizePrompt(item, index, project))
    .filter((item): item is BookIllustrationPrompt => Boolean(item?.prompt))
    .slice(0, maxImages);

  const safeIllustrations = illustrations.length
    ? illustrations
    : [{
        chapterNumber: 1,
        title: project.title,
        scene: `A restrained symbolic opening image for ${project.title}.`,
        prompt: `Premium nonfiction book-interior illustration for ${project.title}. Atmospheric documentary realism, historically grounded objects and setting, no text, no typography, no labels, no watermark, no logo.`,
        safetyNotes: "Fallback prompt created because the AI did not return chapter prompts."
      }];

  const styleBible = stringFrom(object.styleBible) || [
    "Consistent nonfiction book-interior illustration style.",
    "Muted documentary palette, restrained contrast, realistic light, clean composition, no text, no labels, no watermark.",
    "Favor places, objects, records, maps, silhouettes, weather, and historically grounded evidence over sensational imagery."
  ].join(" ");

  return {
    mode,
    styleBible,
    estimatedImageCount: Math.min(maxImages, safeIllustrations.length),
    estimatedCostNote: defaultCostNote(Math.min(maxImages, safeIllustrations.length), model),
    illustrations: safeIllustrations
  };
}

function normalizePrompt(raw: unknown, index: number, project: StoryProject): BookIllustrationPrompt | null {
  if (!raw || typeof raw !== "object") return null;
  const object = raw as Record<string, unknown>;
  const prompt = stringFrom(object.prompt);
  if (!prompt) return null;
  const chapterNumber = Number(object.chapterNumber ?? object.chapter ?? index + 1);
  return {
    chapterNumber: Number.isFinite(chapterNumber) ? Math.max(1, Math.round(chapterNumber)) : index + 1,
    title: stringFrom(object.title) || `${project.title} Illustration ${index + 1}`,
    scene: stringFrom(object.scene) || stringFrom(object.description) || `Illustration for ${project.title}.`,
    prompt,
    safetyNotes: stringFrom(object.safetyNotes) || stringFrom(object.notes) || undefined
  };
}

function bookContext(drafts: ScriptDraft[]) {
  const preferred = [
    ScriptPassType.FINAL,
    ScriptPassType.VOICE_POLISH,
    ScriptPassType.REWRITE,
    ScriptPassType.DRAFT,
    ScriptPassType.STRUCTURE,
    ScriptPassType.DOSSIER,
    ScriptPassType.STORY_SPINE
  ];

  return preferred
    .map((passType) => latestDraft(drafts, passType))
    .filter((draft): draft is ScriptDraft => Boolean(draft))
    .map((draft) => `=== ${draft.passType} ===\n${draft.content.slice(0, 9000)}`)
    .join("\n\n")
    .slice(0, 26000);
}

function latestDraft(drafts: ScriptDraft[], passType: ScriptPassType) {
  return drafts
    .filter((draft) => draft.passType === passType)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function defaultImageCap(format: StoryProjectFormat, mode: BookIllustrationMode) {
  if (mode === "KEY_SCENES") return format === StoryProjectFormat.LONG_BOOK ? 10 : 6;
  if (mode === "FULL_ILLUSTRATED") return format === StoryProjectFormat.LONG_BOOK ? 20 : 12;
  return format === StoryProjectFormat.LONG_BOOK ? 14 : 8;
}

function defaultCostNote(count: number, model: string) {
  const option = getBookIllustrationModelOption(model);
  const label = option ? `${option.label} (${option.costLabel})` : model;
  return `${count} image${count === 1 ? "" : "s"} planned with ${label}. Estimated total: ${formatEstimatedBookIllustrationCost(model, count)}. Exact Runware cost is saved after generation.`;
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
