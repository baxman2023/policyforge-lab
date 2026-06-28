import { slugify } from "@/lib/utils";

export type ForgeNiche = {
  code: string;
  name: string;
  title: string;
  slug: string;
  description: string;
  viewerPromise: string;
  nicheFocus: string;
  tone: string;
  category: string;
  sourceType: string;
  keywords: string[];
  starterAngles: string[];
  engineBrief: string;
  monetizationScore: number;
  monetizationTier: string;
  monetizationRationale: string;
};

type ForgeNicheSeed = Omit<ForgeNiche, "engineBrief" | "monetizationScore" | "monetizationTier" | "monetizationRationale"> & {
  monetizationScore: number;
  monetizationRationale: string;
};

const AGENCY_NAME = "Baxter Insurance Agency, Inc.";
const AGENCY_PHONE = "281-445-1381";
const AGENCY_ADDRESS = "450 N Sam Houston Pkwy E Ste 103, Houston, TX 77060";
const LICENSE_CONTEXT = "Licensed for General Lines and life in Texas only.";
const COMPLIANCE_RULES = [
  "Do not promise savings, claim outcomes, eligibility, coverage, or carrier acceptance.",
  "Use plain-English educational language and tell users coverage depends on underwriting, policy terms, conditions, limits, exclusions, endorsements, deductibles, carrier appetite, and Texas regulations.",
  "Invite prospects to request a review or quote from Baxter Insurance Agency, Inc. instead of giving legal, tax, claim, or coverage advice.",
  "Prioritize home and auto, then commercial, life, and cross-sell opportunities when relevant.",
  "Mention Germania, Travelers, SWYFFT, Progressive, and GEICO only as available carrier relationships or shopping lanes, not endorsements or guarantees."
].join(" ");

