import type { ScriptPassType, StoryProjectFormat, UserSettings } from "@prisma/client";
import { narrationStyleOptions, storyLengthOptions, toneOptions } from "@/lib/story-options";

type IdeaContentMode =
  | "STORY_DOCUMENTARY"
  | "EXPERT_AUTHORITY"
  | "LOCAL_LEAD_GEN"
  | "SALES_OFFER"
  | "EDUCATION_COURSE"
  | "BOOK_PUBLISHING"
  | "REPURPOSE_MULTIPLIER"
  | "BRAND_CHANNEL_STRATEGY";

export type IdeaFactoryInput = {
  niche: string;
  tone: string;
  category: string;
  desiredLength: string;
  sourceType: string;
  count: number;
  contentMode?: IdeaContentMode;
  businessAudience?: string;
  businessOffer?: string;
  businessLocation?: string;
  businessGoal?: string;
  businessCompliance?: string;
  businessCta?: string;
  projectFormat?: StoryProjectFormat | string;
  analyticsGuide?: string;
  whiteSpaceGuide?: string;
  moneyGoal?: string;
  affiliateOffer?: string;
  riskProfile?: string;
  productionCapacity?: string;
};

function projectFormatLabel(format?: StoryProjectFormat | string | null) {
  if (format === "PODCAST_EPISODE") return "Podcast episode";
  if (format === "ARTICLE") return "Article";
  if (format === "SHORT_BOOK") return "Short book";
  if (format === "LONG_BOOK") return "Long form book";
  if (format === "EPISODIC_SERIES") return "Episodic video series";
  return "Video script";
}

function projectOutputName(format?: StoryProjectFormat | string | null) {
  if (format === "PODCAST_EPISODE") return "podcast episode";
  if (format === "ARTICLE") return "article";
  if (format === "SHORT_BOOK") return "short book manuscript";
  if (format === "LONG_BOOK") return "long form book manuscript";
  if (format === "EPISODIC_SERIES") return "five-episode video series";
  return "standalone video script";
}

function contentModeLabel(mode?: IdeaContentMode | string | null) {
  if (mode === "EXPERT_AUTHORITY") return "Expert / Authority";
  if (mode === "LOCAL_LEAD_GEN") return "Local Lead Gen";
  if (mode === "SALES_OFFER") return "Sales / Offer";
  if (mode === "EDUCATION_COURSE") return "Education / Course";
  if (mode === "BOOK_PUBLISHING") return "Book / Publishing";
  if (mode === "REPURPOSE_MULTIPLIER") return "Repurpose / Content Multiplier";
  if (mode === "BRAND_CHANNEL_STRATEGY") return "Brand / Channel Strategy";
  return "Story / Documentary";
}

function inferProjectContentMode(input: {
  category?: string | null;
  sourceType?: string | null;
  suggestedAngle?: string | null;
  location?: string | null;
  eventName?: string | null;
  title?: string | null;
  summary?: string | null;
}): IdeaContentMode {
  const text = [
    input.category,
    input.sourceType,
    input.suggestedAngle,
    input.location,
    input.eventName,
    input.title,
    input.summary
  ].filter(Boolean).join(" ").toLowerCase();

  if (/sales letter|gumroad|offer page|email promo|webinar|vsl|proposal|follow-up|follow up|launch campaign|objection handling|sales goal|core offer|buy now/.test(text)) {
    return "SALES_OFFER";
  }
  if (/course|curriculum|lesson|module|worksheet|quiz|training script|paid community|student|certification|learning goal/.test(text)) {
    return "EDUCATION_COURSE";
  }
  if (/book publishing|authority book|lead magnet book|kindle|illustrated book|book outline|manuscript|reader worksheet|back-cover|back cover/.test(text)) {
    return "BOOK_PUBLISHING";
  }
  if (/repurpose|content multiplier|email series|shorts|reels|tweets|x posts|linkedin|newsletter|podcast notes|multi-platform|source asset|transcript/.test(text)) {
    return "REPURPOSE_MULTIPLIER";
  }
  if (/brand strategy|channel strategy|niche positioning|content pillars|visual identity|publishing calendar|keyword strategy|channel naming|launch plan/.test(text)) {
    return "BRAND_CHANNEL_STRATEGY";
  }
  if (/\blocal\b|near me|service area|neighborhood|quote|consultation|lead generation|cost and pricing|seasonal local|local seo/.test(text)) {
    return "LOCAL_LEAD_GEN";
  }
  if (/authority|expert|buyer question|service explainer|case stud|compliance|faq|objection|myth bust|comparison content|industry expertise|qualified leads/.test(text)) {
    return "EXPERT_AUTHORITY";
  }
  return "LOCAL_LEAD_GEN";
}

export function ideaGenerationPrompt(input: IdeaFactoryInput, existingTitles: string[]) {
  const contentMode = input.contentMode ?? "LOCAL_LEAD_GEN";
  const isBusinessMode = contentMode !== "STORY_DOCUMENTARY";
  const isShortBook = input.projectFormat === "SHORT_BOOK";
  const isLongBook = input.projectFormat === "LONG_BOOK";
  const lengthChoices = isShortBook
    ? "Compact short book (~10,000 words; use recommendedLengthMinutes 30), Standard short book (~15,000 words; use recommendedLengthMinutes 45), Deep short book (~20,000 words; use recommendedLengthMinutes 60)"
    : isLongBook
      ? "Starter long form book (~40,000 words; use recommendedLengthMinutes 30), Standard long form book (~60,000 words; use recommendedLengthMinutes 45), Deep long form book (~80,000 words; use recommendedLengthMinutes 60)"
    : storyLengthOptions.map((item) => `${item.label} (${item.minutes} minutes)`).join(", ");
  const toneChoices = toneOptions.join(", ");
  const narrationChoices = narrationStyleOptions.join(", ");
  const formatLabel = projectFormatLabel(input.projectFormat);
  const formatFitRule =
    input.projectFormat === "ARTICLE"
      ? isBusinessMode
        ? "Clearly prefer ideas that can sustain a useful article with search intent, buyer education, concrete sections, and a strong business payoff."
        : "Clearly prefer ideas that can sustain a strong researched article with a clear angle, useful sections, and reader payoff."
      : input.projectFormat === "PODCAST_EPISODE"
        ? isBusinessMode
          ? "Clearly prefer ideas that can sustain a practical podcast episode with examples, objection handling, and a clear listener takeaway."
          : "Clearly prefer ideas that can sustain the selected 10-60 minute podcast episode length with strong listening flow."
        : isShortBook
          ? isBusinessMode
            ? "Clearly prefer ideas that can sustain a chaptered short book with enough expert substance, frameworks, examples, and reader action steps."
            : "Clearly prefer ideas that can sustain a chaptered short book with enough documented depth, clear sections, and a reader payoff."
          : isLongBook
            ? isBusinessMode
              ? "Clearly prefer ideas that can sustain a full long form book with multiple frameworks, buyer education arcs, examples, proof points, and a strong practical payoff."
              : "Clearly prefer ideas that can sustain a full long form book with multiple research layers, chapter arcs, documented depth, and a strong reader payoff."
            : isBusinessMode
              ? "Clearly prefer ideas that can sustain a complete video script with clear sections, real audience pain, examples, and a useful CTA path."
              : "Clearly prefer ideas that can sustain the selected 10-60 minute spoken narrative length.";

  const contextLines = isBusinessMode
    ? `Content mode: ${contentModeLabel(contentMode)}
Project type: ${formatLabel}
Niche/business focus: ${input.niche || "Not provided"}
Target audience: ${input.businessAudience || "Not provided"}
Offer/service: ${input.businessOffer || "Not provided"}
Market/location: ${input.businessLocation || "Not provided"}
Content goal: ${input.businessGoal || "Not provided"}
CTA: ${input.businessCta || "Not provided"}
Compliance/boundaries: ${input.businessCompliance || "None provided"}
Tone: ${input.tone}
Category: ${input.category}
Desired length/size: ${input.desiredLength}
Source type: ${input.sourceType}`
    : `Content mode: Story / Documentary
Project type: ${formatLabel}
Niche/focus: ${input.niche}
Tone: ${input.tone}
Category: ${input.category}
Desired length: ${input.desiredLength}
Source type: ${input.sourceType}`;

  const modeRules = ideaModeRules(contentMode);
  const intelligenceLines = `YouTube performance guidance:
${input.analyticsGuide || "No connected YouTube analytics guidance yet. Use general retention, clarity, and packaging best practices without inventing channel stats."}

Existing idea-library / white-space guidance:
${input.whiteSpaceGuide || "No existing idea-library pattern available yet. Build variety across titles, formats, subjects, and viewer promises."}

Agency revenue guidance:
- Primary business goal: ${input.moneyGoal || "Generate qualified Texas insurance conversations for Baxter Insurance Agency while preserving trust and compliance."}
- Offer or CTA path: ${input.affiliateOffer || "Use a helpful quote, policy review, referral, review, bundling, or coverage-question CTA. Do not invent products, savings, rates, or eligibility promises."}
- Risk lane: ${input.riskProfile || "Balanced, advertiser-safe documentary framing."}
- Production capacity: ${input.productionCapacity || "Not provided. Prefer ideas that can be produced consistently without padding."}`;

  return `Generate ${input.count} ${isBusinessMode ? "content" : "local insurance education"} ideas for Baxter Insurance Agency.

${contextLines}

${intelligenceLines}

Avoid duplicating or closely echoing these existing ideas:
${existingTitles.slice(0, 80).map((title) => `- ${title}`).join("\n") || "- none yet"}

Return strict JSON with this shape:
{
  "ideas": [
    {
      "title": "string",
      "hook": "string",
      "category": "string",
      "summary": "string",
      "whyCompelling": "string",
      "estimatedLengthPotential": "${isShortBook ? "Standard short book - about 15,000 words" : isLongBook ? "Standard long form book - about 60,000 words" : "45-60 min"}",
      "recommendedLengthMinutes": 45,
      "recommendedTone": "${input.tone || "Mysterious & gripping"}",
      "recommendedNarrationStyle": "${isBusinessMode ? "Journalistic" : "Investigative documentary"}",
      "sourceType": "string",
      "people": ["string"],
      "location": "string",
      "eventName": "string",
      "originalityScore": 0-100,
      "curiosityScore": 0-100,
      "emotionalScore": 0-100,
      "escalationScore": 0-100,
      "lengthPotentialScore": 0-100,
      "researchDifficultyScore": 0-100,
      "productionPriority": "High | Medium | Low",
      "suggestedAngle": "string",
      "ideaPowerPack": {
        "ideaMarketScore": 0-100,
        "titleThumbnailPretest": {
          "titles": [
            { "title": "string", "angle": "string", "score": 0-100 }
          ],
          "thumbnailPrompts": [
            { "overlayText": "2-5 words", "visualHook": "string", "score": 0-100 }
          ],
          "clickPromise": "string",
          "retentionPromise": "string"
        },
        "thumbnailFirstFit": {
          "visualClarityScore": 0-100,
          "coreImage": "one simple thumbnail image the viewer can understand instantly",
          "titleThumbnailMatch": "how the title and thumbnail promise the same thing",
          "firstFrameExpectation": "what the first 5 seconds must show or say to meet the click expectation",
          "hardToVisualizeWarning": "why this idea may be hard to sell visually, or why it is safe to build"
        },
        "sourceDepthPreflight": {
          "depthScore": 0-100,
          "bestLengthMinutes": 10,
          "sourceTypesNeeded": ["string"],
          "mustVerify": ["string"],
          "thinRisk": "string",
          "seriesPotential": "string"
        },
        "analyticsFit": {
          "fitScore": 0-100,
          "whyItFits": "string",
          "patternToUse": "string",
          "patternToAvoid": "string"
        },
        "ideaCluster": {
          "clusterName": "string",
          "role": "Pilot | Follow-up | Series part | Standalone",
          "followUpIdeas": ["string"],
          "shorts": ["string"]
        },
        "monetizationRisk": {
          "riskLevel": "Low | Medium | High",
          "riskScore": 0-100,
          "concerns": ["string"],
          "saferFraming": "string"
        },
        "monetizationStrategy": {
          "primaryRevenuePath": "string",
          "sponsorFit": "string",
          "affiliateAngle": "string",
          "cta": "string",
          "emailCaptureIdea": "string",
          "productIdea": "string",
          "revenueWarnings": ["string"]
        },
        "whiteSpace": {
          "whiteSpaceScore": 0-100,
          "underCoveredAngle": "string",
          "overdoneAngleToAvoid": "string",
          "differentiator": "string"
        }
      }
    }
  ]
}

Rules:
- The "ideas" array must contain exactly ${input.count} complete idea objects.
- If the topic combination seems narrow, ${isBusinessMode ? "broaden within the same audience, service, market, objections, questions, risks, comparisons, seasonal triggers, and decision moments." : "broaden within the same niche/category/tone using different eras, regions, institutions, lost records, overlooked people, abandoned places, strange legal cases, expeditions, disasters, local archives, and under-covered aftermath stories."}
- Do not stop after one strong idea. Keep going until the requested count is filled.
- Do not invent confirmed facts${isBusinessMode ? ", credentials, testimonials, local data, case results, or regulatory claims" : ""}.
- Every idea object must include title, hook, category, summary, all six score fields, productionPriority, and suggestedAngle.
- Every idea object must include the full ideaPowerPack object with all nine intelligence sections: market score, title/thumbnail pre-test, thumbnail-first fit, source depth preflight, analytics fit, idea cluster, monetization risk, monetization strategy, and white-space finder.
- Do not return partial idea objects, commentary, analysis, Markdown, or prose outside the JSON object.
${isBusinessMode ? '- Use "people" for audience personas or decision makers, "location" for the market/service area, and "eventName" for the service problem, campaign, or buyer decision moment.' : '- Use "people", "location", and "eventName" for real-world story context when known.'}
${modeRules}
- ${formatFitRule}
- Pick the best length/time or book size for each individual idea from: ${lengthChoices}.
- Pick recommendedTone exactly from: ${toneChoices}.
- Pick recommendedNarrationStyle exactly from: ${narrationChoices}.
- Treat lengthPotentialScore as Depth Strength: ${isBusinessMode ? "how much useful buyer education, search demand, proof, examples, objection handling, and practical substance exists to sustain the chosen output without padding." : "how much verifiable source/story material exists to sustain the chosen length without padding, repetition, or invented facts."}
- Score lengthPotentialScore low when the idea is likely ${isBusinessMode ? "a short post" : "a short segment"}, medium when it can support one complete standard output, and high only when there are enough ${isBusinessMode ? "angles, examples, questions, proof points, sections, and stakes" : "records, turns, source layers, locations, people, and unanswered questions"} for deep coverage.
- Score ideaMarketScore for qualified-prospect intent, packaging strength, repeatability, usefulness, and compliance-safe agency revenue potential.
- In titleThumbnailPretest, create three packaging options that test different curiosity promises without clickbait or false claims.
- In thumbnailFirstFit, apply the thumbnail-first rule: if the idea cannot be sold with one clear visual subject plus one mystery/evidence detail, score it lower and explain what stronger visual anchor is needed before scripting.
- The firstFrameExpectation must say how the opening line or visual immediately pays off the title/thumbnail promise. Good ideas should let the first 5 seconds say or show what the viewer clicked for.
- In sourceDepthPreflight, flag whether the idea can honestly support 10, 20, 30, 45, or 60 minutes and list the source types needed before writing.
- In analyticsFit, use only the YouTube performance guidance above. If no connected analytics exists, say the fit is based on general channel best practices.
- In ideaCluster, show how the idea fits into a repeatable channel lane with follow-up videos and Shorts cutdowns.
- In monetizationRisk, rate compliance, trust, and platform risk. Use educational framing and avoid promises about savings, coverage, eligibility, underwriting, carrier appetite, or claim outcomes.
- In monetizationStrategy, explain exactly how the idea supports qualified agency conversations without forcing the CTA into the script. Include service fit, CTA, email capture idea, follow-up asset, and warnings about revenue moves that would hurt trust or compliance.
- In whiteSpace, identify the under-covered angle and the common overdone angle to avoid.
- Make the length/time and narration choice fit the idea's substance, audience urgency, complexity, and payoff.`;
}

