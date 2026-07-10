import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { recordConversionEvent } from "@/lib/conversions";

const PublicLeadSchema = z.object({
  name: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(190).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  zipCode: z.string().trim().max(16).optional(),
  product: z.string().trim().max(120).optional(),
  message: z.string().trim().max(3000).optional(),
  visitorId: z.string().trim().max(190).optional(),
  content: z.string().trim().max(190).optional(),
  company: z.string().max(0).optional()
}).refine((value) => Boolean(value.email || value.phone), { message: "Enter an email address or phone number." });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rate = checkRateLimit(`public-lead:${token}:${forwarded}`, 8, 15 * 60_000);
    if (!rate.ok) return Response.json({ error: "Too many submissions. Please call 281-445-1381." }, { status: 429, headers: corsHeaders() });
    const input = PublicLeadSchema.parse(await request.json());
    const campaign = await prisma.conversionCampaign.findFirst({ where: { publicToken: token, status: "ACTIVE" } });
    if (!campaign) return Response.json({ error: "This quote campaign is not available." }, { status: 404, headers: corsHeaders() });
    const lead = await prisma.conversionLead.create({
      data: {
        userId: campaign.userId,
        workspaceId: campaign.workspaceId,
        channelId: campaign.channelId,
        storyProjectId: campaign.storyProjectId,
        campaignId: campaign.id,
        name: input.name || null,
        email: input.email || null,
        phone: input.phone || null,
        zipCode: input.zipCode || null,
        product: input.product || null,
        message: input.message || null,
        content: input.content || null
      }
    });
    await recordConversionEvent({
      campaign,
      leadId: lead.id,
      eventType: "LEAD_SUBMITTED",
      visitorId: input.visitorId,
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
      metadata: { product: input.product || "", zipCode: input.zipCode || "" }
    });
    return Response.json({ ok: true, leadId: lead.id, message: "Thank you. Baxter Insurance Agency will follow up about your Texas insurance request." }, { headers: corsHeaders() });
  } catch (error) {
    const response = jsonError(error, 400);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store"
  };
}
