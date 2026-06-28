import type { ScriptDraft, StoryProject, ThumbnailAsset } from "@prisma/client";
import PDFDocument from "pdfkit";
import JSZip from "jszip";
import { isIP } from "node:net";
import { completeScriptForProject, latestBodyDraft } from "@/lib/content-pack";
import { slugify } from "@/lib/utils";

const MAX_IMAGE_BYTES = 18 * 1024 * 1024;
const BOOK_PAGE_SIZE: [number, number] = [432, 648];
const BOOK_MARGIN = 54;

type BookProjectForExport = Pick<StoryProject, "title" | "format" | "tone" | "narrationStyle" | "sponsorBlurb"> & {
  drafts: ScriptDraft[];
  thumbnails: ThumbnailAsset[];
};

type BookExportOptions = {
  authorName: string;
};

type BookSection = {
  title: string;
  chapterNumber?: number;
  body: string;
};

type ExportImage = {
  asset: ThumbnailAsset;
  buffer: Buffer;
  contentType: string;
  extension: string;
  chapterNumber: number;
};

export function isBookExportFormat(format: StoryProject["format"]) {
  return format === "SHORT_BOOK" || format === "LONG_BOOK";
}

export function bookExportFilename(projectTitle: string, extension: "pdf" | "epub") {
  return `${slugify(projectTitle) || "policyforge-book"}-illustrated-book.${extension}`;
}

export async function buildIllustratedBookPdf(project: BookProjectForExport, options: BookExportOptions) {
  const manuscript = bookManuscript(project);
  const sections = splitBookSections(project.title, manuscript);
  const images = await fetchBookImages(project.thumbnails);
  const sectionImages = assignImagesToSections(sections, images);

  const doc = new PDFDocument({
    size: BOOK_PAGE_SIZE,
    margins: {
      top: BOOK_MARGIN,
      bottom: BOOK_MARGIN,
      left: BOOK_MARGIN,
      right: BOOK_MARGIN
    },
    autoFirstPage: false,
    bufferPages: true,
    info: {
      Title: project.title,
      Author: options.authorName
    }
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  renderPdfTitlePage(doc, project, options.authorName);
  for (const [index, section] of sections.entries()) {
    renderPdfSection(doc, section, sectionImages[index] ?? []);
  }
  doc.end();

  return finished;
}

export async function buildIllustratedBookEpub(project: BookProjectForExport, options: BookExportOptions) {
  const manuscript = bookManuscript(project);
  const sections = splitBookSections(project.title, manuscript);
  const images = await fetchBookImages(project.thumbnails);
  const sectionImages = assignImagesToSections(sections, images);
  const zip = new JSZip();
  const id = `policyforge-${slugify(project.title) || "book"}-${Date.now()}`;
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

  const imageFiles = new Map<string, { path: string; mediaType: string }>();
  images.forEach((image, index) => {
    const fileName = `images/chapter-${image.chapterNumber}-${index + 1}.${image.extension}`;
    imageFiles.set(image.asset.id, { path: fileName, mediaType: image.contentType });
    zip.file(`OEBPS/${fileName}`, image.buffer);
  });

  zip.file("OEBPS/styles.css", epubStyles());
  zip.file("OEBPS/title.xhtml", titleXhtml(project, options.authorName));
  sections.forEach((section, index) => {
    zip.file(`OEBPS/chapter-${index + 1}.xhtml`, sectionXhtml(section, sectionImages[index] ?? [], imageFiles));
  });
  zip.file("OEBPS/nav.xhtml", navXhtml(project.title, sections));
  zip.file("OEBPS/content.opf", contentOpf({ id, title: project.title, authorName: options.authorName, updated: now, sections, images, imageFiles }));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

function bookManuscript(project: BookProjectForExport) {
  const script = completeScriptForProject(project).trim();
  if (script) return script;
  return latestBodyDraft(project.drafts)?.content.trim() || "";
}

function splitBookSections(title: string, manuscript: string): BookSection[] {
  const lines = manuscript.replace(/\r\n?/g, "\n").split("\n");
  const sections: BookSection[] = [];
  let current: BookSection = { title, body: "" };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = parseChapterHeading(line);
    if (heading) {
      if (current.body.trim() || sections.length === 0 && current.title !== title) {
        sections.push({ ...current, body: current.body.trim() });
      }
      current = {
        title: heading.title,
        chapterNumber: heading.chapterNumber,
        body: ""
      };
      continue;
    }
    current.body += `${line}\n`;
  }

  if (current.body.trim() || !sections.length) {
    sections.push({ ...current, body: current.body.trim() || manuscript.trim() });
  }

  return sections.filter((section) => section.body.trim() || section.title.trim());
}

function parseChapterHeading(line: string) {
  const normalized = line.replace(/^#{1,6}\s*/, "").trim();
  const match = normalized.match(/^(chapter|part|section)\s+([a-z]+|\d+)\s*[:.-]?\s*(.*)$/i);
  if (!match) return null;
  const chapterNumber = chapterNumberFromLabel(match[2]);
  if (!chapterNumber) return null;
  const suffix = match[3]?.trim();
  return {
    chapterNumber,
    title: `${capitalize(match[1])} ${titleCaseChapterNumber(chapterNumber)}${suffix ? `: ${suffix}` : ""}`
  };
}

function chapterNumberFromLabel(value: string) {
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    twentyone: 21,
    twentytwo: 22,
    twentythree: 23,
    twentyfour: 24
  };
  return words[value.toLowerCase().replace(/[\s-]+/g, "")] || null;
}

function titleCaseChapterNumber(value: number) {
  const words = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
    "Twenty",
    "Twenty-One",
    "Twenty-Two",
    "Twenty-Three",
    "Twenty-Four"
  ];
  return words[value] || String(value);
}

async function fetchBookImages(assets: ThumbnailAsset[]) {
  const imageAssets = [...assets]
    .filter((asset) => asset.imageUrl && /^https:\/\//i.test(asset.imageUrl))
    .sort((a, b) => a.variant - b.variant || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 48);

  const images: ExportImage[] = [];
  for (const asset of imageAssets) {
    try {
      const url = new URL(asset.imageUrl);
      if (!isSupportedBookImageUrl(url)) continue;
      const response = await fetch(asset.imageUrl, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
      if (!response.ok) continue;
      if (response.url && !isSupportedBookImageUrl(new URL(response.url))) continue;
      const contentType = normalizeImageContentType(response.headers.get("content-type"), asset.imageUrl);
      if (!contentType) continue;
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_IMAGE_BYTES) continue;
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_IMAGE_BYTES) continue;
      images.push({
        asset,
        buffer: Buffer.from(arrayBuffer),
        contentType,
        extension: extensionForContentType(contentType),
        chapterNumber: Math.max(1, Math.round(asset.variant || images.length + 1))
      });
    } catch {
      // Keep the export usable even if a remote image expires or temporarily fails.
    }
  }
  return images;
}

function normalizeImageContentType(contentType: string | null, url: string) {
  const clean = (contentType || "").split(";")[0]?.trim().toLowerCase();
  if (clean === "image/jpeg" || clean === "image/png") return clean;
  if (/\.png(?:\?|$)/i.test(url)) return "image/png";
  if (/\.(?:jpe?g)(?:\?|$)/i.test(url)) return "image/jpeg";
  return null;
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  return "jpg";
}

function isSupportedBookImageUrl(url: URL) {
  return url.protocol === "https:" && !isBlockedHostname(url.hostname);
}

function isBlockedHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) return isBlockedIpv4(host);
  if (ipVersion === 6) return isBlockedIpv6(host);
  return false;
}

