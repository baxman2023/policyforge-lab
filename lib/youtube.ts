import "server-only";
import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getYoutubeOAuthCredentials } from "@/lib/settings";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly"
];

type YoutubeTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type YoutubeChannelResponse = {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    statistics?: {
      subscriberCount?: string;
      viewCount?: string;
      videoCount?: string;
    };
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }>;
};

type YoutubePlaylistItemsResponse = {
  nextPageToken?: string;
  items?: Array<{
    snippet?: {
      title?: string;
      publishedAt?: string;
      thumbnails?: Record<string, { url?: string }>;
      resourceId?: { videoId?: string };
    };
    contentDetails?: { videoId?: string };
  }>;
};

type YoutubeAnalyticsResponse = {
  columnHeaders?: Array<{ name: string }>;
  rows?: Array<Array<string | number>>;
};

type VideoMetadata = {
  youtubeVideoId: string;
  title: string;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
};

type VideoMetricInput = VideoMetadata & {
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
  impressions: number;
  impressionCtr: number;
  cardImpressions: number;
  cardClicks: number;
  cardClickRate: number;
  trafficSources: Prisma.InputJsonValue;
  searchTerms: Prisma.InputJsonValue;
  retentionCurve: Prisma.InputJsonValue;
  rawMetrics: Prisma.InputJsonObject;
};

export function youtubeRedirectUri(origin: string) {
  return `${origin.replace(/\/+$/, "")}/api/youtube/callback`;
}

export function publicAppOrigin(request: Request) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (configured?.trim()) return configured.trim().replace(/\/+$/, "");

  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || url.host;
  let protocol = forwardedProto || url.protocol.replace(":", "") || "https";

  if (/cloudwaysapps\.com$/i.test(host)) protocol = "https";
  return `${protocol}://${host}`.replace(/\/+$/, "");
}

export function youtubeAuthUrl(input: {
  origin: string;
  userId: string;
  workspaceId?: string | null;
  channelId: string;
  clientId: string;
}) {
  const state = signYoutubeState({
    userId: input.userId,
    workspaceId: input.workspaceId || null,
    channelId: input.channelId,
    createdAt: Date.now()
  });
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: youtubeRedirectUri(input.origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: YOUTUBE_SCOPES.join(" "),
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYoutubeCode(input: {
  userId: string;
  origin: string;
  code: string;
}) {
  const credentials = await getYoutubeOAuthCredentials(input.userId);
  if (!credentials) throw new Error("Add YouTube OAuth Client ID and Client Secret in Settings first.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: youtubeRedirectUri(input.origin)
    })
  });
  const payload = await response.json().catch(() => ({})) as YoutubeTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `YouTube OAuth failed with status ${response.status}.`);
  }
  return payload;
}

export async function refreshYoutubeAccessToken(userId: string, refreshToken: string) {
  const credentials = await getYoutubeOAuthCredentials(userId);
  if (!credentials) throw new Error("Add YouTube OAuth Client ID and Client Secret in Settings first.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await response.json().catch(() => ({})) as YoutubeTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || `YouTube token refresh failed with status ${response.status}.`);
  }
  return payload;
}

export async function connectYoutubeChannel(input: {
  userId: string;
  workspaceId?: string | null;
  channelId: string;
  token: YoutubeTokenResponse;
}) {
  if (!input.token.access_token) throw new Error("YouTube did not return an access token.");
  const youtubeChannel = await fetchYoutubeChannel(input.token.access_token);
  const refreshToken = input.token.refresh_token;
  const existing = await prisma.youtubeConnection.findUnique({ where: { channelId: input.channelId } });

  return prisma.youtubeConnection.upsert({
    where: { channelId: input.channelId },
    create: {
      userId: input.userId,
      workspaceId: input.workspaceId || null,
      channelId: input.channelId,
      youtubeChannelId: youtubeChannel.id,
      youtubeChannelTitle: youtubeChannel.title,
      accessTokenEncrypted: encryptSecret(input.token.access_token),
      refreshTokenEncrypted: refreshToken ? encryptSecret(refreshToken) : null,
      tokenExpiresAt: tokenExpiry(input.token.expires_in),
      scopes: input.token.scope || YOUTUBE_SCOPES.join(" "),
      nextSyncAt: new Date()
    },
    update: {
      userId: input.userId,
      workspaceId: input.workspaceId || null,
      youtubeChannelId: youtubeChannel.id,
      youtubeChannelTitle: youtubeChannel.title,
      accessTokenEncrypted: encryptSecret(input.token.access_token),
      ...(refreshToken ? { refreshTokenEncrypted: encryptSecret(refreshToken) } : existing?.refreshTokenEncrypted ? {} : { refreshTokenEncrypted: null }),
      tokenExpiresAt: tokenExpiry(input.token.expires_in),
      scopes: input.token.scope || YOUTUBE_SCOPES.join(" "),
      syncEnabled: true,
      nextSyncAt: new Date()
    }
  });
}

