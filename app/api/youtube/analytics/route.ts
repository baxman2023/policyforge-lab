import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId");
    const connection = channelId
      ? await prisma.youtubeConnection.findFirst({
          where: { userId: user.id, workspaceId: workspace.id, channelId },
          include: {
            syncRuns: { orderBy: { startedAt: "desc" }, take: 5 },
            recommendations: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 8 }
          }
        })
      : await prisma.youtubeConnection.findFirst({
          where: { userId: user.id, workspaceId: workspace.id },
          include: {
            syncRuns: { orderBy: { startedAt: "desc" }, take: 5 },
            recommendations: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 8 }
          },
          orderBy: { updatedAt: "desc" }
        });
    const connections = await prisma.youtubeConnection.findMany({
      where: { userId: user.id, workspaceId: workspace.id },
      include: {
        channel: { select: { id: true, name: true } },
        syncRuns: { orderBy: { startedAt: "desc" }, take: 1 }
      },
      orderBy: { updatedAt: "desc" }
    });
    const connectionSummaries = connections.map((item) => ({
      id: item.id,
      channelId: item.channelId,
      channelName: item.channel.name,
      youtubeChannelId: item.youtubeChannelId,
      youtubeChannelTitle: item.youtubeChannelTitle,
      lastSyncedAt: item.lastSyncedAt,
      nextSyncAt: item.nextSyncAt,
      syncEnabled: item.syncEnabled,
      latestSyncStatus: item.syncRuns[0]?.status ?? null
    }));

    if (!connection) {
      return Response.json({
        connected: false,
        connection: null,
        connections: connectionSummaries,
        summary: emptySummary(),
        videos: [],
        recommendations: [],
        syncRuns: []
      });
    }

    const latestPeriod = await prisma.youtubeVideoMetric.findFirst({
      where: { youtubeConnectionId: connection.id },
      orderBy: { periodEnd: "desc" },
      select: { periodStart: true, periodEnd: true }
    });
    const currentMetrics = latestPeriod
      ? await prisma.youtubeVideoMetric.findMany({
          where: {
            youtubeConnectionId: connection.id,
            periodStart: latestPeriod.periodStart,
            periodEnd: latestPeriod.periodEnd
          },
          orderBy: { estimatedMinutesWatched: "desc" },
          take: 20
        })
      : [];
    const yearMetrics = await prisma.youtubeVideoMetric.findMany({
      where: {
        youtubeConnectionId: connection.id,
        periodEnd: { gte: daysAgo(365) }
      },
      orderBy: { periodEnd: "desc" },
      take: 1000
    });

    return Response.json({
      connected: true,
      connection: {
        id: connection.id,
        channelId: connection.channelId,
        youtubeChannelId: connection.youtubeChannelId,
        youtubeChannelTitle: connection.youtubeChannelTitle,
        lastSyncedAt: connection.lastSyncedAt,
        nextSyncAt: connection.nextSyncAt,
        syncEnabled: connection.syncEnabled
      },
      syncHealth: syncHealthForConnection(connection),
      connections: connectionSummaries,
      summary: summarizeMetrics(currentMetrics, yearMetrics),
      videos: currentMetrics.map((metric) => ({
        id: metric.id,
        youtubeVideoId: metric.youtubeVideoId,
        title: metric.title,
        publishedAt: metric.publishedAt,
        thumbnailUrl: metric.thumbnailUrl,
        views: metric.views,
        estimatedMinutesWatched: metric.estimatedMinutesWatched,
        watchHours: metric.estimatedMinutesWatched / 60,
        averageViewDuration: metric.averageViewDuration,
        averageViewPercentage: metric.averageViewPercentage,
        likes: metric.likes,
        comments: metric.comments,
        subscribersGained: metric.subscribersGained,
        impressions: metric.impressions,
        impressionCtr: metric.impressionCtr,
        cardImpressions: metric.cardImpressions,
        cardClicks: metric.cardClicks,
        cardClickRate: metric.cardClickRate,
        trafficSources: metric.trafficSources,
        searchTerms: metric.searchTerms,
        retentionCurve: metric.retentionCurve
      })),
      recommendations: connection.recommendations.map((item) => ({
        id: item.id,
        category: item.category,
        priority: item.priority,
        title: item.title,
        insight: item.insight,
        recommendation: item.recommendation,
        evidence: item.evidence,
        createdAt: item.createdAt
      })),
      syncRuns: connection.syncRuns.map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        videosSynced: run.videosSynced,
        recommendationCount: run.recommendationCount,
        errorMessage: run.errorMessage
      }))
    });
  } catch (error) {
    return jsonError(error);
  }
}

