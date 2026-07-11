import "server-only";
import { prisma } from "@/lib/prisma";

const OPPORTUNITIES = [
  { key: "texas-storm-season", month: 6, day: 1, title: "Texas storm season begins", description: "Prepare homeowners and drivers before severe-weather losses and renewal questions.", terms: /home|property|storm|flood|auto|texas/i, angle: "A pre-storm policy and documentation checklist for Texas households." },
  { key: "hurricane-peak", month: 9, day: 10, title: "Atlantic hurricane activity peak", description: "A useful planning point for Gulf Coast property, flood, auto, and business continuity education.", terms: /home|property|storm|flood|commercial|business|auto/i, angle: "What Houston-area families and businesses should document and review before a named storm." },
  { key: "back-to-school", month: 8, day: 1, title: "Back-to-school and teen driver season", description: "Household changes, student property, commuting, and newly licensed drivers create timely questions.", terms: /auto|driver|family|rent|home|umbrella/i, angle: "A Texas household insurance review before school and driving routines change." },
  { key: "small-business-week", month: 5, day: 4, title: "Small Business Week", description: "Timely commercial coverage, certificate, cyber, property, and continuity education.", terms: /business|commercial|contractor|liability|cyber|property/i, angle: "The insurance documents a Texas small business should organize before a quote or renewal." },
  { key: "national-preparedness", month: 9, day: 1, title: "National Preparedness Month", description: "Emergency planning, home inventories, business continuity, and claims documentation education.", terms: /home|property|storm|flood|business|commercial/i, angle: "Build a practical inventory and contact plan before a Texas emergency." },
  { key: "holiday-travel", month: 11, day: 15, title: "Holiday travel and home vacancy", description: "Travel, vehicle use, guests, valuables, and vacant-home precautions become timely.", terms: /auto|home|rent|umbrella|travel|valuable/i, angle: "Questions to review before holiday travel changes how a Texas household uses its home and vehicles." }
] as const;

export async function ensureEditorialCalendar(input: { userId: string; workspaceId: string; channelId: string; year?: number }) {
  const channel = await prisma.channel.findFirst({ where: { id: input.channelId, workspaceId: input.workspaceId } });
  if (!channel) throw new Error("Channel not found.");
  const year = input.year || new Date().getFullYear();
  const channelText = `${channel.name} ${channel.description || ""}`;
  for (const item of OPPORTUNITIES) {
    const relevant = item.terms.test(channelText);
    await prisma.editorialOpportunity.upsert({
      where: { workspaceId_channelId_opportunityKey: { workspaceId: input.workspaceId, channelId: channel.id, opportunityKey: `${year}:${item.key}` } },
      update: { relevance: relevant ? "RELEVANT" : "IRRELEVANT", relevanceReason: relevant ? "Matches this channel's stated audience and coverage lane." : "Kept visible for context, but it does not match this channel's primary purpose." },
      create: { userId: input.userId, workspaceId: input.workspaceId, channelId: channel.id, opportunityKey: `${year}:${item.key}`, title: item.title, description: item.description, opportunityDate: new Date(Date.UTC(year, item.month - 1, item.day, 15)), relevance: relevant ? "RELEVANT" : "IRRELEVANT", relevanceReason: relevant ? "Matches this channel's stated audience and coverage lane." : "Kept visible for context, but it does not match this channel's primary purpose.", suggestedAngle: relevant ? item.angle : null }
    });
  }
}

export function shortScheduleDates(longDate: Date) {
  const offsets = [-1, 0, 1, 2, 3, 5, 7, 10, 14];
  return offsets.map((days, index) => { const date = new Date(longDate); date.setDate(date.getDate() + days); date.setHours(index % 2 ? 19 : 12, 0, 0, 0); return date; });
}
