import { z } from "zod";
import { auditLog } from "@/lib/audit";
import {
  channelIdeaMachinePrompt,
  enrichChannelKitKeywords,
  fallbackChannelKit,
  normalizeChannelKit,
  repairChannelKitForNewTopic,
  type ChannelIdeaMachineKit
} from "@/lib/channel-machine";
import { getUserChannel } from "@/lib/channels";
import { formatKeywordMetricsForPrompt, optionalSeoKeywordMetrics } from "@/lib/dataforseo";
import { jsonError } from "@/lib/http";
import { generateJson } from "@/lib/openrouter";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateChannelBrandImages, RunwareConfigurationError } from "@/lib/runware";
import { requireActiveWorkspace } from "@/lib/workspaces";

const CHANNEL_IDEA_MACHINE_SEED_LIMIT = 2000;

const ChannelIdeaMachineSchema = z.object({
  channelId: z.string().optional(),
  seed: z.string().trim().transform((value) => value.slice(0, CHANNEL_IDEA_MACHINE_SEED_LIMIT)).optional(),
  generateImages: z.boolean().default(false),
  surpriseMe: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const limit = checkRateLimit(`channel-machine:${user.id}`, 4, 60_000);
    if (!limit.ok) {
      return Response.json({ error: "Rate limit reached. Try again shortly." }, { status: 429 });
    }

    const input = ChannelIdeaMachineSchema.parse(await request.json());
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);
    const seedKeywords = seedKeywordCandidates(input.seed, channel.name, channel.description, input.surpriseMe);
    const initialMetrics = await optionalSeoKeywordMetrics({ userId: user.id, keywords: seedKeywords });

    let modelUsed = "starter fallback";
    let providerWarning: string | undefined;
    let kit: ChannelIdeaMachineKit;

    try {
      const result = await generateJson<unknown>({
        userId: user.id,
        workspaceId: workspace.id,
        passType: "DISCOVERY",
        messages: [
          {
            role: "user",
            content: channelIdeaMachinePrompt({
              currentChannelName: channel.name,
              seed: input.seed || "",
              keywordMetrics: initialMetrics.metrics,
              surpriseMe: input.surpriseMe
            })
          }
        ],
        temperature: 0.72,
        maxTokens: 7000
      });

      kit = normalizeChannelKit(result.data, initialMetrics.metrics);
      kit = repairChannelKitForNewTopic(kit, {
        currentChannelName: channel.name,
        seed: input.seed || "",
        metrics: initialMetrics.metrics
      });
      modelUsed = result.model;
    } catch (error) {
      kit = fallbackChannelKit({
        currentChannelName: channel.name,
        seed: input.seed || "",
        surpriseMe: input.surpriseMe,
        metrics: initialMetrics.metrics
      });
      providerWarning = `AI channel-kit generation was unavailable (${errorMessage(error)}), so a complete starter kit was loaded. Use Provider Test if this keeps happening.`;
    }

    const keywordMetrics = await optionalSeoKeywordMetrics({
      userId: user.id,
      keywords: kit.keywords.map((item) => item.keyword)
    });
    kit = enrichChannelKitKeywords(kit, keywordMetrics.metrics);
    const warnings = [providerWarning, visibleSeoWarning(initialMetrics.warning), visibleSeoWarning(keywordMetrics.warning)].filter(Boolean) as string[];
    if (warnings.length) kit.dataForSeoWarning = [...new Set(warnings)].join(" ");

    if (input.generateImages) {
      try {
        const images = await generateChannelBrandImages({
          userId: user.id,
          logoPrompt: kit.logoPrompt,
          bannerPrompt: kit.bannerPrompt
        });
        kit = {
          ...kit,
          logoImageUrl: images.logoImageUrl,
          bannerImageUrl: images.bannerImageUrl,
          imageModelUsed: images.modelUsed
        };
      } catch (error) {
        const message = error instanceof RunwareConfigurationError || error instanceof Error
          ? error.message
          : "Channel brand image generation failed.";
        kit = {
          ...kit,
          dataForSeoWarning: [kit.dataForSeoWarning, message].filter(Boolean).join(" ")
        };
      }
    }

    try {
      await auditLog({
        userId: user.id,
        workspaceId: workspace.id,
        action: "channel.idea_machine_generated",
        metadata: {
          channelId: channel.id,
          surpriseMe: input.surpriseMe,
          model: modelUsed,
          usedFallback: Boolean(providerWarning),
          keywordMetrics: formatKeywordMetricsForPrompt(keywordMetrics.metrics.slice(0, 5))
        }
      });
    } catch {
      // Audit failures should not block a generated channel kit.
    }

    return Response.json({ kit, modelUsed });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function visibleSeoWarning(warning?: string) {
  if (!warning || /not configured/i.test(warning)) return undefined;
  return warning;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown provider error";
}

function seedKeywordCandidates(seed = "", _channelName: string, _description?: string | null, surpriseMe = false) {
  if (seed.trim()) {
    return seed
      .split(/[,;\n.]/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter((item) => item.length >= 3)
      .slice(0, 40);
  }

  const candidates = surpriseMe ? [
    "true story documentary",
    "history documentary",
    "mystery documentary",
    "forgotten history",
    "long form storytelling",
    "documentary YouTube channel"
  ] : [
    "true story documentary",
    "forgotten history",
    "historical mysteries",
    "long form documentary",
    "archive documentary",
    "evidence based stories"
  ];
  return candidates.map((item) => item.replace(/\s+/g, " ").trim()).filter((item) => item.length >= 3).slice(0, 40);
}
