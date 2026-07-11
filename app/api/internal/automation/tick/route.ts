import { claimNextAutomationJob, completeAutomationJob, failAutomationJob, reapExpiredAutomationLeases } from "@/lib/automation-queue";
import { runAlwaysFinishJob } from "@/lib/always-finish";

export async function POST(request: Request) {
  const secret = process.env.AUTOMATION_WORKER_SECRET;
  if (!secret || request.headers.get("x-worker-secret") !== secret) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const workerId = request.headers.get("x-worker-id") || `worker-${process.pid}`;
  await reapExpiredAutomationLeases();
  const job = await claimNextAutomationJob(workerId);
  if (!job) return Response.json({ claimed: false });
  try {
    if (job.type === "ALWAYS_FINISH_SCRIPT") await runAlwaysFinishJob(job, workerId);
    else throw new Error(`Unsupported automation job type: ${job.type}`);
    const completed = await completeAutomationJob(job.id, workerId);
    return Response.json({ claimed: true, jobId: job.id, completed });
  } catch (error) {
    const result = await failAutomationJob(job, workerId, error);
    return Response.json({ claimed: true, jobId: job.id, completed: false, retrying: !result.failed, error: error instanceof Error ? error.message : "Worker failed" }, { status: result.failed ? 500 : 202 });
  }
}
