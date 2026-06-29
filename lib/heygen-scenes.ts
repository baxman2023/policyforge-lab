const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  twentyone: 21,
  twentytwo: 22,
  twentythree: 23,
  twentyfour: 24,
  twentyfive: 25,
  twentysix: 26,
  twentyseven: 27,
  twentyeight: 28,
  twentynine: 29,
  thirty: 30,
  thirtyone: 31,
  thirtytwo: 32,
  thirtythree: 33,
  thirtyfour: 34,
  thirtyfive: 35,
  thirtysix: 36,
  thirtyseven: 37,
  thirtyeight: 38,
  thirtynine: 39,
  forty: 40
};

const SCENE_HEADING_PATTERN = /^\s*Scene\s+(\d{1,2}|[a-z][a-z -]{1,24})\s*(?::|\.|-|–|—)?\s*.*$/gim;

export function shouldFormatAsHeyGenScenes(format?: string | null) {
  return format === "STANDALONE" || format === "EPISODIC_SERIES";
}

export function formatHeyGenSceneScript(content: string, options: { wordsPerScene?: number } = {}) {
  const clean = cleanSceneScriptText(content);
  if (!clean) return "";

  const existingScenes = extractExistingScenes(clean);
  const scenes = existingScenes.length >= 2
    ? existingScenes
    : chunkIntoScenes(clean, options.wordsPerScene ?? 170);

  return scenes
    .map((scene, index) => `Scene ${index + 1}\n\n${scene.trim()}`)
    .filter((scene) => scene.replace(/^Scene\s+\d+\s*/i, "").trim())
    .join("\n\n");
}

function extractExistingScenes(content: string) {
  const matches: RegExpExecArray[] = [];
  SCENE_HEADING_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SCENE_HEADING_PATTERN.exec(content))) {
    matches.push(match);
  }
  if (!matches.length) return [];

  const scenes = matches
    .map((match, index) => {
      const start = typeof match.index === "number" ? match.index + match[0].length : 0;
      const end = index + 1 < matches.length && typeof matches[index + 1].index === "number"
        ? matches[index + 1].index ?? content.length
        : content.length;
      return cleanSceneBody(content.slice(start, end));
    })
    .filter(Boolean);
  const prefix = cleanSceneBody(content.slice(0, matches[0].index ?? 0));
  return prefix ? [prefix, ...scenes] : scenes;
}

function chunkIntoScenes(content: string, wordsPerScene: number) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map(cleanSceneBody)
    .filter(Boolean);
  const scenes: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  const targetWords = Math.max(80, wordsPerScene);

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);
    if (current.length && currentWords + paragraphWords > targetWords) {
      scenes.push(current.join("\n\n"));
      current = [];
      currentWords = 0;
    }

    if (paragraphWords > targetWords * 1.35) {
      const sentenceScenes = splitLongParagraph(paragraph, targetWords);
      if (current.length) {
        scenes.push(current.join("\n\n"));
        current = [];
        currentWords = 0;
      }
      scenes.push(...sentenceScenes);
      continue;
    }

    current.push(paragraph);
    currentWords += paragraphWords;
  }

  if (current.length) scenes.push(current.join("\n\n"));
  return scenes.filter(Boolean);
}

function splitLongParagraph(paragraph: string, targetWords: number) {
  const sentences = paragraph.match(/[^.!?]+[.!?]["')\]]?/g) ?? [paragraph];
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    const words = countWords(sentence);
    if (current.length && currentWords + words > targetWords) {
      chunks.push(current.join(" "));
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += words;
  }

  if (current.length) chunks.push(current.join(" "));
  return chunks;
}

function cleanSceneScriptText(content: string) {
  return content
    .replace(/```(?:text|md|markdown)?/gi, "")
    .replace(/```/g, "")
    .replace(/\[(?:\s*(?:pause|beat|long pause|music|sfx|sound effect|silence|cut|visual|b-roll|lower third|on screen text)\s*)\]/gi, "")
    .replace(/^\s*(?:timestamp|visual|background|cue|music|sfx|b-roll|on-screen text|presenter direction)\s*:.*$/gim, "")
    .replace(/^\s*-{3,}\s*$/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanSceneBody(content: string) {
  return content
    .replace(/^\s*(?:timestamp|visual|background|cue|music|sfx|b-roll|on-screen text|presenter direction)\s*:.*$/gim, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\[(?:\s*(?:pause|beat|long pause|music|sfx|sound effect|silence|cut|visual|b-roll|lower third|on screen text)\s*)\]/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function sceneNumberFromLabel(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const numeric = Number(clean);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return NUMBER_WORDS[clean] ?? null;
}
