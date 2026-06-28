import { Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(190),
  password: z.string().min(8).max(200),
  inviteToken: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const input = RegisterSchema.parse(await request.json());
    const email = input.email.toLowerCase();
    let user: { id: string; email: string | null; role: UserRole } | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        user = await prisma.$transaction(
          async (tx) => {
            const existing = await tx.user.findUnique({ where: { email } });
            if (existing) return null;
            const invite = input.inviteToken
              ? await tx.workspaceInvite.findFirst({
                  where: {
                    token: input.inviteToken,
                    acceptedAt: null,
                    expiresAt: { gt: new Date() }
                  }
                })
              : null;
            if (input.inviteToken && !invite) {
              throw new Error("This invite is expired or invalid.");
            }
            if (invite && invite.email !== email) {
              throw new Error("This invite was created for a different email address.");
            }

            const adminCount = await tx.user.count({ where: { role: UserRole.ADMIN } });
            const created = await tx.user.create({
              data: {
                name: input.name,
                email,
                passwordHash: await hashPassword(input.password),
                role: adminCount === 0 ? UserRole.ADMIN : UserRole.USER,
                activeWorkspaceId: invite?.workspaceId
              },
              select: { id: true, email: true, role: true }
            });
            if (invite) {
              await tx.workspaceMembership.upsert({
                where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: created.id } },
                create: { workspaceId: invite.workspaceId, userId: created.id, role: invite.role },
                update: { role: invite.role }
              });
              await tx.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
            }
            return created;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return Response.json({ error: "An account already exists for this email." }, { status: 409 });
        }
        throw error;
      }
    }

    if (!user) {
      return Response.json({ error: "An account already exists for this email." }, { status: 409 });
    }

    await auditLog({ userId: user.id, action: "auth.registered", metadata: { role: user.role } });
    return Response.json({ user });
  } catch (error) {
    return jsonError(error, 400);
  }
}
