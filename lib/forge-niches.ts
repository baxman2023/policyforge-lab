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
  "Texas-only rule: all generated assets must target Texas prospects, Texas clients, Texas agency workflows, and Texas insurance conversations.",
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
  },
  ...carrierNichePacks()
];

type CarrierPackInput = {
  carrier: "Germania" | "Travelers" | "Swyfft";
  code: string;
  title: string;
  product: string;
  lineGroup: "Personal Lines" | "Business Insurance" | "Commercial Lines";
  description: string;
  nicheFocus: string;
  category: string;
  tone?: string;
  sourceType?: string;
  keywords: string[];
  starterAngles: string[];
  monetizationScore: number;
  monetizationRationale: string;
};

function carrierNichePacks(): ForgeNicheSeed[] {
  return [
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_AUTO",
      title: "Germania Texas Auto Insurance Pack",
      product: "Auto Insurance",
      lineGroup: "Personal Lines",
      description: "Germania-focused Texas auto insurance education, quote preparation, driver changes, deductibles, and household review campaigns.",
      nicheFocus: "Auto insurance",
      category: "Germania Personal Auto",
      tone: "Helpful, local, consultative",
      keywords: ["Germania auto insurance Texas", "Texas auto insurance", "Houston auto insurance", "Germania insurance agency"],
      starterAngles: ["Texas auto quote checklist for Germania shoppers", "Household driver changes to review before renewal", "Deductible and liability questions for Texas drivers"],
      monetizationScore: 9,
      monetizationRationale: "Core Texas personal-lines quote lane with strong home-auto cross-sell value."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_HOME",
      title: "Germania Texas Home & Property Pack",
      product: "Home & Property Insurance",
      lineGroup: "Personal Lines",
      description: "Germania-focused Texas homeowners and property education around roof age, wind, hail, deductibles, inspections, and renewal reviews.",
      nicheFocus: "Homeowners insurance",
      category: "Germania Home Property",
      keywords: ["Germania home insurance Texas", "Texas homeowners insurance", "Houston home insurance", "roof age insurance"],
      starterAngles: ["Germania home review questions before storm season", "Roof age and Texas homeowners insurance conversations", "Wind and hail deductible checklist for Houston homeowners"],
      monetizationScore: 10,
      monetizationRationale: "High-intent Texas homeowners lane tied directly to the agency's priority business."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_LIFE",
      title: "Germania Texas Life Insurance Pack",
      product: "Life Insurance",
      lineGroup: "Personal Lines",
      description: "Germania-focused Texas term life and whole life education for families, homeowners, business owners, and annual policy reviews.",
      nicheFocus: "Life insurance",
      category: "Germania Life",
      tone: "Warm and trust-building",
      keywords: ["Germania life insurance Texas", "Texas life insurance", "term life Texas", "whole life Texas"],
      starterAngles: ["Term life questions after buying a Texas home", "Whole life versus term life as a review conversation", "Family protection review for Germania clients"],
      monetizationScore: 8,
      monetizationRationale: "Relationship-deepening cross-sell lane with strong trust value."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_BUSINESS",
      title: "Germania Texas Business Insurance Pack",
      product: "Business Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency business insurance education for Texas small-business owners, contracts, certificates, property, liability, and renewal reviews.",
      nicheFocus: "Small business insurance",
      category: "Germania Business",
      keywords: ["Germania business insurance Texas", "Texas business insurance", "Houston business insurance", "Germania General Agency"],
      starterAngles: ["Texas business insurance checklist before signing a lease", "Certificate requests as a quote trigger", "Business renewal review questions for Germania markets"],
      monetizationScore: 9,
      monetizationRationale: "Commercial account lane with higher revenue potential and service-driven urgency."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_BUSINESS_AUTO",
      title: "Germania Texas Business Auto Pack",
      product: "Business Auto Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency business auto education for Texas contractors, service businesses, employee drivers, and work vehicles.",
      nicheFocus: "Commercial auto",
      category: "Germania Business Auto",
      keywords: ["Germania business auto Texas", "commercial auto insurance Texas", "business vehicle insurance Houston", "work truck insurance"],
      starterAngles: ["When a Texas business vehicle needs a commercial auto conversation", "Driver list hygiene before renewal", "Contractor truck questions for Germania business auto markets"],
      monetizationScore: 9,
      monetizationRationale: "High-value commercial line with obvious cross-sell to GL, BOP, and contractor coverage."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_GL",
      title: "Germania Texas General Liability Pack",
      product: "General Liability Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency general liability education for Texas businesses, contractors, premises exposure, contracts, and certificate requests.",
      nicheFocus: "Small business insurance",
      category: "Germania General Liability",
      keywords: ["Germania general liability Texas", "Texas general liability", "Houston contractor liability", "certificate of insurance"],
      starterAngles: ["General liability questions before a Texas contract", "Certificate request checklist for small businesses", "Premises exposure questions for Houston businesses"],
      monetizationScore: 10,
      monetizationRationale: "Core commercial coverage lane with strong local search and urgent certificate-driven buying behavior."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_BOP",
      title: "Germania Texas BOP Pack",
      product: "Business Owner Insurance (BOP)",
      lineGroup: "Business Insurance",
      description: "Germania General Agency BOP education for Texas small businesses comparing business owner policies, liability, property, and income exposures.",
      nicheFocus: "Small business insurance",
      category: "Germania BOP",
      keywords: ["Germania BOP Texas", "business owners policy Texas", "Houston small business insurance", "BOP insurance"],
      starterAngles: ["BOP versus general liability for Texas businesses", "What business property values to gather before a quote", "Lease insurance requirements and BOP conversations"],
      monetizationScore: 9,
      monetizationRationale: "Efficient commercial package lane with strong small-business quote value."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_BUSINESS_FLOOD",
      title: "Germania Texas Business Flood Pack",
      product: "Flood Insurance for Businesses",
      lineGroup: "Business Insurance",
      description: "Germania General Agency business flood education for Texas property owners, tenants, inventory, equipment, and lender or lease requirements.",
      nicheFocus: "Flood insurance",
      category: "Germania Business Flood",
      keywords: ["business flood insurance Texas", "Houston commercial flood insurance", "Germania business flood", "commercial flood coverage"],
      starterAngles: ["Why Texas business flood risk deserves its own quote conversation", "Inventory and equipment questions before flood season", "Lease and lender flood requirements for Houston businesses"],
      monetizationScore: 8,
      monetizationRationale: "Important Houston-area gap-coverage lane with strong seasonal urgency."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_HOME_BUSINESS",
      title: "Germania Texas Home-Based Business Pack",
      product: "Home-Based Business Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency home-based business education for Texas entrepreneurs who may be mixing homeowners, business property, and liability exposures.",
      nicheFocus: "Small business insurance",
      category: "Germania Home-Based Business",
      keywords: ["home based business insurance Texas", "Germania business insurance", "Texas home business insurance", "Houston small business insurance"],
      starterAngles: ["When a Texas side business outgrows a home policy conversation", "Home office property and liability questions", "Quote-ready checklist for home-based business owners"],
      monetizationScore: 8,
      monetizationRationale: "Practical cross-over lane between personal lines and small commercial."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_MANAGEMENT_PROFESSIONAL",
      title: "Germania Texas Management & Professional Pack",
      product: "Management & Professional Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency management and professional liability education for Texas businesses needing D&O, EPLI, ERISA fidelity, E&O, or fidelity conversations.",
      nicheFocus: "Small business insurance",
      category: "Germania Management Professional",
      keywords: ["management liability Texas", "professional liability Texas", "D&O insurance Texas", "E&O insurance Texas"],
      starterAngles: ["D&O and EPLI questions for Texas business owners", "When errors and omissions belongs in the insurance review", "Fidelity and ERISA questions for management teams"],
      monetizationScore: 8,
      monetizationRationale: "Higher-complexity commercial lane with strong advisory value and premium potential."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_COMMERCIAL_PROPERTY",
      title: "Germania Texas Commercial Property Pack",
      product: "Business / Commercial Property Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency commercial property education for Texas buildings, tenant improvements, inventory, equipment, valuations, and storm exposure.",
      nicheFocus: "Small business insurance",
      category: "Germania Commercial Property",
      keywords: ["Germania commercial property Texas", "commercial property insurance Houston", "business property insurance Texas", "Texas building insurance"],
      starterAngles: ["Commercial property values Texas businesses should review", "Tenant improvements and inventory questions before renewal", "Storm-readiness checklist for commercial property owners"],
      monetizationScore: 9,
      monetizationRationale: "High-value property lane with local storm and renewal urgency."
    }),
    carrierPack({
      carrier: "Germania",
      code: "GERMANIA_CYBER",
      title: "Germania Texas Data Breach & Cyber Pack",
      product: "Data Breach / Cyber Insurance",
      lineGroup: "Business Insurance",
      description: "Germania General Agency data breach and cyber education for Texas small businesses, customer data, payment systems, ransomware, and incident-response planning.",
      nicheFocus: "Small business insurance",
      category: "Germania Cyber",
      keywords: ["cyber insurance Texas", "data breach insurance Texas", "Germania cyber insurance", "small business cyber insurance"],
      starterAngles: ["Cyber questions every Texas small business should ask", "Customer data and payment-system exposure checklist", "Data breach coverage as a renewal review topic"],
      monetizationScore: 9,
      monetizationRationale: "Fast-growing commercial lane with strong advertiser and business-owner urgency."
    }),
    ...travelersPersonalPacks(),
    ...travelersBusinessPacks(),
    ...swyfftPacks()
  ];
}