function ideaModeRules(mode: IdeaContentMode) {
  if (mode === "EXPERT_AUTHORITY") {
    return `- Generate authority-building content ideas for Baxter Insurance Agency or another real professional service business.
- Ideas must be educational, credible, and useful to the specified audience, not generic motivational content.
- Use buyer questions, objections, misconceptions, comparison angles, diagnostic frameworks, risks, checklists, case-study-style angles, and strong points of view.
- Do not promise outcomes, legal results, medical results, financial returns, or guaranteed rankings.
- If the niche is regulated, phrase ideas as general education and include compliance-safe boundaries in suggestedAngle.
- Make titles sound like content a serious expert would publish to earn trust before a sales conversation.`;
  }
  if (mode === "LOCAL_LEAD_GEN") {
    return `- Generate local lead-generation content ideas for a real service business.
- Each idea must connect a service, a location/service area, a customer problem, and a practical next step.
- Favor local SEO intent: "near me" questions, cost questions, seasonal problems, neighborhood issues, emergency decisions, comparison searches, and trust-building proof.
- Do not fabricate local statistics, reviews, testimonials, laws, or competitor claims.
- If a city or service area is missing, create ideas that can be adapted to the user's local market and mark the location as "service area".
- Make suggestedAngle include the search intent and the conversion path.`;
  }
  if (mode === "SALES_OFFER") {
    return `- Generate sales and offer assets, not general educational articles.
- Ideas may include sales letters, Gumroad pages, offer pages, email promos, webinar scripts, VSL scripts, proposals, and follow-up sequences.
- Each idea must identify the buyer, offer, objection, proof angle, urgency/why-now angle, and conversion action.
- Do not invent testimonials, earnings claims, scarcity, guarantees, bonuses, prices, or case studies unless the user supplied them.
- Make suggestedAngle explain the sales mechanism, objection handled, and CTA path.`;
  }
  if (mode === "EDUCATION_COURSE") {
    return `- Generate course and training assets, not generic blog topics.
- Ideas may include course blueprints, modules, lesson plans, worksheets, quizzes, training scripts, paid community prompts, and assessments.
- Each idea must state the learner, skill gap, learning outcome, teaching sequence, and practice/assessment element.
- Do not invent credentials, certifications, or regulated instruction. Keep claims educational and outcomes realistic.
- Make suggestedAngle include how the learner moves from confusion to usable competence.`;
  }
  if (mode === "BOOK_PUBLISHING") {
    return `- Generate book and publishing assets: nonfiction books, lead magnet books, authority books, Kindle books, illustrated books, outlines, and launch assets.
- Each idea must identify reader promise, book angle, chapterable framework, market shelf, and optional lead-generation path.
- Favor ideas with enough structure for chapters, examples, frameworks, research, or illustrations.
- Do not turn every idea into a sales pitch; books should read like books first.
- Make suggestedAngle explain the book promise and how the table of contents would create reader momentum.`;
  }
  if (mode === "REPURPOSE_MULTIPLIER") {
    return `- Generate content multiplication systems from one source asset.
- Ideas may include email series, shorts/reels, tweets or X posts, LinkedIn posts, blog posts, podcast notes, newsletters, and multi-platform campaigns.
- Each idea must specify the source asset, target platforms, adaptation angle, CTA path, and what should be preserved from the original.
- Do not invent new claims that are not in the source. Make platform-native transformations, not copied excerpts.
- Make suggestedAngle include the output bundle and the editorial logic for adapting it.`;
  }
  if (mode === "BRAND_CHANNEL_STRATEGY") {
    return `- Generate brand and channel strategy assets, not one-off content topics.
- Ideas may include niche positioning, audience definition, channel names, content pillars, visual identity, keyword themes, offer ladder, and publishing calendar.
- Each idea must connect audience, positioning, repeatable content system, monetization path, and brand rules.
- Do not claim market data or trend certainty unless source material supports it.
- Make suggestedAngle explain how the strategy becomes a repeatable content engine.`;
  }
  return `- Favor stories with natural escalation, human stakes, and strong curiosity loops.
- No cheesy horror framing or fake certainty.`;
}

function projectModeRules(mode: IdeaContentMode) {
  if (mode === "EXPERT_AUTHORITY") {
    return `- Treat this as expert authority content, not a mystery documentary.
- Build trust through clear teaching, diagnostic frameworks, objection handling, examples, and useful decision criteria.
- The output should make the expert sound experienced, specific, and credible without bragging or inventing proof.`;
  }
  if (mode === "LOCAL_LEAD_GEN") {
    return `- Treat this as local lead-generation content, not a mystery documentary.
- Tie the content to local search intent, local buyer urgency, service-area relevance, trust signals, and a soft quote or consultation CTA.
- Keep location claims adaptable unless the user supplied exact local facts.`;
  }
  if (mode === "SALES_OFFER") {
    return `- Treat this as sales or offer copy, not a neutral explainer.
- Build around the buyer's pain, desired outcome, offer mechanism, proof available from source material, objections, risk reversal if supplied, and one clear conversion action.
- Never invent testimonials, income claims, scarcity, guarantees, discounts, bonuses, deadlines, or prices.`;
  }
  if (mode === "EDUCATION_COURSE") {
    return `- Treat this as course, lesson, or training material.
- Define learner outcomes, module flow, teaching points, examples, practice activities, worksheets, quizzes, and checks for understanding.
- Keep the material clear enough for a learner to follow without expert context.`;
  }
  if (mode === "BOOK_PUBLISHING") {
    return `- Treat this as a publishing asset for nonfiction, lead magnet, authority, Kindle, or illustrated books.
- Build around reader promise, table-of-contents momentum, chapter logic, positioning, examples, launch assets, and reader action.
- Do not make the book feel like disguised ad copy unless the requested format is explicitly a lead magnet.`;
  }
  if (mode === "REPURPOSE_MULTIPLIER") {
    return `- Treat this as a content multiplier built from one source asset.
- Preserve the source's claims and meaning while adapting it into platform-native emails, shorts, posts, newsletters, podcast notes, blog pieces, or campaign assets.
- Do not add new factual claims, testimonials, numbers, or angles that the source does not support.`;
  }
  if (mode === "BRAND_CHANNEL_STRATEGY") {
    return `- Treat this as brand, niche, or channel strategy.
- Build positioning, audience definition, content pillars, visual identity notes, keyword themes, publishing cadence, offer ladder, and repeatable idea lanes.
- Keep the strategy usable as an operating plan, not a vague branding essay.`;
  }
  return `- Treat this as story or documentary content with natural escalation, human stakes, and factual restraint.`;
}

const POLICYFORGE_AGENCY_PROFILE = `Baxter Growth Lab agency profile:
- Agency: Baxter Insurance Agency, Inc.
- Phone: 281-445-1381
- Mailing address: 450 N Sam Houston Pkwy E Ste 103, Houston, TX 77060
- Licensed for General Lines and life in Texas only.
- Service area: Texas only, with strongest focus on Houston and surrounding areas.
- Primary lines: home and auto first; commercial, life, retention, referrals, and reviews as supporting lanes.
- Preferred carrier lanes: Germania, Travelers, SWYFFT, Progressive, GEICO, and other available markets when appropriate.
- Voice: local, practical, plain-English, consultative, no hype, no scare tactics, no guaranteed outcomes.`;

const POLICYFORGE_SOURCE_MEMORY = `Reusable insurance source memory:
- Texas Department of Insurance is the preferred public authority for Texas insurance education, complaints, consumer guidance, licensing, and state-specific rules.
- FEMA, NFIP, FloodSmart, local floodplain resources, and lender requirements are useful source lanes for flood education.
- Carrier pages and underwriting appetite should be treated as current only when the user supplies or verifies them. Do not invent carrier-specific eligibility or appetite.
- Policy terms, endorsements, limits, exclusions, deductibles, underwriting, carrier appetite, inspection results, and Texas regulations control actual coverage.
- Claims guidance must stay educational: document damage, protect property when safe, contact the carrier/claims number, keep receipts, and ask the agency for policy-review help. Do not promise payment or claim outcomes.
- Agency-specific facts: Baxter Insurance Agency, Inc. serves Texas, especially Houston and surrounding areas, and can invite prospects to call 281-445-1381 or request a quote/review.`;

function policyForgeScriptEngineBrief(input: {
  title: string;
  format?: StoryProjectFormat | string | null;
  targetLengthMinutes: number;
  category?: string | null;
  sourceType?: string | null;
  suggestedAngle?: string | null;
  location?: string | null;
  eventName?: string | null;
  channelVoiceGuide?: string;
}) {
  const scriptType = inferInsuranceScriptType(input);
  const cta = recommendedInsuranceCta(scriptType);
  return `Baxter Growth Lab Scripting Engine:
${POLICYFORGE_AGENCY_PROFILE}

Required pre-script brief:
- Target prospect: infer from title, growth lane, category, source material, and saved growth strategy.
- Policy/product focus: ${scriptType.policyFocus}
- Texas location: ${input.location || "Texas, with Houston-area context when relevant"}
- Pain point or decision moment: ${input.eventName || input.suggestedAngle || input.title}
- Script structure: ${scriptType.structure}
- Primary CTA: ${cta}
- Compliance boundaries: Texas-only; do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcomes.
- Proof/source notes: use source material, saved growth strategy, Texas DOI/TDI, FEMA/NFIP where relevant, carrier pages only when supplied, and agency knowledge as general education.

Coverage promise guardrails:
- Flag or remove: "guaranteed savings", "fully covered", "cheapest", "best rate guaranteed", "claim will be paid", "everyone qualifies", "no exclusions", "we can get anyone approved", "this carrier will cover it", or any equivalent promise.
- Use careful language: "may", "can depend on", "ask about", "review", "quote", "policy terms", "underwriting", "limits", "exclusions", "deductibles", "endorsements", "carrier appetite", and "Texas regulations".
- Never give legal, tax, claim, engineering, roofing, medical, financial-planning, or binding coverage advice.
- Treat Germania, Travelers, SWYFFT, Progressive, and GEICO as carrier lanes or available relationships only. Do not imply endorsement, availability, eligibility, or the lowest rate.

Quote-intent structures available:
- Home Quote: roof age, location, deductibles, replacement cost, wind/hail, water/flood distinction, updates, prior claims, review CTA.
- Auto Quote: drivers, vehicles, garaging ZIP, liability limits, UM/UIM, deductibles, teen drivers, household changes, quote CTA.
- Bundle Review: household changes, home/auto alignment, deductibles, liability limits, umbrella conversation, review CTA.
- Renewal Review: premium change, roof/vehicle/driver/business changes, coverage gaps, discounts only when supplied, review CTA.
- Storm Prep: wind/hail deductible, photos, home inventory, roof age, emergency documentation, carrier claims path, review CTA.
- Claims Prep: document, mitigate when safe, contact carrier, keep receipts, avoid outcome promises, policy-review CTA.
- Commercial Prospect: operations, lease/contract requirements, certificates, GL/BOP/property/auto/workers comp/cyber where relevant, quote CTA.
- Referral/Review Ask: gratitude, specific client moment, simple ask, no pressure, Google review/referral CTA.

CTA intelligence:
- Choose one primary CTA per output, not a pile of asks.
- Best CTAs: call 281-445-1381, request a Texas quote, schedule a policy review, ask about bundling, review flood coverage, prepare for renewal, refer a friend, or leave a Google review.
- Put CTAs after useful value. For spoken scripts, the primary CTA usually belongs in the outro or after the first real value beat; never interrupt the opening promise.

Local trust layer:
- When relevant, include Houston/Texas realities such as storm season, wind and hail, roof age, hurricane prep, flooding, traffic, teen drivers, landlord/rental exposure, certificates, contractors, lease requirements, renewal shock, and small-business growth.
- Do not fabricate local statistics, testimonials, reviews, neighborhood facts, laws, rates, or carrier appetite.

Objection handling bank:
- "I already have insurance."
- "I only care about price."
- "My mortgage company handles it."
- "I do not understand deductibles."
- "I will wait until renewal."
- "I thought flood was included."
- "My personal auto covers my business driving."
- "A certificate is just paperwork."
- Use one or two natural objections when they fit the script, then answer in plain English without lecturing.

Agency revenue scorecard criteria:
- Quote intent
- Trust and clarity
- Compliance safety
- Texas/local relevance
- CTA strength
- Objection handling
- Coverage-promise safety
- Usefulness to a real prospect

Supporting-asset expectation:
- Publishing packs should include reusable downstream assets: GBP post, client email, Facebook/social post, short-form clip hooks, call script, website article angle, and review/referral prompt when relevant.

${POLICYFORGE_SOURCE_MEMORY}`;
}

function inferInsuranceScriptType(input: {
  title: string;
  category?: string | null;
  sourceType?: string | null;
  suggestedAngle?: string | null;
  eventName?: string | null;
}) {
  const text = [input.title, input.category, input.sourceType, input.suggestedAngle, input.eventName].filter(Boolean).join(" ").toLowerCase();
  if (/storm|hail|wind|hurricane|roof|claim|damage|inventory/.test(text)) {
    return {
      policyFocus: "storm readiness, home insurance review, roof/wind/hail questions, and claim-documentation education",
      structure: "Storm Prep or Claims Prep"
    };
  }
  if (/flood|nfip|water/.test(text)) {
    return {
      policyFocus: "flood insurance education and the difference between flood coverage and standard homeowners coverage",
      structure: "Flood Coverage Review"
    };
  }
  if (/auto|driver|vehicle|car|teen|uninsured|um\/uim|commercial auto/.test(text)) {
    return {
      policyFocus: "Texas auto insurance, household drivers, liability limits, deductibles, and quote readiness",
      structure: "Auto Quote"
    };
  }
  if (/commercial|business|contractor|certificate|bop|liability|property|lease|workers|cyber|fleet/.test(text)) {
    return {
      policyFocus: "Texas business insurance, liability, commercial property, certificates, and quote readiness",
      structure: "Commercial Prospect"
    };
  }
  if (/renewal|retention|review|cross-sell|umbrella|bundle/.test(text)) {
    return {
      policyFocus: "renewal review, household review, bundling, umbrella, and account-rounding opportunities",
      structure: "Renewal Review or Bundle Review"
    };
  }
  if (/review|referral|google|relationship|thank/.test(text)) {
    return {
      policyFocus: "relationship marketing, referrals, Google reviews, and client retention",
      structure: "Referral/Review Ask"
    };
  }
  if (/life/.test(text)) {
    return {
      policyFocus: "Texas life insurance education and needs-review conversations",
      structure: "Client Education"
    };
  }
  return {
    policyFocus: "Texas home and auto insurance, coverage review, and quote readiness",
    structure: "Home Quote or Bundle Review"
  };
}

function recommendedInsuranceCta(scriptType: { structure: string }) {
  if (/Claims Prep|Storm Prep|Flood/i.test(scriptType.structure)) return "review your Texas policy before storm/flood urgency, document questions, and call Baxter Insurance Agency, Inc. at 281-445-1381 for a policy review or quote conversation.";
  if (/Commercial/i.test(scriptType.structure)) return "call 281-445-1381 or request a Texas business insurance review before signing a lease, accepting a contract, or needing a certificate.";
  if (/Referral|Review/i.test(scriptType.structure)) return "ask for a Google review, referral, or introduction in a grateful, low-pressure way.";
  if (/Renewal|Bundle/i.test(scriptType.structure)) return "schedule a renewal, bundle, or coverage review and call 281-445-1381.";
  return "request a Texas quote or policy review from Baxter Insurance Agency, Inc. and call 281-445-1381.";
}

