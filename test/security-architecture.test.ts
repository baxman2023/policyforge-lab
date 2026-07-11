import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("authentication and ownership architecture", () => {
  it("uses Google OAuth only and promotes the named administrator", () => {
    const auth = read("lib/auth.ts");
    expect(auth).toContain("GoogleProvider");
    expect(auth).not.toContain("CredentialsProvider");
    expect(auth).toContain("keithbax@gmail.com");
  });
  it("never returns encrypted provider fields from settings", () => {
    const route = read("app/api/settings/route.ts");
    for (const field of ["openRouterApiKeyEncrypted", "anthropicApiKeyEncrypted", "openAiApiKeyEncrypted", "runwareApiKeyEncrypted", "youtubeClientSecretEncrypted"]) expect(route).toContain(`${field}: undefined`);
  });
  it("scopes new records by user, workspace, and channel", () => {
    const schema = read("prisma/schema.prisma");
    for (const model of ["CanonicalSubject", "TrendOpportunity", "ContentSeason", "ShortAsset", "EditorialOpportunity", "AutomationJob"]) {
      const section = schema.split(`model ${model} {`)[1]?.split("\n}")[0] || "";
      expect(section).toContain("userId"); expect(section).toContain("workspaceId"); expect(section).toContain("channelId");
    }
  });
});
