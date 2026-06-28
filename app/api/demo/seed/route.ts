import { ScriptPassType, StoryIdeaStatus, StoryProjectFormat, StoryProjectStatus } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { getUserChannel } from "@/lib/channels";
import { jsonError } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireActiveWorkspace } from "@/lib/workspaces";
import { slugify, targetWordsForMinutes, wordCount } from "@/lib/utils";

const DEMO_CHANNEL_NAME = "Demo Channel - Buyer Walkthrough";

export async function POST() {
  try {
    const { user, workspace } = await requireActiveWorkspace();
    await getUserChannel(user.id, workspace.id);
    const channel = await ensureDemoChannel(user.id, workspace.id);
    const existingProjects = await prisma.storyProject.count({ where: { workspaceId: workspace.id, channelId: channel.id } });

    if (existingProjects === 0) {
      await seedDemoChannel(user.id, workspace.id, channel.id);
    }

    const projects = await prisma.storyProject.findMany({
      where: { workspaceId: workspace.id, channelId: channel.id },
      include: {
        storyIdea: true,
        drafts: { orderBy: { createdAt: "desc" }, take: 50 },
        thumbnails: { orderBy: { createdAt: "desc" }, take: 24 },
        publishingSlots: { orderBy: { scheduledDate: "asc" }, take: 20 }
      },
      orderBy: { updatedAt: "desc" },
      take: 20
    });

    await auditLog({ userId: user.id, workspaceId: workspace.id, action: "demo.seeded", metadata: { channelId: channel.id, projectCount: projects.length } });
    return Response.json({ channel, projects });
  } catch (error) {
    return jsonError(error, 400);
  }
}

async function ensureDemoChannel(userId: string, workspaceId: string) {
  const slug = slugify(DEMO_CHANNEL_NAME);
  const blueprint = {
    targetAudience: "Adults who binge thoughtful mystery, survival, maritime, missing-person, and forgotten-history documentaries.",
    toneRules: "Calm authority, cinematic tension, no cheap horror framing, no fake certainty, always separate known facts from speculation.",
    recurringStoryTypes: "Maritime vanishings, forgotten expeditions, remote survival cases, institutional cover-ups, aviation mysteries, and under-covered historical disasters.",
    bannedPhrases: "You won't believe, shocking truth, terrifying secret, what happened next will blow your mind, unexplained forever.",
    thumbnailStyle: "Dark documentary realism, one dominant subject, evidence detail circled in red, bold two-to-four-word overlay, teal/cyan edge light, yellow contrast accents.",
    sponsorRules: "Sponsor appears once near the beginning and once at the end. Use only the provided sponsor copy.",
    publishingRhythm: "One video every Monday and Thursday. One week per month becomes a Monday-Friday five-episode series."
  };

  return prisma.channel.upsert({
    where: { workspaceId_slug: { workspaceId, slug } },
    create: {
      userId,
      workspaceId,
      name: DEMO_CHANNEL_NAME,
      slug,
      description: JSON.stringify(blueprint)
    },
    update: {
      description: JSON.stringify(blueprint)
    }
  });
}