export async function syncYoutubeConnection(connectionId: string) {
  const connection = await prisma.youtubeConnection.findUnique({
    where: { id: connectionId }
  });
  if (!connection) throw new Error("YouTube connection not found.");

  const periodEnd = startOfUtcDay(new Date());
  periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodStart.getUTCDate() - 6);

  const run = await prisma.youtubeSyncRun.create({
    data: {
      userId: connection.userId,
      workspaceId: connection.workspaceId,
      youtubeConnectionId: connection.id,
      status: "RUNNING",
      periodStart,
      periodEnd
    }
  });

  try {
    const accessToken = await validAccessToken(connection);
    const channel = await fetchYoutubeChannel(accessToken);
    const videos = await fetchRecentUploads(accessToken, channel.uploadsPlaylistId, 50);
    const metrics = videos.length
      ? await fetchAnalyticsForVideos(accessToken, periodStart, periodEnd, videos)
      : [];

    for (const metric of metrics) {
      await prisma.youtubeVideoMetric.upsert({
        where: {
          youtubeConnectionId_youtubeVideoId_periodStart_periodEnd: {
            youtubeConnectionId: connection.id,
            youtubeVideoId: metric.youtubeVideoId,
            periodStart,
            periodEnd
          }
        },
        create: {
          userId: connection.userId,
          workspaceId: connection.workspaceId,
          channelId: connection.channelId,
          youtubeConnectionId: connection.id,
          ...metric,
          periodStart,
          periodEnd
        },
        update: {
          title: metric.title,
          publishedAt: metric.publishedAt,
          thumbnailUrl: metric.thumbnailUrl,
          views: metric.views,
          estimatedMinutesWatched: metric.estimatedMinutesWatched,
          averageViewDuration: metric.averageViewDuration,
          averageViewPercentage: metric.averageViewPercentage,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          subscribersGained: metric.subscribersGained,
          subscribersLost: metric.subscribersLost,
          impressions: metric.impressions,
          impressionCtr: metric.impressionCtr,
          cardImpressions: metric.cardImpressions,
          cardClicks: metric.cardClicks,
          cardClickRate: metric.cardClickRate,
          trafficSources: metric.trafficSources,
          searchTerms: metric.searchTerms,
          retentionCurve: metric.retentionCurve,
          rawMetrics: metric.rawMetrics
        }
      });
    }

    const allRecentMetrics = await prisma.youtubeVideoMetric.findMany({
      where: {
        youtubeConnectionId: connection.id,
        periodEnd: { gte: daysAgo(90) }
      },
      orderBy: { periodEnd: "desc" },
      take: 300
    });
    const recommendations = buildYoutubeRecommendations(allRecentMetrics.map((metric) => ({
      title: metric.title,
      views: metric.views,
      estimatedMinutesWatched: metric.estimatedMinutesWatched,
      averageViewDuration: metric.averageViewDuration,
      averageViewPercentage: metric.averageViewPercentage,
      likes: metric.likes,
      comments: metric.comments,
      subscribersGained: metric.subscribersGained,
      impressions: metric.impressions,
      impressionCtr: metric.impressionCtr
    })));

    await prisma.youtubeRecommendation.updateMany({
      where: { youtubeConnectionId: connection.id, status: "OPEN" },
      data: { status: "ARCHIVED" }
    });
    for (const recommendation of recommendations) {
      await prisma.youtubeRecommendation.create({
        data: {
          userId: connection.userId,
          workspaceId: connection.workspaceId,
          channelId: connection.channelId,
          youtubeConnectionId: connection.id,
          syncRunId: run.id,
          ...recommendation
        }
      });
    }

    await prisma.youtubeConnection.update({
      where: { id: connection.id },
      data: {
        youtubeChannelId: channel.id,
        youtubeChannelTitle: channel.title,
        lastSyncedAt: new Date(),
        nextSyncAt: daysFromNow(7)
      }
    });
    await prisma.youtubeSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        videosSynced: metrics.length,
        recommendationCount: recommendations.length
      }
    });

    return { videosSynced: metrics.length, recommendationCount: recommendations.length };
  } catch (error) {
    await prisma.youtubeSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "YouTube sync failed."
      }
    });
    throw error;
  }
}

