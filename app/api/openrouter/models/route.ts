import { jsonError } from "@/lib/http";
import { getAvailableModels } from "@/lib/openrouter";
import { requireUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await requireUser();
    const models = await getAvailableModels(user.id);
    return Response.json(
      { models, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    return jsonError(error);
  }
}
