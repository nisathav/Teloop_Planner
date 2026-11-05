/**
 * Time helpers. All business times are Asia/Colombo (UTC+05:30, no DST since 2006).
 * Internally everything is epoch milliseconds; a "day key" is "YYYY-MM-DD" in Colombo time.
 */
export const COLOMBO_OFFSET_MIN = 330;
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Colombo calendar day for an instant, as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  return new Date(ms + COLOMBO_OFFSET_MIN * MIN).toISOString().slice(0, 10);
}

/** Minutes since Colombo midnight (0..1439). */
export function minuteOfDay(ms: number): number {
  const local = ms + COLOMBO_OFFSET_MIN * MIN;
  return Math.floor((((local % DAY) + DAY) % DAY) / MIN);
}

/** Instant for a Colombo day key plus minutes after midnight (minutes may exceed 1440). */
export function atColombo(key: string, minutes = 0): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - COLOMBO_OFFSET_MIN * MIN + minutes * MIN;
}

export function startOfDay(ms: number): number {
  return atColombo(dayKey(ms), 0);
}

export function addDays(key: string, n: number): string {
  return dayKey(atColombo(key, 12 * 60) + n * DAY);
}

/** Inclusive list of day keys from a to b. */
export function dayRange(a: string, b: string): string[] {
  const out: string[] = [];
  let k = a;
  let guard = 0;
  while (k <= b && guard++ < 1000) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

export function minutesBetween(a: number, b: number): number {
  return Math.round((b - a) / MIN);
}

/** "HH:MM" for minutes after midnight. */
export function hm(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "HH:MM" Colombo time for an instant. */
export function clock(ms: number): string {
  return hm(minuteOfDay(ms));
}

/** Overlap in minutes of [a1,a2) and [b1,b2). */
export function overlapMinutes(a1: number, a2: number, b1: number, b2: number): number {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)) / MIN;
}

export function hoursLabel(minutes: number, digits = 1): string {
  return `${(minutes / 60).toFixed(digits)} h`;
}
