import { describe, expect, it } from "vitest";
import { routeModelForPass } from "../lib/story-prompts";

const settings = { defaultModel: "anthropic/claude-sonnet-5", discoveryModel: "anthropic/claude-sonnet-5", dossierModel: "anthropic/claude-sonnet-5", structureModel: "anthropic/claude-sonnet-5", draftingModel: "anthropic/claude-sonnet-5", critiqueModel: "openai/gpt-5.6-luna", rewriteModel: "anthropic/claude-sonnet-5", autoModelRouting: true };

describe("model responsibilities", () => {
  it("routes writing, extraction, revisions, and Shorts packaging to Sonnet 5", () => {
    for (const pass of ["RESEARCH", "DRAFT", "REWRITE", "PUBLISHING_PACK"] as const) expect(routeModelForPass(settings, pass)).toContain("claude-sonnet-5");
  });
  it("routes independent audits and policy gates to GPT-5.6 Luna", () => {
    for (const pass of ["CRITIQUE", "FACT_CHECK", "QUALITY_GATE"] as const) expect(routeModelForPass(settings, pass)).toContain("gpt-5.6-luna");
  });
});
