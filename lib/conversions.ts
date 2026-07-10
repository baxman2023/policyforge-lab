import "server-only";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUOTE_STARTED", "QUOTED", "BOUND", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function appOrigin() {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "")
    .trim()
    .replace(/\/+$/, "");
}

export function trackedCampaignUrl(slug: string, origin = appOrigin()) {
  return origin ? `${origin}/go/${encodeURIComponent(slug)}` : `/go/${encodeURIComponent(slug)}`;
}

export function publicLeadEndpoint(token: string, origin = appOrigin()) {
  return origin
    ? `${origin}/api/public/conversions/${encodeURIComponent(token)}/lead`
    : `/api/public/conversions/${encodeURIComponent(token)}/lead`;
}

export async function ensureConversionCampaign(input: {
  userId: string;
  workspaceId: string;
  channelId: string;
  storyProjectId: string;
  projectTitle: string;
  destinationUrl?: string | null;
  cta?: string | null;
}) {
  const existing = await prisma.conversionCampaign.findUnique({ where: { storyProjectId: input.storyProjectId } });
  const cta = input.cta?.trim() || "Call Baxter Insurance Agency, Inc. at 281-445-1381 or request a Texas insurance review.";
  if (existing) {
    return prisma.conversionCampaign.update({
      where: { id: existing.id },
      data: {
        name: input.projectTitle,
        cta,
        ...(input.destinationUrl !== undefined ? { destinationUrl: normalizeDestination(input.destinationUrl) } : {})
      }
    });
  }

  return prisma.conversionCampaign.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      storyProjectId: input.storyProjectId,
      name: input.projectTitle,
      slug: await uniqueCampaignSlug(input.projectTitle),
      publicToken: crypto.randomBytes(24).toString("base64url"),
      destinationUrl: normalizeDestination(input.destinationUrl),
      cta
    }
  });
}

export async function recordConversionEvent(input: {
  campaign: {
    id: string;
    userId: string;
    workspaceId: string;
    channelId: string;
    storyProjectId: string;
  };
  eventType: string;
  leadId?: string | null;
  visitorId?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return prisma.conversionEvent.create({
    data: {
      userId: input.campaign.userId,
      workspaceId: input.campaign.workspaceId,
      channelId: input.campaign.channelId,
      storyProjectId: input.campaign.storyProjectId,
      campaignId: input.campaign.id,
      leadId: input.leadId || null,
      eventType: input.eventType,
      visitorId: input.visitorId?.slice(0, 190) || null,
      referrer: input.referrer?.slice(0, 2000) || null,
      userAgent: input.userAgent?.slice(0, 2000) || null,
      metadata: input.metadata
    }
  });
}

export function conversionSummary(campaigns: Array<{
  id: string;
  leads: Array<{ status: string; boundPremium: Prisma.Decimal | null }>;
  events: Array<{ eventType: string }>;
}>) {
  const events = campaigns.flatMap((campaign) => campaign.events);
  const leads = campaigns.flatMap((campaign) => campaign.leads);
  const count = (eventType: string) => events.filter((event) => event.eventType === eventType).length;
  const clicks = count("LINK_CLICK");
  const submitted = leads.length;
  const quoted = leads.filter((lead) => ["QUOTED", "BOUND"].includes(lead.status)).length;
  const bound = leads.filter((lead) => lead.status === "BOUND").length;
  const boundPremium = leads.reduce((total, lead) => total + Number(lead.boundPremium || 0), 0);
  return {
    campaigns: campaigns.length,
    clicks,
    formStarts: count("FORM_START"),
    leads: submitted,
    quoted,
    bound,
    boundPremium,
    clickToLeadRate: clicks ? (submitted / clicks) * 100 : 0,
    leadToQuoteRate: submitted ? (quoted / submitted) * 100 : 0,
    quoteToBindRate: quoted ? (bound / quoted) * 100 : 0
  };
}

function normalizeDestination(value?: string | null) {
  const clean = value?.trim();
  if (!clean) return null;
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

async function uniqueCampaignSlug(title: string) {
  const base = slugify(title).slice(0, 64) || "texas-insurance-review";
  let slug = base;
  let index = 2;
  while (await prisma.conversionCampaign.findUnique({ where: { slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}