export async function validAccessToken(connection: {
  id: string;
  userId: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
}) {
  if (connection.accessTokenEncrypted && connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 120_000) {
    return decryptSecret(connection.accessTokenEncrypted);
  }
  if (!connection.refreshTokenEncrypted) throw new Error("Reconnect YouTube. The saved connection does not include a refresh token.");
  const refreshed = await refreshYoutubeAccessToken(connection.userId, decryptSecret(connection.refreshTokenEncrypted));
  if (!refreshed.access_token) throw new Error("YouTube did not return a refreshed access token.");
  await prisma.youtubeConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encryptSecret(refreshed.access_token),
      tokenExpiresAt: tokenExpiry(refreshed.expires_in),
      scopes: refreshed.scope || undefined
    }
  });
  return refreshed.access_token;
}

export async function createYoutubeUploadSession(input: {
  connection: {
    id: string;
    userId: string;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  };
  title: string;
  description: string;
  tags?: string[];
  contentType: string;
  contentLength: number;
  privacyStatus?: "private" | "unlisted" | "public";
  publishAt?: Date | null;
}) {
  const accessToken = await validAccessToken(input.connection);
  const scheduled = input.publishAt && input.publishAt.getTime() > Date.now() ? input.publishAt : null;
  const privacyStatus = scheduled ? "private" : input.privacyStatus || "private";
  const params = new URLSearchParams({ uploadType: "resumable", part: "snippet,status", notifySubscribers: "false" });
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/videos?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.contentType,
      "X-Upload-Content-Length": String(input.contentLength)
    },
    body: JSON.stringify({
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        tags: (input.tags || []).filter(Boolean).slice(0, 50),
        categoryId: "27",
        defaultLanguage: "en"
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true,
        ...(scheduled ? { publishAt: scheduled.toISOString() } : {})
      }
    })
  });
  const responseText = await response.text();
  if (!response.ok) {
    const payload = responseText ? JSON.parse(responseText) as { error?: { message?: string } } : {};
    throw new Error(payload.error?.message || `YouTube upload initialization failed with status ${response.status}.`);
  }
  const uploadUrl = response.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube did not return a resumable upload URL.");
  return { uploadUrl, privacyStatus, publishAt: scheduled };
}

export async function setYoutubeThumbnail(input: {
  connection: {
    id: string;
    userId: string;
    accessTokenEncrypted: string | null;
    refreshTokenEncrypted: string | null;
    tokenExpiresAt: Date | null;
  };
  youtubeVideoId: string;
  imageUrl: string;
}) {
  const imageResponse = await fetch(input.imageUrl);
  if (!imageResponse.ok) throw new Error("PolicyForge could not download the selected thumbnail.");
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  if (!/^image\/(?:jpeg|png)$/i.test(contentType)) throw new Error("YouTube thumbnails must be JPEG or PNG images.");
  const image = await imageResponse.arrayBuffer();
  if (image.byteLength > 2 * 1024 * 1024) throw new Error("YouTube thumbnails must be 2 MB or smaller.");
  const accessToken = await validAccessToken(input.connection);
  const params = new URLSearchParams({ videoId: input.youtubeVideoId, uploadType: "media" });
  const response = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?${params.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
    body: image
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `YouTube thumbnail upload failed with status ${response.status}.`);
  return payload;
}

export function verifyYoutubeState(value: string) {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new Error("Invalid YouTube OAuth state.");
  const expected = hmac(encoded);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid YouTube OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
    userId: string;
    workspaceId?: string | null;
    channelId: string;
    createdAt: number;
  };
  if (!parsed.userId || !parsed.channelId || Date.now() - parsed.createdAt > 30 * 60_000) {
    throw new Error("Expired YouTube OAuth state.");
  }
  return parsed;
}

