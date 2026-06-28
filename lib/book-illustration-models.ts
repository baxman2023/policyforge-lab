export type BookIllustrationModelQuality = "Budget" | "Balanced" | "Premium";

export type BookIllustrationModelOption = {
  id: string;
  label: string;
  provider: string;
  costPerImage: number;
  costLabel: string;
  dimensions: {
    width: number;
    height: number;
  };
  quality: BookIllustrationModelQuality;
  bestFor: string;
  recommended?: boolean;
};

export const DEFAULT_BOOK_ILLUSTRATION_MODEL = "runware:z-image@turbo";

export const BOOK_ILLUSTRATION_MODEL_OPTIONS: BookIllustrationModelOption[] = [
  {
    id: "runware:z-image@turbo",
    label: "Z-Image Turbo",
    provider: "Runware / Z.ai",
    costPerImage: 0.0006,
    costLabel: "~$0.0006 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Budget",
    bestFor: "Default low-cost choice for chapter openers, interior art, and first-pass book visuals.",
    recommended: true
  },
  {
    id: "alibaba:qwen-image@2512",
    label: "Qwen-Image 2512",
    provider: "Alibaba",
    costPerImage: 0.0051,
    costLabel: "$0.0051 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Budget",
    bestFor: "Prompt-following nonfiction scenes with strong object, place, and evidence control."
  },
  {
    id: "runware:z-image@0",
    label: "Z-Image",
    provider: "Runware / Z.ai",
    costPerImage: 0.0051,
    costLabel: "~$0.005 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Budget",
    bestFor: "A stronger low-cost option when Turbo is too rough for final interior illustrations."
  },
  {
    id: "krea:krea@2-turbo",
    label: "Krea 2 Turbo",
    provider: "Krea",
    costPerImage: 0.015,
    costLabel: "$0.015 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Balanced",
    bestFor: "Polished cinematic concept art and fast style exploration."
  },
  {
    id: "krea:krea@2-medium",
    label: "Krea 2 Medium",
    provider: "Krea",
    costPerImage: 0.03,
    costLabel: "$0.030 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Balanced",
    bestFor: "Cleaner final illustrations with a more expressive visual style."
  },
  {
    id: "recraft:v4.1@0",
    label: "Recraft V4.1",
    provider: "Recraft",
    costPerImage: 0.035,
    costLabel: "$0.035 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Premium",
    bestFor: "Graphic, editorial, and stylized nonfiction book artwork."
  },
  {
    id: "xai:grok-imagine@image-quality",
    label: "Grok Imagine Image Quality",
    provider: "xAI",
    costPerImage: 0.05,
    costLabel: "$0.050 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Premium",
    bestFor: "Higher-quality cinematic scenes when the image budget allows it."
  },
  {
    id: "google:4@2",
    label: "Nano Banana Pro",
    provider: "Google",
    costPerImage: 0.138,
    costLabel: "$0.138 / image",
    dimensions: { width: 1024, height: 1024 },
    quality: "Premium",
    bestFor: "Expensive premium art for the most important book illustrations."
  }
];

export function getBookIllustrationModelOption(modelId?: string | null) {
  const normalized = modelId?.trim();
  if (!normalized) {
    return BOOK_ILLUSTRATION_MODEL_OPTIONS.find((option) => option.id === DEFAULT_BOOK_ILLUSTRATION_MODEL);
  }

  return BOOK_ILLUSTRATION_MODEL_OPTIONS.find((option) => option.id === normalized);
}

export function estimateBookIllustrationCost(modelId: string | undefined | null, count: number) {
  const option = getBookIllustrationModelOption(modelId);
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return Number(((option?.costPerImage ?? 0) * safeCount).toFixed(6));
}

export function formatEstimatedBookIllustrationCost(modelId: string | undefined | null, count: number) {
  const cost = estimateBookIllustrationCost(modelId, count);
  if (cost > 0 && cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}
