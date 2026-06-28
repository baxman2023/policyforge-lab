import { jsonError } from "@/lib/http";
import { isIP } from "node:net";

const MAX_ASSET_BYTES = 30 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get("url") || "";
    const filename = safeFilename(searchParams.get("filename") || "policyforge-asset.jpg");
    const url = new URL(rawUrl);
    if (!isSupportedAssetUrl(url)) {
      return Response.json({ error: "Unsupported asset URL." }, { status: 400 });
    }

    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      return Response.json({ error: `Asset download failed with status ${response.status}.` }, { status: 502 });
    }
    if (response.url && !isSupportedAssetUrl(new URL(response.url))) {
      return Response.json({ error: "Asset URL redirected to an unsupported location." }, { status: 400 });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") {
      return Response.json({ error: "Asset URL did not return an image." }, { status: 400 });
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_ASSET_BYTES) {
      return Response.json({ error: "Asset image is too large to download here." }, { status: 413 });
    }

    const body = await response.arrayBuffer();
    if (!body.byteLength) {
      return Response.json({ error: "Asset URL returned an empty image." }, { status: 502 });
    }
    if (body.byteLength > MAX_ASSET_BYTES) {
      return Response.json({ error: "Asset image is too large to download here." }, { status: 413 });
    }

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

function isSupportedAssetUrl(url: URL) {
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

function safeFilename(value: string) {
  const clean = value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return clean || "policyforge-asset.jpg";
}