function travelersPersonalPacks(): ForgeNicheSeed[] {
  return [
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_HOME", title: "Travelers Texas Home & Property Pack", product: "Home / Property Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas home and property education for homeowners, roof questions, deductibles, water, wind, hail, and renewal reviews.", nicheFocus: "Homeowners insurance", category: "Travelers Home Property", keywords: ["Travelers home insurance Texas", "Texas homeowners insurance", "Houston home insurance", "home insurance review"], starterAngles: ["Travelers home quote checklist for Texas homeowners", "Roof and deductible questions before renewal", "Houston home review before storm season"], monetizationScore: 10, monetizationRationale: "High-intent Texas homeowners lane with major quote and retention value." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_AUTO", title: "Travelers Texas Auto Pack", product: "Auto Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas auto education for drivers, households, teen drivers, deductibles, limits, and renewal reviews.", nicheFocus: "Auto insurance", category: "Travelers Auto", keywords: ["Travelers auto insurance Texas", "Texas auto insurance", "Houston car insurance", "auto insurance review"], starterAngles: ["Travelers auto quote checklist for Texas drivers", "Teen driver questions before renewal", "Liability and deductible review for Houston households"], monetizationScore: 9, monetizationRationale: "Large-volume personal line with strong home-auto cross-sell." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_RENTERS", title: "Travelers Texas Renters Pack", product: "Renters Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas renters education for apartments, personal property, liability, lease requirements, and first-policy conversations.", nicheFocus: "Renters insurance", category: "Travelers Renters", keywords: ["Travelers renters insurance Texas", "Houston renters insurance", "Texas renters insurance", "apartment insurance"], starterAngles: ["Renters checklist for Houston apartments", "What renters should know about personal property", "Lease-required insurance versus real protection questions"], monetizationScore: 7, monetizationRationale: "Entry-level relationship lane with long-term household growth potential." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_CONDO", title: "Travelers Texas Condo Pack", product: "Condo Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas condo education around unit-owner coverage, association master policies, personal property, loss assessment, and liability.", nicheFocus: "Homeowners insurance", category: "Travelers Condo", keywords: ["Travelers condo insurance Texas", "Texas condo insurance", "Houston condo insurance", "loss assessment insurance"], starterAngles: ["Condo insurance questions before closing in Texas", "Master policy versus unit-owner policy explained", "Loss assessment questions for condo owners"], monetizationScore: 8, monetizationRationale: "Useful property sub-lane with purchase and association-triggered quote intent." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_BOAT", title: "Travelers Texas Boat & Yacht Pack", product: "Boat & Yacht Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas boat and yacht education for coastal, lake, storage, liability, trailer, and seasonal review conversations.", nicheFocus: "Liability protection", category: "Travelers Boat Yacht", keywords: ["Travelers boat insurance Texas", "Texas boat insurance", "boat insurance Houston", "yacht insurance Texas"], starterAngles: ["Boat insurance questions before Texas lake season", "Storage and trailer questions for boat owners", "Liability conversations for Texas boaters"], monetizationScore: 7, monetizationRationale: "Niche personal-lines cross-sell with affluent household potential." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_LANDLORD", title: "Travelers Texas Landlord Pack", product: "Landlord / Rental Property Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas landlord and rental property education for rental homes, tenant exposure, vacancy, short-term rentals, and property investor reviews.", nicheFocus: "Rental property insurance", category: "Travelers Landlord", keywords: ["Travelers landlord insurance Texas", "Texas rental property insurance", "Houston landlord insurance", "vacant home insurance"], starterAngles: ["Rental property checklist for Texas landlords", "Vacancy and tenant questions before renewal", "Landlord coverage conversation before leasing a home"], monetizationScore: 8, monetizationRationale: "Higher account value and good cross-sell into umbrella and property schedules." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_UMBRELLA", title: "Travelers Texas Personal Umbrella Pack", product: "Personal Umbrella (Excess Liability)", lineGroup: "Personal Lines", description: "Travelers-focused Texas personal umbrella education for homeowners, drivers, landlords, boat owners, and higher-asset households.", nicheFocus: "Liability protection", category: "Travelers Umbrella", keywords: ["Travelers umbrella insurance Texas", "personal umbrella Texas", "excess liability insurance Texas", "Houston umbrella insurance"], starterAngles: ["Umbrella questions for Texas families with teen drivers", "Landlords and umbrella liability conversations", "Why auto limits matter before umbrella quotes"], monetizationScore: 8, monetizationRationale: "Strong retention and account-rounding lane with advisory value." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_VALUABLE_ITEMS", title: "Travelers Texas Valuable Items Pack", product: "Valuable Items / Jewelry Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas valuable items and jewelry education for appraisals, scheduling, gifts, engagement rings, collections, and household reviews.", nicheFocus: "Homeowners insurance", category: "Travelers Valuable Items", keywords: ["Travelers jewelry insurance Texas", "valuable items insurance Texas", "scheduled personal property", "Houston jewelry insurance"], starterAngles: ["Jewelry questions after an engagement or anniversary", "When valuable items may need a separate review", "Appraisal checklist for Texas households"], monetizationScore: 7, monetizationRationale: "Useful cross-sell tied to life events and higher-value households." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_WEDDING_EVENT", title: "Travelers Texas Wedding & Event Pack", product: "Wedding & Special Event Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas wedding and special event insurance education for venues, deposits, liability, vendors, weather, and event-day surprises.", nicheFocus: "Liability protection", category: "Travelers Wedding Event", keywords: ["wedding insurance Texas", "special event insurance Texas", "Travelers wedding insurance", "event liability Texas"], starterAngles: ["Wedding insurance checklist for Texas venues", "Event liability questions before signing contracts", "Weather and vendor questions for Texas events"], monetizationScore: 6, monetizationRationale: "Lower-frequency but timely life-event lane with clear search intent." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_TRAVEL", title: "Travelers Texas Travel Insurance Pack", product: "Travel Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas travel insurance education for trip costs, medical questions, cancellations, family travel, and timing conversations.", nicheFocus: "Liability protection", category: "Travelers Travel", keywords: ["Travelers travel insurance Texas", "travel insurance Texas", "trip insurance", "travel protection"],
      starterAngles: ["Travel insurance questions before a major trip", "Trip cost and cancellation checklist", "Family travel protection questions for Texas clients"], monetizationScore: 6, monetizationRationale: "Useful cross-sell and seasonal content lane, though less central to P&C agency revenue." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_PET", title: "Travelers Texas Pet Insurance Pack", product: "Pet Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas pet insurance education for households comparing pet medical costs, timing, exclusions, and quote questions.", nicheFocus: "Relationship marketing", category: "Travelers Pet", keywords: ["Travelers pet insurance Texas", "pet insurance Texas", "Houston pet insurance", "pet medical insurance"], starterAngles: ["Pet insurance questions for Texas families", "When to compare pet insurance before a health issue", "Pet coverage as a household review conversation"], monetizationScore: 6, monetizationRationale: "Lightweight relationship and cross-sell lane with broad household appeal." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_MOTORCYCLE", title: "Travelers Texas Motorcycle Pack", product: "Motorcycle Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas motorcycle insurance education for riders, seasonal use, liability, physical damage, gear, and multi-policy reviews.", nicheFocus: "Auto insurance", category: "Travelers Motorcycle", keywords: ["Travelers motorcycle insurance Texas", "Texas motorcycle insurance", "Houston motorcycle insurance", "motorcycle coverage review"], starterAngles: ["Motorcycle insurance checklist for Texas riders", "Seasonal rider questions before renewal", "Liability and physical damage conversations for motorcycles"], monetizationScore: 7, monetizationRationale: "Niche auto-adjacent cross-sell with clear seasonal engagement." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_FLOOD", title: "Travelers Texas Flood Pack", product: "Flood Insurance", lineGroup: "Personal Lines", description: "Travelers-focused Texas flood insurance education for homeowners, landlords, condo owners, Houston flooding, lender requirements, and quote timing.", nicheFocus: "Flood insurance", category: "Travelers Flood", keywords: ["Travelers flood insurance Texas", "Houston flood insurance", "Texas flood insurance", "flood policy review"], starterAngles: ["Flood questions for Houston homeowners outside high-risk zones", "Waiting period reminders before storm season", "Flood quote checklist before buying a Texas home"], monetizationScore: 9, monetizationRationale: "Critical Houston-area protection gap with strong educational lead value." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_CLASSIC_CAR", title: "Travelers Texas Classic Car Pack", product: "Classic / Antique Car Insurance", lineGroup: "Personal Lines", description: "Travelers/InsuraMatch-focused Texas classic and antique car education for agreed value, storage, usage, collections, and household reviews.", nicheFocus: "Auto insurance", category: "Travelers Classic Car", keywords: ["classic car insurance Texas", "antique car insurance Texas", "Travelers classic car", "agreed value auto insurance"], starterAngles: ["Classic car insurance questions before a show or sale", "Agreed value versus regular auto conversations", "Storage and usage questions for Texas collectors"], monetizationScore: 7, monetizationRationale: "Niche but valuable affluent-household cross-sell lane." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_RV", title: "Travelers Texas RV Pack", product: "RV Insurance", lineGroup: "Personal Lines", description: "Travelers/InsuraMatch-focused Texas RV insurance education for motorhomes, trailers, seasonal travel, storage, liability, and household reviews.", nicheFocus: "Auto insurance", category: "Travelers RV", keywords: ["RV insurance Texas", "Travelers RV insurance", "motorhome insurance Texas", "camper insurance Texas"], starterAngles: ["RV insurance questions before Texas road trips", "Storage and seasonal use checklist", "Motorhome liability and physical damage conversations"], monetizationScore: 7, monetizationRationale: "Seasonal personal-lines cross-sell with strong household and travel timing." })
  ];
}

