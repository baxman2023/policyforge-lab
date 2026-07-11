import "server-only";
import type { AutomationJob } from "@prisma/client";
import { generateText } from "@/lib/openrouter";
import { prisma } from "@/lib/prisma";
import { ensureNineShortAssets } from "@/lib/short-assets";
import { assertFreshRunBudget, heartbeatAutomationJob } from "@/lib/automation-queue";
import { extractCtaEvidence, runtimeBounds } from "@/lib/upgrade-domain";
import { canonicalSubjectKey } from "@/lib/upgrade-domain";
import { ensureChannelSourceFoundation } from "@/lib/channel-foundation";
import { wordCount, estimatedMinutesFromWords } from "@/lib/utils";

export async function runAlwaysFinishJob(job: AutomationJob, workerId: string) {
  if (!job.storyProjectId) throw new Error("Always-finish job has no project.");
  const project = await prisma.storyProject.findFirst({ where: { id: job.storyProjectId, workspaceId: job.workspaceId }, include: { storyIdea: true, channel: true, canonicalSubject: true, drafts: { orderBy: { createdAt: "desc" }, take: 50 } } });
  if (!project?.channelId) throw new Error("Project or channel not found.");
  const bounds = runtimeBounds(project.targetLengthMinutes, Boolean(project.seasonEpisodeId || project.format === "EPISODIC_SERIES"));
  await prisma.storyProject.update({ where: { id: project.id }, data: { status: "DRAFTING", targetLengthMinutes: bounds.targetMinutes, targetWordCount: bounds.targetWords } });
  await heartbeatAutomationJob(job.id, workerId);
  await assertFreshRunBudget(job);

  let canonical = project.canonicalSubject;
  if (!canonical) {
    const subjectKey = canonicalSubjectKey({ title: project.title, eventName: project.storyIdea?.eventName, category: project.storyIdea?.category });
    canonical = await prisma.canonicalSubject.upsert({ where: { workspaceId_channelId_subjectKey: { workspaceId: job.workspaceId, channelId: project.channelId, subjectKey } }, update: {}, create: { userId: job.userId, workspaceId: job.workspaceId, channelId: project.channelId, subjectKey, canonicalName: project.storyIdea?.eventName || project.title, aliases: [project.title] } });
    await prisma.storyProject.update({ where: { id: project.id }, data: { canonicalSubjectId: canonical.id } });
  }
  let evidence = [project.sourceMaterial, JSON.stringify({ verifiedSources: canonical.verifiedSources, approvedClaims: canonical.approvedClaims, quotations: canonical.quotations, classifications: canonical.classifications })].filter(Boolean).join("\n\n");
  if (!project.sourceMaterial && !canonical.verifiedAt) {
    const foundation = await ensureChannelSourceFoundation({ userId: job.userId, workspaceId: job.workspaceId, channelId: project.channelId });
    const research = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "RESEARCH", messages: [{ role: "user", content: `Build a conservative source-and-claim brief for this Texas insurance video. Distinguish verified general guidance, source leads that still need checking, policy-specific uncertainty, and statements the script must not present as fact. Do not invent rates, forms, carrier rules, savings, coverage, eligibility, or claim outcomes.\n\nTopic: ${project.title}\nIdea: ${project.storyIdea?.summary || ""}\nChannel source foundation (source leads, not proof by itself):\n${JSON.stringify(foundation)}` }], temperature: 0.2, maxTokens: 4_500 });
    const verification = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "FACT_CHECK", messages: [{ role: "user", content: `Independently audit this research brief. Mark every unsupported or policy-specific statement as NEEDS VERIFICATION. Return a safe evidence brief the writer can use, with explicit do-not-say-as-fact boundaries.\n\n${research.content}` }], temperature: 0.1, maxTokens: 3_500 });
    evidence = verification.content;
    await prisma.$transaction([
      prisma.storyProject.update({ where: { id: project.id }, data: { sourceMaterial: evidence, canonicalSubjectId: canonical.id } }),
      prisma.canonicalSubject.update({ where: { id: canonical.id }, data: { approvedClaims: [{ projectId: project.id, safeEvidenceBrief: evidence }], evidence: [{ researchModel: research.model, verificationModel: verification.model }], verifiedAt: new Date() } })
    ]);
  }
  const outline = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "STRUCTURE", messages: [{ role: "user", content: masterPrompt(project, bounds, evidence, "Create three competing hooks and two concise outlines. Score them deterministically for promise clarity, first-minute usefulness, evidence fit, retention, and quote-conversion fit. Select one hook and one outline. Do not write the full script yet.") }], temperature: 0.45, maxTokens: 4_500 });
  await assertFreshRunBudget(job);
  const draft = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "DRAFT", messages: [{ role: "user", content: masterPrompt(project, bounds, evidence, `Use this selected hook/outline competition and write ONE complete script, not variants:\n${outline.content}`) }], temperature: 0.55, maxTokens: 12_000 });
  let final = draft.content.trim();
  await saveDraft(project.id, "DRAFT", draft.model, final);
  await heartbeatAutomationJob(job.id, workerId);

  const deterministicIssues = scriptIssues(final, bounds);
  if (deterministicIssues.length) {
    await assertFreshRunBudget(job);
    const repaired = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "REWRITE", messages: [{ role: "user", content: targetedRepairPrompt(project.title, final, deterministicIssues, bounds) }], temperature: 0.35, maxTokens: 12_000 });
    final = repaired.content.trim();
  }

  await assertFreshRunBudget(job);
  const audit = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "QUALITY_GATE", messages: [{ role: "user", content: `Independently audit this Texas insurance script. Return only PASS or a compact TARGETED REPAIRS list. Check unsupported factual claims, carrier impersonation, promises of savings/coverage/eligibility/claim outcomes, minimum useful depth, title-promise fulfillment, CTA timing, and whether each CTA follows real value.\n\n${final}` }], temperature: 0.1, maxTokens: 2_500 });
  if (!/^\s*PASS\b/i.test(audit.content)) {
    await assertFreshRunBudget(job);
    try {
      const repaired = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "REWRITE", messages: [{ role: "user", content: targetedRepairPrompt(project.title, final, [audit.content], bounds) }], temperature: 0.3, maxTokens: 12_000 });
      final = repaired.content.trim();
    } catch {
      const rescue = await generateText({ userId: job.userId, workspaceId: job.workspaceId, storyProjectId: project.id, passType: "QUALITY_GATE", model: "openai/gpt-5.6-luna", messages: [{ role: "user", content: targetedRepairPrompt(project.title, final, [audit.content], bounds) }], temperature: 0.2, maxTokens: 12_000 });
      final = rescue.content.trim();
    }
  }
  const hardIssues = scriptIssues(final, bounds).filter((issue) => /minimum|prohibited|unsupported/i.test(issue));
  if (hardIssues.length) throw new Error(`Hard script protections still fail: ${hardIssues.join("; ")}`);
  await saveDraft(project.id, "FINAL", `${draft.model}; audit:${audit.model}`, final);
  await prisma.storyProject.update({ where: { id: project.id }, data: { status: "FINAL" } });
  await ensureNineShortAssets({ userId: job.userId, workspaceId: job.workspaceId, channelId: project.channelId, storyProjectId: project.id, title: project.title, script: final });
}

