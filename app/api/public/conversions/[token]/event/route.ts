import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordConversionEvent } from "@/lib/conversions";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const EventSchema = z.object({
  eventType: z.enum(["FORM_START", "CTA_CLICK", "PHONE_CLICK"]),
  visitorId: z.string().trim().max(190).optional(),
  content: z.string().trim().max(190).optional()
});

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const rate = checkRateLimit(`conversion-event:${token}`, 120, 60_000);
    if (!rate.ok) return new Response(null, { status: 429, headers: corsHeaders() });
    const input = EventSchema.parse(await request.json());
    const campaign = await prisma.conversionCampaign.findFirst({ where: { publicToken: token, status: "ACTIVE" } });
    if (!campaign) return new Response(null, { status: 404, headers: corsHeaders() });
    await recordConversionEvent({
      campaign,
      eventType: input.eventType,
      visitorId: input.visitorId,
      referrer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
      metadata: { content: input.content || "" }
    });
    return Response.json({ ok: true }, { headers: corsHeaders() });
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
