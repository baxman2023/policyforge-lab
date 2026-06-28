import "server-only";
import { ScriptPassType, StoryProjectFormat, type ScriptDraft, type StoryIdea, type StoryProject, type ThumbnailAsset } from "@prisma/client";
import { completeScriptForProject, latestDraftForPass } from "@/lib/content-pack";
import { parsePublishingPack, type PublishingPack } from "@/lib/publishing-pack";
import { getWordPressCredentials } from "@/lib/settings";
import { slugify } from "@/lib/utils";

type ProjectForWordPress = StoryProject & {
  storyIdea?: StoryIdea | null;
  drafts: ScriptDraft[];
  thumbnails: ThumbnailAsset[];
};

type WordPressCredentials = {
  siteUrl: string;
  username: string;
  applicationPassword: string;
};

type UploadedImage = {
  id: number;
  sourceUrl: string;
  altText: string;
  caption: string;
  placement: string;
};

type WordPressPostResponse = {
  id?: number;
  link?: string;
  status?: string;
  slug?: string;
  message?: string;
};

type WordPressMediaResponse = {
  id?: number;
  source_url?: string;
  message?: string;
};

type WordPressTagResponse = {
  id?: number;
  name?: string;
  message?: string;
};

export async function createWordPressArticleDraft(input: {
  userId: string;
  project: ProjectForWordPress;
}) {
  if (input.project.format !== StoryProjectFormat.ARTICLE) {
    throw new Error("WordPress draft upload is only available for Article projects.");
  }

  const credentials = await getWordPressCredentials(input.userId);
  if (!credentials) {
    throw new Error("Add and test WordPress credentials in Settings before uploading an article draft.");
  }

  const packDraft = latestDraftForPass(input.project.drafts, ScriptPassType.PUBLISHING_PACK);
  const pack = packDraft ? parsePublishingPack(packDraft.content) : null;
  const article = completeScriptForProject(input.project).trim();
  if (!article) {
    throw new Error("Create the final article before uploading a WordPress draft.");
  }

  const articleImages = input.project.thumbnails
    .filter((asset) => /^Article image \d+:/i.test(asset.title || "") || /^Article image placement:/im.test(asset.prompt))
    .sort((a, b) => a.variant - b.variant || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, 6);
  const uploadedImages = await uploadArticleImages(credentials, input.project.title, articleImages);
  const content = articleToWordPressHtml(article, uploadedImages);
  const tags = pack ? await findOrCreateTags(credentials, pack.tags.slice(0, 12)) : [];
  const title = articleTitle(input.project, pack);
  const slug = pack?.seoPack?.urlSlug ? slugify(pack.seoPack.urlSlug) : slugify(title);
  const excerpt = pack?.seoPack?.metaDescription || pack?.description || input.project.storyIdea?.summary || "";

  const response = await fetch(`${credentials.siteUrl}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: wordpressAuthHeader(credentials),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      title,
      content,
      status: "draft",
      slug,
      excerpt,
      ...(uploadedImages[0]?.id ? { featured_media: uploadedImages[0].id } : {}),
      ...(tags.length ? { tags } : {})
    })
  });
  const payload = (await response.json().catch(() => ({}))) as WordPressPostResponse;
  if (!response.ok || !payload.id) {
    throw new Error(payload.message || `WordPress draft upload failed with status ${response.status}.`);
  }

  return {
    postId: payload.id,
    status: payload.status || "draft",
    link: payload.link || "",
    editUrl: `${credentials.siteUrl}/wp-admin/post.php?post=${payload.id}&action=edit`,
    imageCount: uploadedImages.length,
    tagCount: tags.length
  };
}

async function uploadArticleImages(credentials: WordPressCredentials, title: string, assets: ThumbnailAsset[]) {
  const uploaded: UploadedImage[] = [];
  for (const asset of assets) {
    const metadata = articleImageMetadata(asset);
    const imageResponse = await fetch(asset.imageUrl);
    if (!imageResponse.ok) continue;
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const filename = `${slugify(title)}-${asset.variant || uploaded.length + 1}.${extension}`;

    const mediaResponse = await fetch(`${credentials.siteUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: wordpressAuthHeader(credentials),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": contentType,
        Accept: "application/json"
      },
      body: imageBuffer
    });
    const media = (await mediaResponse.json().catch(() => ({}))) as WordPressMediaResponse;
    if (!mediaResponse.ok || !media.id || !media.source_url) continue;

    await fetch(`${credentials.siteUrl}/wp-json/wp/v2/media/${media.id}`, {
      method: "POST",
      headers: {
        Authorization: wordpressAuthHeader(credentials),
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        alt_text: metadata.altText,
        caption: metadata.caption,
        title: metadata.caption || metadata.altText || title
      })
    }).catch(() => undefined);

    uploaded.push({
      id: media.id,
      sourceUrl: media.source_url,
      altText: metadata.altText,
      caption: metadata.caption,
      placement: metadata.placement
    });
  }
  return uploaded;
}

