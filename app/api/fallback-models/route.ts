import { z } from "zod";
import { jsonError } from "@/lib/http";
import { getFallbackModelCatalogs } from "@/lib/provider-models";
import { requireUser } from "@/lib/session";

const FallbackModelsSchema = z.object({
  anthropicApiKey: z.string().optional(),
  openAiApiKey: z.string().optional()
});

export async function GET() {
  try {
    const user = await requireUser();
    const catalogs = await getFallbackModelCatalogs(user.id);
    return Response.json(
      { ...catalogs, fetchedAt: new Date().toISOString() },
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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = FallbackModelsSchema.parse(await request.json());
    const catalogs = await getFallbackModelCatalogs(user.id, input);
    return Response.json(
      { ...catalogs, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    return jsonError(error, 400);
  }
}
