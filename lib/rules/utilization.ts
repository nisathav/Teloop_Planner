import { MIN, atColombo, overlapMinutes } from "./time";
import type { TimelineItem } from "./timeline";
import type { Settings } from "./types";

export interface Utilization {
  windowMinutes: number;
  recording: number;
  handoff: number;
  offload: number;
  charge: number;
  other: number;
  idle: number;
  idleGaps: { start: number; end: number; minutes: number }[];
}

export function emptyUtil(): Utilization {
  return { windowMinutes: 0, recording: 0, handoff: 0, offload: 0, charge: 0, other: 0, idle: 0, idleGaps: [] };
}

/**
 * Splits a device's operating window on one day into recording (booked), buffer and idle minutes.
 * Optionally only counts time up to `until` (e.g. "now" for today so the future isn't idle yet).
 */
export function deviceDayUtilization(items: TimelineItem[], day: string, s: Settings, until?: number): Utilization {
  const w0 = atColombo(day, s.windowStartMinutes);
  let w1 = atColombo(day, s.windowEndMinutes);
  if (until != null) w1 = Math.max(w0, Math.min(w1, until));
  const u = emptyUtil();
  u.windowMinutes = (w1 - w0) / MIN;
  if (u.windowMinutes <= 0) return u;

  const busy: [number, number][] = [];
  for (const it of items) {
    const m = overlapMinutes(it.start, it.end, w0, w1);
    if (m <= 0) continue;
    if (it.kind === "booking") u.recording += m;
    else if (it.kind === "handoff") u.handoff += m;
    else if (it.kind === "offload") u.offload += m;
    else if (it.kind === "charge") u.charge += m;
    else u.other += m;
    busy.push([Math.max(it.start, w0), Math.min(it.end, w1)]);
  }
  busy.sort((a, b) => a[0] - b[0]);
  let cursor = w0;
  for (const [a, b] of busy) {
    if (a > cursor) u.idleGaps.push({ start: cursor, end: a, minutes: (a - cursor) / MIN });
    cursor = Math.max(cursor, b);
  }
  if (cursor < w1) u.idleGaps.push({ start: cursor, end: w1, minutes: (w1 - cursor) / MIN });
  u.idle = u.idleGaps.reduce((s2, g) => s2 + g.minutes, 0);
  // Overlapping buffers (e.g. a conflict) could double count; clamp so parts never exceed the window.
  const used = u.recording + u.handoff + u.offload + u.charge + u.other;
  if (used + u.idle > u.windowMinutes + 0.01) {
    const scale = (u.windowMinutes - u.idle) / used;
    u.recording *= scale; u.handoff *= scale; u.offload *= scale; u.charge *= scale; u.other *= scale;
  }
  return u;
}

export function addUtil(a: Utilization, b: Utilization): Utilization {
  return {
    windowMinutes: a.windowMinutes + b.windowMinutes,
    recording: a.recording + b.recording,
    handoff: a.handoff + b.handoff,
    offload: a.offload + b.offload,
    charge: a.charge + b.charge,
    other: a.other + b.other,
    idle: a.idle + b.idle,
    idleGaps: [...a.idleGaps, ...b.idleGaps],
  };
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? (100 * part) / whole : 0;
}
