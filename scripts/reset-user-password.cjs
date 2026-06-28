#!/usr/bin/env node
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { PrismaClient, UserRole } = require("@prisma/client");

const scrypt = promisify(crypto.scrypt);
const prisma = new PrismaClient();

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] || "";
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(key).toString("base64url")}`;
}

async function main() {
  const email = (argValue("--email") || process.env.TSL_RESET_EMAIL || "").trim().toLowerCase();
  const password = argValue("--password") || process.env.TSL_RESET_PASSWORD || "";

  if (!password || password.length < 8) {
    throw new Error("Provide a new password with at least 8 characters using --password or TSL_RESET_PASSWORD.");
  }

  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: "asc" }
    });

  if (!user) {
    throw new Error(email ? `No user found for ${email}.` : "No admin user found.");
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      disabledAt: null,
      role: user.role === UserRole.ADMIN ? UserRole.ADMIN : user.role
    }
  });

  await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});

  console.log(`Password reset for ${user.email || user.id}.`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
