const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen"
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const ORDINAL_EXCEPTIONS: Record<string, string> = {
  one: "first",
  two: "second",
  three: "third",
  five: "fifth",
  eight: "eighth",
  nine: "ninth",
  twelve: "twelfth",
  twenty: "twentieth",
  thirty: "thirtieth",
  forty: "fortieth",
  fifty: "fiftieth",
  sixty: "sixtieth",
  seventy: "seventieth",
  eighty: "eightieth",
  ninety: "ninetieth"
};

const IDENTIFIER_LABELS = [
  "Cabin",
  "Room",
  "Suite",
  "Flight",
  "Route",
  "Highway",
  "Interstate",
  "Episode",
  "Chapter",
  "Part"
];

export function formatScriptForTts(content: string) {
  let text = content;
  const monthPattern = MONTHS.join("|");
  const identifierPattern = IDENTIFIER_LABELS.join("|");

  text = text.replace(
    new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*(\\d{4}))?\\b`, "g"),
    (_match, month: string, day: string, year?: string) => {
      const spokenDay = ordinalWords(Number(day));
      return year ? `${month} ${spokenDay}, ${yearWords(Number(year))}` : `${month} ${spokenDay}`;
    }
  );

  text = text.replace(/\$(\d[\d,]*(?:\.\d{1,2})?)(\+)?/g, (_match, amount: string, plus?: string) => {
    const [dollars, cents] = amount.replace(/,/g, "").split(".");
    const spokenDollars = `${cardinalWords(Number(dollars))} ${Number(dollars) === 1 ? "dollar" : "dollars"}`;
    const spokenCents = cents && Number(cents) > 0 ? ` and ${cardinalWords(Number(cents))} ${Number(cents) === 1 ? "cent" : "cents"}` : "";
    return plus ? `more than ${spokenDollars}${spokenCents}` : `${spokenDollars}${spokenCents}`;
  });

  text = text.replace(/\b(\d[\d,]*(?:\.\d+)?)\s*%/g, (_match, value: string) => `${numberWords(value)} percent`);
  text = text.replace(/\b(\d{3,4})s\b/g, (_match, value: string) => decadeWords(Number(value)));
  text = text.replace(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?\b/gi, (_match, hour: string, minute: string, period?: string) => {
    const spokenMinute = Number(minute) < 10 ? `oh ${cardinalWords(Number(minute))}` : cardinalWords(Number(minute));
    const spokenPeriod = period ? ` ${period.replace(/\./g, "").toUpperCase().split("").join(" ")}` : "";
    return `${cardinalWords(Number(hour))} ${spokenMinute}${spokenPeriod}`;
  });
  text = text.replace(/\b(\d[\d,]*)(st|nd|rd|th)\b/gi, (_match, value: string) => ordinalWords(parseInteger(value)));
  text = text.replace(/\b(\d[\d,]*)-year-old\b/gi, (_match, value: string) => `${cardinalWords(parseInteger(value))}-year-old`);
  text = text.replace(/\b(\d[\d,]*)\s*[-–—]\s*(\d[\d,]*)\b/g, (_match, from: string, to: string) => {
    return `${spokenInteger(parseInteger(from))} to ${spokenInteger(parseInteger(to))}`;
  });
  text = text.replace(new RegExp(`\\b(${identifierPattern})\\s+(\\d{1,4})\\b`, "g"), (_match, label: string, value: string) => {
    return `${label} ${identifierWords(value)}`;
  });
  text = text.replace(/\b\d[\d,]*(?:\.\d+)?\+?\b/g, (match) => {
    const plus = match.endsWith("+");
    const value = plus ? match.slice(0, -1) : match;
    const spoken = numberWords(value);
    return plus ? `more than ${spoken}` : spoken;
  });

  return text;
}

function numberWords(value: string) {
  const normalized = value.replace(/,/g, "");
  if (normalized.includes(".")) {
    const [whole, decimal] = normalized.split(".");
    return `${spokenInteger(Number(whole))} point ${decimal.split("").map((digit) => SMALL_NUMBERS[Number(digit)]).join(" ")}`;
  }
  return spokenInteger(Number(normalized));
}

function spokenInteger(value: number) {
  if (value >= 1000 && value <= 2099) return yearWords(value);
  return cardinalWords(value);
}

function yearWords(value: number) {
  if (value < 1000 || value > 2099) return cardinalWords(value);
  if (value === 2000) return "two thousand";
  if (value > 2000 && value < 2010) return `two thousand ${cardinalWords(value % 2000)}`;
  const century = Math.floor(value / 100);
  const rest = value % 100;
  if (rest === 0) return `${cardinalWords(century)} hundred`;
  if (rest < 10) return `${cardinalWords(century)} oh ${cardinalWords(rest)}`;
  return `${cardinalWords(century)} ${cardinalWords(rest)}`;
}

function decadeWords(value: number) {
  if (value >= 1000) {
    const century = Math.floor(value / 100);
    const decade = Math.floor((value % 100) / 10) * 10;
    return `${cardinalWords(century)} ${decadeName(decade)}`;
  }
  return decadeName(value);
}

function decadeName(value: number) {
  const names: Record<number, string> = {
    0: "aughts",
    10: "tens",
    20: "twenties",
    30: "thirties",
    40: "forties",
    50: "fifties",
    60: "sixties",
    70: "seventies",
    80: "eighties",
    90: "nineties"
  };
  return names[Math.floor(value / 10) * 10] ?? cardinalWords(value);
}

function identifierWords(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return cardinalWords(Number(digits));
  if (digits.length === 3) {
    const first = SMALL_NUMBERS[Number(digits[0])];
    const rest = Number(digits.slice(1));
    if (rest === 0) return `${first} hundred`;
    return rest < 10 ? `${first} oh ${cardinalWords(rest)}` : `${first} ${cardinalWords(rest)}`;
  }
  const first = Number(digits.slice(0, 2));
  const rest = Number(digits.slice(2));
  return rest < 10 ? `${cardinalWords(first)} oh ${cardinalWords(rest)}` : `${cardinalWords(first)} ${cardinalWords(rest)}`;
}

function cardinalWords(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value < 0) return `negative ${cardinalWords(Math.abs(value))}`;
  if (value < 20) return SMALL_NUMBERS[value];
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const rest = value % 10;
    return rest ? `${TENS[tens]}-${SMALL_NUMBERS[rest]}` : TENS[tens];
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const rest = value % 100;
    return rest ? `${SMALL_NUMBERS[hundreds]} hundred ${cardinalWords(rest)}` : `${SMALL_NUMBERS[hundreds]} hundred`;
  }
  if (value < 1_000_000) return scaledWords(value, 1000, "thousand");
  if (value < 1_000_000_000) return scaledWords(value, 1_000_000, "million");
  return scaledWords(value, 1_000_000_000, "billion");
}

function scaledWords(value: number, scale: number, label: string) {
  const major = Math.floor(value / scale);
  const rest = value % scale;
  return rest ? `${cardinalWords(major)} ${label} ${cardinalWords(rest)}` : `${cardinalWords(major)} ${label}`;
}

function ordinalWords(value: number) {
  const cardinal = cardinalWords(value);
  return cardinal.replace(/(?:one|two|three|five|eight|nine|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|[a-z]+)$/, (word) => {
    return ORDINAL_EXCEPTIONS[word] ?? `${word}th`;
  });
}

function parseInteger(value: string) {
  return Number(value.replace(/,/g, ""));
}