const POLICY_NICHE_SEEDS: ForgeNicheSeed[] = [
  {
    code: "HOMEAUTO",
    name: "HOMEAUTO",
    title: "Texas Home & Auto Bundle Growth",
    slug: "homeauto",
    description: "Homeowners, auto, bundling, household reviews, renewal education, and Houston-area quote campaigns.",
    viewerPromise: "Every asset helps a Texas household understand home and auto risk, then take the next step toward a quote or policy review.",
    nicheFocus: "Home and auto insurance",
    tone: "Helpful, local, consultative",
    category: "Home and Auto",
    sourceType: "Agency knowledge, carrier appetite, Texas market context",
    keywords: ["Texas home insurance", "Houston auto insurance", "home and auto bundle", "Baxter Insurance Agency"],
    starterAngles: ["Why Houston families should review home and auto together", "What changes before renewal can affect your premium", "How deductibles work when you bundle home and auto"],
    monetizationScore: 10,
    monetizationRationale: "Primary agency revenue lane with strong local intent, high quote value, repeat renewals, and clear cross-sell paths."
  },
  {
    code: "HOUSTONHOME",
    name: "HOUSTONHOME",
    title: "Houston Homeowners Insurance",
    slug: "houstonhome",
    description: "Houston and surrounding-area homeowners coverage, roof age, wind, hail, water, deductibles, inspections, and carrier shopping.",
    viewerPromise: "Every asset makes Houston homeowners more informed before renewal, purchase, roof updates, or a coverage review.",
    nicheFocus: "Homeowners insurance",
    tone: "Local expert",
    category: "Homeowners",
    sourceType: "Texas homeowner policy education and agency experience",
    keywords: ["Houston homeowners insurance", "Texas home insurance", "roof age insurance", "wind hail deductible"],
    starterAngles: ["Why roof age matters in Houston homeowners insurance", "The deductible conversation every Texas homeowner should understand", "Home insurance review checklist before hurricane season"],
    monetizationScore: 10,
    monetizationRationale: "High-intent local SEO lane for the agency's core product with strong seasonal urgency and consultative value."
  },
  {
    code: "TEXASAUTO",
    name: "TEXASAUTO",
    title: "Texas Auto Insurance",
    slug: "texasauto",
    description: "Auto liability, physical damage, uninsured motorists, teen drivers, household changes, and quote-ready education.",
    viewerPromise: "Every asset helps Texas drivers understand the choices behind an auto quote before they buy or renew.",
    nicheFocus: "Auto insurance",
    tone: "Clear and practical",
    category: "Auto",
    sourceType: "Texas auto insurance education and carrier quoting workflow",
    keywords: ["Texas auto insurance", "Houston car insurance", "uninsured motorist coverage", "teen driver insurance"],
    starterAngles: ["What Texas drivers should know before choosing liability limits", "Teen driver insurance checklist for Houston families", "Why uninsured motorist coverage deserves a real conversation"],
    monetizationScore: 9,
    monetizationRationale: "Large volume line with strong quote demand and excellent household cross-sell potential."
  },
  {
    code: "STORMCLAIMS",
    name: "STORMCLAIMS",
    title: "Storm, Wind, Hail & Roof Readiness",
    slug: "stormclaims",
    description: "Texas storm season readiness, wind and hail deductibles, roof questions, claim documentation, and renewal prep.",
    viewerPromise: "Every asset helps homeowners prepare before a storm and understand the next steps after damage without replacing carrier claim guidance.",
    nicheFocus: "Storm readiness",
    tone: "Calm and action-oriented",
    category: "Storm Season",
    sourceType: "Texas weather, carrier guidelines, agency claim-support experience",
    keywords: ["Texas hail insurance", "Houston storm damage insurance", "wind hail deductible", "roof insurance claim"],
    starterAngles: ["What to photograph before hurricane season", "How wind and hail deductibles can surprise Texas homeowners", "A homeowner's first 24 hours after roof damage"],
    monetizationScore: 9,
    monetizationRationale: "Seasonal urgency creates high engagement and lead flow, especially around Houston storms."
  },
  {
    code: "FLOOD",
    name: "FLOOD",
    title: "Flood Insurance Education",
    slug: "flood",
    description: "Flood risk, NFIP versus private flood education, Houston flooding realities, lender requirements, and quote triggers.",
    viewerPromise: "Every asset helps Texas property owners understand that flood risk is a separate conversation from a standard home policy.",
    nicheFocus: "Flood insurance",
    tone: "Educational and urgent",
    category: "Flood",
    sourceType: "Flood risk education and agency quoting workflow",
    keywords: ["Houston flood insurance", "Texas flood insurance", "NFIP flood policy", "private flood insurance"],
    starterAngles: ["Why Houston homeowners outside high-risk zones still ask about flood insurance", "Flood insurance waiting periods explained plainly", "Questions to ask before buying flood coverage"],
    monetizationScore: 9,
    monetizationRationale: "High local relevance, major protection gap, and strong education-to-quote conversion potential."
  },
  {
    code: "LANDLORD",
    name: "LANDLORD",
    title: "Rental Property & Landlord Coverage",
    slug: "landlord",
    description: "Rental homes, landlord policies, tenant exposure, vacancy questions, short-term rental risk, and property investor education.",
    viewerPromise: "Every asset helps Texas property owners protect rental income and avoid confusing a landlord exposure with a normal homeowners policy.",
    nicheFocus: "Rental property insurance",
    tone: "Advisor-like",
    category: "Landlord",
    sourceType: "Agency knowledge and property investor questions",
    keywords: ["Texas landlord insurance", "rental property insurance Houston", "short term rental insurance", "vacant home insurance"],
    starterAngles: ["Why a rental home usually needs a different insurance conversation", "Vacant versus rented: why occupancy matters", "Insurance questions before turning a home into a rental"],
    monetizationScore: 8,
    monetizationRationale: "Strong commercial-personal crossover with higher account value and recurring review needs."
  },
  {
    code: "UMBRELLA",
    name: "UMBRELLA",
    title: "Personal Umbrella & Asset Protection",
    slug: "umbrella",
    description: "Umbrella liability education for households, drivers, homeowners, landlords, boat owners, and higher-asset clients.",
    viewerPromise: "Every asset shows when a household may need a bigger liability conversation than home and auto alone.",
    nicheFocus: "Liability protection",
    tone: "Protective and consultative",
    category: "Umbrella",
    sourceType: "Agency risk review and liability education",
    keywords: ["personal umbrella insurance Texas", "umbrella policy Houston", "liability insurance review", "asset protection insurance"],
    starterAngles: ["Why umbrella coverage often starts with your auto limits", "The liability gap many homeowners do not see", "Umbrella questions for landlords and families with teen drivers"],
    monetizationScore: 8,
    monetizationRationale: "Excellent cross-sell and retention lane that increases account depth and client stickiness."
  },
  {
    code: "RENTERS",
    name: "RENTERS",
    title: "Renters Insurance & First Policy Education",
    slug: "renters",
    description: "Renters coverage, apartment requirements, personal property, liability, young adults, and first-time insurance education.",
    viewerPromise: "Every asset helps renters understand a low-cost coverage conversation that can become a long-term agency relationship.",
    nicheFocus: "Renters insurance",
    tone: "Simple and reassuring",
    category: "Renters",
    sourceType: "Agency FAQs and apartment/renter education",
    keywords: ["Houston renters insurance", "Texas renters insurance", "apartment insurance", "first insurance policy"],
    starterAngles: ["What renters insurance can and cannot do", "Why apartment-required insurance may not be the whole conversation", "A first-policy checklist for young renters"],
    monetizationScore: 7,
    monetizationRationale: "Lower premium but useful for long-term client acquisition and household lifecycle marketing."
  },
  {
    code: "COMMERCIAL",
    name: "COMMERCIAL",
    title: "Small Business Insurance",
    slug: "commercial",
    description: "General liability, BOP, commercial property, professional exposures, certificates, contracts, and Texas small-business reviews.",
    viewerPromise: "Every asset helps a business owner understand the insurance questions behind growth, leases, contracts, and claims.",
    nicheFocus: "Commercial insurance",
    tone: "Professional and plain-English",
    category: "Commercial",
    sourceType: "Agency commercial intake workflow and business risk education",
    keywords: ["Houston business insurance", "Texas general liability insurance", "business owners policy", "commercial property insurance"],
    starterAngles: ["What business owners should review before signing a lease", "Why certificates of insurance create urgent quote opportunities", "BOP versus general liability explained for Texas businesses"],
    monetizationScore: 10,
    monetizationRationale: "Commercial accounts have higher lifetime value, strong local search intent, and recurring certificate/service needs."
  },
  {
    code: "CONTRACTORS",
    name: "CONTRACTORS",
    title: "Contractor & Trades Insurance",
    slug: "contractors",
    description: "Contractor liability, tools and equipment, commercial auto, certificates, subcontractors, and job-site insurance questions.",
    viewerPromise: "Every asset helps Texas contractors get quote-ready and avoid contract or job-site surprises.",
    nicheFocus: "Contractor insurance",
    tone: "Direct and practical",
    category: "Contractors",
    sourceType: "Agency commercial quoting and trade contractor questions",
    keywords: ["contractor insurance Texas", "Houston contractor liability", "certificate of insurance", "tools equipment insurance"],
    starterAngles: ["The certificate request that tells contractors they need better insurance support", "Commercial auto questions for contractors using personal vehicles", "Insurance checklist before taking a larger job"],
    monetizationScore: 9,
    monetizationRationale: "High-intent commercial niche with urgent certificate-driven buying behavior."
  },
  {
    code: "RESTAURANT",
    name: "RESTAURANT",
    title: "Restaurant, Retail & Main Street Business",
    slug: "restaurant-retail",
    description: "Coverage education for restaurants, retailers, offices, salons, and local service businesses around property, liability, inventory, and income risk.",
    viewerPromise: "Every asset turns business-owner stress into a clear checklist for the next insurance review.",
    nicheFocus: "Main Street business insurance",
    tone: "Supportive and business-minded",
    category: "Commercial",
    sourceType: "Local business risk and agency commercial experience",
    keywords: ["restaurant insurance Houston", "retail business insurance Texas", "business property insurance", "BOP insurance"],
    starterAngles: ["What restaurants should review before a busy season", "Why inventory and equipment values should not be guessed", "A local business insurance checklist for lease renewals"],
    monetizationScore: 8,
    monetizationRationale: "Good commercial premiums and strong local relationships, though underwriting appetite may vary by class."
  },
  {
    code: "COMMERCIALAUTO",
    name: "COMMERCIALAUTO",
    title: "Commercial Auto & Fleet",
    slug: "commercial-auto",
    description: "Business vehicle coverage, hired and non-owned auto, fleets, contractor trucks, delivery exposures, and driver questions.",
    viewerPromise: "Every asset helps business owners separate personal driving from business auto risk before a claim exposes the gap.",
    nicheFocus: "Commercial auto",
    tone: "Risk-aware",
    category: "Commercial Auto",
    sourceType: "Commercial auto quoting and agency risk reviews",
    keywords: ["commercial auto insurance Texas", "business auto insurance Houston", "hired non owned auto", "contractor truck insurance"],
    starterAngles: ["When a personal auto policy may not fit business driving", "Commercial auto questions for contractors and delivery businesses", "Driver list hygiene before renewal"],
    monetizationScore: 9,
    monetizationRationale: "High-value commercial line with clear pain points and strong cross-sell with GL and BOP."
  },
  {
    code: "LIFE",
    name: "LIFE",
    title: "Life Insurance Cross-Sell",
    slug: "life",
    description: "Texas life insurance education for families, mortgages, business owners, young parents, and annual household reviews.",
    viewerPromise: "Every asset opens a human, respectful protection conversation without fear tactics or product pushing.",
    nicheFocus: "Life insurance",
    tone: "Warm and trust-building",
    category: "Life",
    sourceType: "Texas life insurance education and agency relationship marketing",
    keywords: ["Texas life insurance", "Houston life insurance", "family protection review", "mortgage protection life insurance"],
    starterAngles: ["Life insurance questions after buying a home", "A family protection review for young parents", "How business owners can think about life insurance"],
    monetizationScore: 8,
    monetizationRationale: "Useful relationship and cross-sell lane with strong trust value when framed carefully."
  },
  {
    code: "RENEWAL",
    name: "RENEWAL",
    title: "Renewal Rescue & Retention",
    slug: "renewal",
    description: "Renewal reviews, premium-change explanations, coverage checkups, remarketing requests, and save-the-account workflows.",
    viewerPromise: "Every asset helps clients feel guided before they shop blindly or let a renewal surprise turn into churn.",
    nicheFocus: "Retention",
    tone: "Calm and proactive",
    category: "Retention",
    sourceType: "Agency renewal workflow and client service scripts",
    keywords: ["insurance renewal review", "home insurance premium increase", "auto insurance renewal", "insurance policy review"],
    starterAngles: ["What to check before reacting to a renewal increase", "The polite renewal review email that gets responses", "How to explain rate pressure without sounding defensive"],
    monetizationScore: 10,
    monetizationRationale: "Directly protects existing revenue and creates cross-sell conversations from already-warm relationships."
  },
  {
    code: "LOCALSEO",
    name: "LOCALSEO",
    title: "Texas Local SEO Pages",
    slug: "local-seo",
    description: "City pages, neighborhood pages, Google Business Profile posts, FAQs, schema-ready copy, and service-area content for Houston and Texas.",
    viewerPromise: "Every asset helps the agency be found by local prospects searching for insurance help in Texas.",
    nicheFocus: "Local SEO",
    tone: "Useful and search-focused",
    category: "SEO",
    sourceType: "Local SEO strategy and agency service areas",
    keywords: ["insurance agency Houston TX", "home insurance Houston", "auto insurance Houston", "Texas insurance agency"],
    starterAngles: ["Houston home insurance city page", "Spring TX auto insurance page", "Google Business Profile post for storm season"],
    monetizationScore: 10,
    monetizationRationale: "Direct lead-generation lane with compounding search value and clear local purchase intent."
  },
  {
    code: "REFERRAL",
    name: "REFERRAL",
    title: "Referral & Review Campaigns",
    slug: "referral",
    description: "Client referral asks, review requests, thank-you sequences, relationship campaigns, and scripts for happy clients.",
    viewerPromise: "Every asset helps turn satisfied clients into more conversations without sounding pushy.",
    nicheFocus: "Relationship marketing",
    tone: "Grateful and human",
    category: "Referrals",
    sourceType: "Agency relationship workflow and client communication",
    keywords: ["insurance referral program", "insurance review request", "client referral email", "Google review request"],
    starterAngles: ["A review request email after a smooth policy setup", "Referral ask for home and auto clients", "Thank-you sequence after a client sends a referral"],
    monetizationScore: 9,
    monetizationRationale: "Low-cost growth channel with warm trust transfer and strong lifetime value."
  }
];