export function projectGenerationPrompt(passType: ScriptPassType, input: {
  title: string;
  hook?: string | null;
  summary?: string | null;
  format?: StoryProjectFormat | string | null;
  targetLengthMinutes: number;
  targetWordCount: number;
  tone: string;
  narrationStyle: string;
  sourceMaterial?: string;
  sponsorBlurb?: string;
  sponsorLink?: string;
  thumbnailStyleGuide?: string;
  seoKeywordHints?: string;
  channelVoiceGuide?: string;
  analyticsGuide?: string;
  passContext?: string;
  category?: string | null;
  sourceType?: string | null;
  suggestedAngle?: string | null;
  location?: string | null;
  eventName?: string | null;
  contentMode?: IdeaContentMode;
}) {
  const format = input.format || "STANDALONE";
  const isArticle = format === "ARTICLE";
  const isPodcast = format === "PODCAST_EPISODE";
  const isEpisodicSeries = format === "EPISODIC_SERIES";
  const hasEpisodePlan = /Five-episode series plan/i.test(input.passContext || "");
  const isSeriesWorkflow = isEpisodicSeries || hasEpisodePlan;
  const isShortBook = format === "SHORT_BOOK";
  const isLongBook = format === "LONG_BOOK";
  const isBook = isShortBook || isLongBook;
  const contentMode = input.contentMode ?? inferProjectContentMode(input);
  const isStrategicProject = contentMode !== "STORY_DOCUMENTARY";
  const formatLabel = projectFormatLabel(format);
  const outputName = isSeriesWorkflow ? "five-episode video series" : projectOutputName(format);
  const seriesTargetWordCount = input.targetWordCount;
  const policyForgeEngineBrief = policyForgeScriptEngineBrief(input);
  const targetLine = isArticle
    ? `Target output: ${input.targetWordCount.toLocaleString()}-word article`
    : isBook
      ? `Target output: ${input.targetWordCount.toLocaleString()}-word ${isLongBook ? "long form" : "short"} book manuscript`
      : isSeriesWorkflow
        ? `Series target: five episodes, each about ${input.targetLengthMinutes} minutes\nTotal series target word count: ${seriesTargetWordCount.toLocaleString()} words`
        : `Target length: ${input.targetLengthMinutes} minutes\nTarget word count: ${input.targetWordCount}`;
  const shared = `${isStrategicProject ? "Content title" : "Story title"}: ${input.title}
Content mode: ${contentModeLabel(contentMode)}
Project type: ${formatLabel}
Hook: ${input.hook || "Not provided"}
Summary: ${input.summary || "Not provided"}
Category: ${input.category || "Not provided"}
Source type: ${input.sourceType || "Not provided"}
Suggested angle: ${input.suggestedAngle || "Not provided"}
Location or market: ${input.location || "Not provided"}
Event, service problem, or buyer moment: ${input.eventName || "Not provided"}
${targetLine}
Tone: ${input.tone}
Narration style: ${input.narrationStyle}
Channel voice and brand rules:
${input.channelVoiceGuide || "No saved channel voice profile."}

${policyForgeEngineBrief}

YouTube performance guidance:
${input.analyticsGuide || "No connected YouTube analytics guidance yet. Use general retention, clarity, and packaging best practices without inventing channel stats."}

Agency revenue and CTA guidance:
- If the saved growth strategy includes a revenue goal, lead magnet, quote URL, compliance lane, service focus, or primary CTA, honor it in the intro, outro, publishing pack, and final QA.
- Keep the main script prospect-first. Do not force quote language into the body unless the project format explicitly calls for quote, renewal, referral, or sales outreach.
- A revenue-focused output should preserve trust, retention, usefulness, and factual safety before it asks for a call, quote, review, referral, or policy review.
- For YouTube video projects, use the retention-script framework without becoming formulaic: match the title/thumbnail promise immediately, prove effort or credibility, create a clear curiosity gap, show the viewer they will get what they clicked for, and tease one extra payoff.
- Thumbnail-first rule: the first 5 seconds should say or show the same subject, object, map, document, person, event, or mystery promised by the title and thumbnail.
- Input-bias rule: make the viewer feel the work behind the video through verified effort, such as timeline reconstruction, source comparison, document review, map tracing, expert context, or evidence sorting. Never invent effort.
- Timing targets for video scripts: intro ideally under 30 seconds; first real story/value beat by 30-40 seconds; first strong payoff, reveal, practical warning, or useful epiphany by 75 seconds; a soft quote/review/referral/policy-review CTA may appear after the first real value beat, roughly around 90 seconds, only if it feels earned.
- Transition rule: every section should make the next section feel necessary. Avoid mechanical "Point two" transitions when a curiosity bridge can do the work.
- End-screen rule: the outro should quickly point to the next video by making it feel like the natural next question in the viewer's watch session.
- Do not use fake engagement bait, intentional mistakes, misleading claims, or deliberate factual errors to farm comments.

Source material provided by user:
${input.sourceMaterial || (isStrategicProject ? "No source material pasted yet. Do not fabricate credentials, testimonials, statistics, prices, laws, case results, local proof, market data, or outcomes." : "No source material pasted yet. Label uncertain details clearly.")}
Previous pass material:
${input.passContext || "No previous pass material available yet."}

${isStrategicProject
  ? `${contentModeLabel(contentMode)} rules:
${projectModeRules(contentMode)}
- Write for the specific buyer, audience, market, offer, and CTA implied by the idea.
- Do not invent credentials, testimonials, case results, prices, discounts, statistics, local facts, laws, medical advice, legal advice, financial advice, or guaranteed outcomes.
- If the niche is regulated or high-stakes, use general educational language and recommend speaking with a qualified professional.
- Keep the content practical, specific, and useful without sounding like generic filler.
- Do not use fake case studies, fake numbers, fake reviews, or competitor claims.`
  : `Accuracy rules:
- Separate Confirmed, Likely, Unverified, and Speculative details.
- Do not invent facts for true stories.
- Mark narrative reconstruction explicitly.
- Avoid AI-sounding phrases and generic intros.`}`;

  const ttsScriptRules = `TTS formatting rules for spoken script output:
- Spell out every number as words. Never use Arabic numerals in spoken script copy.
- Write dates, years, ages, times, ranges, money, percentages, addresses, cabin numbers, flight numbers, route numbers, and counts exactly as they should be read aloud.
- For difficult, unusual, non-English, or easily mispronounced names and places, use a TTS-friendly phonetic spelling inline on first mention. If the original spelling must remain clear, phrase it naturally once, such as "Curaçao, pronounced KUR-uh-sow," then use the normal name after that.
- Do not add editor-only pronunciation notes, brackets, footnotes, or stage directions.`;
  const ttsOutputRules = ttsScriptRules.split("\n").map((line) => `- ${line.replace(/^- /, "")}`).join("\n");
  const sponsorBlurb = isBook ? undefined : input.sponsorBlurb?.trim();
  const sponsorText = sponsorBlurb || "No agency CTA instructions provided.";
  const sponsorLink = isBook ? undefined : input.sponsorLink?.trim();
  const sponsorLinkText = sponsorLink || "No agency CTA link provided.";
  const sponsorLinkLanguage = isBook ? "agency CTA or offer-link" : isArticle ? "agency CTA or offer-link" : isPodcast ? "link in the show notes" : "link in the description";
  const bodySponsorRules = sponsorBlurb
    ? `Agency CTA placement rules:
- Do not include CTA, ad, promo, discount, offer, product, or "${sponsorLinkLanguage}" language anywhere in this body pass.
- Agency CTA copy belongs only in the separate opening and closing passes. The final assembled output will combine those pieces later.
- If previous material contains CTA copy, default sponsor text, or ad language, remove it from the body instead of rewriting it.`
    : `Agency CTA placement rules:
- No agency CTA instructions were provided.
- Do not invent CTA, ad, promo, discount, offer, product, or "${sponsorLinkLanguage}" language.`;
  const nonVideoPackLabel = isArticle ? "Article SEO Pack" : isPodcast ? "Podcast Show Notes Pack" : "Book Launch Pack";
  const nonVideoTitleKind = isArticle ? "article headline" : isPodcast ? "podcast episode title" : "book title and subtitle";
  const nonVideoDescriptionLabel = isArticle
    ? "SEO meta description, article excerpt, suggested URL slug, and reader CTA"
    : isPodcast
      ? "Podcast show notes with summary, chapters, guest/source notes if relevant, and listener CTA"
      : "Back-cover description, short sales-page blurb, suggested subtitle, categories, and reader CTA";
  const nonVideoPromptLabel = isArticle ? "Social post or reader discussion prompt" : isPodcast ? "Listener question or social caption" : "Reader discussion prompt or launch social caption";
  const nonVideoPasteTarget = isArticle ? "a CMS SEO/description field or article notes" : isPodcast ? "podcast show notes" : "a book sales page, Gumroad listing, or Amazon-style book description";
  const nonVideoSponsorContext = isBook
    ? `Book CTA rules:
Book projects do not use sponsor blurbs, sponsor links, ad reads, or product mentions.`
    : `Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link to include when useful:
${sponsorLinkText}`;
  const nonVideoSponsorRules = isBook
    ? `- Do not include sponsor blurbs, sponsor links, ad reads, product mentions, affiliate CTAs, or invented offers.`
    : `- If an agency CTA link is provided, include the exact link once in the CTA area: ${sponsorLink || "no agency CTA link"}.
- If no agency CTA link is provided, do not add a fake link.`;

  switch (passType) {
    case "INTRO":
      if (isSeriesWorkflow) {
        return `${shared}

Create opening narration for all five episodes in the series.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the YouTube description:
${sponsorLinkText}

Output plain text with these exact sections:
Episode One Intro
Episode Two Intro
Episode Three Intro
Episode Four Intro
Episode Five Intro

Rules:
- Each intro should be a distinct cold open for that specific episode, not a generic series trailer.
- Each intro should be roughly one strong opening paragraph.
- Use the episode plan if available.
- If agency CTA instructions are provided, include them exactly once inside each episode intro, briefly and naturally after the cold open.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the description only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or the description.
- Do not draft the full episodes yet.
- Do not use Markdown bullets, stage directions, or production notes.
- End each intro with a natural bridge into that episode's story.
${ttsOutputRules}`;
      }
      if (isArticle) {
        return `${shared}

Create Step 1: The Article Lead.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the article CTA:
${sponsorLinkText}

Output rules:
- Output one strong opening paragraph only.
- Open with the central question, human stakes, and reason the reader should continue.
- Do not welcome viewers or say "video."
- If agency CTA instructions are provided, include them exactly once after the opening context and before the article moves into the body.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or carrier promises.
- If no agency CTA instructions are provided, do not mention sponsors or products.
- Do not use Markdown headings, bullets, bracketed notes, or production notes.`;
      }
      if (isPodcast) {
        return `${shared}

Create Step 1: The Podcast Intro.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the show notes:
${sponsorLinkText}

Output rules:
- Output one paragraph only.
- Welcome the listener to the show, set up the story, and give one clear reason to keep listening.
- Vary the language from episode to episode. Do not use a stock template.
- If agency CTA instructions are provided, include them exactly once inside this intro. Work them in briefly and naturally before "Now, let's get into today's topic."
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the show notes only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or show notes.
- End with this exact sentence: Now, let's get into today's topic.
${ttsOutputRules}
- Do not use Markdown, headings, bullets, bracketed stage directions, or pause markers.`;
      }
      if (isBook) {
        return `${shared}

Create Step 1: The Book Preface.

Output rules:
- Output one concise reader-facing preface paragraph only.
- Welcome the reader into the book, frame the central question, and explain the promise of the story without sounding like a video intro.
- Vary the language from book to book. Do not use a stock template.
- Do not spoil the ending or over-explain the case.
- Book projects do not use sponsor blurbs, sponsor links, ad reads, or product mentions. Do not mention sponsors or products.
- Do not use Markdown headings, bullets, bracketed notes, stage directions, or production notes.`;
      }
      return `${shared}

Create Step 1: The Intro.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the YouTube description:
${sponsorLinkText}

Output rules:
- Output one paragraph only.
- Write a warm, human opening modeled on strong long-form YouTube and narrative podcast intros: welcome them to the channel, establish the high-level story, and create a clean reason to keep listening.
- Vary the language from video to video. Do not use a stock template.
- Do not spoil the ending or over-explain the case.
- If agency CTA instructions are provided, include the CTA message exactly once inside this intro. Work it in briefly and naturally after the opening context and before "Now, let's get into today's topic."
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- Preserve the CTA's phone number, link, and description-link instruction when provided. Condense lightly only if needed for flow.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the description only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or the description.
- End with this exact sentence: Now, let's get into today's topic.
${ttsOutputRules}
- Do not use Markdown, headings, bullets, bracketed stage directions, or pause markers.`;
    case "DOSSIER":
      return `${shared}

Create an insurance-ready research dossier, agency script brief, and fact ledger for this project.

Output plain text with these exact sections:
Agency Script Brief
Target Prospect
Policy Product Focus
Texas Location And Local Trust Layer
Pain Point Or Decision Moment
Recommended Script Structure
Primary CTA
Compliance Boundaries
Useful Objections To Answer
Research Dossier
Confirmed Facts
Likely But Needs Verification
Unverified Or Risky Claims
Timeline
People And Organizations
Locations
Source Leads
Reusable Source Memory
Fact Ledger
Do Not Say As Fact
Writer Notes

Rules:
- Treat this as the foundation for the whole script.
- Be strict about uncertainty. If a claim is not supported by source material, put it under Unverified Or Risky Claims or Do Not Say As Fact.
- Include a compact fact ledger with claim, confidence level, and how it should be handled in narration.
- The Agency Script Brief must identify the best quote-intent structure and primary CTA before any draft is written.
- Reusable Source Memory should list useful trusted source lanes such as Texas DOI/TDI, FEMA/NFIP, supplied carrier pages, agency notes, policy forms, renewal notes, claims documentation checklists, and local SEO questions. Do not invent exact source claims.
- Do not write the script yet.`;
    case "ANALYTICS_BRIEF":
      return `${shared}

Create a script-facing Analytics Brief for this project.

Output plain text with these exact sections:
Channel Performance Signals
Script Implications
Hook Instructions
Pacing Instructions
Length And Structure Guidance
Title Thumbnail Promise Notes
Do More Of This
Avoid This
Draft Instructions

Rules:
- Use only the YouTube performance guidance provided above. If no connected analytics exists, say that clearly and fall back to general best practices.
- Translate metrics and recommendations into writing instructions, not a public analytics report.
- Do not invent performance numbers, trends, competitors, or channel history.
- Make the brief immediately usable by Hook Lab, Structure, Retention Map, Draft, Rewrite, and Publishing Pack.`;
    case "EPISODES":
      return `${shared}

Create an episode plan for a deep five-part series from this idea.

Assume the topic can support five ${input.targetLengthMinutes}-minute videos if researched deeply. Your job is to find the strongest way to split the story into episodes without padding, repetition, or fake certainty.

Output plain text with these exact sections:
Series Thesis
Why This Deserves Five Episodes
Episode One
Episode Two
Episode Three
Episode Four
Episode Five
Under-Covered Angles
Original Research Leads
What Everyone Else Usually Misses
Episode Order Rationale
Best First Episode To Draft Now
Series Continuity Rules

Rules:
- Each episode must have its own central question, emotional promise, reveal arc, key evidence, and ending payoff.
- Include angles that may be under-covered, overlooked, locally reported, buried in timelines, or usually skipped by summary videos.
- Do not invent facts. If an episode depends on research that is not yet confirmed, label it as a research lead.
- Do not turn one thin story into five padded recaps. If an episode is risky or evidence-thin, say exactly what research would make it viable.
- In "Best First Episode To Draft Now," choose the strongest episode, but the full series workflow must still draft all five episodes. Do not ask the user to choose.`;
    case "SERIES_BIBLE":
      return `${shared}

Create the Series Bible for this five-episode project.

Output plain text with these exact sections:
Series Thesis
Audience Promise
Season Arc
Episode One Promise And Boundary
Episode Two Promise And Boundary
Episode Three Promise And Boundary
Episode Four Promise And Boundary
Episode Five Promise And Boundary
Recurring Mystery Thread
Continuity Rules
Spoiler Rules
Recap Rules
Escalation Rules
Title Thumbnail Promise
Final Draft Instructions

Rules:
- Treat this as the source of truth for all five episodes.
- Each episode needs its own promise, reveal arc, payoff, and boundary so the series never feels like one script chopped into pieces.
- Define what can be repeated, what must not be repeated, and what must be held back until later parts.
- Do not invent facts. Label uncertain leads as research leads.
- Make Part One through Part Five feel connected but individually satisfying.`;
    case "HOOK_LAB":
      if (isSeriesWorkflow) {
        return `${shared}

Create a Hook Lab for this five-episode series. If an episode plan exists, create hooks for each planned episode.

Output plain text with these exact sections:
Episode One Hook Candidates
Episode One Selected Hook
Episode Two Hook Candidates
Episode Two Selected Hook
Episode Three Hook Candidates
Episode Three Selected Hook
Episode Four Hook Candidates
Episode Four Selected Hook
Episode Five Hook Candidates
Episode Five Selected Hook
Series Hook Continuity Notes

Rules:
- Generate at least three possible cold opens for each episode, score each from 0-100, then choose the strongest hook for that episode.
- Do not choose only one episode. Every episode needs its own selected hook.
- Score for title/thumbnail promise match, first-frame expectation, curiosity, clarity, emotional charge, factual safety, originality, effort proof, and retention potential.
- Each selected hook should fit its episode's central question, not a title card or production note.
- Each selected hook should meet the click expectation within the first 5 seconds and imply the viewer will get the promised payoff.
- Prefer hooks that combine multiple jobs in one sentence: expectation match, effort/credibility proof, curiosity gap, and value assurance.
- Selected hooks must avoid unsupported claims and cheap sensationalism.`;
      }
      return `${shared}

Create a Hook Lab for this story. If an episode plan exists, use its selected first episode. If no episode plan exists, treat this as a ${outputName}.

Generate 8 possible cold opens, score each from 0-100, then choose the single strongest hook.

Output plain text with these exact sections:
Hook Candidates
Scoring Rationale
Selected Hook
Why This Hook Wins
How To Use It

Rules:
- You make the decision. Do not ask the user to choose.
- Score for title/thumbnail promise match, first-frame expectation, curiosity, clarity, emotional charge, factual safety, originality, effort proof, and retention potential.
- The selected hook should fit the ${outputName}, not a title card or production note.
- The selected hook should meet the click expectation within the first 5 seconds and imply the viewer will get the promised payoff.
- Prefer hooks that combine multiple jobs in one sentence: expectation match, effort/credibility proof, curiosity gap, and value assurance.
- The selected hook must avoid unsupported claims and cheap sensationalism.`;
    case "STORY_SPINE":
      return `${shared}

Create a locked story spine for the ${outputName}.

Output plain text with these exact sections:
Central Question
Emotional Promise
Main Mystery
Secondary Thread
Point Of View
Reveal Order
Payoff
Boundaries
Locked Spine

Rules:
- The Locked Spine section is the source of truth for later passes.
- Define what this story is really about beneath the facts. If an episode plan exists, respect the larger series arc.
- Define what should not be over-explained, overstated, or answered too early.
- Do not draft the full script.`;
    case "STRUCTURE":
      return `${shared}

Create a long-form narrative strategy and outline that obeys the research dossier, episode plan, selected hook, and locked story spine.

Include opening hook, main question, secondary mystery, reveal order, emotional promise, pacing plan, curiosity gaps, cliffhanger placements, retention checkpoints, and section-by-section outline.

Add these exact sections to the outline:
Agency Script Brief Check
Prospect Decision Moment
Quote Intent Structure
Coverage Promise Guardrails
Local Trust Layer
Objection Handling Plan
Title/Thumbnail Promise
First 5 Seconds Expectation Match
First 30 Seconds
First Value Beat
Effort Proof / Input Bias
Soft CTA Window
Primary Agency CTA
Supporting Asset Plan
End-Screen Bridge

Rules:
- Respect the Agency Script Brief from the dossier. If the brief is missing, infer one using the Baxter Growth Lab Scripting Engine.
- Pick one quote-intent structure and make the whole outline serve that structure.
- Add one or two natural prospect objections and where they should be answered.
- The local trust layer must be useful Texas/Houston context, not a tacked-on city mention.
- Coverage Promise Guardrails must list the exact claims the writer must avoid or hedge.
- The title/thumbnail promise must be deliverable in the first spoken lines or first visual beat.
- First 30 Seconds should include the cold open, effort/credibility proof, curiosity gap, and assurance that the viewer will get the promised payoff.
- First Value Beat should happen by 30-40 seconds when possible.
- Soft CTA Window should happen only after value, roughly around 90 seconds, and should be skipped if no quote, lead magnet, review, referral, renewal, or service path fits.
- Supporting Asset Plan should name the downstream GBP post, email, social post, short clip, call script, and website article angle the final pack should create.
- End-Screen Bridge should make the next video feel like the natural unanswered question.`;
    case "RETENTION_MAP":
      if (isBook) {
        return `${shared}

Create a reader retention and chapter momentum map for the ${outputName}.

Output plain text with these exact sections:
Reader Strategy
Chapter By Chapter Curiosity Plan
Open Loops
Chapter Payoffs
Reversals And Escalations
Quiet Moments
Weak Spots
Draft Instructions

Rules:
- Plan the reader's curiosity across the full book.
- Add a meaningful question, reveal, contradiction, or emotional turn in every chapter.
- Do not invent facts to create excitement.
- This is a planning document, not the full manuscript.`;
      }
      return `${shared}

Create a retention beat map for the ${outputName}.

Output plain text with these exact sections:
Retention Strategy
First 90 Seconds Plan
Title Thumbnail Promise Delivery
Effort Proof / Input Bias
Minute By Minute Curiosity Plan
Open Loops
Mini Payoffs
Reversals And Escalations
Quiet Moments
CTA Timing
End-Screen Bridge
Weak Spots
Draft Instructions

Rules:
- Plan the reader's or listener's curiosity across the full target length.
- The First 90 Seconds Plan must include: expectation match in the first 5 seconds, intro under 30 seconds when possible, first real value/story beat by 30-40 seconds, first payoff or epiphany by 75 seconds, and optional CTA only after value.
- Add a meaningful question, reveal, contradiction, or emotional turn every 3-5 minutes.
- Each major transition should make the viewer need the next section, not merely announce the next section.
- CTA Timing should identify whether a quote request, policy review, referral request, review request, lead magnet, or subscribe CTA belongs around 90 seconds, in the outro, in the description only, or nowhere.
- End-Screen Bridge should name the next natural video/question that keeps the watch session alive.
- Do not use fake engagement bait, deliberate errors, or misleading curiosity gaps.
- Do not invent facts to create excitement.
- This is a planning document, not the full script.`;
    case "SCRIPT_LENGTH_GOVERNOR":
      return `${shared}

Create a Script Length Governor for the ${outputName}.

Output plain text with these exact sections:
Target Runtime
Target Word Range
Maximum Word Ceiling
Section Word Budget
Pacing Budget
Must Expand
Must Compress
Runtime Risk Notes
Draft Instructions

Rules:
- Use the target length and target word count exactly as the controlling constraint.
- Give a realistic acceptable word range: minimum, ideal, and hard ceiling.
- For a five-episode series, create separate word budgets for Episode One through Episode Five and a total series budget.
- For each major section or episode, say what belongs there and what must not spill over.
- Prevent padding, repetition, fake certainty, overlong context, and bloated endings.
- This is a control document, not a script.`;
    case "OPEN_LOOP_LEDGER":
      return `${shared}

Create an Open Loop Ledger for the ${outputName}.

Output plain text with these exact sections:
Title Thumbnail Promise
Primary Open Loop
Secondary Open Loops
Section By Section Loop Plan
Mini Payoffs
Delayed Payoffs
Cliffhangers
Loops To Avoid
Unresolved Questions Allowed
Draft Instructions

Rules:
- Track what question is opened, when it is opened, how it keeps attention, and when it pays off.
- Make sure the script delivers the promise implied by the title, hook, and thumbnail.
- For a five-episode series, create separate loop ledgers for each episode and a series-level unanswered thread.
- Do not create fake mysteries or unsupported claims.
- Every loop must either pay off, be clearly framed as unresolved, or be removed.`;
    case "DRAFT":
      if (isSeriesWorkflow) {
        return `${shared}

Write the full spoken narration scripts for all five episodes in this episodic video series. Use the episode plan as the spine. If Hook Lab, Story Spine, Structure, or Retention Map material exists, apply it across the full five-episode series.

Output plain text with these exact sections:
Episode One: [episode title]
Episode Two: [episode title]
Episode Three: [episode title]
Episode Four: [episode title]
Episode Five: [episode title]

Episode rules:
- Each episode must be a complete standalone narration script with its own hook, middle, payoff, and closing bridge.
- Each episode should target roughly ${input.targetLengthMinutes} minutes.
- Total series target is roughly ${seriesTargetWordCount.toLocaleString()} words across all five episodes.
- Do not write one long documentary split by arbitrary labels. Each episode needs its own central question and reveal arc.
- Do not repeat the same recap at the start of every episode.
- Preserve series continuity, but make every episode satisfying on its own.
- Use short sentences during tension, longer sentences during setup, natural listener questions, mini payoffs every 3-5 minutes, and emotional resolution.
- In every episode, meet the title/thumbnail promise immediately, prove effort or credibility early, deliver a first payoff quickly, and use transitions that make the next section feel necessary.
- If an agency CTA, quote request, referral request, review request, or lead magnet is used, place it only after the viewer has received real value or in the outro. Never interrupt the opening promise.
- Do not invent facts. If source material is thin, deepen through verified context, timeline reconstruction, competing explanations, aftermath, source uncertainty, and why the story endured.

${bodySponsorRules}

${ttsScriptRules}`;
      }
      if (isArticle) {
        return `${shared}

Write the full article draft. Start from the selected Hook Lab angle. Obey the story spine, structure, and retention map, but write for readers instead of listeners.

Article rules:
- Write a complete article with a clear beginning, middle, and ending.
- Use concise paragraphs and helpful section headings.
- Keep the headline out of the body unless it improves readability.
- Make the article easy to scan without making it shallow.
- Follow the Agency Script Brief: target prospect, policy/product focus, Texas location, pain point, CTA, and compliance boundaries.
- Use the best quote-intent structure for the topic, such as Home Quote, Auto Quote, Bundle Review, Renewal Review, Storm Prep, Claims Prep, Commercial Prospect, Referral/Review Ask, or Client Education.
- Add Texas/Houston context where it helps the reader make a better insurance decision.
- Answer one or two natural objections in plain English when they fit.
- End with one clear agency CTA, such as call 281-445-1381, request a quote, schedule a review, review flood coverage, ask about bundling, refer a friend, or leave a review.
- Do not write teleprompter copy, host narration, stage directions, or video language.
- Do not use fake certainty, sensational claims, or unsupported facts.
- Do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcomes.
- Target roughly ${input.targetWordCount.toLocaleString()} words, but prioritize completeness and factual safety.

${bodySponsorRules}`;
      }
      if (isBook) {
        return `${shared}

Write the full ${isLongBook ? "long form" : "short"} book draft. Start from the selected Hook Lab angle. Obey the story spine, structure, and retention map, but write for readers who want a chaptered, immersive book.

${isLongBook ? "Long form book" : "Short book"} rules:
- Write a complete manuscript with a clear beginning, middle, and ending.
- Use clean chapter headings such as "Chapter One: The Road In" and short, readable paragraphs.
- Build chapters around evidence, chronology, human stakes, unanswered questions, and careful conclusions.
- Make the book easy to keep reading without using video, host, podcast, teleprompter, or production language.
- Do not use fake certainty, sensational claims, or unsupported facts.
- Target roughly ${input.targetWordCount.toLocaleString()} words, but prioritize completeness, factual safety, and chapter flow.
- If the model cannot fit the full target length, prioritize complete chapter structure, manuscript continuity, and clearly developed chapters over raw word count.

${bodySponsorRules}`;
      }
      return `${shared}

Write the full spoken narration script. If an episode plan exists, write the selected episode. Otherwise, write a ${outputName}. Start with the selected Hook Lab hook. Obey the story spine, structure, and retention beat map. Use short sentences during tension, longer sentences during setup, natural listener questions, mini payoffs every 3-5 minutes, and emotional resolution.

Length rules:
- Follow the Agency Script Brief: target prospect, policy/product focus, Texas location, pain point, CTA, and compliance boundaries.
- Use the best quote-intent structure for the topic, such as Home Quote, Auto Quote, Bundle Review, Renewal Review, Storm Prep, Claims Prep, Commercial Prospect, Referral/Review Ask, or Client Education.
- Include a useful Texas/Houston local trust layer when relevant: storm season, wind/hail, roof age, flooding, traffic, teen drivers, contractors, lease/certificate needs, renewal changes, or business growth.
- Answer one or two natural prospect objections in the body without sounding defensive or salesy.
- Use one clear CTA path. Do not stack calls, quotes, reviews, referrals, and subscriptions all at once.
- Do not promise savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcomes.
- Meet the title/thumbnail promise in the first spoken lines. The viewer should immediately feel, "this is the video I clicked."
- Keep the intro tight. Aim for under 30 seconds, start the first real story/value beat by 30-40 seconds, and deliver the first payoff, reveal, shock of context, or useful epiphany by roughly 75 seconds when the facts allow it.
- Show input bias early: the viewer should feel the verified work behind the script through records, maps, timelines, witness accounts, source comparison, expert context, or reconstruction. Do not fake sources or effort.
- If a quote, review, referral, renewal, or lead magnet CTA belongs in the script, place it only after real value has been delivered or in the outro. Do not interrupt the cold open.
- Write transitions that create need for the next section. Avoid mechanical "next" phrasing when a curiosity bridge can make the viewer continue.
- Do not use fake engagement bait, deliberate mistakes, misleading claims, or manufactured controversy to farm comments.
- Target roughly ${input.targetWordCount.toLocaleString()} words for about ${input.targetLengthMinutes} minutes.
- Do not stop at a summary. Build enough scenes, context, transitions, evidence, and careful analysis to sustain the requested runtime.
- If the source material is thin, deepen through verified context, timeline reconstruction, competing explanations, aftermath, source uncertainty, and why the story endured. Never pad, repeat, or invent facts.

${bodySponsorRules}

${ttsScriptRules}`;
    case "RETENTION_ANALYSIS":
      return `${shared}

Analyze the actual draft for viewer or reader retention.

Output plain text with these exact sections:
Overall Retention Score
Beat By Beat Drop-Off Risk
Hook Delivery
Pacing Problems
Payoff Density
Open Loop Follow-Through
Length Compliance
Confusing Or Boring Sections
Best Moments To Preserve
Rewrite Instructions

Rules:
- Score from 0-100 where useful.
- Compare the draft against the Retention Map, Open Loop Ledger, and Length Governor.
- Identify exact sections, episode parts, or approximate time ranges where attention may drop.
- For five-episode series, score each episode separately and then score the series.
- Do not rewrite the script here. Give direct instructions for Rewrite and Voice Polish.`;
    case "CRITIQUE":
      return `${shared}

Critique the existing ${outputName} as a Baxter Growth Lab agency-growth script.

Output plain text with these exact sections:
Overall Score
Quote Intent Score
Trust Score
Clarity Score
Compliance Safety Score
Texas Local Relevance Score
CTA Strength Score
Objection Handling Score
Usefulness Score
Hook And Retention Notes
Coverage Promise Risks
Weak Or Generic Sections
Rewrite Instructions

Rules:
- Score each category from 0-100.
- Grade whether the script would make a real Texas prospect more likely to call, request a quote, schedule a policy review, leave a review, refer someone, or start a renewal conversation.
- Check whether the script follows the Agency Script Brief and the best quote-intent structure.
- Flag missing or weak Texas/Houston context, generic filler, unclear service focus, overlong setup, weak CTA, and unanswered objections.
- Flag language that sounds like legal, tax, claim, engineering, roofing, medical, financial-planning, or binding coverage advice.
- Flag any promise of savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcome.
- Return specific rewrite instructions that can be applied directly.`;
    case "FACT_CHECK":
      return `${shared}

Run a fact and continuity check on the latest ${outputName}.

Output plain text with these exact sections:
Fact Risk Summary
Texas-Only Check
Coverage Promise Warnings
Carrier Statement Warnings
Claim Outcome Warnings
Legal Tax Or Professional Advice Warnings
Unsupported Claims
Continuity Issues
Name Date Place Checks
Cause And Motive Warnings
Timeline Problems
Overstatement Risks
CTA Compliance Check
Required Fixes
Safe Rewrite Guidance

Rules:
- Compare the ${outputName} against the dossier, source material, and prior notes.
- Flag claims that need hedging or removal.
- Flag contradictions in names, dates, places, chronology, causes, motives, and numbers.
- Flag any out-of-state language or advice that conflicts with Texas-only agency positioning.
- Flag any implied promise of savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcome.
- Flag any carrier-specific claim about Germania, Travelers, SWYFFT, Progressive, GEICO, or another carrier unless the source material directly supports it.
- Flag language that tells the prospect what is covered instead of inviting them to review policy terms, limits, exclusions, deductibles, endorsements, underwriting, carrier appetite, and Texas regulations.
- Safe Rewrite Guidance must provide replacement wording for risky insurance claims.
- Do not rewrite the script here.`;
    case "REWRITE":
      if (isSeriesWorkflow) {
        return `${shared}

Rewrite the full five-episode series to apply the critique and fact/continuity check. Improve each episode's hook, pacing, tension, engagement, emotional impact, narration rhythm, clarity, factual safety, and ending.

Rules:
- Preserve all five episode scripts.
- Keep clear plain-text episode headings.
- Do not collapse the series into one episode.
- Strengthen continuity between episodes without repeating the same recap.
- Keep each episode complete and satisfying on its own.

${bodySponsorRules}

${ttsScriptRules}`;
      }
      if (isArticle) {
        return `${shared}

Rewrite the article to apply the critique and fact/continuity check. Improve opening, section order, clarity, pacing, evidence handling, emotional impact, reader flow, and ending.

Article rules:
- Keep it article-ready, not spoken-script-ready.
- Use clear headings only where they help the reader.
- Remove video, teleprompter, host, stage, and production language.
- Preserve factual caution and attribution.
- Keep the ending complete and not abrupt.
- Strengthen quote intent, Texas/local relevance, objection handling, and CTA clarity.
- Remove or hedge any risky coverage, savings, carrier, underwriting, or claim outcome language.
- Keep one primary CTA and make it feel earned after useful education.

${bodySponsorRules}`;
      }
      if (isBook) {
        return `${shared}

Rewrite the ${isLongBook ? "long form" : "short"} book manuscript to apply the critique and fact/continuity check. Improve chapter order, opening pull, section transitions, clarity, evidence handling, emotional impact, reader flow, and ending.

${isLongBook ? "Long form book" : "Short book"} rules:
- Keep it book-ready, not spoken-script-ready.
- Use clear chapter headings and short readable paragraphs.
- Remove video, podcast, teleprompter, host, stage, and production language.
- Preserve factual caution and attribution.
- Keep the ending complete and not abrupt.

${bodySponsorRules}`;
      }
      return `${shared}

Rewrite the script to apply the critique and fact/continuity check. Improve opening, pacing, tension, engagement, emotional impact, narration rhythm, clarity, factual safety, and ending.

- Strengthen quote intent, Texas/local relevance, objection handling, and CTA clarity.
- Remove or hedge any risky coverage, savings, carrier, underwriting, or claim outcome language.
- Keep one primary CTA and make it feel earned after useful education.
- Preserve the Baxter voice: local, practical, plain-English, consultative, no hype, no scare tactics, no guaranteed outcomes.

${bodySponsorRules}

${ttsScriptRules}`;
    case "VOICE_POLISH":
      if (isSeriesWorkflow) {
        return `${shared}

Create the Voice Polish version of the full five-episode series.

Rules:
- Output all five complete episode scripts.
- Preserve clear plain-text headings: Episode One: [title], Episode Two: [title], Episode Three: [title], Episode Four: [title], Episode Five: [title].
- Remove AI-sounding cadence, generic documentary filler, repeated sentence rhythm, stiff transitions, cheap hype, and overused rhetorical questions.
- Make the narration sound human, specific, grounded, cinematic, and easy to perform.
- Preserve factual caution, episode boundaries, open-loop payoffs, and the Series Bible.
- Do not collapse, summarize, or shorten the series.
- Do not add production notes, Markdown fences, bullets, pause markers, or stage directions.
${ttsOutputRules}
${bodySponsorRules}`;
      }
      if (isArticle) {
        return `${shared}

Create the Voice Polish version of the article.

Rules:
- Output only the polished article.
- Remove AI-sounding cadence, generic filler, stiff transitions, repetitive paragraph openings, and over-explaining.
- Keep headings useful, paragraphs readable, and the argument/story specific.
- Preserve factual caution, source boundaries, and the strongest hook.
${bodySponsorRules}`;
      }
      if (isBook) {
        return `${shared}

Create the Voice Polish version of the ${isLongBook ? "long form" : "short"} book manuscript.

Rules:
- Output only the polished manuscript.
- Preserve chapter headings, chapter order, factual caution, continuity, and a complete ending.
- Remove AI-sounding cadence, generic filler, repetitive paragraph openings, stiff transitions, and video/podcast language.
- Improve human rhythm, specificity, narrative flow, and reader momentum without inventing facts.
${bodySponsorRules}`;
      }
      return `${shared}

Create the Voice Polish version of the ${outputName}.

Rules:
- Output only the polished spoken narration.
- Remove AI-sounding cadence, generic documentary filler, repeated sentence rhythm, stiff transitions, cheap hype, and overused rhetorical questions.
- Make the narration sound human, specific, grounded, cinematic, and easy to perform.
- Preserve factual caution, open-loop payoffs, retention improvements, and the strongest hook.
- Do not add Markdown, headings, title cards, bullets, pause markers, stage directions, or production notes.
${ttsOutputRules}
${bodySponsorRules}`;
    case "QUALITY_GATE":
      if (isSeriesWorkflow) {
        return `${shared}

Run the final quality gate before series polish.

Output plain text with these exact sections:
Overall Series Score
Episode One Score
Episode Two Score
Episode Three Score
Episode Four Score
Episode Five Score
Series Continuity Score
Retention Score
Clarity Score
Emotional Payoff Score
Factual Safety Score
Title Thumbnail Match Score
First 90 Seconds Score
Input Bias Score
Transition Strength Score
Monetization Fit Score
Must Fix Before Final Series
Final Polish Instructions

Rules:
- Score each category from 0-100.
- Be blunt and specific.
- Identify weak episodes, repetition, abrupt endings, continuity issues, unsupported claims, or teleprompter problems.
- Confirm whether all five episodes are present.
- Check whether each episode meets the title/thumbnail promise immediately, proves effort or credibility early, delivers an early payoff, and bridges naturally to the next section.
- Flag missing or heavy-handed agency CTA handling, especially if it hurts trust, compliance, or episode continuity.
- Reject any deliberate factual error, fake engagement bait, or misleading curiosity gap.
- Do not produce the final scripts here.`;
      }
      if (isArticle) {
        return `${shared}

Run the final quality gate before article polish.

Output plain text with these exact sections:
Overall Score
Lead Score
Reader Flow Score
Clarity Score
Emotional Payoff Score
Factual Safety Score
Publication Readiness Score
Quote Intent Score
Trust Score
Compliance Safety Score
Texas Local Relevance Score
CTA Strength Score
Objection Handling Score
Coverage Promise Safety Score
Must Fix Before Final Article
Final Polish Instructions

Rules:
- Score each category from 0-100.
- Be blunt and specific.
- Identify any remaining repetition, abrupt ending risk, awkward phrasing, weak headings, unsupported claims, or article-readability problems.
- Flag sponsor, ad, promo, discount, offer, product, or CTA language if it appears in the body article. Sponsor placement belongs only in the opening and closing passes.
- Flag missing, unclear, or trust-damaging quote/review/referral/renewal CTA language in the article assets.
- Score whether the article is likely to create a qualified agency action without creating compliance risk.
- Do not produce the final article here.`;
      }
      if (isPodcast) {
        return `${shared}

Run the final quality gate before podcast polish.

Output plain text with these exact sections:
Overall Score
Hook Score
Listener Retention Score
Clarity Score
Emotional Payoff Score
Factual Safety Score
Podcast Readiness Score
Quote Intent Score
Trust Score
Compliance Safety Score
Texas Local Relevance Score
CTA Strength Score
Objection Handling Score
Coverage Promise Safety Score
Must Fix Before Final Podcast Script
Final Polish Instructions

Rules:
- Score each category from 0-100.
- Be blunt and specific.
- Identify any remaining repetition, abrupt ending risk, awkward phrasing, unsupported claims, or spoken-readability problems.
- Flag sponsor, ad, promo, discount, offer, product, or "link in the show notes" language if it appears in the body script. Sponsor placement belongs only in the Podcast Intro and Podcast Outro.
- Flag missing, unclear, or trust-damaging quote/review/referral/renewal CTA language in the podcast assets.
- Score whether the episode is likely to create a qualified agency action without creating compliance risk.
- Do not produce the final podcast script here.`;
      }
      if (isBook) {
        return `${shared}

Run the final quality gate before ${isLongBook ? "long form book" : "short book"} polish.

Output plain text with these exact sections:
Overall Score
Opening Score
Chapter Flow Score
Clarity Score
Emotional Payoff Score
Factual Safety Score
Book Readiness Score
Monetization Fit Score
Must Fix Before Final ${isLongBook ? "Long Form Book" : "Short Book"}
Final Polish Instructions

Rules:
- Score each category from 0-100.
- Be blunt and specific.
- Identify any remaining repetition, abrupt ending risk, awkward phrasing, weak chapter headings, unsupported claims, or book-readability problems.
- Flag sponsor, ad, promo, discount, offer, product, or CTA language if it appears anywhere in the manuscript. Book projects should not use sponsor placement.
- Flag missing or trust-damaging launch-note, lead-magnet, or back-matter CTA opportunities.
- Do not produce the final ${isLongBook ? "long form book" : "short book"} here.`;
      }
      return `${shared}

Run the final quality gate before teleprompter polish.

Output plain text with these exact sections:
Overall Score
Hook Score
Retention Score
Clarity Score
Emotional Payoff Score
Factual Safety Score
Teleprompter Readiness Score
Title Thumbnail Match Score
First 90 Seconds Score
Input Bias Score
Transition Strength Score
Quote Intent Score
Trust Score
Compliance Safety Score
Texas Local Relevance Score
CTA Strength Score
Objection Handling Score
Coverage Promise Safety Score
Must Fix Before Final
Final Polish Instructions

Rules:
- Score each category from 0-100.
- Be blunt and specific.
- Identify any remaining repetition, abrupt ending risk, awkward phrasing, markdown, section labels, unsupported claims, or teleprompter problems.
- Check whether the script meets the title/thumbnail promise immediately, proves effort or credibility early, delivers an early payoff, and uses curiosity bridges instead of mechanical transitions.
- Flag sponsor, ad, promo, discount, offer, product, or "link in the description" language if it appears in the body script. Sponsor placement belongs only in the Intro and Outro.
- Flag missing, unclear, or trust-damaging quote/review/referral/renewal CTA language in the intro, outro, and publishing-pack path.
- Score whether the script is likely to create a qualified agency action without creating compliance risk.
- Reject any deliberate factual error, fake engagement bait, or misleading curiosity gap.
- Do not produce the final script here.`;
    case "FINAL":
      if (isSeriesWorkflow) {
        return `${shared}

Create the final teleprompter-ready five-episode series from the strongest previous series draft above. Apply the final quality gate instructions.

Output rules:
- Output all five final episode scripts.
- Use clear plain-text headings: Episode One: [title], Episode Two: [title], Episode Three: [title], Episode Four: [title], Episode Five: [title].
- Do not use Markdown fences, bullet lists, horizontal rules, title cards, stage directions, or production notes.
- Do not include bracketed pause markers. Never write [pause], [beat], [music], [sfx], or similar cues.
- Write clean narrator-ready paragraphs under each episode heading.
${ttsOutputRules}
${bodySponsorRules}
- Preserve the strongest hooks, transitions, tension, factual caution, and emotional endings.
- Remove AI-sounding phrases, unsupported claims, and production notes.
- Total series target is roughly ${seriesTargetWordCount.toLocaleString()} words across five ${input.targetLengthMinutes}-minute episodes.
- Every episode must have a complete final paragraph and must not end abruptly.
- Do not collapse the series into one summary or one selected episode.`;
      }
      if (isArticle) {
        return `${shared}

Create the final publication-ready article from the strongest previous article draft above. Apply the final quality gate instructions.

Output rules:
- Output only the final article.
- Use clean article formatting with a strong opening, short paragraphs, and useful section headings.
- Do not include Markdown fences, production notes, teleprompter notes, stage directions, or pause markers.
- Do not include video language such as "watch," "viewer," "thumbnail," or "subscribe to the channel" unless it is part of a separate CTA.
- Spell out numbers only when it improves readability; article copy may use standard numerals where readers expect them.
${bodySponsorRules}
- Preserve the strongest hook, clear transitions, factual caution, and emotional ending.
- Preserve the selected agency CTA, Texas/local trust layer, and useful objection handling.
- Remove any language that promises savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcomes.
- Keep the Baxter voice local, practical, plain-English, consultative, and calm.
- The article must have a complete final paragraph and must not end abruptly.`;
      }
      if (isBook) {
        return `${shared}

Create the final publication-ready ${isLongBook ? "long form" : "short"} book manuscript from the strongest previous book draft above. Apply the final quality gate instructions.

Output rules:
- Output only the final ${isLongBook ? "long form" : "short"} book manuscript.
- Use clean book formatting with a title, chapter headings, short readable paragraphs, and a complete final chapter.
- Keep chapter headings in plain text, such as "Chapter One: The Road In". Do not use Markdown fences.
- Do not include production notes, teleprompter notes, stage directions, pause markers, video language, podcast language, or thumbnail language.
- Spell out numbers only when it improves reader clarity; book copy may use standard numerals where readers expect them.
${bodySponsorRules}
- Preserve the strongest hook, clear transitions, factual caution, and emotional ending.
- The book must have a complete final paragraph and must not end abruptly.
- If the model cannot fit the full target length, prioritize complete chapter structure, manuscript continuity, and a complete beginning, middle, and ending over raw word count.`;
      }
      return `${shared}

Create the final ${isPodcast ? "podcast-ready" : "teleprompter-ready"} script from the strongest previous script above. Apply the final quality gate instructions.

Output rules:
- Output only the final spoken narration.
- Do not use Markdown.
- Do not use headings, title cards, chapter names, "Part One" labels, bullet points, lists, horizontal rules, or separator lines.
- Do not include bracketed stage directions or pause markers. Never write [pause], [beat], [music], [sfx], or similar cues.
- Write clean paragraphs for a narrator to read directly from a teleprompter.
${ttsOutputRules}
${bodySponsorRules}
- Preserve the strongest hook, clear transitions, tension, and emotional ending.
- Preserve the selected agency CTA, Texas/local trust layer, and useful objection handling.
- Remove any language that promises savings, coverage, eligibility, underwriting acceptance, carrier appetite, rate availability, or claim outcomes.
- Keep the Baxter voice local, practical, plain-English, consultative, and calm.
- Remove AI-sounding phrases, unsupported claims, and production notes.
- Target roughly ${input.targetWordCount.toLocaleString()} words for about ${input.targetLengthMinutes} minutes.
- The script must have a complete final paragraph and must not end abruptly.
- If the model cannot fit the full target length, prioritize a complete beginning, middle, and ending over raw word count, but do not collapse the story into a short summary.`;
    case "OUTRO":
      if (isSeriesWorkflow) {
        return `${shared}

Create closing narration for all five episodes in the series.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the YouTube description:
${sponsorLinkText}

Output plain text with these exact sections:
Episode One Outro
Episode Two Outro
Episode Three Outro
Episode Four Outro
Episode Five Outro

Rules:
- Each outro should be a short human closing paragraph for that specific episode.
- Episodes one through four should close the episode and naturally tease the next episode without spoiling it.
- Episode five should close the full series with a satisfying final note and a standard subscribe, like, comment, and share request.
- If agency CTA instructions are provided, include the agency CTA message exactly once at the very end of each outro.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the description only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or the description.
- Do not add new facts, new theories, credits, title cards, or production notes.
${ttsOutputRules}
- Do not use Markdown bullets, bracketed stage directions, or pause markers.`;
      }
      if (isArticle) {
        return `${shared}

Create the last step: The Article Closing CTA.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the article CTA:
${sponsorLinkText}

Output rules:
- Output one short closing paragraph only.
- Invite the reader to take one useful next step: call 281-445-1381, request a Texas quote, schedule a policy review, ask about bundling, review flood coverage, refer a friend, or leave a Google review. Choose the one that best fits the article.
- Keep the CTA educational and low pressure.
- If agency CTA instructions are provided, include the agency CTA message exactly once at the very end.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or carrier promises.
- If no agency CTA instructions are provided, do not mention sponsors or products.
- Do not add new facts, new theories, credits, title cards, or production notes.`;
      }
      if (isPodcast) {
        return `${shared}

Create the last step: The Podcast Outro.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the show notes:
${sponsorLinkText}

Output rules:
- Output one short human paragraph only.
- Thank the listener naturally and ask for one useful next step: call 281-445-1381, request a Texas quote, schedule a policy review, ask about bundling, review flood coverage, refer a friend, leave a Google review, or follow the show if this is truly a podcast-first asset. Choose the one that best fits the episode.
- Keep the CTA educational and low pressure.
- If agency CTA instructions are provided, include the agency CTA message exactly once at the very end.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the show notes only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or show notes.
- Vary the phrasing from episode to episode. Keep it sincere and conversational, not salesy.
- Do not add new facts, new theories, credits, title cards, or production notes.
${ttsOutputRules}
- Do not use Markdown, headings, bullets, bracketed stage directions, or pause markers.`;
      }
      if (isBook) {
        return `${shared}

Create the last step: The Closing Author Note.

Output rules:
- Output one short closing author note only.
- Thank the reader naturally and ask them to review the book, share it with someone who would care about the story, send questions, and follow the author or publication for more stories like this.
- Book projects do not use sponsor blurbs, sponsor links, ad reads, or product mentions. Do not mention sponsors or products.
- Vary the phrasing from book to book. Keep it sincere and conversational, not salesy.
- Do not add new facts, new theories, credits, title cards, or production notes.
- Do not use Markdown headings, bullets, bracketed notes, stage directions, or pause markers.`;
      }
      return `${shared}

Create the last step: The Outro.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link saved for the YouTube description:
${sponsorLinkText}

Output rules:
- Output one short human paragraph only.
- Thank the listener naturally and ask for one useful next step: call 281-445-1381, request a Texas quote, schedule a policy review, ask about bundling, review flood coverage, refer a friend, leave a Google review, or subscribe only if the asset is clearly a YouTube growth asset. Choose the one that best fits the script.
- Keep the CTA educational and low pressure.
- If agency CTA instructions are provided, include the agency CTA message exactly once at the very end of this outro, after any subscribe, like, comment, or share request.
- Use only the agency CTA instructions provided by the user. Never invent generic sponsor wording, savings claims, or default sponsor text.
- Preserve the CTA's phone number, link, and description-link instruction when provided. Condense lightly only if needed for flow.
- If a CTA link is provided, do not read the raw URL aloud. Say the link is in the description only if that fits the CTA instructions.
- If no agency CTA instructions are provided, do not mention sponsors, products, or the description.
- Vary the phrasing from video to video. Keep it sincere and conversational, not salesy.
- Do not add new facts, new theories, credits, title cards, or production notes.
${ttsOutputRules}
- Do not use Markdown, headings, bullets, bracketed stage directions, or pause markers.`;
    case "SCENE_CARDS":
      return `${shared}

Create production Scene Cards for the completed ${outputName}.

Output plain text with these exact sections:
Production Overview
Visual Style Rules
Scene Cards
On-Screen Text Moments
B-Roll And Evidence Visuals
Sound And Music Cues
Thumbnail Moment Candidates
Shorts Clip Candidates
Risk And Sensitivity Notes
Asset Checklist

Rules:
- This is a production file, not narration. Do not rewrite the script.
- Keep final narration clean; put all visuals, SFX, music, captions, and editing notes here.
- For each scene card include: approximate timestamp or section, narration beat, visual idea, on-screen text if any, SFX/music cue if useful, and asset prompt or source note.
- For five-episode series, separate Scene Cards by Episode One through Episode Five.
- Include 5-10 Shorts clip candidates with hook line, source moment, caption angle, and CTA back to the full video.
- Do not request fake evidence, fake documents, fake real-person confessions, gore, exploitation, or exact copyrighted/celebrity styles.
- Keep visual prompts aligned with the saved channel thumbnail/style guidance when available.`;
    case "PUBLISHING_PACK":
      if (isArticle) {
        return `${shared}

Create the final Article SEO Pack and Topical Authority Map for this completed article.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link to include when useful:
${sponsorLinkText}

SEO keyword hints from DataForSEO, when available:
${input.seoKeywordHints || "No keyword metrics available. Use the strongest natural search phrases from the article topic."}

Return strict JSON only. Do not use Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "titles": [
    { "title": "Article headline option 1", "angle": "Why this headline should earn clicks from the right reader" },
    { "title": "Article headline option 2", "angle": "Why this headline should earn clicks from the right reader" },
    { "title": "Article headline option 3", "angle": "Why this headline should earn clicks from the right reader" }
  ],
  "description": "CMS-ready article excerpt and reader CTA. Include the agency CTA link once if provided.",
  "tags": ["tag one", "tag two"],
  "thumbnailPrompts": [],
  "pinnedComment": "Reader discussion or social post prompt",
  "conversionAssets": {
    "gbpPost": "Google Business Profile post draft",
    "clientEmail": "short client/prospect email version",
    "facebookPost": "Facebook or social post",
    "shortClipHooks": ["short-form clip hook 1", "short-form clip hook 2", "short-form clip hook 3"],
    "callScript": "short call script for staff or producer",
    "websiteArticleAngle": "website page/article follow-up angle",
    "macalyLandingPagePrompt": "comprehensive prompt to paste into Macaly.com for a standalone landing page matched to this article and its conversion goal",
    "reviewReferralPrompt": "review or referral prompt if relevant"
  },
  "seoPack": {
    "primaryKeyword": "one main keyword phrase",
    "secondaryKeywords": ["supporting keyword", "related question"],
    "searchIntent": "Informational, commercial, local, investigative, comparison, or mixed intent",
    "seoTitle": "title tag under about 60 characters when possible",
    "metaDescription": "meta description under about 155 characters when possible",
    "urlSlug": "short-url-slug",
    "h1": "article H1",
    "h2Outline": ["H2 section one", "H2 section two"],
    "faq": [
      { "question": "reader/search question", "answer": "concise answer for the article FAQ" }
    ],
    "internalLinkSuggestions": ["suggested internal article/page to link to"],
    "externalSourceSuggestions": ["credible source type or site to cite"],
    "schemaRecommendation": "Article, FAQPage, LocalBusiness, HowTo, or other appropriate schema",
    "featuredSnippetTarget": "short answer target or list/table target",
    "imagePlan": [
      { "placement": "after H2 section name", "prompt": "image prompt", "altText": "SEO alt text", "caption": "caption text" }
    ]
  },
  "topicalAuthorityMap": {
    "pillarTopic": "main topical authority theme",
    "audience": "target reader or buyer",
    "authorityGoal": "what this cluster should make the site known for",
    "clusters": [
      {
        "clusterName": "cluster name",
        "pillarArticle": "pillar article title",
        "supportingArticles": [
          {
            "title": "supporting article title",
            "primaryKeyword": "target keyword",
            "intent": "search intent",
            "funnelStage": "awareness, consideration, decision, retention, or trust",
            "priority": "High, Medium, or Low",
            "angle": "why this article should exist",
            "internalLinks": ["pillar or related article title"]
          }
        ]
      }
    ],
    "recommendedNextArticles": [
      {
        "title": "next article to create",
        "primaryKeyword": "target keyword",
        "intent": "search intent",
        "funnelStage": "awareness, consideration, decision, retention, or trust",
        "priority": "High, Medium, or Low",
        "angle": "why this should be next",
        "internalLinks": ["related article title"]
      }
    ]
  }
}

Rules:
- Provide exactly 3 article headline options.
- Provide 12-20 useful tags, including keyword variants, topic terms, local/service terms when relevant, people/place terms when relevant, and broad category terms without stuffing.
- thumbnailPrompts must be an empty array for articles.
- seoPack is required and must be directly useful for publishing the current article.
- topicalAuthorityMap is required and must help the user know what articles to create next.
- conversionAssets is required and must adapt the article into agency growth assets without adding unsupported claims.
- macalyLandingPagePrompt is required inside conversionAssets. Write it as a complete prompt the user can paste into Macaly.com to build a standalone landing page for this article's goal. It must specify: page goal, target Texas audience, Baxter Insurance Agency context, hero headline/subheadline, trust section, problem section, education/value section, quote or review/referral CTA section, lead form fields to include, form-disclaimer copy, FAQ section, local SEO cues, mobile-first design direction, tone, color/visual guidance, analytics/tracking placeholders, and compliance boundaries. Do not ask Macaly to edit baxterinsuranceagency.com directly.
- Topical Authority Map should include 3-5 clusters and 12-25 supporting article ideas total.
- recommendedNextArticles should list the best 5-8 articles to create after this one.
- For local lead-gen or expert/authority articles, include local service, cost, comparison, objection, FAQ, trust, and decision-intent articles.
- For story/documentary articles, include background, timeline, evidence, location, unanswered questions, related cases, and source-guide articles.
- If SEO keyword hints are available, use the most relevant phrases naturally in the primary keyword, secondary keywords, title tag, meta description, tags, and authority map.
- If an agency CTA link is provided, include the exact link once in the description CTA area: ${sponsorLink || "no agency CTA link"}.
- If no agency CTA link is provided, do not add a fake link.
- Do not use video-only language, podcast language, thumbnail instructions, or Shazi production notes.`;
      }

      if (isPodcast || isBook) {
        return `${shared}

Create the final ${nonVideoPackLabel} for this completed ${outputName}.

${nonVideoSponsorContext}

SEO keyword hints from DataForSEO, when available:
${input.seoKeywordHints || "No keyword metrics available. Use the strongest natural search phrases from the story."}

Return strict JSON only. Do not use Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "titles": [
    { "title": "Title option 1", "angle": "Why this title should test well" },
    { "title": "Title option 2", "angle": "Why this title should test well" },
    { "title": "Title option 3", "angle": "Why this title should test well" }
  ],
  "description": "${nonVideoDescriptionLabel}",
  "tags": ["tag one", "tag two"],
  "thumbnailPrompts": [],
  "pinnedComment": "${nonVideoPromptLabel}",
  "conversionAssets": {
    "gbpPost": "Google Business Profile post draft",
    "clientEmail": "short client/prospect email version",
    "facebookPost": "Facebook or social post",
    "shortClipHooks": ["short-form clip hook 1", "short-form clip hook 2", "short-form clip hook 3"],
    "callScript": "short call script for staff or producer",
    "websiteArticleAngle": "website page/article follow-up angle",
    "macalyLandingPagePrompt": "comprehensive prompt to paste into Macaly.com for a standalone landing page matched to this content and its conversion goal",
    "reviewReferralPrompt": "review or referral prompt if relevant"
  }
}

Rules:
- Provide exactly 3 ${nonVideoTitleKind} options.
- Titles should be curiosity-driven, factual, human, and clickable without false claims.
- The description should be ready to paste into ${nonVideoPasteTarget}.
- conversionAssets is required and must adapt this ${outputName} into agency growth assets without adding unsupported claims.
- macalyLandingPagePrompt is required inside conversionAssets. Write it as a complete prompt the user can paste into Macaly.com to build a standalone landing page for this ${outputName}'s goal. It must specify: page goal, target Texas audience, Baxter Insurance Agency context, hero headline/subheadline, trust section, problem section, education/value section, quote or review/referral CTA section, lead form fields to include, form-disclaimer copy, FAQ section, local SEO cues, mobile-first design direction, tone, color/visual guidance, analytics/tracking placeholders, and compliance boundaries. Do not ask Macaly to edit baxterinsuranceagency.com directly.
${nonVideoSponsorRules}
- Tags should include useful names, places, categories, spellings, and broad topic terms without stuffing.
- If SEO keyword hints are available, use the most relevant phrases naturally.
- thumbnailPrompts must be an empty array for this project type.
- Do not include YouTube thumbnail instructions, video-only language, or Shazi production notes.`;
      }
      if (isSeriesWorkflow) {
        return `${shared}

Create the final YouTube Publishing Packs for this completed five-episode series.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link to include in each YouTube description:
${sponsorLinkText}

Channel thumbnail style guide:
${input.thumbnailStyleGuide || "Use a premium documentary thumbnail style with consistent lighting, texture, and composition across all videos."}

SEO keyword hints from DataForSEO, when available:
${input.seoKeywordHints || "No keyword metrics available. Use the strongest natural search phrases from the story."}

Return strict JSON only. Do not use Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "episodePacks": [
    {
      "episodeNumber": 1,
      "partLabel": "Part 1",
      "titles": [
        { "title": "Part 1: Title option 1", "angle": "Why this title should test well" },
        { "title": "Part 1: Title option 2", "angle": "Why this title should test well" },
        { "title": "Part 1: Title option 3", "angle": "Why this title should test well" }
      ],
      "description": "YouTube description text for Part 1 only",
      "tags": ["tag one", "tag two"],
      "thumbnailPrompts": [
        { "title": "Part 1 thumbnail concept 1", "overlayText": "PART 1 HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible Part 1 text" },
        { "title": "Part 1 thumbnail concept 2", "overlayText": "PART 1 HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible Part 1 text" },
        { "title": "Part 1 thumbnail concept 3", "overlayText": "PART 1 HOOK", "prompt": "Ideogram 4 Runware image prompt that includes visible Part 1 text" }
      ],
      "sunoPrompt": {
        "title": "Short track concept title",
        "prompt": "Suno.com background music prompt for this specific episode"
      },
      "pinnedComment": "Pinned comment text for Part 1"
    }
  ]
}

Rules:
- Provide exactly five episodePacks: Part 1, Part 2, Part 3, Part 4, and Part 5.
- Every title option must include the exact matching part label, such as "Part 1:" or "Part 2:".
- Every thumbnail prompt title, overlayText, and prompt must include the exact matching part label.
- Each episode pack must be for that episode only, not the whole series.
- Each episode pack must include exactly 3 title options, 12-20 tags, exactly 3 thumbnail prompts, one pinned comment, and one Suno prompt.
- Descriptions must be ready to paste into YouTube and must accurately summarize only that episode without unsupported claims.
- Each title, thumbnail, first description sentence, and pinned comment must sell the same promise. Do not create a title/thumbnail promise the episode does not deliver in the first 30 seconds.
- Each episode description should include a brief value assurance: what the viewer will understand, discover, or feel by watching this part.
- If an episode has a natural agency CTA, lead magnet, quote request, review request, or referral tie-in, place it in the CTA blocks only after the episode promise is clear. Do not make the whole pack feel like an ad.
- Each description must follow this exact block order, separated by blank lines:
  1. MAIN KEYWORD: one search-focused phrase for the episode, no label, no hashtag, title case or natural case.
  2. CTA LINK: if an agency CTA link is provided, put a short direct CTA plus the exact link; if no CTA link is provided, put a short subscribe/comment CTA with no fake URL.
  3. DESCRIPTION PART 1: 2-4 sentences that hook the viewer and summarize that episode's central story.
  4. TIMESTAMPS: include a "Timestamps:" heading and 5-8 estimated timestamps in MM:SS format for that episode's major story beats.
  5. DESCRIPTION PART 2: 2-4 sentences with deeper context, stakes, and what the viewer will learn in that episode.
  6. CTA WITH LINK: if an agency CTA link is provided, repeat the exact link with a clear CTA; if no CTA link is provided, use a like/subscribe/comment CTA with no fake URL.
  7. 3-5 HASHTAGS: one final line containing only 3-5 relevant hashtags.
- Do not add labels like "MAIN KEYWORD" or "DESCRIPTION PART 1"; output the actual YouTube-ready text only.
- If an agency CTA link is provided, each description must include the exact link string at least twice: ${sponsorLink || "no agency CTA link"}.
- Thumbnail prompts should produce bold clickbait documentary images, not generic stock art or quiet poster art.
- Keep all fifteen thumbnail prompts in the same channel family while making each part visually distinct.
- For every thumbnail, provide overlayText as exactly 2-4 punchy all-caps words and include PART 1, PART 2, PART 3, PART 4, or PART 5 as appropriate.
- Every thumbnail prompt must explicitly specify the exact overlay text, where it appears, one or two red arrows/circles, what those arrows/circles point at, the main focal subject, background, color accents, curiosity gap, and matching part label.
- Every thumbnail prompt must be thumbnail-first: one dominant subject, one mystery/evidence detail, instant readability on mobile, and a visual that can be echoed in the first 5 seconds of the episode.
- Pinned comments should ask for a genuine viewer interpretation, theory, memory, or next-question response. Do not use intentional typos, fake mistakes, or manipulative engagement bait.
- Do not copy any competitor thumbnail, face, layout, logo, or exact framing.
- Suno prompts must be instrumental only, no vocals, no lyrics, loopable, emotionally aligned to that episode, and not so busy that they compete with voiceover.
- Do not reference copyrighted songs, bands, composers, celebrity voices, or exact artist styles.
- Do not include Shazi production notes.`;
      }
      return `${shared}

Create the final YouTube Publishing Pack for this completed script.

Agency CTA instructions provided by the user:
${sponsorText}

Agency CTA link to include in the YouTube description:
${sponsorLinkText}

Channel thumbnail style guide:
${input.thumbnailStyleGuide || "Use a premium documentary thumbnail style with consistent lighting, texture, and composition across all videos."}

SEO keyword hints from DataForSEO, when available:
${input.seoKeywordHints || "No keyword metrics available. Use the strongest natural search phrases from the story."}

Return strict JSON only. Do not use Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "titles": [
    { "title": "Title option 1", "angle": "Why this title should test well" },
    { "title": "Title option 2", "angle": "Why this title should test well" },
    { "title": "Title option 3", "angle": "Why this title should test well" }
  ],
  "description": "YouTube description text using the exact required block order",
  "tags": ["tag one", "tag two"],
  "thumbnailPrompts": [
    { "title": "Thumbnail concept 1", "overlayText": "Required 2-4 word all-caps in-image text", "prompt": "Ideogram 4 Runware image prompt" },
    { "title": "Thumbnail concept 2", "overlayText": "Required 2-4 word all-caps in-image text", "prompt": "Ideogram 4 Runware image prompt" },
    { "title": "Thumbnail concept 3", "overlayText": "Required 2-4 word all-caps in-image text", "prompt": "Ideogram 4 Runware image prompt" }
  ],
  "sunoPrompt": {
    "title": "Short track concept title",
    "prompt": "Suno.com background music prompt for this specific video"
  },
  "pinnedComment": "Pinned comment text",
  "conversionAssets": {
    "gbpPost": "Google Business Profile post draft",
    "clientEmail": "short client/prospect email version",
    "facebookPost": "Facebook or social post",
    "shortClipHooks": ["short-form clip hook 1", "short-form clip hook 2", "short-form clip hook 3"],
    "callScript": "short call script for staff or producer",
    "websiteArticleAngle": "website page/article follow-up angle",
    "macalyLandingPagePrompt": "comprehensive prompt to paste into Macaly.com for a standalone landing page matched to this video and its conversion goal",
    "reviewReferralPrompt": "review or referral prompt if relevant"
  }
}

Rules:
- Provide exactly 3 title options. Do not score or choose a winner; YouTube will test them.
- Titles should be curiosity-driven, factual, human, and clickable without false claims.
- Description should be ready to paste into YouTube and accurately summarize the story without unsupported claims.
- Each title, thumbnail, first description sentence, and pinned comment must sell the same promise. Do not create a title/thumbnail promise the script does not deliver in the first 30 seconds.
- Include a brief value assurance in the description: what the viewer will understand, discover, or feel by watching.
- If there is a natural agency CTA, lead magnet, quote request, review request, or referral tie-in, place it in the CTA blocks only after the video promise is clear. Do not make the whole pack feel like an ad.
- Description must follow this exact block order, separated by blank lines:
  1. MAIN KEYWORD: one search-focused phrase for the video, no label, no hashtag, title case or natural case.
  2. CTA LINK: if an agency CTA link is provided, put a short direct CTA plus the exact link; if no CTA link is provided, put a short subscribe/comment CTA with no fake URL.
  3. DESCRIPTION PART 1: 2-4 sentences that hook the viewer and summarize the central story.
  4. TIMESTAMPS: include a "Timestamps:" heading and 5-8 estimated timestamps in MM:SS format for the major story beats. Base timestamps on the actual completed script word count in the context, not the requested target length.
  5. DESCRIPTION PART 2: 2-4 sentences with deeper context, stakes, and what the viewer will learn, without unsupported claims.
  6. CTA WITH LINK: if an agency CTA link is provided, repeat the exact link with a clear CTA; if no CTA link is provided, use a like/subscribe/comment CTA with no fake URL.
  7. 3-5 HASHTAGS: one final line containing only 3-5 relevant hashtags.
- Do not add labels like "MAIN KEYWORD" or "DESCRIPTION PART 1"; output the actual YouTube-ready text only.
- If an agency CTA link is provided, the description must include the exact link string at least twice: ${sponsorLink || "no agency CTA link"}.
- If agency CTA instructions are provided, use the agency's requested next step in the two CTA blocks. Do not invent sponsor terms, savings claims, or carrier promises.
- If no agency CTA link is provided, do not add a fake link.
- Do not put hashtags in the tags array only; the description itself must end with 3-5 hashtags.
- Tags are secondary; include 12-20 useful tags when possible: names, places, alternate spellings, categories, historical context, documentary phrases, mystery phrases, and broad topic terms without stuffing.
- If SEO keyword hints are available, use the most relevant high-volume phrases naturally in the main keyword, description, tags, and hashtags.
- Provide exactly 3 thumbnail prompts designed for high-CTR 16:9 YouTube thumbnails.
- Thumbnail prompts should produce bold clickbait documentary images, not generic stock art or quiet poster art.
- All three thumbnail prompts must clearly belong to the same channel family and follow the style guide above.
- Each thumbnail must have a different curiosity angle and a different visual hook.
- For every thumbnail, provide overlayText as exactly 2-4 punchy words in ALL CAPS. It must be intended to appear inside the generated image.
- Every prompt must explicitly specify the exact overlay text, where it appears, one or two red arrows/circles, what those arrows/circles point at, the main focal subject, background, color accents, and curiosity gap.
- Keep the composition simple: one dominant subject plus one mystery/evidence detail, with no more than 2-3 major visual elements.
- Every thumbnail prompt must be thumbnail-first: instant readability on mobile, one clear subject, one evidence/mystery detail, and a visual that can be echoed in the first 5 seconds of the video.
- Pinned comments should ask for a genuine viewer interpretation, theory, memory, or next-question response. Do not use intentional typos, fake mistakes, or manipulative engagement bait.
- Do not copy any competitor thumbnail, face, layout, logo, or exact framing.
- Provide one sunoPrompt for background music specific to this video.
- conversionAssets is required. Adapt the finished script into a GBP post, short email, Facebook/social post, three short-form clip hooks, staff call script, website article angle, Macaly landing page prompt, and review/referral prompt when relevant.
- macalyLandingPagePrompt is required inside conversionAssets. Write it as a complete prompt the user can paste into Macaly.com to build a standalone landing page for this video's goal. It must specify: page goal, target Texas audience, Baxter Insurance Agency context, hero headline/subheadline, embedded video or article-summary section, trust section, problem section, education/value section, quote or review/referral CTA section, lead form fields to include, form-disclaimer copy, FAQ section, local SEO cues, mobile-first design direction, tone, color/visual guidance, analytics/tracking placeholders, and compliance boundaries. Do not ask Macaly to edit baxterinsuranceagency.com directly.
- Every conversion asset must keep the same compliance boundaries: Texas-only, no savings guarantees, no coverage promises, no carrier promises, no claim outcome promises.
- The Suno prompt must be designed for background music under spoken narration: instrumental only, no vocals, no lyrics, loopable, emotionally aligned to the story, and not so busy that it competes with voiceover.
- Include genre/style, mood, instrumentation, pacing or BPM feel, emotional arc, and a clear "no vocals, no lyrics" instruction.
- Do not reference copyrighted songs, bands, composers, celebrity voices, or exact artist styles in the Suno prompt.
- Do not include Shazi production notes.`;
  }
}

