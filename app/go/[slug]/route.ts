import { recordConversionEvent } from "@/lib/conversions";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const campaign = await prisma.conversionCampaign.findFirst({ where: { slug, status: "ACTIVE" } });
  if (!campaign) return Response.redirect(new URL("https://baxterinsuranceagency.com", request.url), 302);
  await recordConversionEvent({
    campaign,
    eventType: "LINK_CLICK",
    visitorId: new URL(request.url).searchParams.get("vid"),
    referrer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
    metadata: Object.fromEntries(new URL(request.url).searchParams.entries())
  });
  const destination = campaign.destinationUrl || "https://baxterinsuranceagency.com";
  const url = new URL(destination);
  url.searchParams.set("utm_source", "youtube");
  url.searchParams.set("utm_medium", "video");
  url.searchParams.set("utm_campaign", campaign.slug);
  url.searchParams.set("utm_content", campaign.storyProjectId);
  return Response.redirect(url, 302);
}
