import { z } from "zod";
import { jsonError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { consumePasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";

const CompleteResetSchema = z.object({
  email: z.string().trim().email().max(190),
  token: z.string().min(20).max(300),
  password: z.string().min(8).max(200)
});

export async function POST(request: Request) {
  try {
    const input = CompleteResetSchema.parse(await request.json());
    const reset = await consumePasswordResetToken(input.email, input.token);
    if (!reset) {
      return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: reset.email },
      select: { id: true, disabledAt: true }
    });

    if (!user) {
      return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
    }
    if (user.disabledAt) {
      return Response.json({ error: "This account is disabled. Ask an admin to re-enable it." }, { status: 403 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) }
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
