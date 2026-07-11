import "server-only";
import { generateJson } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { recommendShaziStyle } from "@/lib/upgrade-domain";

type SourceFoundation = {
  authoritativeSources: Array<{ name: string; url: string; useFor: string }>;
  recurringQuestions: string[];
  editorialLanes: string[];
  riskyClaims: string[];
  searchQueries: string[];
};

export async function ensureChannelSourceFoundation(input: { userId: string; workspaceId: string; channelId: string }) {
  const channel = await prisma.channel.findFirst({ where: { id: input.channelId, workspaceId: input.workspaceId } });
  if (!channel) throw new Error("Channel not found.");
  if (channel.sourceFoundation) return channel.sourceFoundation as SourceFoundation;

  let foundation: SourceFoundation;
  try {
    const result = await generateJson<SourceFoundation>({
      userId: input.userId,
      workspaceId: input.workspaceId,
      passType: "DISCOVERY",
      messages: [{ role: "user", content: `Build a reusable source foundation for this Texas insurance content channel.\n\nChannel: ${channel.name}\nChannel strategy: ${channel.description || "General Texas home and auto insurance education."}\n\nReturn JSON with authoritativeSources (name, url, useFor), recurringQuestions, editorialLanes, riskyClaims, and searchQueries. Prioritize Texas Department of Insurance, FEMA/NFIP, carrier public consumer materials, statutes/regulators, recognized safety organizations, and Baxter Insurance Agency's licensed independent-agency perspective. Do not invent URLs, carrier rules, rates, savings, coverage, or claim outcomes. Provide at least eight sources and eight editorial lanes.` }],
      temperature: 0.2,
      maxTokens: 4_500
    });
    foundation = result.data;
  } catch {
    foundation = fallbackFoundation(channel.name);
  }

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      sourceFoundation: foundation,
      sourceFoundationBuiltAt: new Date(),
      shaziStyle: channel.shaziStyle || recommendShaziStyle(channel)
    }
  });
  return foundation;
}

function fallbackFoundation(channelName: string): SourceFoundation {
  return {
    authoritativeSources: [
      { name: "Texas Department of Insurance", url: "https://www.tdi.texas.gov/", useFor: "Texas consumer guidance, regulation, complaints, and market context" },
      { name: "FEMA National Flood Insurance Program", url: "https://www.floodsmart.gov/", useFor: "Flood insurance and preparedness education" },
      { name: "Texas Department of Public Safety", url: "https://www.dps.texas.gov/", useFor: "Driving, licensing, and safety context" },
      { name: "National Highway Traffic Safety Administration", url: "https://www.nhtsa.gov/", useFor: "Vehicle and driver safety evidence" },
      { name: "Insurance Institute for Business & Home Safety", url: "https://ibhs.org/", useFor: "Property resilience and loss prevention" },
      { name: "Ready.gov", url: "https://www.ready.gov/", useFor: "Emergency preparation" },
      { name: "Texas Legislature Online", url: "https://capitol.texas.gov/", useFor: "Texas statutory source checks" },
      { name: "Baxter Insurance Agency", url: "https://baxterinsuranceagency.com/", useFor: "Agency services, contact details, and quote path" }
    ],
    recurringQuestions: ["What should a Texas buyer review before requesting a quote?", "Which limits, deductibles, exclusions, and endorsements deserve attention?", "What changes should be reported before renewal?"],
    editorialLanes: [channelName, "Texas home insurance", "Texas auto insurance", "Houston insurance questions", "storm preparation", "renewal reviews", "coverage misconceptions", "quote preparation"],
    riskyClaims: ["Guaranteed savings", "Guaranteed coverage", "Everyone qualifies", "A claim will be paid", "A carrier always handles a loss in one way"],
    searchQueries: ["site:tdi.texas.gov insurance consumer Texas", "site:floodsmart.gov Texas flood insurance", "Texas home insurance renewal questions", "Texas auto insurance coverage review"]
  };
}