export type BookIllustrationMode = "CHAPTER_OPENERS" | "KEY_SCENES" | "FULL_ILLUSTRATED";

export function bookIllustrationPlanPrompt(input: {
  title: string;
  hook?: string | null;
  summary?: string | null;
  format?: StoryProjectFormat | string | null;
  targetWordCount: number;
  tone: string;
  narrationStyle: string;
  sourceMaterial?: string | null;
  passContext?: string;
  mode: BookIllustrationMode;
  maxImages: number;
}) {
  const modeLabel = input.mode === "KEY_SCENES"
    ? "key scenes only"
    : input.mode === "FULL_ILLUSTRATED"
      ? "full illustrated edition"
      : "chapter openers";
  const bookType = input.format === "LONG_BOOK" ? "long form book" : "short book";

  return `Create a book illustration plan for this ${bookType}.

Story title: ${input.title}
Hook: ${input.hook || "Not provided"}
Summary: ${input.summary || "Not provided"}
Target manuscript length: ${input.targetWordCount.toLocaleString()} words
Tone: ${input.tone}
Narration style: ${input.narrationStyle}
Illustration mode: ${modeLabel}
Maximum image count: ${input.maxImages}

Source material:
${input.sourceMaterial || "No source material pasted yet. Avoid claims that require unsupported visual certainty."}

Book/manuscript context:
${input.passContext || "No previous book output is available yet. Infer a sensible chapter structure from the title, hook, summary, and source material."}

Return strict JSON only. Do not include Markdown fences, commentary, or prose outside JSON.

Schema:
{
  "mode": "${input.mode}",
  "styleBible": "A concise art style bible for the entire book",
  "estimatedImageCount": 8,
  "estimatedCostNote": "Short plain-English estimate note",
  "illustrations": [
    {
      "chapterNumber": 1,
      "title": "Chapter illustration title",
      "scene": "What this image depicts",
      "prompt": "Runware image prompt",
      "safetyNotes": "Any visual accuracy or restraint note"
    }
  ]
}

Rules:
- Return no more than ${input.maxImages} illustrations.
- For chapter openers, create one image for each major chapter or section until the cap is reached.
- For key scenes, choose only the strongest visual moments that help the reader understand place, evidence, stakes, or mood.
- For full illustrated edition, cover the manuscript more densely, but still obey the cap.
- The style bible must lock a consistent book-wide look: palette, line style, lighting, texture, era cues, camera distance, composition rules, and banned elements.
- Prompts must request premium book-interior illustrations, not YouTube thumbnails, posters, ads, or social graphics.
- Prompts must say: no text, no typography, no labels, no watermark, no logo.
- Avoid gore, exploitation, cheap horror, fake evidence, and sensationalized violence.
- Do not ask for exact likenesses of private people. Use respectful symbolic or documentary-style visualizations when real people are involved.
- Favor historically grounded settings, objects, maps, landscapes, documents, architecture, weather, and emotionally restrained human silhouettes.
- Keep each prompt usable as a direct image-generation prompt.`;
}

