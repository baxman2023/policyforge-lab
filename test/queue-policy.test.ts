import { describe, expect, it } from "vitest";
import { freshRunSpend, retryDecision, workerConcurrency } from "../lib/queue-policy";

describe("automation queue policy", () => {
  it("uses three MariaDB slots and one SQLite slot", () => {
    expect(workerConcurrency("mysql://host/db", 10)).toBe(3);
    expect(workerConcurrency("file:./dev.db", 3)).toBe(1);
  });
  it("backs off then stops at the bounded attempt limit", () => {
    expect(retryDecision(0, 3, 0).runAfter?.getTime()).toBe(10_000);
    expect(retryDecision(2, 3, 0).failed).toBe(true);
  });
  it("gives reruns a fresh budget without erasing historical spend", () => {
    expect(freshRunSpend(102, 100, 5)).toEqual({ spent: 2, remaining: 3, exceeded: false });
    expect(freshRunSpend(106, 100, 5).exceeded).toBe(true);
  });
});