function masterPrompt(project: { title: string; tone: string; narrationStyle: string; storyIdea: { hook: string; summary: string; suggestedAngle: string } | null; channel: { name: string; description: string | null } | null }, bounds: ReturnType<typeof runtimeBounds>, evidence: string, task: string) { return `You are the primary Claude Sonnet 5 writer for PolicyForge.\nTASK: ${task}\nTITLE: ${project.title}\nHOOK: ${project.storyIdea?.hook || ""}\nSUMMARY: ${project.storyIdea?.summary || ""}\nANGLE: ${project.storyIdea?.suggestedAngle || ""}\nCHANNEL: ${project.channel?.name || "PolicyForge"}\nCHANNEL RULES: ${project.channel?.description || "Independent Texas insurance education for Baxter Insurance Agency."}\nTONE: ${project.tone}; ${project.narrationStyle}\nRUNTIME: ${bounds.targetMinutes} minutes; ${bounds.minWords}-${bounds.maxWords} words; target ${bounds.targetWords}. Never pad thin evidence.\nEVIDENCE:\n${evidence || "No verified dossier is available. Use careful general education and explicitly avoid unsupported specifics."}\n\nMake it useful, engaging, trustworthy, retention-aware, and conversion-aware. Open with the viewer problem, pay off the title early, use escalating practical value and clean transitions, and place one soft CTA after value plus one concise closing CTA. Public identity is Baxter Insurance Agency, never a carrier. Do not promise savings, coverage, eligibility, underwriting, rates, or claim outcomes. Coverage depends on exact policy terms and underwriting. Output spoken script only when writing the draft.`; }
function scriptIssues(script: string, bounds: ReturnType<typeof runtimeBounds>) { const issues: string[] = []; const words = wordCount(script); if (words < bounds.minWords) issues.push(`Minimum useful length failed: ${words} words; need at least ${bounds.minWords} without padding.`); if (words > bounds.maxWords) issues.push(`Runtime ceiling exceeded: ${words} words; reduce below ${bounds.maxWords}.`); if (!extractCtaEvidence(script).length) issues.push("CTA evidence is missing; recover one exact useful CTA sentence after substantive value."); if (/guaranteed savings|fully covered|everyone qualifies|claim will be paid|we work for (?:germania|travelers|progressive|geico|swyfft)/i.test(script)) issues.push("Prohibited insurance promise or carrier impersonation detected."); return issues; }
function targetedRepairPrompt(title: string, script: string, issues: string[], bounds: ReturnType<typeof runtimeBounds>) { return `Repair only the sections needed to solve these failures, then return the complete clean spoken script. Preserve good sections and supported claims. Do not mention the audit.\nTITLE: ${title}\nTARGET: ${bounds.minWords}-${bounds.maxWords} words\nFAILURES:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nSCRIPT:\n${script}`; }
async function saveDraft(storyProjectId: string, passType: "DRAFT" | "FINAL", modelUsed: string, content: string) { const latest = await prisma.scriptDraft.findFirst({ where: { storyProjectId, passType }, orderBy: { version: "desc" } }); const words = wordCount(content); return prisma.scriptDraft.create({ data: { storyProjectId, passType, version: (latest?.version || 0) + 1, modelUsed, content, wordCount: words, estimatedMinutes: estimatedMinutesFromWords(words) } }); }
