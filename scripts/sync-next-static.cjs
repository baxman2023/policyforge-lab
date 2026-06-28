const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, ".next", "static");
const target = path.join(root, "_next", "static");
const publicSource = path.join(root, "public");
const standalonePublicTarget = path.join(root, ".next", "standalone", "public");

if (!fs.existsSync(source)) {
  console.error("Missing .next/static. Run next build before syncing public assets.");
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });

if (fs.existsSync(publicSource)) {
  fs.rmSync(standalonePublicTarget, { recursive: true, force: true });
  fs.mkdirSync(standalonePublicTarget, { recursive: true });
  fs.cpSync(publicSource, standalonePublicTarget, { recursive: true });

  for (const entry of fs.readdirSync(publicSource)) {
    fs.cpSync(path.join(publicSource, entry), path.join(root, entry), { recursive: true });
  }
}

console.log(`Synced Next static assets to ${path.relative(root, target)}`);
console.log("Synced public assets for Cloudways standalone and web-root serving");