function isBlockedIpv4(host: string) {
  const [a = 0, b = 0] = host.split(".").map((part) => Number(part));
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isBlockedIpv6(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80");
}

function assignImagesToSections(sections: BookSection[], images: ExportImage[]) {
  const assignments = sections.map(() => [] as ExportImage[]);
  if (!sections.length || !images.length) return assignments;

  const assignedImageIds = new Set<string>();
  images.forEach((image) => {
    const sectionIndex = sections.findIndex((section) => section.chapterNumber === image.chapterNumber);
    if (sectionIndex >= 0) {
      assignments[sectionIndex].push(image);
      assignedImageIds.add(image.asset.id);
    }
  });

  const unmatched = images.filter((image) => !assignedImageIds.has(image.asset.id));
  unmatched.forEach((image, index) => {
    const sectionIndex = Math.min(sections.length - 1, Math.floor((index * sections.length) / Math.max(1, unmatched.length)));
    assignments[sectionIndex].push(image);
  });

  return assignments.map((items) => [...items].sort((a, b) => a.chapterNumber - b.chapterNumber || a.asset.createdAt.getTime() - b.asset.createdAt.getTime()));
}

function renderPdfTitlePage(doc: PDFKit.PDFDocument, project: BookProjectForExport, authorName: string) {
  doc.addPage();
  const width = doc.page.width - BOOK_MARGIN * 2;
  doc.font("Times-Bold").fontSize(24).fillColor("#102428");
  doc.text(project.title, BOOK_MARGIN, 190, {
    width,
    align: "center"
  });
  doc.moveDown(1.4);
  doc.font("Times-Italic").fontSize(12).fillColor("#516164");
  doc.text(authorName, {
    width,
    align: "center"
  });
}

function renderPdfSection(doc: PDFKit.PDFDocument, section: BookSection, images: ExportImage[]) {
  doc.addPage();
  doc.font("Times-Bold").fontSize(18).fillColor("#102428");
  doc.text(section.title, { align: "center" });
  doc.moveDown(1);

  const paragraphs = section.body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  renderPdfImages(doc, images);
  for (const paragraph of paragraphs) {
    setPdfBodyFont(doc);
    if (doc.y > doc.page.height - BOOK_MARGIN - 80) doc.addPage();
    doc.text(paragraph.replace(/\n+/g, " "), {
      align: "justify",
      width: doc.page.width - BOOK_MARGIN * 2
    });
    doc.moveDown(0.65);
  }
}

function setPdfBodyFont(doc: PDFKit.PDFDocument) {
  doc.font("Times-Roman").fontSize(11).fillColor("#152426").lineGap(3);
}

function renderPdfImages(doc: PDFKit.PDFDocument, images: ExportImage[]) {
  for (const image of images) {
    renderPdfImage(doc, image);
  }
}

function renderPdfImage(doc: PDFKit.PDFDocument, image: ExportImage) {
  try {
    const maxWidth = doc.page.width - BOOK_MARGIN * 2;
    const maxHeight = 240;
    if (doc.y > doc.page.height - BOOK_MARGIN - maxHeight - 35) doc.addPage();
    doc.image(image.buffer, BOOK_MARGIN, doc.y, {
      fit: [maxWidth, maxHeight],
      align: "center",
      valign: "center"
    });
    doc.y += maxHeight + 8;
    doc.font("Times-Italic").fontSize(8).fillColor("#667477");
    doc.text(image.asset.title || `Illustration ${image.chapterNumber}`, BOOK_MARGIN, doc.y, {
      width: maxWidth,
      align: "center"
    });
    doc.moveDown(1.2);
  } catch {
    // PDFKit may reject an uncommon image encoding. Skip that asset and keep the book usable.
  }
}

function titleXhtml(project: BookProjectForExport, authorName: string) {
  return xhtmlDocument(project.title, `
    <section class="title-page">
      <h1>${escapeXml(project.title)}</h1>
      <p>${escapeXml(authorName)}</p>
    </section>
  `);
}

function sectionXhtml(section: BookSection, images: ExportImage[], imageFiles: Map<string, { path: string; mediaType: string }>) {
  const paragraphs = section.body
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const figureXhtml = (image: ExportImage) => {
    const file = imageFiles.get(image.asset.id);
    if (!file) return "";
    return `<figure>
      <img src="${escapeXml(file.path)}" alt="${escapeXml(image.asset.title || `Illustration for ${section.title}`)}"/>
      <figcaption>${escapeXml(image.asset.title || `Illustration ${image.chapterNumber}`)}</figcaption>
    </figure>`;
  };
  const content = [
    ...images.map(figureXhtml),
    ...paragraphs.map((paragraph) => `<p>${escapeXml(paragraph.replace(/\n+/g, " "))}</p>`)
  ].filter(Boolean).join("\n");

  return xhtmlDocument(section.title, `
    <section>
      <h1>${escapeXml(section.title)}</h1>
      ${content}
    </section>
  `);
}

function navXhtml(title: string, sections: BookSection[]) {
  const items = sections.map((section, index) => `<li><a href="chapter-${index + 1}.xhtml">${escapeXml(section.title)}</a></li>`).join("\n");
  return xhtmlDocument("Table of Contents", `
    <nav epub:type="toc" id="toc">
      <h1>${escapeXml(title)}</h1>
      <ol>
        <li><a href="title.xhtml">Title Page</a></li>
        ${items}
      </ol>
    </nav>
  `, true);
}

function contentOpf(input: {
  id: string;
  title: string;
  authorName: string;
  updated: string;
  sections: BookSection[];
  images: ExportImage[];
  imageFiles: Map<string, { path: string; mediaType: string }>;
}) {
  const chapterManifest = input.sections
    .map((_, index) => `<item id="chapter-${index + 1}" href="chapter-${index + 1}.xhtml" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const imageManifest = input.images
    .map((image, index) => {
      const file = input.imageFiles.get(image.asset.id);
      if (!file) return "";
      return `<item id="image-${index + 1}" href="${escapeXml(file.path)}" media-type="${escapeXml(file.mediaType)}"/>`;
    })
    .filter(Boolean)
    .join("\n    ");
  const spine = input.sections.map((_, index) => `<itemref idref="chapter-${index + 1}"/>`).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(input.id)}</dc:identifier>
    <dc:title>${escapeXml(input.title)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>${escapeXml(input.authorName)}</dc:creator>
    <meta property="dcterms:modified">${input.updated}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="styles.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${chapterManifest}
    ${imageManifest}
  </manifest>
  <spine>
    <itemref idref="title"/>
    ${spine}
  </spine>
</package>`;
}

function xhtmlDocument(title: string, body: string, includeEpubNamespace = false) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"${includeEpubNamespace ? ' xmlns:epub="http://www.idpf.org/2007/ops"' : ""}>
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${body}
</body>
</html>`;
}

function epubStyles() {
  return `body {
  font-family: Georgia, serif;
  line-height: 1.55;
  color: #152426;
}
h1 {
  page-break-before: always;
  text-align: center;
  margin: 2em 0 1.25em;
  font-size: 1.65em;
}
p {
  margin: 0 0 1em;
}
figure {
  margin: 1.2em 0 1.4em;
  text-align: center;
}
img {
  max-width: 100%;
  height: auto;
}
figcaption {
  color: #667477;
  font-size: 0.85em;
  font-style: italic;
}
.title-page {
  text-align: center;
  padding-top: 30%;
}`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