export const FORGE_NICHES: ForgeNiche[] = POLICY_NICHE_SEEDS.map((niche) => ({
  ...niche,
  engineBrief: [
    `Generate insurance growth assets inside ${niche.name}: ${niche.description}`,
    `Agency: ${AGENCY_NAME}, ${AGENCY_PHONE}, ${AGENCY_ADDRESS}. ${LICENSE_CONTEXT}`,
    "Primary market: all of Texas, especially Houston and surrounding areas.",
    "Primary lines: home and auto. Also support commercial P&C and life insurance.",
    "Preferred carrier emphasis: Germania, Travelers, SWYFFT, Progressive, GEICO, and other available markets when appropriate.",
    `Viewer/prospect promise: ${niche.viewerPromise}`,
    `Starter angles: ${niche.starterAngles.join("; ")}.`,
    COMPLIANCE_RULES
  ].join(" "),
  monetizationTier: monetizationTier(niche.monetizationScore)
}));

export function forgeNicheBySlug(slug?: string | null) {
  if (!slug) return undefined;
  return FORGE_NICHES.find((niche) => niche.slug === slug);
}

export function forgeNicheByChannel(channel: { name?: string | null; slug?: string | null } | null | undefined) {
  if (!channel) return undefined;
  const normalizedName = (channel.name || "").trim().toUpperCase();
  return forgeNicheBySlug(channel.slug) || FORGE_NICHES.find((niche) => niche.name === normalizedName || niche.code === normalizedName);
}