async function findOrCreateTags(credentials: WordPressCredentials, tags: string[]) {
  const ids: number[] = [];
  for (const tag of tags.map((item) => item.trim()).filter(Boolean)) {
    try {
      const searchResponse = await fetch(`${credentials.siteUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tag)}&per_page=20`, {
        headers: {
          Authorization: wordpressAuthHeader(credentials),
          Accept: "application/json"
        }
      });
      const found = (await searchResponse.json().catch(() => [])) as WordPressTagResponse[];
      const existing = Array.isArray(found)
        ? found.find((item) => item.name?.trim().toLowerCase() === tag.toLowerCase())
        : undefined;
      if (existing?.id) {
        ids.push(existing.id);
        continue;
      }

      const createResponse = await fetch(`${credentials.siteUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: {
          Authorization: wordpressAuthHeader(credentials),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ name: tag })
      });
      const created = (await createResponse.json().catch(() => ({}))) as WordPressTagResponse;
      if (createResponse.ok && created.id) ids.push(created.id);
    } catch {
      continue;
    }
  }
  return [...new Set(ids)];
}

function articleTitle(project: ProjectForWordPress, pack: PublishingPack | null) {
  return pack?.seoPack?.h1 || pack?.titles[0]?.title || project.title;
}

function articleImageMetadata(asset: ThumbnailAsset) {
  const prompt = asset.prompt || "";
  const placementFromTitle = asset.title?.replace(/^Article image \d+:\s*/i, "").trim();
  return {
    placement: placementFromTitle || lineValue(prompt, "Article image placement") || `Image ${asset.variant}`,
    altText: lineValue(prompt, "Alt text") || asset.title || "Article image",
    caption: lineValue(prompt, "Caption") || ""
  };
}

function lineValue(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^${escaped}:\\s*(.*)$`, "im"));
  return match?.[1]?.trim() || "";
}

function articleToWordPressHtml(markdown: string, images: UploadedImage[]) {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  const parts: string[] = [];
  const paragraph: string[] = [];
  const inserted = new Set<number>();
  let orderedImageIndex = 0;
  let paragraphCount = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    parts.push(`<p>${paragraph.map(escapeHtml).join("<br />")}</p>`);
    paragraph.length = 0;
    paragraphCount += 1;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(4, heading[1].length);
      const headingText = heading[2].trim();
      parts.push(`<h${level}>${escapeHtml(headingText)}</h${level}>`);
      const imageIndex = imageIndexForHeading(images, inserted, headingText, orderedImageIndex);
      if (imageIndex >= 0) {
        inserted.add(imageIndex);
        orderedImageIndex = Math.max(orderedImageIndex, imageIndex + 1);
        parts.push(imageFigure(images[imageIndex]));
      }
      continue;
    }

    paragraph.push(line);
    if (paragraphCount >= 2 && !inserted.size && images[0]) {
      flushParagraph();
      inserted.add(0);
      orderedImageIndex = 1;
      parts.push(imageFigure(images[0]));
    }
  }

  flushParagraph();

  images.forEach((image, index) => {
    if (!inserted.has(index)) parts.push(imageFigure(image));
  });

  return parts.join("\n\n");
}

function imageIndexForHeading(images: UploadedImage[], inserted: Set<number>, heading: string, fallbackIndex: number) {
  const normalizedHeading = normalizePlacement(heading);
  const matchedIndex = images.findIndex((image, index) => {
    if (inserted.has(index)) return false;
    const placement = normalizePlacement(image.placement);
    return Boolean(placement && normalizedHeading && (placement.includes(normalizedHeading) || normalizedHeading.includes(placement)));
  });
  if (matchedIndex >= 0) return matchedIndex;

  if (fallbackIndex < images.length && !inserted.has(fallbackIndex)) return fallbackIndex;
  return images.findIndex((_image, index) => !inserted.has(index));
}

function imageFigure(image: UploadedImage) {
  const caption = image.caption.trim();
  return [
    "<figure class=\"wp-block-image size-large\">",
    `<img src="${escapeAttribute(image.sourceUrl)}" alt="${escapeAttribute(image.altText)}" />`,
    caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "",
    "</figure>"
  ].filter(Boolean).join("");
}

function normalizePlacement(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(after|before|under|below|above|h1|h2|h3|h4|section|heading|title|image|placement)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wordpressAuthHeader(credentials: WordPressCredentials) {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.applicationPassword}`).toString("base64")}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}
