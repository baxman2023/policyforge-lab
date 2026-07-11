import "server-only";
import { generateJson } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { normalizeNineShorts, type ShortCandidate } from "@/lib/upgrade-domain";

export async function ensureNineShortAssets(input: {
  userId: string;
  workspaceId: string;
  channelId: string;
  storyProjectId: string;
  title: string;
  script: string;
}) {
  const existing = await prisma.shortAsset.findMany({ where: { storyProjectId: input.storyProjectId }, orderBy: { shortIndex: "asc" } });
  if (existing.length === 9) return existing;

  let candidates: ShortCandidate[] = [];
  try {
    const result = await generateJson<{ shorts: ShortCandidate[] }>({
      userId: input.userId,
      workspaceId: input.workspaceId,
      storyProjectId: input.storyProjectId,
      passType: "PUBLISHING_PACK",
      messages: [{ role: "user", content: `Create exactly nine genuinely useful vertical-video Shorts from this completed Texas insurance video script.\n\nTITLE: ${input.title}\n\nSCRIPT:\n${input.script}\n\nReturn strict JSON: {"shorts":[{"hook":"...","payoff":"...","script":"45-75 spoken words","title":"...","caption":"...","sourceSafety":"exact claim/source caution","exportAssets":{"aspectRatio":"9:16","visualPrompt":"no text in image","sourceSentences":["exact supporting sentence"]}}]}.\n\nEach Short needs a different useful idea, a fast hook, a real payoff, no invented statistics, no carrier impersonation, no guaranteed savings/coverage/outcomes, and its own export metadata. Use only claims supportable from the supplied completed script.` }],
      temperature: 0.45,
      maxTokens: 6_500
    });
    candidates = Array.isArray(result.data.shorts) ? result.data.shorts : [];
  } catch {
    candidates = [];
  }
  const shorts = normalizeNineShorts(candidates, input.script);
  await prisma.$transaction([
    prisma.shortAsset.deleteMany({ where: { storyProjectId: input.storyProjectId } }),
    ...shorts.map((item, index) => prisma.shortAsset.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        storyProjectId: input.storyProjectId,
        shortIndex: index + 1,
        hook: item.hook,
        payoff: item.payoff,
        script: item.script,
        title: item.title,
        caption: item.caption,
        sourceSafety: item.sourceSafety,
        exportAssets: item.exportAssets as object
      }
    }))
  ]);
  return prisma.shortAsset.findMany({ where: { storyProjectId: input.storyProjectId }, orderBy: { shortIndex: "asc" } });
}
