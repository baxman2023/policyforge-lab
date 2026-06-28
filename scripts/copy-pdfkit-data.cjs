const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "node_modules", "pdfkit", "js", "data");
const searchRoots = [
  path.join(root, ".next", "server", "app"),
  path.join(root, ".next", "standalone", ".next", "server", "app")
];

if (!fs.existsSync(sourceDir)) {
  throw new Error(`PDFKit data directory not found: ${sourceDir}`);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
  return files;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target);
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

const targetDirs = new Set();

for (const searchRoot of searchRoots) {
  for (const file of walk(searchRoot)) {
    const contents = fs.readFileSync(file, "utf8");
    if (contents.includes("/data/Helvetica.afm") || contents.includes("/data/Times-Roman.afm")) {
      targetDirs.add(path.join(path.dirname(file), "data"));
    }
  }
}

for (const targetDir of targetDirs) {
  copyDir(sourceDir, targetDir);
}

console.log(`Copied PDFKit font data to ${targetDirs.size} bundled route director${targetDirs.size === 1 ? "y" : "ies"}.`);
