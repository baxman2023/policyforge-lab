import { z } from "zod";
import { jsonError } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { publicWorkspace, switchActiveWorkspace } from "@/lib/workspaces";

const ActiveWorkspaceSchema = z.object({
  workspaceId: z.string().min(1)
});

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = ActiveWorkspaceSchema.parse(await request.json());
    const { workspace, membership } = await switchActiveWorkspace(user.id, input.workspaceId);
    return Response.json({ activeWorkspace: publicWorkspace(workspace, membership) });
  } catch (error) {
    return jsonError(error, 400);
  }
}
