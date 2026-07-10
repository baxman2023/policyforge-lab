import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { ensureConversionCampaign, conversionSummary, publicLeadEndpoint, trackedCampaignUrl } from "@/lib/conversions";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

const CampaignSchema = z.object({
  storyProjectId: z.string().min(1),
  destinationUrl: z.string().trim().max(2000).optional(),
  cta: z.string().trim().max(1200).optional()
});

export async function GET(request: Request) {
  try {
    const { workspace } = await requireActiveWorkspace();
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId") || undefined;
    const campaigns = await prisma.conversionCampaign.findMany({
      where: { workspaceId: workspace.id, ...(channelId ? { channelId } : {}) },
      include: {
        storyProject: { select: { title: true, youtubeVideoId: true } },
        leads: { orderBy: { createdAt: "desc" }, take: 100 },
        events: { orderBy: { createdAt: "desc" }, take: 1000 }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
    return Response.json({
      summary: conversionSummary(campaigns),
      campaigns: campaigns.map((campaign) => ({
        ...campaign,
        trackedUrl: trackedCampaignUrl(campaign.slug),
        leadEndpoint: publicLeadEndpoint(campaign.publicToken)
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = CampaignSchema.parse(await request.json());
    const project = await prisma.storyProject.findFirst({
      where: { id: input.storyProjectId, workspaceId: workspace.id }
    });
    if (!project?.channelId) throw new Error("Select a channel project before creating conversion tracking.");
    const campaign = await ensureConversionCampaign({
      userId: user.id,
      workspaceId: workspace.id,
      channelId: project.channelId,
      storyProjectId: project.id,
      projectTitle: project.title,
      destinationUrl: input.destinationUrl,
      cta: input.cta
    });
    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "conversion_campaign.saved", metadata: { campaignId: campaign.id, projectId: project.id } });
    return Response.json({
      campaign: {
        ...campaign,
        trackedUrl: trackedCampaignUrl(campaign.slug),
        leadEndpoint: publicLeadEndpoint(campaign.publicToken)
      }
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
