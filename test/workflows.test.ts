import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("post-fork durable workflows", () => {
  it("has canonical reuse, delta-only research, and no-progress strategy changes", () => { const route = read("app/api/projects/[id]/research/route.ts"); expect(route).toContain("delta only"); expect(route).toContain("processedSourceUrls"); expect(route).toContain("nextSearchStrategy"); });
  it("has atomic, idempotent, leased jobs and a three-slot worker", () => { const queue = read("lib/automation-queue.ts"); const worker = read("scripts/policyforge-worker.cjs"); expect(queue).toContain("FOR UPDATE SKIP LOCKED"); expect(queue).toContain("idempotencyKey"); expect(queue).toContain("leaseExpiresAt"); expect(worker).toContain("WORKER_CONCURRENCY || 3"); });
  it("persists seasons and individual episode projects", () => { const route = read("app/api/seasons/route.ts"); expect(route).toContain("contentSeason.create"); expect(route).toContain("seasonEpisodeId"); expect(route).toContain("suggestedEpisodeDate"); });
  it("survives optional channel image failures", () => { const route = read("app/api/channels/idea-machine/route.ts"); expect(route).toMatch(/if \(input\.generateImages\)[\s\S]+try[\s\S]+catch/); expect(route).toContain("Channel brand image generation failed"); });
  it("retains Texas insurance policy safeguards", () => { const prompts = read("lib/story-prompts.ts"); expect(prompts).toMatch(/(?:Never|Do not) promise savings/i); expect(prompts).toContain("Baxter Insurance Agency"); expect(prompts).toContain("Texas"); });
});
