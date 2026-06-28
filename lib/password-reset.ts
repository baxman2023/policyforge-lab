import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const RESET_IDENTIFIER_PREFIX = "password-reset:";
const RESET_TTL_MINUTES = 60;

export function passwordResetIdentifier(email: string) {
  return `${RESET_IDENTIFIER_PREFIX}${email.trim().toLowerCase()}`;
}

export async function createPasswordResetToken(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const identifier = passwordResetIdentifier(normalizedEmail);
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires }
  });

  return {
    email: normalizedEmail,
    token,
    expires,
    resetPath: `/reset-password?email=${encodeURIComponent(normalizedEmail)}&token=${encodeURIComponent(token)}`
  };
}

export async function consumePasswordResetToken(email: string, token: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const identifier = passwordResetIdentifier(normalizedEmail);
  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || record.identifier !== identifier || record.expires < new Date()) {
    return null;
  }

  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
  return { email: normalizedEmail };
}