async function seedDemoChannel(userId: string, workspaceId: string, channelId: string) {
  const ideas = await Promise.all(DEMO_IDEAS.map(async (idea, index) => prisma.storyIdea.create({
    data: {
      userId,
      workspaceId,
      channelId,
      title: idea.title,
      slug: await uniqueIdeaSlug(workspaceId, channelId, idea.title),
      hook: idea.hook,
      summary: idea.summary,
      category: idea.category,
      sourceType: "Demo research pack",
      people: idea.people,
      location: idea.location,
      eventName: idea.eventName,
      originalityScore: 88 + index,
      curiosityScore: 92 + index,
      emotionalScore: 86 + index,
      escalationScore: 90 + index,
      lengthPotentialScore: 91,
      researchDifficultyScore: 54 + index,
      estimatedLengthPotential: index === 2 ? "60 min" : "45-60 min",
      recommendedLengthMinutes: index === 2 ? 60 : 45,
      recommendedTone: "Investigative & grounded",
      recommendedNarrationStyle: "Investigative documentary",
      totalScore: 89 + index,
      productionPriority: index < 3 ? "High" : "Medium",
      suggestedAngle: idea.angle,
      status: index < 3 ? StoryIdeaStatus.IN_PROGRESS : StoryIdeaStatus.SAVED
    }
  })));

  const dates = nextDemoDates(4);
  for (const [index, idea] of ideas.slice(0, 3).entries()) {
    const project = await prisma.storyProject.create({
      data: {
        userId,
        workspaceId,
        channelId,
        storyIdeaId: idea.id,
        title: idea.title,
        format: index === 2 ? StoryProjectFormat.EPISODIC_SERIES : StoryProjectFormat.STANDALONE,
        targetLengthMinutes: index === 2 ? 60 : 45,
        targetWordCount: targetWordsForMinutes(index === 2 ? 60 : 45),
        tone: "Investigative & grounded",
        narrationStyle: "Investigative documentary",
        sourceMaterial: demoSourceMaterial(idea.title),
        sponsorBlurb: index === 0 ? "This demo sponsor block is customizable. Use it for a brand, affiliate offer, or buyer-specific promotion, and direct viewers to the description for details." : null,
        sponsorLink: index === 0 ? "https://phpstack-1305612-6519184.cloudwaysapps.com/" : null,
        status: StoryProjectStatus.FINAL
      }
    });

    await createDemoDrafts(project.id, index);
    await createDemoThumbnails(project.id, idea.title);
    await prisma.publishingSlot.create({
      data: {
        userId,
        workspaceId,
        channelId,
        storyProjectId: project.id,
        title: project.title,
        scheduledDate: dates[index],
        slotType: index === 2 ? "EPISODE" : "STANDALONE",
        status: "SCHEDULED",
        episodeNumber: index === 2 ? 1 : null,
        episodeCount: index === 2 ? 5 : null,
        durationMinutes: project.targetLengthMinutes,
        batchId: "demo-buyer-walkthrough"
      }
    });
  }
}

async function createDemoDrafts(storyProjectId: string, index: number) {
  const base = DEMO_IDEAS[index];
  const script = demoScript(base.title);
  const drafts = [
    { passType: ScriptPassType.INTRO, content: demoIntro(base.title, index) },
    { passType: ScriptPassType.DOSSIER, content: demoDossier(base.title) },
    { passType: ScriptPassType.HOOK_LAB, content: demoHookLab(base.title) },
    { passType: ScriptPassType.STORY_SPINE, content: demoStorySpine(base.title) },
    { passType: ScriptPassType.STRUCTURE, content: demoStructure(base.title) },
    { passType: ScriptPassType.RETENTION_MAP, content: demoRetentionMap(base.title) },
    { passType: ScriptPassType.DRAFT, content: script },
    { passType: ScriptPassType.CRITIQUE, content: demoCritique(base.title) },
    { passType: ScriptPassType.FACT_CHECK, content: demoFactCheck(base.title) },
    { passType: ScriptPassType.REWRITE, content: script },
    { passType: ScriptPassType.QUALITY_GATE, content: demoQualityGate(base.title) },
    { passType: ScriptPassType.FINAL, content: script },
    { passType: ScriptPassType.OUTRO, content: demoOutro(index) },
    { passType: ScriptPassType.PUBLISHING_PACK, content: JSON.stringify(demoPublishingPack(base.title), null, 2) }
  ];

  for (const [draftIndex, draft] of drafts.entries()) {
    await prisma.scriptDraft.create({
      data: {
        storyProjectId,
        version: 1,
        passType: draft.passType,
        modelUsed: "demo/buyer-walkthrough",
        content: draft.content,
        wordCount: wordCount(draft.content),
        estimatedMinutes: Math.max(1, Math.round(wordCount(draft.content) / 160)),
        createdAt: new Date(Date.now() - (drafts.length - draftIndex) * 60_000)
      }
    });
  }
}