function syncHealthForConnection(connection: {
  syncEnabled: boolean;
  lastSyncedAt: Date | null;
  nextSyncAt: Date | null;
  syncRuns: Array<{ status: string; errorMessage: string | null; startedAt: Date }>;
}) {
  const latestRun = connection.syncRuns[0];
  const stale = !connection.lastSyncedAt || Date.now() - connection.lastSyncedAt.getTime() > 8 * 24 * 60 * 60 * 1000;
  return {
    status: !connection.syncEnabled ? "PAUSED" : latestRun?.status === "FAILED" ? "FAILED" : stale ? "STALE" : "HEALTHY",
    stale,
    lastSyncedAt: connection.lastSyncedAt,
    nextSyncAt: connection.nextSyncAt,
    latestError: latestRun?.status === "FAILED" ? latestRun.errorMessage : null
  };
}

function summarizeMetrics(
  currentMetrics: Array<{
    views: number;
    estimatedMinutesWatched: number;
    averageViewDuration: number;
    averageViewPercentage: number;
    likes: number;
    comments: number;
    subscribersGained: number;
    subscribersLost: number;
    impressions: number;
    impressionCtr: number;
  }>,
  yearMetrics: Array<{
    views: number;
    estimatedMinutesWatched: number;
    subscribersGained: number;
    subscribersLost: number;
  }>
) {
  const totals = currentMetrics.reduce((acc, metric) => ({
    views: acc.views + metric.views,
    watchMinutes: acc.watchMinutes + metric.estimatedMinutesWatched,
    likes: acc.likes + metric.likes,
    comments: acc.comments + metric.comments,
    subscribersGained: acc.subscribersGained + metric.subscribersGained,
    subscribersLost: acc.subscribersLost + metric.subscribersLost,
    impressions: acc.impressions + metric.impressions,
    weightedCtr: acc.weightedCtr + (metric.impressions * metric.impressionCtr),
    weightedRetention: acc.weightedRetention + (metric.views * metric.averageViewPercentage),
    weightedDuration: acc.weightedDuration + (metric.views * metric.averageViewDuration)
  }), {
    views: 0,
    watchMinutes: 0,
    likes: 0,
    comments: 0,
    subscribersGained: 0,
    subscribersLost: 0,
    impressions: 0,
    weightedCtr: 0,
    weightedRetention: 0,
    weightedDuration: 0
  });
  const year = yearMetrics.reduce((acc, metric) => ({
    views: acc.views + metric.views,
    watchMinutes: acc.watchMinutes + metric.estimatedMinutesWatched,
    subscribers: acc.subscribers + metric.subscribersGained - metric.subscribersLost
  }), { views: 0, watchMinutes: 0, subscribers: 0 });

  return {
    currentViews: totals.views,
    currentWatchHours: totals.watchMinutes / 60,
    currentLikes: totals.likes,
    currentComments: totals.comments,
    currentSubscribersNet: totals.subscribersGained - totals.subscribersLost,
    averageCtr: totals.impressions ? totals.weightedCtr / totals.impressions : 0,
    averageRetention: totals.views ? totals.weightedRetention / totals.views : 0,
    averageViewDuration: totals.views ? totals.weightedDuration / totals.views : 0,
    annualWatchHours: year.watchMinutes / 60,
    annualSubscribersNet: year.subscribers,
    monetization: {
      watchHoursTo4000: Math.max(0, 4000 - year.watchMinutes / 60),
      subscribersTo1000: Math.max(0, 1000 - year.subscribers),
      watchHoursTo3000: Math.max(0, 3000 - year.watchMinutes / 60),
      subscribersTo500: Math.max(0, 500 - year.subscribers)
    }
  };
}

function emptySummary() {
  return {
    currentViews: 0,
    currentWatchHours: 0,
    currentLikes: 0,
    currentComments: 0,
    currentSubscribersNet: 0,
    averageCtr: 0,
    averageRetention: 0,
    averageViewDuration: 0,
    annualWatchHours: 0,
    annualSubscribersNet: 0,
    monetization: {
      watchHoursTo4000: 4000,
      subscribersTo1000: 1000,
      watchHoursTo3000: 3000,
      subscribersTo500: 500
    }
  };
}

function daysAgo(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value;
}