function travelersBusinessPacks(): ForgeNicheSeed[] {
  return [
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_EQUIPMENT_BREAKDOWN", title: "Travelers Texas Equipment Breakdown Pack", product: "Boiler & Machinery / Equipment Breakdown", lineGroup: "Business Insurance", description: "Travelers-focused Texas equipment breakdown education for building systems, machinery, restaurants, retailers, offices, and property owners.", nicheFocus: "Small business insurance", category: "Travelers Equipment Breakdown", keywords: ["Travelers equipment breakdown Texas", "boiler machinery insurance Texas", "business equipment breakdown", "commercial property Texas"], starterAngles: ["Equipment breakdown questions for Texas businesses", "Restaurants and retailers: systems that can stop revenue", "Commercial property review checklist for equipment exposure"], monetizationScore: 8, monetizationRationale: "Good commercial property add-on lane with useful loss-prevention education." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_COMMERCIAL_AUTO_TRUCKING", title: "Travelers Texas Commercial Auto & Trucking Pack", product: "Commercial Auto & Trucking", lineGroup: "Business Insurance", description: "Travelers-focused Texas commercial auto and trucking education for fleets, hired/non-owned auto, contractors, delivery, driver lists, and trucking exposures.", nicheFocus: "Commercial auto", category: "Travelers Commercial Auto Trucking", keywords: ["Travelers commercial auto Texas", "Texas trucking insurance", "commercial auto insurance Houston", "fleet insurance Texas"], starterAngles: ["Fleet review checklist for Texas businesses", "Hired and non-owned auto questions", "Driver list hygiene for commercial auto renewals"], monetizationScore: 10, monetizationRationale: "High-value commercial line with urgent quote and renewal triggers." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_GROUP_CAPTIVE", title: "Travelers Texas Commercial Group Captive Pack", product: "Commercial Group Captive", lineGroup: "Business Insurance", description: "Travelers-focused Texas commercial group captive education for qualifying businesses exploring risk-sharing, safety, loss control, and long-term cost-control conversations.", nicheFocus: "Small business insurance", category: "Travelers Group Captive", keywords: ["Travelers group captive Texas", "commercial group captive", "Texas captive insurance", "business risk financing"], starterAngles: ["What a group captive conversation means for Texas businesses", "Loss control questions before considering captive options", "Who should ask about group captive programs"], monetizationScore: 7, monetizationRationale: "Specialized commercial lane for larger, more sophisticated accounts." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_CYBER", title: "Travelers Texas Cyber Liability Pack", product: "Cyber Liability", lineGroup: "Business Insurance", description: "Travelers-focused Texas cyber liability education for ransomware, data breach, payment systems, customer data, vendor access, and incident response.", nicheFocus: "Small business insurance", category: "Travelers Cyber", keywords: ["Travelers cyber liability Texas", "cyber insurance Texas", "data breach insurance Houston", "ransomware insurance"], starterAngles: ["Cyber questions every Texas business should ask", "Customer data and payment-system checklist", "Why cyber belongs in the annual commercial review"], monetizationScore: 10, monetizationRationale: "Premium commercial lane with strong urgency and high-value advertiser/search intent." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_ENVIRONMENTAL", title: "Travelers Texas Environmental Liability Pack", product: "Environmental / Pollution Liability", lineGroup: "Business Insurance", description: "Travelers-focused Texas environmental and pollution liability education for contractors, property owners, fuel, storage, cleanup, and contractual exposures.", nicheFocus: "Small business insurance", category: "Travelers Environmental", keywords: ["Travelers pollution liability Texas", "environmental insurance Texas", "pollution liability Houston", "contractor pollution insurance"], starterAngles: ["Pollution liability questions for Texas contractors", "Environmental exposure checklist before a contract", "Property-owner cleanup conversations before renewal"], monetizationScore: 8, monetizationRationale: "Specialized commercial lane with strong account value and advisory differentiation." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_COMMERCIAL_UMBRELLA", title: "Travelers Texas Commercial Umbrella Pack", product: "Commercial Umbrella & Excess Liability", lineGroup: "Business Insurance", description: "Travelers-focused Texas commercial umbrella and excess liability education for contracts, auto fleets, premises, products, and larger liability stacks.", nicheFocus: "Liability protection", category: "Travelers Commercial Umbrella", keywords: ["Travelers commercial umbrella Texas", "commercial excess liability Texas", "business umbrella insurance Houston", "Texas liability limits"], starterAngles: ["Commercial umbrella questions before signing larger contracts", "Fleet and premises exposures that raise limit conversations", "Why excess liability belongs in the business review"], monetizationScore: 9, monetizationRationale: "Strong commercial account-rounding lane with high retention value." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_GL", title: "Travelers Texas General Liability Pack", product: "General Liability", lineGroup: "Business Insurance", description: "Travelers-focused Texas general liability education for small businesses, contractors, premises liability, products, completed operations, and certificates.", nicheFocus: "Small business insurance", category: "Travelers General Liability", keywords: ["Travelers general liability Texas", "Texas general liability insurance", "Houston business liability", "certificate of insurance"], starterAngles: ["General liability questions before a Texas contract", "Certificate requests and quote readiness", "Products and completed operations conversations"], monetizationScore: 10, monetizationRationale: "Core commercial line with strong search intent and urgent certificate-driven demand." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_INTERNATIONAL", title: "Travelers Texas Global / International Pack", product: "Global / International Insurance", lineGroup: "Business Insurance", description: "Travelers-focused Texas international insurance education for businesses with global operations, foreign travel, imported goods, overseas contracts, and cross-border exposures.", nicheFocus: "Small business insurance", category: "Travelers International", keywords: ["Travelers international insurance Texas", "global business insurance", "foreign liability insurance", "Texas international business insurance"], starterAngles: ["When a Texas business should ask about international exposure", "Foreign travel and overseas contract insurance questions", "Imported goods and global operations review checklist"], monetizationScore: 7, monetizationRationale: "Specialized but valuable lane for more complex commercial accounts." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_INLAND_MARINE", title: "Travelers Texas Inland Marine Pack", product: "Inland Marine", lineGroup: "Business Insurance", description: "Travelers-focused Texas inland marine education for equipment, tools, materials in transit, installation floaters, contractors, and mobile property.", nicheFocus: "Contractor insurance", category: "Travelers Inland Marine", keywords: ["Travelers inland marine Texas", "tools equipment insurance Texas", "contractor equipment insurance", "installation floater Texas"], starterAngles: ["Tools and equipment checklist for Texas contractors", "Property in transit questions for businesses", "Installation floater conversations before larger jobs"], monetizationScore: 9, monetizationRationale: "Strong contractor and commercial property cross-sell with tangible pain points." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_MANAGEMENT_PROFESSIONAL", title: "Travelers Texas Management & Professional Pack", product: "Management & Professional Liability", lineGroup: "Business Insurance", description: "Travelers-focused Texas management and professional liability education for D&O, EPLI, fiduciary, E&O, nonprofit, private, public, and financial institution exposures.", nicheFocus: "Small business insurance", category: "Travelers Management Professional", keywords: ["Travelers management liability Texas", "D&O insurance Texas", "EPLI insurance Texas", "professional liability Texas"], starterAngles: ["D&O and EPLI questions for Texas leadership teams", "Professional liability review before contract growth", "Fiduciary liability questions for benefit plans"], monetizationScore: 9, monetizationRationale: "High-value commercial advisory lane with strong account sophistication." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_OCEAN_MARINE", title: "Travelers Texas Ocean Marine Pack", product: "Ocean Marine", lineGroup: "Business Insurance", description: "Travelers-focused Texas ocean marine education for cargo, ports, logistics, maritime businesses, import/export, and coastal commercial exposures.", nicheFocus: "Small business insurance", category: "Travelers Ocean Marine", keywords: ["Travelers ocean marine Texas", "ocean marine insurance Houston", "cargo insurance Texas", "marine insurance Texas"], starterAngles: ["Ocean marine questions for Houston logistics businesses", "Cargo and import/export coverage review", "Port-related business exposure checklist"], monetizationScore: 8, monetizationRationale: "Specialized Houston-relevant commercial lane with larger account potential." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_COMMERCIAL_PROPERTY", title: "Travelers Texas Commercial Property Pack", product: "Commercial Property", lineGroup: "Business Insurance", description: "Travelers-focused Texas commercial property education for buildings, business personal property, valuations, equipment, storm risk, leases, and renewal reviews.", nicheFocus: "Small business insurance", category: "Travelers Commercial Property", keywords: ["Travelers commercial property Texas", "commercial property insurance Houston", "business property insurance Texas", "building insurance Texas"], starterAngles: ["Commercial property values to gather before renewal", "Business personal property questions for Texas companies", "Storm-readiness review for commercial buildings"], monetizationScore: 10, monetizationRationale: "High-value commercial property lane with major Texas storm and renewal urgency." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_BOP", title: "Travelers Texas BOP / Small Business Pack", product: "Business Owner's Policy (BOP) / Small Business", lineGroup: "Business Insurance", description: "Travelers-focused Texas BOP and small-business education for package policies, liability, property, income exposures, leases, and local business reviews.", nicheFocus: "Small business insurance", category: "Travelers BOP Small Business", keywords: ["Travelers BOP Texas", "business owners policy Texas", "small business insurance Houston", "Texas BOP insurance"], starterAngles: ["BOP checklist for Texas small businesses", "BOP versus general liability explained plainly", "Lease insurance requirements and quote readiness"], monetizationScore: 10, monetizationRationale: "Core small-commercial lane with high quote value and repeatable local SEO demand." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_SURETY", title: "Travelers Texas Surety Bonds Pack", product: "Surety Bonds", lineGroup: "Business Insurance", description: "Travelers-focused Texas surety bond education for contractors, licensing, performance bonds, payment bonds, bid bonds, and business obligations.", nicheFocus: "Contractor insurance", category: "Travelers Surety Bonds", keywords: ["Travelers surety bonds Texas", "Texas surety bonds", "contractor bonds Texas", "performance bond Texas"], starterAngles: ["Surety bond questions before bidding Texas work", "Performance and payment bonds explained for contractors", "License bond checklist for Texas businesses"], monetizationScore: 8, monetizationRationale: "Specialized but high-intent commercial/service lane tied to contractor growth." }),
    carrierPack({ carrier: "Travelers", code: "TRAVELERS_WORKERS_COMP", title: "Travelers Texas Workers Compensation Pack", product: "Workers Compensation", lineGroup: "Business Insurance", description: "Travelers-focused Texas workers compensation education for employers, payroll, classifications, claims, safety, audits, and renewal reviews.", nicheFocus: "Small business insurance", category: "Travelers Workers Compensation", keywords: ["Travelers workers compensation Texas", "Texas workers comp insurance", "Houston workers compensation", "workers comp audit"], starterAngles: ["Workers comp questions before hiring in Texas", "Payroll and classification checklist before renewal", "Safety and claims conversations for business owners"], monetizationScore: 9, monetizationRationale: "High-retention commercial line with recurring audits and service conversations."
    })
  ];
}