export function forgeChannelDescription(niche: ForgeNiche) {
  const keywords = niche.keywords.map((keyword, index) => ({
    keyword,
    intent: index < 2 ? "Core local search and campaign keyword." : "Supporting education, SEO, and content-pack keyword.",
    priority: index < 2 ? "Primary" : "Secondary"
  }));

  return JSON.stringify({
    channelName: niche.name,
    tagline: niche.title,
    description: `${niche.name} is an insurance growth lane for ${niche.description} The business promise: ${niche.viewerPromise} Direction: ${niche.engineBrief}`,
    targetAudience: "Texas insurance prospects, Baxter Insurance Agency clients, homeowners, drivers, families, landlords, and small-business owners who need clear insurance guidance.",
    toneRules: `Default tone: ${niche.tone}. Stay helpful, local, compliant, and plain-English. Never promise savings, coverage, claims outcomes, underwriting acceptance, or legal advice. Follow this lane direction: ${niche.engineBrief}`,
    voiceProfile: "Trusted Texas insurance advisor: practical, warm, direct, local, and careful about coverage limitations.",
    introStyle: "Open with a real Texas risk, renewal problem, household question, or business decision, then quickly connect it to a useful insurance review.",
    formattingRules: "Generate ideas, scripts, SEO pages, emails, social posts, publishing packs, and client education only inside this insurance lane.",
    phrasesToUse: "coverage depends on policy terms, request a review, quote-ready checklist, Texas homeowners, Houston-area families, talk with a licensed Texas agent",
    recurringStoryTypes: `${niche.starterAngles.join("; ")}. Engine direction: ${niche.engineBrief}`,
    bannedPhrases: "guaranteed savings, fully covered, cheapest, best rate guaranteed, claim will be paid, everyone qualifies, no exclusions.",
    phrasesToAvoid: "secret trick, loophole, one weird hack, guaranteed, always covered, never denied",
    thumbnailStyle: "Clean professional insurance visuals, Texas/Houston cues, home/auto/business subject, readable two-to-five-word overlay, trust-first not fear-first.",
    sponsorRules: "If a sponsor or offer link is saved, place it naturally as an agency call-to-action once near the beginning and once near the end.",
    publishingRhythm: "Publish two educational videos or posts weekly, one local SEO asset weekly, and one client email or referral campaign weekly.",
    engineBrief: niche.engineBrief,
    monetizationScore: niche.monetizationScore,
    monetizationTier: niche.monetizationTier,
    monetizationRationale: niche.monetizationRationale,
    agency: {
      name: AGENCY_NAME,
      phone: AGENCY_PHONE,
      address: AGENCY_ADDRESS,
      licenseContext: LICENSE_CONTEXT,
      serviceArea: "All of Texas, mainly Houston and surrounding areas",
      priorityCarriers: ["Germania", "Travelers", "SWYFFT", "Progressive", "GEICO"]
    },
    keywords,
    ideaCombinations: [
      {
        nicheFocus: niche.nicheFocus,
        category: niche.category,
        tone: niche.tone,
        desiredLength: "SEO page, 3-8 minute video, short-form clip, email, or client checklist",
        sourceType: niche.sourceType,
        rationale: `Core ${niche.name} lane for repeatable agency growth assets.`,
        sampleAngles: niche.starterAngles
      }
    ],
    logoPrompt: `Square premium logo for PolicyForge LAB ${niche.name}, Texas insurance growth, clean shield or document mark, modern navy teal gold palette, no tiny text.`,
    bannerPrompt: `YouTube or web banner for PolicyForge LAB ${niche.name}, tagline "${niche.title}", professional Texas insurance advisor style, readable text in centered safe area.`
  });
}