export function scriptExpansionPrompt(input: {
  title: string;
  format?: StoryProjectFormat | string | null;
  targetLengthMinutes: number;
  targetWordCount: number;
  currentWordCount: number;
  minimumWordCount: number;
  tone: string;
  narrationStyle: string;
  sourceMaterial?: string;
  passContext?: string;
  currentContent: string;
  sponsorBlurb?: string;
}) {
  const isEpisodicSeries = input.format === "EPISODIC_SERIES";
  const format = input.format === "PODCAST_EPISODE" ? "podcast-ready spoken script" : "teleprompter-ready video script";
  const sponsorRule = input.sponsorBlurb?.trim()
    ? "The user provided sponsor copy, but this body script must not include sponsor, ad, promo, offer, product, or link-in-description language."
    : "No sponsor copy was provided; do not mention sponsors, products, offers, or links.";

  if (isEpisodicSeries) {
    return `The previous five-episode series draft is too short and must be rewritten/expanded before it can be saved.

Story title: ${input.title}
Series target: five episodes, each about ${input.targetLengthMinutes} minutes
Total target word count: ${input.targetWordCount.toLocaleString()} words
Current word count: ${input.currentWordCount.toLocaleString()} words
Minimum acceptable word count: ${input.minimumWordCount.toLocaleString()} words
Tone: ${input.tone}
Narration style: ${input.narrationStyle}

Source material:
${input.sourceMaterial || "No source material pasted yet. Label uncertain details clearly."}

Previous planning context:
${input.passContext || "No previous pass material available."}

Current under-length series draft:
${input.currentContent}

Rewrite and expand the entire five-episode series, not just a continuation.

Rules:
- Output all five complete episode scripts.
- Preserve clear plain-text headings: Episode One: [title], Episode Two: [title], Episode Three: [title], Episode Four: [title], Episode Five: [title].
- Each episode must be a standalone narration script with its own hook, middle, payoff, and closing bridge.
- Aim for the total target word count across all five episodes. At minimum, exceed the minimum acceptable word count.
- Keep the same factual caution, but deepen through verified context, timeline reconstruction, source uncertainty, competing explanations, aftermath, emotional stakes, and why the story endured.
- Do not collapse the series into one long script, one selected episode, a summary, or a list of episode outlines.
- Do not pad, repeat, ramble, or invent facts.
- Keep it natural for TTS and teleprompter reading.
- Spell out every number as words. Never use Arabic numerals in spoken script copy.
- Do not use Markdown fences, bullets, timestamps, title cards, bracketed stage directions, or pause markers.
- ${sponsorRule}
- Every episode must end with a complete final paragraph.`;
  }

  return `The previous ${format} is too short and must be rewritten/expanded before it can be saved.

Story title: ${input.title}
Target length: ${input.targetLengthMinutes} minutes
Target word count: ${input.targetWordCount.toLocaleString()} words
Current word count: ${input.currentWordCount.toLocaleString()} words
Minimum acceptable word count: ${input.minimumWordCount.toLocaleString()} words
Tone: ${input.tone}
Narration style: ${input.narrationStyle}

Source material:
${input.sourceMaterial || "No source material pasted yet. Label uncertain details clearly."}

Previous planning context:
${input.passContext || "No previous pass material available."}

Current under-length script:
${input.currentContent}

Rewrite and expand the entire script, not just a continuation.

Rules:
- Output only the complete expanded spoken narration.
- Aim for the target word count. At minimum, exceed the minimum acceptable word count.
- Keep the same factual caution, but deepen through verified context, timeline reconstruction, source uncertainty, competing explanations, aftermath, emotional stakes, and why the story endured.
- Do not pad, repeat, ramble, or invent facts.
- Keep it natural for TTS and teleprompter reading.
- Spell out every number as words. Never use Arabic numerals in spoken script copy.
- Do not use Markdown, headings, bullets, timestamps, title cards, chapter labels, bracketed stage directions, or pause markers.
- ${sponsorRule}
- End with a complete final paragraph.`;
}