async function createDemoThumbnails(storyProjectId: string, title: string) {
  const overlays = ["MISSING AT SEA", "LAST SIGNAL", "NO ONE LOOKED"];
  for (const [index, overlay] of overlays.entries()) {
    await prisma.thumbnailAsset.create({
      data: {
        storyProjectId,
        variant: index + 1,
        title: `${overlay} concept`,
        prompt: `High-CTR documentary thumbnail for ${title}. Overlay text: ${overlay}. Red arrow points to the key evidence detail.`,
        imageUrl: demoThumbnailDataUrl(overlay, index),
        imageUUID: `demo-${storyProjectId}-${index + 1}`,
        taskUUID: `demo-task-${storyProjectId}-${index + 1}`,
        modelUsed: "demo/ideogram-4-style",
        estimatedCost: 0
      }
    });
  }
}

async function uniqueIdeaSlug(workspaceId: string, channelId: string, title: string) {
  const base = slugify(title) || "demo-idea";
  let slug = base;
  let index = 2;
  while (await prisma.storyIdea.findFirst({ where: { workspaceId, channelId, slug } })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function nextDemoDates(count: number) {
  const dates: Date[] = [];
  const used = new Set<string>();
  const current = new Date();
  current.setHours(12, 0, 0, 0);
  while (dates.length < count) {
    const day = current.getDay();
    const key = current.toISOString().slice(0, 10);
    if ((day === 1 || day === 4) && !used.has(key)) {
      dates.push(new Date(current));
      used.add(key);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function demoThumbnailDataUrl(overlay: string, index: number) {
  const accent = ["#f4d35e", "#2ed5c9", "#ff5a4f"][index] || "#f4d35e";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#061116"/><stop offset="1" stop-color="#12343d"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>
<rect x="48" y="48" width="1184" height="624" fill="none" stroke="${accent}" stroke-width="8"/>
<circle cx="${index === 1 ? 840 : 900}" cy="${index === 2 ? 320 : 390}" r="92" fill="none" stroke="#ff2e2e" stroke-width="18"/>
<path d="M180 520 C360 420 520 400 760 365" fill="none" stroke="#ff2e2e" stroke-width="20" marker-end="url(#arrow)"/>
<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#ff2e2e"/></marker></defs>
<text x="72" y="155" fill="#ffffff" font-family="Arial Black, Arial" font-size="72" font-weight="900">${escapeSvg(overlay)}</text>
<text x="74" y="630" fill="${accent}" font-family="Arial Black, Arial" font-size="42" font-weight="900">TRUE DOCUMENTARY</text>
<rect x="760" y="230" width="270" height="210" rx="12" fill="#e8e0c7"/>
<path d="M780 260 L1010 255 L1000 412 L792 430 Z" fill="#b9ad8a"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value: string) {
  return value.replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[char] || char);
}

const DEMO_IDEAS = [
  {
    title: "The Vanishing Lifeboat: A Maritime Mystery No One Reopened",
    hook: "A lifeboat drifted home without the people who launched it, leaving a trail of official silence and one impossible timing problem.",
    summary: "A premium demo story showing how PolicyForge LAB turns a thin maritime mystery into a research-led documentary with a safe central question.",
    category: "Maritime Stories",
    people: ["Unknown crew", "Harbor officials"],
    location: "North Atlantic",
    eventName: "Vanishing Lifeboat",
    angle: "Make the missing lifeboat a question about record gaps, weather, and institutional memory rather than a cheap ghost story."
  },
  {
    title: "The Town That Disappeared From the Map",
    hook: "A mining town vanished from official records, but tax rolls, cemetery names, and one surviving map suggest the story was never fully told.",
    summary: "Forgotten history demo built around source-led reconstruction and a strong under-covered local archive angle.",
    category: "Forgotten History",
    people: ["Town residents", "County clerks"],
    location: "American West",
    eventName: "Lost Mining Town",
    angle: "Use records as the mystery engine: what disappears first, the town or the people who remember it?"
  },
  {
    title: "Five Days Inside the Ice: The Expedition Everyone Misquotes",
    hook: "The famous version says the expedition failed in one dramatic night. The documents suggest the real story lasted five freezing days.",
    summary: "Episodic-series demo showing how one idea can become five deep videos without padding.",
    category: "Survival Stories",
    people: ["Expedition members"],
    location: "Arctic coast",
    eventName: "Five Days Inside the Ice",
    angle: "Split the episode series by decision points, not chronology, so each video has its own central question."
  },
  {
    title: "The Signal After Midnight",
    hook: "A final radio signal was logged after everyone was supposed to be gone.",
    summary: "A short saved idea included to show queue depth.",
    category: "Aviation Incidents",
    people: ["Radio operators"],
    location: "Remote airfield",
    eventName: "Midnight Signal",
    angle: "Use the signal log as the opening question."
  }
];

function demoIntro(title: string, index: number) {
  const sponsor = index === 0 ? "This demo sponsor block is customizable. Use it for a brand, affiliate offer, or buyer-specific promotion, and direct viewers to the description for details. " : "";
  return `Welcome back to the channel. Today we are looking at ${title}, a story where the most important clue is not a shocking confession or a cinematic twist, but the quiet gap between what people remembered and what the record preserved. ${sponsor}Now, let's get into today's story.`;
}

function demoOutro(index: number) {
  const sponsor = index === 0 ? " This demo sponsor block is customizable. Use it for a brand, affiliate offer, or buyer-specific promotion, and direct viewers to the description for details." : "";
  return `If this story pulled you in, subscribe to the channel, like the video, and leave any questions or theories in the comments. And if you know someone who cares about careful true-story documentaries, send this one their way.${sponsor}`;
}

function demoScript(title: string) {
  return `The first thing to understand about ${title} is that the mystery does not begin with the moment everyone remembers.

It begins earlier, in the ordinary paper trail. A note in a ledger. A date that appears twice. A name written one way in one place and another way somewhere else. Those are not dramatic details, but they are the kind of details that decide whether a story becomes a myth or a case that can still be understood.

In the popular version, the story is simple. Something happened. People vanished. The explanation never came.

But the closer you look, the less simple it becomes. The timeline starts to bend. The witnesses do not fully agree. The official record seems confident in places where it should be careful, and strangely quiet in places where it should be specific.

That is the spine of this episode: not to pretend we can solve every unanswered question, but to rebuild the strongest version of what can be said, what cannot be said, and why this story still has weight after all these years.

By the end, the question is not only what happened. It is why the version everyone repeats became easier to remember than the version the evidence actually supports.`;
}

function demoSourceMaterial(title: string) {
  return `=== CONFIRMED FACTS TO VERIFY ===
- ${title} should be handled as a source-led documentary.
- Separate confirmed records from witness memory and later retellings.
- Avoid declaring motive, cause, or certainty unless the source material supports it.

=== SOURCE LEADS ===
- Newspaper archives
- Official reports
- Local history collections
- Maps, ledgers, timelines, and family statements

=== RISK NOTES ===
- Do not overstate mystery.
- Do not invent dialogue.
- Keep speculation clearly labeled.`;
}

function demoDossier(title: string) {
  return `Research Dossier
Confirmed Facts
- ${title} has enough evidence depth for a long-form documentary treatment.
- The strongest narrative path is the gap between public memory and source records.

Likely But Needs Verification
- Later summaries may compress the timeline.
- Names, dates, and locations should be checked against primary or near-primary sources.

Unverified Or Risky Claims
- Any claim of intent, cover-up, or final cause needs direct sourcing.

Fact Ledger
- Central claim: the record is more complicated than the popular version. Confidence: high. Use as framing.
- Specific cause: unknown. Confidence: low. Do not state as fact.

Do Not Say As Fact
- Do not claim the mystery is solved.
- Do not accuse named people without sourced evidence.`;
}

function demoHookLab(title: string) {
  return `Hook Candidates
1. The record did not fail all at once. It failed one quiet detail at a time. Score: 94.
2. Everyone remembers the ending, but the beginning is where the story breaks. Score: 91.

Selected Hook
The record did not fail all at once. It failed one quiet detail at a time.

Why This Hook Wins
It creates curiosity without false certainty and matches the documentary tone for ${title}.`;
}

function demoStorySpine(title: string) {
  return `Central Question
What does the source record actually support about ${title}, and what did later retellings simplify?

Emotional Promise
The viewer will feel the difference between a mystery being sensationalized and a mystery being carefully reconstructed.

Locked Spine
Follow the documents first, use uncertainty as tension, and end with the human cost of what remains unknown.`;
}

function demoStructure(title: string) {
  return `Opening Hook
Begin with the smallest contradiction in the record.

Reveal Order
Start with the familiar version, then move backward through the evidence, witness memory, official gaps, and unresolved questions.

Ending
Return to the central question and leave the viewer with a clean distinction between fact, likelihood, and myth for ${title}.`;
}

function demoRetentionMap(title: string) {
  return `Retention Strategy
Give the viewer a new question every three to five minutes.

Open Loops
- Why does the timeline not line up?
- Which record should be trusted?
- What did later versions leave out?

Draft Instructions
Keep ${title} grounded, human, and evidence-led.`;
}

function demoCritique(title: string) {
  return `Overall Score: 90
Hook strength is high. The script for ${title} has a clear central question, strong restraint, and a clean ending. Improve by tightening two transitions and adding one more human-scale detail before the final paragraph.`;
}

function demoFactCheck(title: string) {
  return `Fact Risk Summary
${title} is safe as framed because the script emphasizes uncertainty.

Unsupported Claims
None in the demo draft.

Required Fixes
Keep names, dates, and locations source-dependent before production.`;
}

function demoQualityGate(title: string) {
  return `Overall Score: 93
Hook Score: 95
Retention Score: 91
Clarity Score: 94
Emotional Payoff Score: 90
Factual Safety Score: 96
Teleprompter Readiness Score: 92

Must Fix Before Final
No blocking issues. ${title} is ready for teleprompter polish and packaging.

Final Polish Instructions
Keep paragraphs clean, remove headings, avoid pause markers, and preserve factual restraint.`;
}

function demoPublishingPack(title: string) {
  return {
    titles: [
      { title: `${title}: The Detail Everyone Missed`, angle: "Curiosity-forward and factual without overclaiming." },
      { title: `The Record That Changed This Mystery`, angle: "Positions the episode around evidence rather than sensationalism." },
      { title: `Why the Official Story Never Felt Complete`, angle: "Invites a click while staying grounded." }
    ],
    description: `A careful long-form documentary reconstruction of ${title}, separating confirmed facts from uncertainty and later retellings.`,
    tags: ["true story documentary", "mystery documentary", "forgotten history", "long form storytelling", title.toLowerCase()],
    thumbnailPrompts: [
      { title: "Evidence detail", overlayText: "MISSING PIECE", prompt: `Dark documentary thumbnail for ${title}, bold text MISSING PIECE, red circle around one evidence detail, teal edge light.` },
      { title: "Timeline contradiction", overlayText: "WRONG DATE", prompt: `High-CTR documentary thumbnail for ${title}, bold text WRONG DATE, red arrow pointing to a timeline document.` },
      { title: "Vanishing record", overlayText: "NO RECORD", prompt: `Premium mystery documentary thumbnail for ${title}, bold text NO RECORD, red arrow toward missing ledger page.` }
    ],
    sunoPrompt: {
      title: "Evidence Room Underscore",
      prompt: `Instrumental cinematic documentary background music for "${title}". Slow-burn mystery tone, restrained tension, sparse piano, low strings, soft analog pulses, subtle percussion, gradual emotional lift, loopable under narration, no vocals, no lyrics, no copyrighted artist references.`
    },
    pinnedComment: "What detail changed how you understood this story?"
  };
}
