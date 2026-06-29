import { ScriptPassType, StoryProjectFormat } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { generateSceneBackgrounds, type SceneBackgroundPrompt } from "@/lib/runware";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const project = await prisma.storyProject.findFirst({
      where: { id, workspaceId: workspace.id },
      include: {
        drafts: {
          where: { passType: ScriptPassType.SCENE_CARDS },
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
    if (project.format !== StoryProjectFormat.STANDALONE && project.format !== StoryProjectFormat.EPISODIC_SERIES) {
      return Response.json({ error: "HeyGen scene backgrounds are only available for video projects." }, { status: 400 });
    }

    const sceneDraft = project.drafts[0];
    if (!sceneDraft) {
      return Response.json({ error: "Create Scene Cards before generating HeyGen scene backgrounds." }, { status: 400 });
    }

    const prompts = parseSceneBackgroundPrompts(sceneDraft.content);
    if (!prompts.length) {
      return Response.json({ error: "Scene Cards must include lines like: Scene 01 Background Prompt: ..." }, { status: 400 });
    }

    const backgrounds = await generateSceneBackgrounds({
      userId: user.id,
      storyProjectId: project.id,
      scriptDraftId: sceneDraft.id,
      prompts
    });

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "story_project.scene_backgrounds_generated",
      metadata: { projectId: project.id, count: backgrounds.length }
    });

    return Response.json({ backgrounds });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function parseSceneBackgroundPrompts(content: string): SceneBackgroundPrompt[] {
  const rows: SceneBackgroundPrompt[] = [];
  const pattern = /Scene\s+(\d{1,2})\s+Background\s+Prompt\s*:\s*([\s\S]+?)(?=\n\s*Scene\s+\d{1,2}\s+Background\s+Prompt\s*:|\n\s*(?:On-Screen Text Moments|B-Roll And Evidence Visuals|Sound And Music Cues|Thumbnail Moment Candidates|Shorts Clip Candidates|Risk And Sensitivity Notes|Asset Checklist)\b|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    const sceneNumber = Number(match[1]);
    const prompt = (match[2] || "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(sceneNumber) || !prompt) continue;
    rows.push({
      sceneNumber: rows.length + 1,
      title: firstPromptPhrase(prompt) || `Background`,
      prompt
    });
  }

  if (!rows.length) {
    parseSceneBackgroundVisualIdeas(content).forEach((item) => rows.push(item));
  }

  return rows
    .sort((a, b) => a.sceneNumber - b.sceneNumber)
    .slice(0, 40);
}

function parseSceneBackgroundVisualIdeas(content: string): SceneBackgroundPrompt[] {
  const rows: SceneBackgroundPrompt[] = [];
  const normalized = content.replace(/\r\n/g, "\n");
  const scenePattern = /(?:^|\n)\s*(?:\*\*)?Scene\s+(\d{1,2})(?:\*\*)?[^\n]*\n([\s\S]*?)(?=\n\s*(?:\*\*)?Scene\s+\d{1,2}(?:\*\*)?|\n\s*###\s+PART\b|\n\s*##\s+(?:HeyGen Scene Background Prompts|On-Screen Text Moments|B-Roll And Evidence Visuals|Sound And Music Cues|Thumbnail Moment Candidates|Shorts Clip Candidates|Risk And Sensitivity Notes|Asset Checklist)\b|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = scenePattern.exec(normalized))) {
    const block = match[2] || "";
    const idea = firstField(block, "Background visual idea") || firstField(block, "Background image prompt");
    if (!idea || /^see\s+heygen\s+scene\s+background\s+prompts/i.test(idea)) continue;
    const beat = firstField(block, "Narration beat");
    const title = beat || firstPromptPhrase(idea) || `Scene ${rows.length + 1}`;
    rows.push({
      sceneNumber: rows.length + 1,
      title,
      prompt: idea
    });
  }

  return rows;
}

function firstField(block: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(String.raw`(?:\*\*)?${escaped}(?:\*\*)?\s*:\s*([^\n]+)`, "i");
  return block.match(pattern)?.[1]?.trim();
}

function firstPromptPhrase(value: string) {
  return value.split(/[.;]/)[0]?.trim().slice(0, 90);
}
