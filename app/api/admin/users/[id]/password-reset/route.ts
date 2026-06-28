import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { createPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true }
    });

    if (!user?.email) {
      return Response.json({ error: "This user does not have an email address." }, { status: 400 });
    }

    const reset = await createPasswordResetToken(user.email);
    const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const resetUrl = new URL(reset.resetPath, origin).toString();

    await auditLog({
      userId: admin.id,
      action: "admin.user.password_reset_link_created",
      metadata: { targetUserId: id }
    });

    return Response.json({
      resetPath: reset.resetPath,
      resetUrl,
      expires: reset.expires.toISOString()
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