export function routeModelForPass(
  settings: Pick<UserSettings, "defaultModel" | "discoveryModel" | "dossierModel" | "structureModel" | "draftingModel" | "critiqueModel" | "rewriteModel" | "autoModelRouting">,
  passType: ScriptPassType | "DISCOVERY" | "RESEARCH",
  manualModel?: string
) {
  if (manualModel) return manualModel;
  if (!settings.autoModelRouting) return settings.defaultModel;

  if (passType === "DISCOVERY") return settings.discoveryModel || settings.defaultModel;
  if (passType === "RESEARCH") return settings.dossierModel || settings.defaultModel;
  if (passType === "INTRO" || passType === "OUTRO") return settings.rewriteModel || settings.draftingModel || settings.defaultModel;
  if (passType === "DOSSIER" || passType === "ANALYTICS_BRIEF") return settings.dossierModel || settings.defaultModel;
  if (passType === "EPISODES" || passType === "SERIES_BIBLE" || passType === "HOOK_LAB" || passType === "STORY_SPINE" || passType === "STRUCTURE" || passType === "RETENTION_MAP" || passType === "SCRIPT_LENGTH_GOVERNOR" || passType === "OPEN_LOOP_LEDGER" || passType === "SCENE_CARDS") {
    return settings.structureModel || settings.dossierModel || settings.defaultModel;
  }
  if (passType === "DRAFT") return settings.draftingModel || settings.defaultModel;
  if (passType === "RETENTION_ANALYSIS" || passType === "CRITIQUE" || passType === "FACT_CHECK" || passType === "QUALITY_GATE") {
    const critique = settings.critiqueModel || settings.defaultModel;
    return critique === settings.draftingModel ? settings.defaultModel : critique;
  }
  if (passType === "REWRITE" || passType === "VOICE_POLISH") return settings.rewriteModel || settings.draftingModel || settings.defaultModel;
  if (passType === "PUBLISHING_PACK") return settings.rewriteModel || settings.defaultModel;
  return settings.rewriteModel || settings.defaultModel;
}