function swyfftPacks(): ForgeNicheSeed[] {
  return [
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_HO3_HOMEOWNERS", title: "Swyfft Texas Homeowners HO3 Pack", product: "Homeowners Insurance (HO3)", lineGroup: "Personal Lines", description: "Swyfft-focused Texas HO3 homeowners education covering dwelling, other structures, personal property, loss of use, personal liability, deductibles, and quote-readiness.", nicheFocus: "Homeowners insurance", category: "Swyfft HO3 Homeowners", keywords: ["Swyfft homeowners insurance Texas", "HO3 insurance Texas", "Texas homeowners insurance", "Houston home insurance"], starterAngles: ["HO3 checklist for Texas homeowners comparing Swyfft", "Coverage A through E explained for home reviews", "Quote-ready home details before a Swyfft conversation"], monetizationScore: 10, monetizationRationale: "Priority homeowners lane with strong Texas property lead value." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_EQUIPMENT_BREAKDOWN", title: "Swyfft Texas Equipment Breakdown Pack", product: "Equipment Breakdown Coverage", lineGroup: "Personal Lines", description: "Swyfft-focused Texas equipment breakdown endorsement education for homeowners reviewing systems, appliances, mechanical breakdown, and household risk questions.", nicheFocus: "Homeowners insurance", category: "Swyfft Equipment Breakdown", keywords: ["Swyfft equipment breakdown Texas", "equipment breakdown coverage", "home equipment breakdown insurance", "Texas homeowners endorsement"], starterAngles: ["Equipment breakdown questions for Texas homeowners", "Systems and appliances to discuss during a home review", "Endorsement conversations before renewal"], monetizationScore: 8, monetizationRationale: "Useful endorsement lane that strengthens homeowners reviews and account rounding." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_FLOOD", title: "Swyfft Texas Flood Education Pack", product: "Flood Insurance", lineGroup: "Personal Lines", description: "Swyfft-adjacent flood education for Texas homeowners, clearly framed as availability-dependent and focused on separate flood conversations, waiting periods, and Houston-area risk.",
      nicheFocus: "Flood insurance", category: "Swyfft Flood Education", keywords: ["Swyfft flood insurance Texas", "Houston flood insurance", "Texas flood insurance", "flood insurance review"], starterAngles: ["Flood questions Texas homeowners should ask separately from HO3", "Houston flood risk review before storm season", "Availability-dependent flood quote conversation checklist"], monetizationScore: 8, monetizationRationale: "Houston-relevant protection-gap lane, with careful availability-dependent framing." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_APARTMENT_BUILDINGS", title: "Swyfft Texas Apartment Buildings Pack", product: "Commercial Package — Apartment Buildings", lineGroup: "Commercial Lines", description: "Swyfft-focused Texas commercial package education for apartment building owners, property values, liability, habitational risk, loss control, and renewal reviews.", nicheFocus: "Small business insurance", category: "Swyfft Apartment Buildings", keywords: ["Swyfft apartment building insurance Texas", "apartment building insurance Houston", "habitational insurance Texas", "commercial package Texas"], starterAngles: ["Apartment building insurance checklist for Texas owners", "Habitational risk questions before renewal", "Property values and liability conversations for apartment buildings"], monetizationScore: 9, monetizationRationale: "High-value property/commercial lane with strong Houston real estate relevance." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_CONDO_ASSOCIATIONS", title: "Swyfft Texas Condo Associations Pack", product: "Commercial Package — Condominium Associations", lineGroup: "Commercial Lines", description: "Swyfft-focused Texas commercial package education for condominium associations, buildings, shared property, liability, board questions, and renewal planning.", nicheFocus: "Small business insurance", category: "Swyfft Condo Associations", keywords: ["Swyfft condo association insurance Texas", "condominium association insurance", "HOA insurance Texas", "commercial package insurance"], starterAngles: ["Condo association insurance checklist for Texas boards", "Shared property and liability questions before renewal", "Board-level review prompts for condominium associations"], monetizationScore: 8, monetizationRationale: "Specialized commercial property lane with strong advisory value." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_SHOPPING_CENTERS", title: "Swyfft Texas Shopping Centers Pack", product: "Commercial Package — Shopping Center Owners & Operators", lineGroup: "Commercial Lines", description: "Swyfft-focused Texas commercial package education for shopping center owners and operators, tenant exposures, property values, liability, leases, and storm risk.", nicheFocus: "Small business insurance", category: "Swyfft Shopping Centers", keywords: ["shopping center insurance Texas", "Swyfft commercial package Texas", "retail property insurance Houston", "commercial property liability"], starterAngles: ["Shopping center insurance checklist for Texas owners", "Tenant and lease insurance questions before renewal", "Storm and liability review for retail property operators"], monetizationScore: 9, monetizationRationale: "High-account-value commercial property lane with strong local relevance." }),
    carrierPack({ carrier: "Swyfft", code: "SWYFFT_OFFICE_BUILDINGS", title: "Swyfft Texas Office Buildings Pack", product: "Commercial Package — Office Buildings", lineGroup: "Commercial Lines", description: "Swyfft-focused Texas commercial package education for office building owners, property values, tenants, liability, building systems, and renewal reviews.", nicheFocus: "Small business insurance", category: "Swyfft Office Buildings", keywords: ["office building insurance Texas", "Swyfft commercial package", "commercial property Houston", "office building liability"], starterAngles: ["Office building insurance checklist for Texas owners", "Tenant and building-system questions before renewal", "Commercial property review prompts for office buildings"], monetizationScore: 8, monetizationRationale: "Commercial property lane with clear property-owner and lease-driven conversations." })
  ];
}

