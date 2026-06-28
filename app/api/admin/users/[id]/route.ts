import { UserRole } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const ActionSchema = z.object({
  action: z.enum(["disable", "enable", "make_admin", "make_user"])
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    if (id === admin.id) {
      return Response.json({ error: "You cannot change your own admin account here." }, { status: 400 });
    }

    const { action } = ActionSchema.parse(await request.json());
    const data =
      action === "disable"
        ? { disabledAt: new Date() }
        : action === "enable"
          ? { disabledAt: null }
          : action === "make_admin"
            ? { role: UserRole.ADMIN }
            : { role: UserRole.USER };

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { ideas: true, projects: true, generationLogs: true } }
      }
    });

    await auditLog({ userId: admin.id, action: `admin.user.${action}`, metadata: { targetUserId: id } });
    return Response.json({ user });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    if (id === admin.id) {
      return Response.json({ error: "You cannot delete your own admin account." }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });
    await auditLog({ userId: admin.id, action: "admin.user.deleted", metadata: { targetUserId: id } });
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
