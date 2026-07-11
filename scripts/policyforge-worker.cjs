const fs = require("node:fs");
const path = require("node:path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) { const text = line.trim(); if (!text || text.startsWith("#")) continue; const split = text.indexOf("="); if (split < 0) continue; const key = text.slice(0, split).trim(); const value = text.slice(split + 1).trim().replace(/^['"]|['"]$/g, ""); if (!process.env[key]) process.env[key] = value; }

const port = process.env.PORT || "3138";
const secret = process.env.AUTOMATION_WORKER_SECRET;
const concurrency = Math.max(1, Math.min(3, Number(process.env.WORKER_CONCURRENCY || 3)));
let running = true;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function slot(index) {
  const workerId = `policyforge-${process.pid}-${index}`;
  while (running) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/internal/automation/tick`, { method: "POST", headers: { "x-worker-secret": secret || "", "x-worker-id": workerId }, signal: AbortSignal.timeout(14 * 60_000) });
      const payload = await response.json().catch(() => ({}));
      if (!payload.claimed) await sleep(1500);
      else if (!response.ok && response.status !== 202) await sleep(5000);
    } catch { await sleep(3000); }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { running = false; });
if (!secret) { console.error("AUTOMATION_WORKER_SECRET is required."); process.exit(1); }
Promise.all(Array.from({ length: concurrency }, (_, index) => slot(index))).catch(() => process.exit(1));
