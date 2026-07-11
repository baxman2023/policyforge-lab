const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const text = line.trim(); if (!text || text.startsWith("#")) continue; const split = text.indexOf("="); if (split < 0) continue; const key = text.slice(0, split).trim(); const value = text.slice(split + 1).trim().replace(/^['"]|['"]$/g, ""); if (!process.env[key]) process.env[key] = value; }

function decrypt(payload) { const [iv, tag, data] = payload.split(":"); const key = crypto.createHash("sha256").update(process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "").digest(); const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64")); decipher.setAuthTag(Buffer.from(tag, "base64")); return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8"); }
function hasEnv(name) { return fs.existsSync(envPath) && new RegExp(`^${name}=`, "m").test(fs.readFileSync(envPath, "utf8")); }
function appendEnv(name, value) { if (!value || hasEnv(name)) return; fs.appendFileSync(envPath, `\n${name}=${JSON.stringify(value)}\n`, { mode: 0o600 }); }

async function main() {
  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findUnique({ where: { email: "keithbax@gmail.com" }, include: { settings: true } });
    if (admin) {
      await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
      await prisma.userSettings.upsert({ where: { userId: admin.id }, create: { userId: admin.id, alwaysFinishScripts: true }, update: { alwaysFinishScripts: true } });
      if (admin.settings?.youtubeClientId && admin.settings.youtubeClientSecretEncrypted) {
        appendEnv("GOOGLE_CLIENT_ID", admin.settings.youtubeClientId);
        appendEnv("GOOGLE_CLIENT_SECRET", decrypt(admin.settings.youtubeClientSecretEncrypted));
      }
    }
    await prisma.userSettings.updateMany({ data: { defaultModel: "anthropic/claude-sonnet-5", discoveryModel: "anthropic/claude-sonnet-5", dossierModel: "anthropic/claude-sonnet-5", structureModel: "anthropic/claude-sonnet-5", draftingModel: "anthropic/claude-sonnet-5", critiqueModel: "openai/gpt-5.6-luna", rewriteModel: "anthropic/claude-sonnet-5", openAiModel: "gpt-5.6-luna" } });
    console.log(`Post-fork upgrade applied: admin=${Boolean(admin)} googleOAuth=${hasEnv("GOOGLE_CLIENT_ID") && hasEnv("GOOGLE_CLIENT_SECRET")}`);
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(`Post-fork upgrade failed: ${error.message}`); process.exit(1); });
