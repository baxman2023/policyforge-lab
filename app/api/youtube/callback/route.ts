import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { connectYoutubeChannel, exchangeYoutubeCode, publicAppOrigin, verifyYoutubeState } from "@/lib/youtube";

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return Response.redirect(new URL("/login", request.url));

    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) return Response.redirect(new URL(`/?youtube=${encodeURIComponent(error)}`, request.url));

    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) throw new Error("YouTube OAuth callback was missing code or state.");

    const state = verifyYoutubeState(stateRaw);
    if (state.userId !== userId) throw new Error("YouTube OAuth state does not match the signed-in user.");

    const token = await exchangeYoutubeCode({
      userId,
      origin: publicAppOrigin(request),
      code
    });
    await connectYoutubeChannel({
      userId,
      workspaceId: state.workspaceId,
      channelId: state.channelId,
      token
    });

    return Response.redirect(new URL("/?youtube=connected", request.url));
  } catch (error) {
    return jsonError(error, 400);
  }
}
