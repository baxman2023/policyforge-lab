# PolicyForge LAB

Private AI growth engine for Baxter Insurance Agency, Inc. It creates Texas insurance content ideas, local SEO assets, client education scripts, renewal/cross-sell campaigns, YouTube/publishing packs, thumbnails, logos, banners, and analytics-informed recommendations.

## Quick Start

```bash
npm install
cp .env.example .env
docker compose up -d
npm run prisma:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `OPENROUTER_GLOBAL_API_KEY`
- `ENCRYPTION_KEY`
- `NEXT_PUBLIC_APP_URL`

## Agency Defaults

- Agency: Baxter Insurance Agency, Inc.
- Phone: 281-445-1381
- Address: 450 N Sam Houston Pkwy E Ste 103, Houston, TX 77060
- Service area: all of Texas, mainly Houston and surrounding areas
- License context: General Lines and life in Texas only
- Primary emphasis: home and auto, with commercial P&C and life supported
- Carrier emphasis: Germania, Travelers, SWYFFT, Progressive, GEICO, and other available markets

PolicyForge LAB should not promise savings, coverage, eligibility, underwriting acceptance, carrier placement, or claim outcomes. Outputs should invite a licensed Texas agent review and remind readers that coverage depends on policy terms, conditions, limits, exclusions, endorsements, deductibles, underwriting, carrier appetite, and Texas regulations.
