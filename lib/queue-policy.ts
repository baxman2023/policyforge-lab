export const PRODUCTION_WORKER_CONCURRENCY = 3;
export const SQLITE_WORKER_CONCURRENCY = 1;

export function workerConcurrency(databaseUrl: string, requested = PRODUCTION_WORKER_CONCURRENCY) {
  if (/^file:|sqlite/i.test(databaseUrl)) return SQLITE_WORKER_CONCURRENCY;
  return Math.max(1, Math.min(PRODUCTION_WORKER_CONCURRENCY, Math.round(requested)));
}

export function retryDecision(attempts: number, maxAttempts: number, now = Date.now()) {
  const nextAttempts = attempts + 1;
  const failed = nextAttempts >= maxAttempts;
  return { attempts: nextAttempts, failed, runAfter: failed ? null : new Date(now + Math.min(15 * 60_000, 10_000 * 2 ** Math.max(0, nextAttempts - 1))) };
}

export function freshRunSpend(currentTotal: number, historicalBaseline: number, runBudget: number) {
  const spent = Math.max(0, currentTotal - historicalBaseline);
  return { spent, remaining: Math.max(0, runBudget - spent), exceeded: spent > runBudget };
}