export function projectResearchPrompt(input: {
  title: string;
  hook?: string | null;
  summary?: string | null;
  category?: string | null;
  location?: string | null;
  eventName?: string | null;
  format?: StoryProjectFormat | string | null;
  targetLengthMinutes: number;
  targetWordCount?: number | null;
  tone: string;
  narrationStyle: string;
  existingNotes?: string;
}) {
  const formatLabel = projectFormatLabel(input.format);
  const target = input.format === "ARTICLE"
    ? `${input.targetWordCount?.toLocaleString() || "2,000"}-word article`
    : input.format === "SHORT_BOOK"
      ? `${input.targetWordCount?.toLocaleString() || "15,000"}-word short book`
      : input.format === "LONG_BOOK"
        ? `${input.targetWordCount?.toLocaleString() || "60,000"}-word long form book`
    : `${input.targetLengthMinutes}-minute ${projectOutputName(input.format)}`;

  return `Create a Baxter Growth Lab research brief and agency script brief for a ${formatLabel} project.

Story title: ${input.title}
Project type: ${formatLabel}
Category: ${input.category || "Not provided"}
Hook: ${input.hook || "Not provided"}
Summary: ${input.summary || "Not provided"}
Location: ${input.location || "Not provided"}
Event name: ${input.eventName || "Not provided"}
Target output: ${target}
Tone: ${input.tone}
Narration style: ${input.narrationStyle}

${POLICYFORGE_AGENCY_PROFILE}

${POLICYFORGE_SOURCE_MEMORY}

Existing source material / notes:
${input.existingNotes || "No notes pasted yet."}

Return plain text notes, not JSON. Organize with these headings:
Agency Script Brief
Target Prospect
Policy Product Focus
Texas Location And Local Trust Layer
Pain Point Or Decision Moment
Recommended Script Structure
Primary CTA
Compliance Boundaries
Useful Objections To Answer
Confirmed facts to verify
Likely timeline
People / organizations
Places
Primary source leads
Secondary source leads
Reusable source memory
Research confidence
Open questions
Do not say as fact
Coverage promise warnings
Carrier statement warnings
Claim outcome warnings
Legal tax or professional advice warnings
CTA compliance check
Best narrative angle

Rules:
- Treat fetched URL excerpts and pasted notes as source material to organize, not automatic proof.
- Separate what is directly supported, what is repeated by secondary sources, and what still needs verification.
- Build a pre-script brief before writing guidance: target prospect, policy/product, Texas location, decision moment, recommended quote-intent structure, CTA, compliance boundaries, and objections.
- For insurance content, do not invent regulations, prices, guarantees, credentials, testimonials, carrier appetite, underwriting results, savings, coverage, eligibility, or claim outcomes.
- Treat this as Texas-only agency content for Baxter Insurance Agency, Inc.; flag any out-of-state or non-Texas assumption.
- Do not present uncertain details as confirmed facts.
- If source material is thin, make that clear and provide research leads instead of inventing facts.
- Focus on what would help a writer build the selected output type.
- Keep it concise enough to paste into a notes field.`;
}

