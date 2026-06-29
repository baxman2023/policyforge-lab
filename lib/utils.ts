import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

export function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function estimatedMinutesFromWords(words: number) {
  return Math.max(1, Math.round(words / 150));
}

export function targetWordsForMinutes(minutes: number) {
  return Math.round(Math.max(1, minutes) * 160);
}

export function targetWordsForProject(format: string, minutes: number, episodeCount = 5) {
  if (format === "ARTICLE") {
    if (minutes <= 30) return 1200;
    if (minutes >= 60) return 3000;
    return 2000;
  }

  if (format === "SHORT_BOOK") {
    if (minutes <= 30) return 10000;
    if (minutes >= 60) return 20000;
    return 15000;
  }

  if (format === "LONG_BOOK") {
    if (minutes <= 30) return 40000;
    if (minutes >= 60) return 80000;
    return 60000;
  }

  if (format === "PODCAST_EPISODE") {
    return Math.round(Math.max(1, minutes) * 150);
  }

  if (format === "EPISODIC_SERIES") {
    return targetWordsForMinutes(minutes) * Math.min(5, Math.max(1, Math.round(episodeCount)));
  }

  return targetWordsForMinutes(minutes);
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}