async function fetchYoutubeChannel(accessToken: string) {
  const params = new URLSearchParams({
    part: "snippet,statistics,contentDetails",
    mine: "true"
  });
  const response = await youtubeFetch<YoutubeChannelResponse>(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`, accessToken);
  const item = response.items?.[0];
  if (!item?.id) throw new Error("No YouTube channel was returned for this Google account.");
  return {
    id: item.id,
    title: item.snippet?.title || "YouTube Channel",
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads || "",
    subscriberCount: toNumber(item.statistics?.subscriberCount),
    viewCount: toNumber(item.statistics?.viewCount),
    videoCount: toNumber(item.statistics?.videoCount)
  };
}

async function fetchRecentUploads(accessToken: string, uploadsPlaylistId: string, maxVideos: number) {
  if (!uploadsPlaylistId) return [];
  const videos: VideoMetadata[] = [];
  let pageToken = "";
  while (videos.length < maxVideos) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, maxVideos - videos.length))
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await youtubeFetch<YoutubePlaylistItemsResponse>(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, accessToken);
    for (const item of response.items ?? []) {
      const youtubeVideoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "";
      if (!youtubeVideoId) continue;
      videos.push({
        youtubeVideoId,
        title: item.snippet?.title || "Untitled YouTube Video",
        publishedAt: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
        thumbnailUrl: bestThumbnail(item.snippet?.thumbnails)
      });
    }
    pageToken = response.nextPageToken || "";
    if (!pageToken) break;
  }
  return videos;
}

async function fetchAnalyticsForVideos(accessToken: string, periodStart: Date, periodEnd: Date, videos: VideoMetadata[]): Promise<VideoMetricInput[]> {
  const videoMap = new Map(videos.map((video) => [video.youtubeVideoId, video]));
  const metrics = [
    "views",
    "estimatedMinutesWatched",
    "averageViewDuration",
    "averageViewPercentage",
    "likes",
    "comments",
    "shares",
    "subscribersGained",
    "subscribersLost",
    "impressions",
    "impressionClickThroughRate",
    "cardImpressions",
    "cardClicks",
    "cardClickRate"
  ];
  let response: YoutubeAnalyticsResponse;
  try {
    response = await analyticsReport(accessToken, periodStart, periodEnd, videos, metrics);
  } catch {
    response = await analyticsReport(accessToken, periodStart, periodEnd, videos, metrics.filter((metric) => !/^(?:impression|card)/.test(metric)));
  }

  const [trafficByVideo, searchByVideo, retentionByVideo] = await Promise.all([
    fetchTrafficSources(accessToken, periodStart, periodEnd, videos).catch(() => new Map<string, Prisma.InputJsonValue>()),
    fetchSearchTerms(accessToken, periodStart, periodEnd, videos).catch(() => new Map<string, Prisma.InputJsonValue>()),
    fetchRetentionCurves(accessToken, periodStart, periodEnd, videos.slice(0, 12)).catch(() => new Map<string, Prisma.InputJsonValue>())
  ]);

  const headers = response.columnHeaders?.map((header) => header.name) ?? [];
  const output: VideoMetricInput[] = [];
  for (const row of response.rows ?? []) {
    const raw = Object.fromEntries(headers.map((name, index) => [name, row[index] ?? 0])) as Prisma.InputJsonObject;
    const videoId = String(raw.video || "");
    const metadata = videoMap.get(videoId);
    if (!metadata) continue;
    output.push({
      ...metadata,
      views: toNumber(raw.views),
      estimatedMinutesWatched: toNumber(raw.estimatedMinutesWatched),
      averageViewDuration: toNumber(raw.averageViewDuration),
      averageViewPercentage: toFloat(raw.averageViewPercentage),
      likes: toNumber(raw.likes),
      comments: toNumber(raw.comments),
      shares: toNumber(raw.shares),
      subscribersGained: toNumber(raw.subscribersGained),
      subscribersLost: toNumber(raw.subscribersLost),
      impressions: toNumber(raw.impressions),
      impressionCtr: toFloat(raw.impressionClickThroughRate),
      cardImpressions: toNumber(raw.cardImpressions),
      cardClicks: toNumber(raw.cardClicks),
      cardClickRate: toFloat(raw.cardClickRate),
      trafficSources: trafficByVideo.get(videoId) ?? [],
      searchTerms: searchByVideo.get(videoId) ?? [],
      retentionCurve: retentionByVideo.get(videoId) ?? [],
      rawMetrics: {
        ...raw,
        trafficSources: trafficByVideo.get(videoId) ?? [],
        searchTerms: searchByVideo.get(videoId) ?? [],
        retentionCurve: retentionByVideo.get(videoId) ?? []
      }
    });
  }
  return output;
}

async function fetchTrafficSources(accessToken: string, periodStart: Date, periodEnd: Date, videos: VideoMetadata[]) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: formatDate(periodStart),
    endDate: formatDate(periodEnd),
    dimensions: "video,insightTrafficSourceType",
    metrics: "views,estimatedMinutesWatched",
    filters: `video==${videos.map((video) => video.youtubeVideoId).join(",")}`,
    sort: "-estimatedMinutesWatched",
    maxResults: "200"
  });
  const response = await youtubeFetch<YoutubeAnalyticsResponse>(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, accessToken);
  return groupReportByVideo(response, "insightTrafficSourceType");
}

async function fetchSearchTerms(accessToken: string, periodStart: Date, periodEnd: Date, videos: VideoMetadata[]) {
  const output = new Map<string, Prisma.InputJsonValue>();
  for (const video of videos.slice(0, 20)) {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: formatDate(periodStart),
      endDate: formatDate(periodEnd),
      dimensions: "insightTrafficSourceDetail",
      metrics: "views,estimatedMinutesWatched",
      filters: `video==${video.youtubeVideoId};insightTrafficSourceType==YT_SEARCH`,
      sort: "-views",
      maxResults: "25"
    });
    try {
      const response = await youtubeFetch<YoutubeAnalyticsResponse>(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, accessToken);
      output.set(video.youtubeVideoId, reportRows(response));
    } catch {
      output.set(video.youtubeVideoId, []);
    }
  }
  return output;
}

async function fetchRetentionCurves(accessToken: string, periodStart: Date, periodEnd: Date, videos: VideoMetadata[]) {
  const output = new Map<string, Prisma.InputJsonValue>();
  for (const video of videos) {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: formatDate(periodStart),
      endDate: formatDate(periodEnd),
      dimensions: "elapsedVideoTimeRatio",
      metrics: "audienceWatchRatio,relativeRetentionPerformance",
      filters: `video==${video.youtubeVideoId}`,
      sort: "elapsedVideoTimeRatio",
      maxResults: "200"
    });
    try {
      const response = await youtubeFetch<YoutubeAnalyticsResponse>(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, accessToken);
      output.set(video.youtubeVideoId, reportRows(response));
    } catch {
      output.set(video.youtubeVideoId, []);
    }
  }
  return output;
}

function reportRows(response: YoutubeAnalyticsResponse): Prisma.InputJsonValue {
  const headers = response.columnHeaders?.map((header) => header.name) ?? [];
  return (response.rows ?? []).map((row) => Object.fromEntries(headers.map((name, index) => [name, row[index] ?? 0]))) as Prisma.InputJsonValue;
}

function groupReportByVideo(response: YoutubeAnalyticsResponse, labelField: string) {
  const headers = response.columnHeaders?.map((header) => header.name) ?? [];
  const output = new Map<string, Prisma.InputJsonValue>();
  const grouped = new Map<string, Array<Record<string, string | number>>>();
  for (const row of response.rows ?? []) {
    const record = Object.fromEntries(headers.map((name, index) => [name, row[index] ?? 0])) as Record<string, string | number>;
    const videoId = String(record.video || "");
    if (!videoId) continue;
    const values = grouped.get(videoId) ?? [];
    values.push({ label: record[labelField] || "Unknown", views: record.views || 0, estimatedMinutesWatched: record.estimatedMinutesWatched || 0 });
    grouped.set(videoId, values);
  }
  for (const [videoId, values] of grouped.entries()) output.set(videoId, values as Prisma.InputJsonValue);
  return output;
}

async function analyticsReport(accessToken: string, periodStart: Date, periodEnd: Date, videos: VideoMetadata[], metrics: string[]) {
  const params = new URLSearchParams({
    ids: "channel==MINE",
    startDate: formatDate(periodStart),
    endDate: formatDate(periodEnd),
    dimensions: "video",
    metrics: metrics.join(","),
    filters: `video==${videos.map((video) => video.youtubeVideoId).join(",")}`,
    sort: "-estimatedMinutesWatched",
    maxResults: "200"
  });
  return youtubeFetch<YoutubeAnalyticsResponse>(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, accessToken);
}

async function youtubeFetch<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await response.text();
  const payload = (text ? JSON.parse(text) : {}) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message || `YouTube API failed with status ${response.status}.`);
  }
  return payload;
}

function buildYoutubeRecommendations(metrics: Array<{
  title: string;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  likes: number;
  comments: number;
  subscribersGained: number;
  impressions: number;
  impressionCtr: number;
}>) {
  if (!metrics.length) {
    return [{
      category: "Launch",
      priority: "High",
      title: "Publish and sync the first videos",
      insight: "No YouTube performance data is synced yet.",
      recommendation: "Publish at least three long-form videos, then run YouTube sync so Baxter Growth Lab can identify retention, CTR, and subscriber patterns.",
      evidence: {}
    }];
  }

  const byWatchTime = [...metrics].sort((a, b) => b.estimatedMinutesWatched - a.estimatedMinutesWatched);
  const bySubs = [...metrics].sort((a, b) => b.subscribersGained - a.subscribersGained);
  const byRetention = [...metrics].filter((item) => item.views >= 25).sort((a, b) => b.averageViewPercentage - a.averageViewPercentage);
  const highCtrLowRetention = [...metrics]
    .filter((item) => item.impressionCtr >= 4 && item.averageViewPercentage > 0 && item.averageViewPercentage < 35)
    .sort((a, b) => b.impressionCtr - a.impressionCtr)[0];
  const lowCtrHighRetention = [...metrics]
    .filter((item) => item.impressions >= 100 && item.impressionCtr > 0 && item.impressionCtr < 3 && item.averageViewPercentage >= 40)
    .sort((a, b) => b.averageViewPercentage - a.averageViewPercentage)[0];

  const output = [
    {
      category: "Watch Time",
      priority: "High",
      title: "Double down on the strongest watch-time pattern",
      insight: `"${byWatchTime[0].title}" produced the most synced watch time with ${Math.round(byWatchTime[0].estimatedMinutesWatched / 60)} hours.`,
      recommendation: "Create the next three ideas from the same promise, pacing style, and viewer question before branching into a new lane.",
      evidence: byWatchTime[0]
    },
    {
      category: "Subscribers",
      priority: bySubs[0].subscribersGained > 0 ? "High" : "Medium",
      title: "Use subscriber gain as the north-star tie breaker",
      insight: `"${bySubs[0].title}" gained ${bySubs[0].subscribersGained} subscribers in the synced period.`,
      recommendation: "When choosing between two video ideas, favor the topic/title/thumbnail pattern that converts viewers into subscribers, not only raw views.",
      evidence: bySubs[0]
    }
  ];

  if (byRetention[0]) {
    output.push({
      category: "Retention",
      priority: "High",
      title: "Protect the best retention structure",
      insight: `"${byRetention[0].title}" held ${byRetention[0].averageViewPercentage.toFixed(1)}% average viewed percentage.`,
      recommendation: "Use its hook timing, section lengths, cliffhangers, and payoff rhythm as the template for the next script outline.",
      evidence: byRetention[0]
    });
  }
  if (highCtrLowRetention) {
    output.push({
      category: "Script",
      priority: "Medium",
      title: "Fix click promise mismatch",
      insight: `"${highCtrLowRetention.title}" has strong CTR but weaker retention.`,
      recommendation: "Keep the thumbnail/title curiosity style, but make the first 60 seconds pay off the exact promise faster and remove slow context before the first reveal.",
      evidence: highCtrLowRetention
    });
  }
  if (lowCtrHighRetention) {
    output.push({
      category: "Thumbnail",
      priority: "Medium",
      title: "Repackage videos viewers actually finish",
      insight: `"${lowCtrHighRetention.title}" retained viewers well but underperformed on CTR.`,
      recommendation: "Generate three new thumbnail/title tests for this pattern: clearer visual question, fewer words, and a stronger curiosity gap.",
      evidence: lowCtrHighRetention
    });
  }

  return output.slice(0, 6);
}

function signYoutubeState(value: Record<string, unknown>) {
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

function hmac(value: string) {
  return crypto
    .createHmac("sha256", process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "policyforge-lab-dev-secret")
    .update(value)
    .digest("base64url");
}

function tokenExpiry(expiresIn?: number) {
  return new Date(Date.now() + Math.max(60, expiresIn || 3600) * 1000);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysAgo(days: number) {
  const value = startOfUtcDay(new Date());
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}

function daysFromNow(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function toFloat(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function bestThumbnail(thumbnails?: Record<string, { url?: string }>) {
  return thumbnails?.maxres?.url || thumbnails?.standard?.url || thumbnails?.high?.url || thumbnails?.medium?.url || thumbnails?.default?.url || null;
}
