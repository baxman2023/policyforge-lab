export function normalizePublishDate(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12, 0, 0, 0));
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return normalizePublishDate(next);
}

export function dateKey(date: Date) {
  return normalizePublishDate(date).toISOString().slice(0, 10);
}

export function nextOpenDate(startDate: Date, usedDates: Set<string>, allowedWeekdays: number[]) {
  let candidate = normalizePublishDate(startDate);
  for (let attempt = 0; attempt < 730; attempt += 1) {
    if (allowedWeekdays.includes(candidate.getUTCDay()) && !usedDates.has(dateKey(candidate))) {
      return candidate;
    }
    candidate = addDays(candidate, 1);
  }
  throw new Error("Could not find an open publishing date in the next two years.");
}

export function nextOpenSeriesWeek(startDate: Date, usedDates: Set<string>) {
  let candidate = nextMondayOnOrAfter(startDate);
  for (let attempt = 0; attempt < 104; attempt += 1) {
    const weekDates = [0, 1, 2, 3, 4].map((offset) => addDays(candidate, offset));
    if (weekDates.every((date) => !usedDates.has(dateKey(date)))) return candidate;
    candidate = addDays(candidate, 7);
  }
  throw new Error("Could not find an open Monday-Friday episode week in the next two years.");
}

export function nextAppendCursor(startDate: Date, scheduledDates: Date[]) {
  const latestFutureDate = [...scheduledDates].sort((a, b) => a.getTime() - b.getTime()).at(-1);
  return latestFutureDate ? addDays(normalizePublishDate(latestFutureDate), 1) : normalizePublishDate(startDate);
}

function nextMondayOnOrAfter(startDate: Date) {
  const candidate = normalizePublishDate(startDate);
  const day = candidate.getUTCDay();
  const daysUntilMonday = (8 - day) % 7;
  return addDays(candidate, daysUntilMonday);
}
