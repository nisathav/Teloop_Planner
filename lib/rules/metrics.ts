import { isOccupying, isUnlogged, plannedMinutes, recordedMinutes } from "./bookings";
import { DAY, addDays, atColombo, dayKey, dayRange } from "./time";
import type { BookingLite, TaskLite } from "./types";

/** Recorded minutes per Colombo day (by booking start), from logged segments only. */
export function recordedByDay(bookings: BookingLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bookings) {
    const r = recordedMinutes(b);
    if (r > 0) m.set(dayKey(b.start), (m.get(dayKey(b.start)) ?? 0) + r);
  }
  return m;
}

export function plannedByDay(bookings: BookingLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of bookings) {
    const p = plannedMinutes(b);
    if (p > 0) m.set(dayKey(b.start), (m.get(dayKey(b.start)) ?? 0) + p);
  }
  return m;
}

export function totalRecorded(bookings: BookingLite[], taskId?: string): number {
  return bookings.reduce((s, b) => s + recordedMinutes(b, taskId), 0);
}

export function totalPlanned(bookings: BookingLite[], taskId?: string): number {
  return bookings.reduce((s, b) => s + plannedMinutes(b, taskId), 0);
}

export interface BurnPoint {
  day: string;
  recorded: number | null; // cumulative hours (null for future days)
  planned: number; // cumulative recorded + planned hours
  ideal: number;
}

export function burnUp(bookings: BookingLite[], projectStart: number, deadline: number, targetHours: number, now: number): BurnPoint[] {
  const first = dayKey(projectStart);
  const lastKey = dayKey(Math.max(deadline - 1, projectStart));
  const days = dayRange(first, lastKey);
  // Include days after the deadline if bookings exist there.
  const extra = bookings.filter(isOccupying).map((b) => dayKey(b.start)).filter((d) => d > lastKey).sort();
  if (extra.length) days.push(...dayRange(addDays(lastKey, 1), extra[extra.length - 1]));
  const rec = recordedByDay(bookings);
  const plan = plannedByDay(bookings);
  const before = bookings.filter((b) => dayKey(b.start) < first);
  let cumRec = totalRecorded(before) / 60;
  let cumPlan = cumRec + totalPlanned(before) / 60;
  const today = dayKey(now);
  const n = Math.max(1, dayRange(first, lastKey).length);
  return days.map((d, i) => {
    cumRec += (rec.get(d) ?? 0) / 60;
    cumPlan += ((rec.get(d) ?? 0) + (plan.get(d) ?? 0)) / 60;
    return {
      day: d,
      recorded: d <= today ? round1(cumRec) : null,
      planned: round1(cumPlan),
      ideal: round1(Math.min(targetHours, (targetHours * (i + 1)) / n)),
    };
  });
}

export interface PaceSummary {
  recordedHours: number;
  plannedHours: number;
  percent: number;
  daysLeft: number;
  requiredPace: number;
  actualPace3d: number;
  projectedCompletion: string | null;
}

export function pace(bookings: BookingLite[], targetHours: number, deadline: number, now: number): PaceSummary {
  const recordedHours = totalRecorded(bookings) / 60;
  const plannedHours = totalPlanned(bookings) / 60;
  const today = dayKey(now);
  const daysLeft = Math.max(0, Math.ceil((deadline - atColombo(today, 0)) / DAY));
  const remaining = Math.max(0, targetHours - recordedHours);
  const requiredPace = daysLeft > 0 ? remaining / daysLeft : remaining;
  const byDay = recordedByDay(bookings);
  const last3 = [addDays(today, -2), addDays(today, -1), today].reduce((s, d) => s + (byDay.get(d) ?? 0), 0) / 60;
  const actualPace3d = last3 / 3;
  let projectedCompletion: string | null = null;
  if (remaining <= 0) projectedCompletion = today;
  else if (actualPace3d > 0) projectedCompletion = addDays(today, Math.ceil(remaining / actualPace3d));
  return {
    recordedHours,
    plannedHours,
    percent: targetHours > 0 ? (100 * recordedHours) / targetHours : 0,
    daysLeft,
    requiredPace,
    actualPace3d,
    projectedCompletion,
  };
}

export interface TaskProgress {
  taskId: string;
  name: string;
  target: number;
  recorded: number;
  planned: number;
  remaining: number;
  behind: boolean;
  capHours: number;
  operatorsNeeded: number;
}

/** Task progress in hours. "Behind" = recorded share is below the elapsed share of the project. */
export function taskProgress(tasks: TaskLite[], bookings: BookingLite[], defaultCap: number, elapsedFraction: number): TaskProgress[] {
  return tasks.map((t) => {
    const recorded = totalRecorded(bookings, t.id) / 60;
    const planned = totalPlanned(bookings, t.id) / 60;
    const remaining = Math.max(0, t.targetHours - recorded - planned);
    const capHours = t.perPersonCapHours ?? defaultCap;
    return {
      taskId: t.id,
      name: t.name,
      target: t.targetHours,
      recorded,
      planned,
      remaining,
      behind: t.targetHours > 0 && recorded / t.targetHours < elapsedFraction - 0.05,
      capHours,
      operatorsNeeded: capHours > 0 ? Math.ceil(remaining / capHours) : 0,
    };
  });
}

export function unloggedBookings(bookings: BookingLite[]): BookingLite[] {
  return bookings.filter(isUnlogged);
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
