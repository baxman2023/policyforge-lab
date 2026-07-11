import { describe, expect, it } from "vitest";
import { canonicalSubjectKey, extractCtaEvidence, normalizeNineShorts, runtimeBounds, scoreTrend, underlyingEventKey } from "../lib/upgrade-domain";

describe("canonical research and trends", () => {
  it("recognizes differently titled parts as one subject", () => {
    expect(canonicalSubjectKey({ title: "Roof Replacement Cost - Part 1" })).toBe(canonicalSubjectKey({ title: "Part 3: Roof Replacement Cost" }));
  });
  it("deduplicates the same underlying event", () => {
    expect(underlyingEventKey("Texas roof update", ["https://tdi.texas.gov/a"])).toBe(underlyingEventKey("Texas roof update", ["https://tdi.texas.gov/b"]));
  });
  it("scores channel-relevant fresh trends above unrelated old items", () => {
    const relevant = scoreTrend({ channelText: "Texas home flood storm insurance", title: "Texas home flood insurance storm update", freshnessHours: 2, sourceCount: 3 });
    const unrelated = scoreTrend({ channelText: "Texas home insurance", title: "European football transfer", freshnessHours: 200, sourceCount: 1 });
    expect(relevant).toBeGreaterThan(unrelated);
    expect(relevant).toBeLessThanOrEqual(100);
  });
});

describe("script safeguards", () => {
  it("enforces standard and season runtime caps", () => {
    expect(runtimeBounds(30, false).targetMinutes).toBe(12);
    expect(runtimeBounds(30, true).targetMinutes).toBe(15);
    expect(runtimeBounds(4, false).targetMinutes).toBe(8);
  });
  it("recovers exact CTA evidence from script sentences", () => {
    expect(extractCtaEvidence("Review the declarations page first. Call Baxter at 281-445-1381 after you gather it.")).toEqual(["Call Baxter at 281-445-1381 after you gather it."]);
  });
  it("always creates exactly nine independent Shorts", () => {
    const shorts = normalizeNineShorts([{ hook: "Check this", payoff: "Read your deductible.", script: "Read your deductible before storm season." }], "This is a sufficiently long supporting sentence about reviewing a Texas policy before renewal. Another useful supported sentence explains why exact terms matter.");
    expect(shorts).toHaveLength(9);
    expect(shorts.every((item) => item.hook && item.payoff && item.title && item.caption && item.sourceSafety && item.exportAssets)).toBe(true);
  });
});