function carrierPack(input: CarrierPackInput): ForgeNicheSeed {
  const texasTitle = input.title.includes("Texas") ? input.title : `${input.title} Texas Pack`;
  const linePrefix = `${input.carrier} ${input.lineGroup}`;
  return {
    code: input.code,
    name: input.code,
    title: texasTitle,
    slug: slugify(input.code),
    description: `${input.description} Texas-only pack for Baxter Insurance Agency content, local SEO, client education, quote preparation, renewal reviews, and compliant carrier-specific conversations.`,
    viewerPromise: `Every asset helps Texas prospects and clients understand ${input.carrier} ${input.product} conversations before requesting a licensed Texas agency review.`,
    nicheFocus: input.nicheFocus,
    tone: input.tone || "Helpful, local, consultative",
    category: input.category,
    sourceType: input.sourceType || `${linePrefix} product information, Texas market context, agency quoting workflow, client FAQs`,
    keywords: uniqueList([...input.keywords, `${input.carrier} insurance Texas`, "Baxter Insurance Agency", "Texas insurance review"]),
    starterAngles: input.starterAngles,
    monetizationScore: input.monetizationScore,
    monetizationRationale: `${input.monetizationRationale} Keep all assets Texas-based and frame ${input.carrier} as a possible market or carrier relationship, not a promise of availability, placement, price, or coverage.`
  };
}

function uniqueList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
    logoPrompt: `Square premium logo for Baxter Growth Lab ${niche.name}, Texas insurance growth, clean shield or document mark, modern navy teal gold palette, no tiny text.`,
    bannerPrompt: `YouTube or web banner for Baxter Growth Lab ${niche.name}, tagline "${niche.title}", professional Texas insurance advisor style, readable text in centered safe area.`
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
