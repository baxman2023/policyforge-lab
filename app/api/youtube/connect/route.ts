import { jsonError } from "@/lib/http";
import { getUserChannel } from "@/lib/channels";
import { getYoutubeOAuthCredentials } from "@/lib/settings";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { publicAppOrigin, youtubeAuthUrl } from "@/lib/youtube";

export async function GET(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const url = new URL(request.url);
    const channelId = url.searchParams.get("channelId") || undefined;
    const channel = await getUserChannel(user.id, workspace.id, channelId);
    const credentials = await getYoutubeOAuthCredentials(user.id);
    if (!credentials) {
      return Response.redirect(new URL("/?youtube=missing-credentials", request.url));
    }
    return Response.redirect(youtubeAuthUrl({
      origin: publicAppOrigin(request),
      userId: user.id,
      workspaceId: workspace.id,
      channelId: channel.id,
      clientId: credentials.clientId
    }));
  } catch (error) {
    return jsonError(error, 400);
  }
}
