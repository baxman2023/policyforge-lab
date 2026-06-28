import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { getUserChannel } from "@/lib/channels";
import { FORGE_NICHES } from "@/lib/forge-niches";
import { jsonError } from "@/lib/http";
import { requireActiveWorkspace } from "@/lib/workspaces";

const ForgeNichesSchema = z.object({
  channelId: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ForgeNichesSchema.parse(await request.json());
    const channel = await getUserChannel(user.id, workspace.id, input.channelId);

    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "channel.forge_niches_loaded",
      metadata: { channelId: channel.id, count: FORGE_NICHES.length }
    });

    const rankedNiches = [...FORGE_NICHES].sort((first, second) => {
      if (second.monetizationScore !== first.monetizationScore) {
        return second.monetizationScore - first.monetizationScore;
      }
      return first.name.localeCompare(second.name);
    });

    return Response.json({
      niches: rankedNiches.map((niche, index) => ({
        title: niche.name,
        description: `${niche.title} — ${niche.description}`,
        whyHotThisMonth: `${niche.monetizationTier}. Prioritized by advertiser safety, CPM potential, repeatable topics, and likely watch time.`,
        bestViewerPromise: niche.viewerPromise,
        monetizationRank: index + 1,
        monetizationScore: niche.monetizationScore,
        monetizationTier: niche.monetizationTier,
        monetizationRationale: niche.monetizationRationale,
        seedPrompt: [
          `${niche.name} — ${niche.title}`,
          niche.description,
          `Business promise: ${niche.viewerPromise}`,
          `Agency revenue rank: ${niche.monetizationScore}/10 (${niche.monetizationTier}). ${niche.monetizationRationale}`,
          `Starter angles: ${niche.starterAngles.join("; ")}`
        ].join("\n"),
        nicheFocus: niche.nicheFocus,
        tone: niche.tone,
        category: niche.category,
        sourceType: niche.sourceType,
        keywords: niche.keywords,
        starterAngles: niche.starterAngles
      })),
      monthLabel: "Baxter Insurance Catalog",
      modelUsed: "fixed private catalog"
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
