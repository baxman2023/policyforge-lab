import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { createUserChannel, listUserChannels } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { requireActiveWorkspace } from "@/lib/workspaces";

const ChannelSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(50_000).optional(),
  archiveCurrentChannelId: z.string().optional()
});

export async function GET() {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const { channels, archivedChannels, defaultChannel } = await listUserChannels(user.id, workspace.id);
    return Response.json({ channels, archivedChannels, defaultChannelId: defaultChannel.id });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    const input = ChannelSchema.parse(await request.json());
    const channel = await createUserChannel(user.id, workspace.id, input.name, input.description, {
      archiveChannelId: input.archiveCurrentChannelId
    });
    await auditLog({
      userId: user.id,
      workspaceId: workspace.id,
      action: "channel.created",
      metadata: { channelId: channel.id, name: channel.name, archivedChannelId: input.archiveCurrentChannelId }
    });
    return Response.json({ channel });
  } catch (error) {
    return jsonError(error, 400);
  }
}