export function fallbackIdeas(input?: Partial<IdeaFactoryInput>) {
  if (input?.contentMode === "EXPERT_AUTHORITY") {
    const niche = input.niche || "the expert niche";
    const audience = input.businessAudience || "the target buyer";
    const offer = input.businessOffer || "the core offer";
    return [
      {
        title: `The Questions ${audience} Should Ask Before Choosing ${offer}`,
        hook: `Most buyers do not know what to ask until after they have already made the decision.`,
        category: input.category || "Buyer Questions",
        summary: `A trust-building guide that teaches ${audience} how to evaluate ${offer} with confidence, spot weak advice, and understand what a serious expert looks for first.`,
        whyCompelling: "It positions the agency as a patient educator before the sales conversation.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Measured documentary",
        recommendedNarrationStyle: "Journalistic",
        sourceType: input.sourceType || "Industry expertise and client questions",
        people: [audience],
        location: input.businessLocation || "market",
        eventName: "buyer decision checklist",
        originalityScore: 84,
        curiosityScore: 82,
        emotionalScore: 78,
        escalationScore: 80,
        lengthPotentialScore: 86,
        researchDifficultyScore: 42,
        productionPriority: "High",
        suggestedAngle: "Build the piece around the gap between what buyers think matters and what an expert checks first."
      },
      {
        title: `The Costly Myths People Believe About ${niche}`,
        hook: `A few familiar assumptions make the whole decision harder than it needs to be.`,
        category: input.category || "Myth Busting",
        summary: `An authority piece that clears up the most common misconceptions in ${niche}, explains why they persist, and gives the audience a cleaner way to think through the next step.`,
        whyCompelling: "Myth-busting creates curiosity while letting the agency demonstrate judgment.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Investigative",
        recommendedNarrationStyle: "Journalistic",
        sourceType: input.sourceType || "FAQs, objections, and buyer concerns",
        people: [audience],
        location: input.businessLocation || "market",
        eventName: "misconception review",
        originalityScore: 86,
        curiosityScore: 88,
        emotionalScore: 76,
        escalationScore: 82,
        lengthPotentialScore: 84,
        researchDifficultyScore: 48,
        productionPriority: "High",
        suggestedAngle: "Use each myth as a short diagnostic: what sounds true, what is missing, and what to do instead."
      }
    ];
  }

  if (input?.contentMode === "LOCAL_LEAD_GEN") {
    const service = input.businessOffer || input.niche || "the service";
    const location = input.businessLocation || "your service area";
    const audience = input.businessAudience || "local customers";
    return [
      {
        title: `What ${audience} Should Do Before Hiring a ${service} in ${location}`,
        hook: `A local decision can get expensive fast when the buyer does not know which warning signs matter.`,
        category: input.category || "Local Buyer Questions",
        summary: `A local SEO and lead-generation guide that helps ${audience} understand the decision, compare options, avoid common mistakes, and know when to request help.`,
        whyCompelling: "It targets high-intent local searchers who are close to taking action.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Investigative",
        recommendedNarrationStyle: "Journalistic",
        sourceType: input.sourceType || "Local SEO keywords and service pages",
        people: [audience],
        location,
        eventName: "local hiring decision",
        originalityScore: 82,
        curiosityScore: 84,
        emotionalScore: 81,
        escalationScore: 78,
        lengthPotentialScore: 85,
        researchDifficultyScore: 45,
        productionPriority: "High",
        suggestedAngle: "Lead with the local problem, explain the decision criteria, then close with a soft quote or consultation CTA."
      },
      {
        title: `${service} Cost Guide for ${location}`,
        hook: `People search for price because they are trying to avoid surprise, pressure, and bad advice.`,
        category: input.category || "Cost and Pricing Guides",
        summary: `A practical local guide that explains what can affect cost, what questions to ask, and how to compare options without claiming exact prices unless the user provides them.`,
        whyCompelling: "Cost content attracts motivated searchers and creates a natural path to a quote request.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Measured documentary",
        recommendedNarrationStyle: "Journalistic",
        sourceType: input.sourceType || "Local SEO keywords and service pages",
        people: [audience],
        location,
        eventName: "local cost search",
        originalityScore: 80,
        curiosityScore: 86,
        emotionalScore: 79,
        escalationScore: 76,
        lengthPotentialScore: 82,
        researchDifficultyScore: 50,
        productionPriority: "High",
        suggestedAngle: "Explain price variables and decision tradeoffs, then invite the reader to request a custom estimate."
      }
    ];
  }

  if (input?.contentMode === "SALES_OFFER") {
    const offer = input.businessOffer || input.niche || "the offer";
    const audience = input.businessAudience || "the target buyer";
    return [
      {
        title: `The Sales Letter That Turns ${audience} From Curious To Ready`,
        hook: "The offer does not need louder hype. It needs a cleaner reason to act now.",
        category: input.category || "Sales Letters",
        summary: `A long-form sales asset for ${offer} that sharpens the buyer pain, explains the mechanism, handles the main objections, and creates one clear next step.`,
        whyCompelling: "It gives the user a concrete revenue asset instead of a generic content topic.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Urgent",
        recommendedNarrationStyle: "Journalistic",
        sourceType: input.sourceType || "Offer details and customer objections",
        people: [audience],
        location: input.businessLocation || "market",
        eventName: "offer conversion page",
        originalityScore: 84,
        curiosityScore: 86,
        emotionalScore: 82,
        escalationScore: 88,
        lengthPotentialScore: 85,
        researchDifficultyScore: 46,
        productionPriority: "High",
        suggestedAngle: "Build the piece around the buyer's stalled decision, the offer mechanism, objection handling, and a single CTA."
      },
      {
        title: `Seven Follow-Up Emails For People Who Almost Bought ${offer}`,
        hook: "Most sales are lost after the first no, when the buyer still has unanswered questions.",
        category: input.category || "Follow-Up Sequences",
        summary: `A follow-up sequence that reopens the conversation, answers doubts, reframes value, and moves ${audience} toward a low-friction next action.`,
        whyCompelling: "Follow-up assets are immediately usable and easy to connect to revenue.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Measured documentary",
        recommendedNarrationStyle: "Conversational",
        sourceType: input.sourceType || "Offer details and customer objections",
        people: [audience],
        location: input.businessLocation || "email list",
        eventName: "post-offer follow-up sequence",
        originalityScore: 82,
        curiosityScore: 80,
        emotionalScore: 84,
        escalationScore: 86,
        lengthPotentialScore: 83,
        researchDifficultyScore: 42,
        productionPriority: "High",
        suggestedAngle: "Each email should handle one objection or hesitation without inventing proof, discounts, or scarcity."
      }
    ];
  }

  if (input?.contentMode === "EDUCATION_COURSE") {
    const topic = input.niche || "the topic";
    const learner = input.businessAudience || "learners";
    return [
      {
        title: `The Starter Course That Gets ${learner} Competent In ${topic}`,
        hook: "A good course does not dump information. It changes what the learner can actually do.",
        category: input.category || "Course Blueprint",
        summary: `A practical course blueprint with modules, lessons, worksheets, quizzes, and clear learner outcomes for ${topic}.`,
        whyCompelling: "It turns expertise into a paid or internal training asset.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Measured documentary",
        recommendedNarrationStyle: "Instructional",
        sourceType: input.sourceType || "Expert curriculum notes",
        people: [learner],
        location: input.businessLocation || "online classroom",
        eventName: "course curriculum build",
        originalityScore: 83,
        curiosityScore: 78,
        emotionalScore: 76,
        escalationScore: 80,
        lengthPotentialScore: 88,
        researchDifficultyScore: 44,
        productionPriority: "High",
        suggestedAngle: "Organize the course around outcomes, practice tasks, and checks for understanding rather than lectures alone."
      },
      {
        title: `The Worksheet System That Makes ${topic} Easier To Apply`,
        hook: "The lesson only matters if the learner knows what to do after watching it.",
        category: input.category || "Worksheets",
        summary: `A set of guided worksheets, examples, and short quizzes that help ${learner} practice the core decisions inside ${topic}.`,
        whyCompelling: "Worksheets create tangible course value and improve student completion.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 30,
        recommendedTone: input.tone || "Clear and practical",
        recommendedNarrationStyle: "Instructional",
        sourceType: input.sourceType || "Expert curriculum notes",
        people: [learner],
        location: input.businessLocation || "online classroom",
        eventName: "student practice asset",
        originalityScore: 80,
        curiosityScore: 74,
        emotionalScore: 72,
        escalationScore: 78,
        lengthPotentialScore: 82,
        researchDifficultyScore: 38,
        productionPriority: "Medium",
        suggestedAngle: "Make each worksheet solve one recurring learner mistake and end with a simple self-check."
      }
    ];
  }

  if (input?.contentMode === "BOOK_PUBLISHING") {
    const topic = input.niche || "the book topic";
    const reader = input.businessAudience || "the reader";
    return [
      {
        title: `The Authority Book That Makes ${topic} Easy To Understand`,
        hook: "The book works when the reader finally sees the whole problem in one organized frame.",
        category: input.category || "Authority Books",
        summary: `A nonfiction book concept for ${reader} that turns ${topic} into a clear reader promise, chapter framework, examples, and a launchable publishing asset.`,
        whyCompelling: "It can become both an authority builder and a useful lead-generation asset.",
        estimatedLengthPotential: input.desiredLength || "Standard short book - about 15,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Reflective",
        recommendedNarrationStyle: "Narrative nonfiction",
        sourceType: input.sourceType || "Book notes and research folders",
        people: [reader],
        location: input.businessLocation || "reader market",
        eventName: "authority book outline",
        originalityScore: 84,
        curiosityScore: 82,
        emotionalScore: 78,
        escalationScore: 81,
        lengthPotentialScore: 90,
        researchDifficultyScore: 52,
        productionPriority: "High",
        suggestedAngle: "Build the table of contents around the reader's transformation and the framework that makes the topic usable."
      },
      {
        title: `A Lead Magnet Book That Solves One Expensive Problem In ${topic}`,
        hook: "A small book can work harder than a sales page when it solves the right problem.",
        category: input.category || "Lead Magnet Books",
        summary: `A focused short book that gives ${reader} a concrete win while naturally leading to the user's offer or next step.`,
        whyCompelling: "It packages expertise into a persuasive but useful front-end asset.",
        estimatedLengthPotential: input.desiredLength || "Compact short book - about 10,000 words",
        recommendedLengthMinutes: 30,
        recommendedTone: input.tone || "Practical",
        recommendedNarrationStyle: "Instructional",
        sourceType: input.sourceType || "Book notes and research folders",
        people: [reader],
        location: input.businessLocation || "reader market",
        eventName: "lead magnet book",
        originalityScore: 81,
        curiosityScore: 79,
        emotionalScore: 75,
        escalationScore: 78,
        lengthPotentialScore: 84,
        researchDifficultyScore: 40,
        productionPriority: "High",
        suggestedAngle: "Keep the promise narrow, helpful, and complete enough that the reader trusts the next offer."
      }
    ];
  }

  if (input?.contentMode === "REPURPOSE_MULTIPLIER") {
    const source = input.niche || "the source asset";
    const audience = input.businessAudience || "the audience";
    return [
      {
        title: `Turn ${source} Into A Thirty-Day Content Campaign`,
        hook: "One strong piece of content can become a month of useful posts if the adaptation is intentional.",
        category: input.category || "Multi-platform Campaign",
        summary: `A repurposing plan that turns ${source} into emails, short-form posts, LinkedIn posts, newsletter ideas, blog sections, and platform-specific CTAs.`,
        whyCompelling: "It multiplies the value of existing work without forcing the user to start from zero.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Measured documentary",
        recommendedNarrationStyle: "Conversational",
        sourceType: input.sourceType || "Existing script, article, or book",
        people: [audience],
        location: input.businessLocation || "multi-platform",
        eventName: "content repurposing campaign",
        originalityScore: 82,
        curiosityScore: 76,
        emotionalScore: 74,
        escalationScore: 80,
        lengthPotentialScore: 86,
        researchDifficultyScore: 34,
        productionPriority: "High",
        suggestedAngle: "Preserve the source claims while changing the hook, CTA, length, and format for each platform."
      },
      {
        title: `The Email Series Hidden Inside ${source}`,
        hook: "A long piece usually contains five or six buyer conversations that deserve their own email.",
        category: input.category || "Email Series",
        summary: `An email sequence that extracts the strongest lessons, objections, examples, and CTAs from ${source} without adding unsupported claims.`,
        whyCompelling: "Email repurposing creates direct business leverage from existing long-form content.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 30,
        recommendedTone: input.tone || "Conversational",
        recommendedNarrationStyle: "Conversational",
        sourceType: input.sourceType || "Existing script, article, or book",
        people: [audience],
        location: input.businessLocation || "email list",
        eventName: "email repurposing sequence",
        originalityScore: 80,
        curiosityScore: 78,
        emotionalScore: 76,
        escalationScore: 82,
        lengthPotentialScore: 82,
        researchDifficultyScore: 32,
        productionPriority: "High",
        suggestedAngle: "Each email should isolate one idea from the source and end with a natural next step."
      }
    ];
  }

  if (input?.contentMode === "BRAND_CHANNEL_STRATEGY") {
    const direction = input.niche || "the channel direction";
    const audience = input.businessAudience || "the target audience";
    return [
      {
        title: `A Complete Channel Strategy For ${direction}`,
        hook: "A channel gets easier to run when the niche, promise, pillars, and calendar all point the same direction.",
        category: input.category || "Niche Positioning",
        summary: `A brand and channel strategy that defines audience, positioning, content pillars, keyword lanes, visual rules, publishing cadence, and repeatable idea combinations.`,
        whyCompelling: "It gives the user a strategic operating system instead of scattered content ideas.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 45,
        recommendedTone: input.tone || "Investigative",
        recommendedNarrationStyle: "Strategic brief",
        sourceType: input.sourceType || "Audience and niche research",
        people: [audience],
        location: input.businessLocation || "channel market",
        eventName: "channel positioning build",
        originalityScore: 84,
        curiosityScore: 80,
        emotionalScore: 74,
        escalationScore: 78,
        lengthPotentialScore: 88,
        researchDifficultyScore: 48,
        productionPriority: "High",
        suggestedAngle: "Turn the strategy into an operating plan with pillars, keywords, publishing cadence, and idea lanes."
      },
      {
        title: `The Content Pillar Map For ${audience}`,
        hook: "The best channels do not need endless ideas. They need the right repeatable lanes.",
        category: input.category || "Content Pillars",
        summary: `A pillar map that shows what the channel should publish every week, why each pillar exists, and how it supports audience growth and monetization.`,
        whyCompelling: "It makes channel planning feel concrete and repeatable.",
        estimatedLengthPotential: input.desiredLength || "Feature article - about 2,000 words",
        recommendedLengthMinutes: 30,
        recommendedTone: input.tone || "Clear and practical",
        recommendedNarrationStyle: "Strategic brief",
        sourceType: input.sourceType || "Audience and niche research",
        people: [audience],
        location: input.businessLocation || "channel market",
        eventName: "content pillar strategy",
        originalityScore: 82,
        curiosityScore: 77,
        emotionalScore: 72,
        escalationScore: 76,
        lengthPotentialScore: 84,
        researchDifficultyScore: 40,
        productionPriority: "Medium",
        suggestedAngle: "Define the recurring lanes, example topics, audience promise, and publishing rhythm."
      }
    ];
  }

  return [
    {
      title: "The Ferry That Returned Empty",
      hook: "A passenger ferry sails from a Caribbean island and returns the next day with no one on board.",
      category: "Maritime Stories",
      summary: "A routine crossing becomes a puzzle when a vessel reappears without passengers, crew, or a clear distress signal.",
      whyCompelling: "It has a clean central mystery, a contained setting, and multiple plausible explanations to test.",
      estimatedLengthPotential: "45-60 min",
      recommendedLengthMinutes: 45,
      recommendedTone: "Mysterious & gripping",
      recommendedNarrationStyle: "Investigative documentary",
      sourceType: "Mixed (Books, Articles, Podcasts)",
      people: ["crew", "passengers"],
      location: "Caribbean Sea",
      eventName: "Empty ferry return",
      originalityScore: 95,
      curiosityScore: 92,
      emotionalScore: 91,
      escalationScore: 90,
      lengthPotentialScore: 94,
      researchDifficultyScore: 61,
      productionPriority: "High",
      suggestedAngle: "Tell it as a narrowing investigation: what the ship carried, what it lacked, and what the sea refused to explain."
    },
    {
      title: "The Pilot Who Followed the Wrong Star",
      hook: "In 1954, a commercial pilot claims he was guided by a star that did not exist.",
      category: "Aviation Incidents",
      summary: "A flight crew survives a navigation anomaly that later looks less like a mistake and more like a chain of small impossible choices.",
      whyCompelling: "Aviation stories naturally provide stakes, timelines, instruments, and expert disagreement.",
      estimatedLengthPotential: "45-60 min",
      recommendedLengthMinutes: 45,
      recommendedTone: "Suspenseful",
      recommendedNarrationStyle: "Cinematic narration",
      sourceType: "Mixed (Books, Articles, Podcasts)",
      people: ["captain", "first officer", "air traffic controllers"],
      location: "North Atlantic route",
      eventName: "Wrong star navigation incident",
      originalityScore: 92,
      curiosityScore: 90,
      emotionalScore: 88,
      escalationScore: 89,
      lengthPotentialScore: 91,
      researchDifficultyScore: 72,
      productionPriority: "High",
      suggestedAngle: "Build the tension through cockpit observations, then compare each explanation against the recorded flight path."
    },
    {
      title: "The Town That Heard the Same Voice",
      hook: "For weeks, an entire town heard a voice on the wind, but no one could trace where it came from.",
      category: "Strange True Stories",
      summary: "A remote community experiences a repeated nighttime voice that becomes part rumor, part investigation, and part civic panic.",
      whyCompelling: "It combines witness testimony, local fear, and an eerie but grounded sound mystery.",
      estimatedLengthPotential: "30-45 min",
      recommendedLengthMinutes: 30,
      recommendedTone: "Atmospheric",
      recommendedNarrationStyle: "Slow-burn mystery",
      sourceType: "Local archives and newspapers",
      people: ["residents", "local police", "radio operators"],
      location: "Rural mountain town",
      eventName: "Town voice mystery",
      originalityScore: 88,
      curiosityScore: 91,
      emotionalScore: 90,
      escalationScore: 87,
      lengthPotentialScore: 86,
      researchDifficultyScore: 66,
      productionPriority: "High",
      suggestedAngle: "Use changing witness accounts to show how mystery becomes social pressure."
    }
  ];
}