export function forgeIdeaBrief(niche: ForgeNiche) {
  return [
    `${niche.name} — ${niche.title}`,
    niche.description,
    `Business promise: ${niche.viewerPromise}`,
    `Revenue fit: ${niche.monetizationScore}/10 (${niche.monetizationTier}). ${niche.monetizationRationale}`,
    `Agency direction: ${niche.engineBrief}`,
    "Generate assets ONLY inside this insurance lane.",
    `Repeatable starter angles: ${niche.starterAngles.join("; ")}.`,
    `Useful keywords: ${niche.keywords.join(", ")}.`
  ].join("\n");
}

function monetizationTier(score: number) {
  if (score >= 10) return "Elite agency revenue fit";
  if (score >= 9) return "Very strong agency revenue fit";
  if (score >= 8) return "Strong agency revenue fit";
  if (score >= 7) return "Useful support lane";
  return "Experimental lane";
}

export const POLICY_AGENCY_BRIEF = {
  agencyName: AGENCY_NAME,
  phone: AGENCY_PHONE,
  address: AGENCY_ADDRESS,
  licenseContext: LICENSE_CONTEXT,
  complianceRules: COMPLIANCE_RULES
};

export function policySafeFilename(value: string) {
  return slugify(value || "policyforge-asset") || "policyforge-asset";
}
