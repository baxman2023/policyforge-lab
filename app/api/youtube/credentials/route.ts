import { z } from "zod";
import { jsonError } from "@/lib/http";
import { saveUserSettings } from "@/lib/settings";
import { requireActiveWorkspace } from "@/lib/workspaces";

const YoutubeCredentialsSchema = z.object({
  youtubeClientId: z.string().trim().min(10, "Enter the YouTube OAuth Client ID."),
  youtubeClientSecret: z.string().trim().min(6, "Enter the YouTube OAuth Client Secret.")
});

export async function PUT(request: Request) {
  try {
    const { user } = await requireActiveWorkspace();
    const input = YoutubeCredentialsSchema.parse(await request.json());
    const settings = await saveUserSettings(user.id, input);
    return Response.json({
      youtubeClientId: settings.youtubeClientId ?? "",
      hasYoutubeOAuthCredentials: Boolean(settings.youtubeClientId && settings.youtubeClientSecretEncrypted)
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
