import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { LEAD_STATUSES, recordConversionEvent } from "@/lib/conversions";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

const LeadPatchSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  quotedPremium: z.number().nonnegative().nullable().optional(),
  boundPremium: z.number().nonnegative().nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { id } = await context.params;
    const input = LeadPatchSchema.parse(await request.json());
    const existing = await prisma.conversionLead.findFirst({
      where: { id, workspaceId: workspace.id },
      include: { campaign: true }
    });
    if (!existing) return Response.json({ error: "Lead not found." }, { status: 404 });
    const lead = await prisma.conversionLead.update({ where: { id }, data: input });
    if (input.status && input.status !== existing.status) {
      await recordConversionEvent({ campaign: existing.campaign, leadId: lead.id, eventType: input.status });
    }
    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "conversion_lead.updated", metadata: { leadId: lead.id, status: lead.status } });
    return Response.json({ lead });
  } catch (error) {
    return jsonError(error, 400);
  }
}
