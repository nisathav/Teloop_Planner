import type { BookingLite, Settings, TaskLite } from "./types";

/** Statuses that hold device/operator time. Cancelled and no-show bookings free their slot. */
export const OCCUPYING = new Set(["planned", "confirmed", "in-progress", "completed"]);

export function isOccupying(b: { status: string }): boolean {
  return OCCUPYING.has(b.status);
}

export function isCompleted(b: { status: string }): boolean {
  return b.status === "completed";
}

/** Booking is completed but at least one segment has no actual minutes entered. */
export function isUnlogged(b: BookingLite): boolean {
  return b.status === "completed" && b.segments.some((s) => s.actualMinutes == null);
}

/**
 * Recorded minutes: ONLY actualMinutes of segments in completed bookings.
 * This is the single source of truth for every "recorded hours" number in the app.
 */
export function recordedMinutes(b: BookingLite, taskId?: string): number {
  if (!isCompleted(b)) return 0;
  return b.segments
    .filter((s) => taskId == null || s.taskId === taskId)
    .reduce((sum, s) => sum + (s.actualMinutes ?? 0), 0);
}

/**
 * Planned minutes: segments of bookings that are not completed yet (planned / confirmed / in-progress),
 * plus completed bookings that have not been logged (their planned minutes stand in until logged).
 * Never mixed into recorded minutes.
 */
export function plannedMinutes(b: BookingLite, taskId?: string): number {
  if (!isOccupying(b)) return 0;
  if (isCompleted(b) && !isUnlogged(b)) return 0;
  return b.segments
    .filter((s) => taskId == null || s.taskId === taskId)
    .reduce((sum, s) => sum + (isCompleted(b) && s.actualMinutes != null ? 0 : s.plannedMinutes), 0);
}

/** Minutes that count against caps/limits: recorded + still-planned. */
export function committedMinutes(b: BookingLite, taskId?: string): number {
  return recordedMinutes(b, taskId) + plannedMinutes(b, taskId);
}

/** Recording minutes used for device battery/offload tracking (actual when known, else planned). */
export function deviceRecordingMinutes(b: BookingLite): number {
  if (!isOccupying(b)) return 0;
  return b.segments.reduce((sum, s) => sum + (isCompleted(b) && s.actualMinutes != null ? s.actualMinutes : s.plannedMinutes), 0);
}

export function taskCapMinutes(task: Pick<TaskLite, "perPersonCapHours">, settings: Settings): number {
  const h = task.perPersonCapHours ?? settings.maxHoursPerOperatorPerTask;
  return Math.round(h * 60);
}

/** Split a recording length into segments no longer than the continuous max. */
export function splitRecording(totalMinutes: number, maxContinuous: number): number[] {
  if (totalMinutes <= 0) return [];
  const n = Math.max(1, Math.ceil(totalMinutes / Math.max(1, maxContinuous)));
  const base = Math.floor(totalMinutes / n);
  const parts = Array.from({ length: n }, () => base);
  let rest = totalMinutes - base * n;
  for (let i = 0; rest > 0; i++, rest--) parts[i] += 1;
  return parts;
}

/** Booking length (minutes) for a recording length: segments plus a minimum break between each. */
export function bookingLengthFor(recordingMinutes: number, settings: Settings): { segments: number[]; bookingMinutes: number } {
  const segments = splitRecording(recordingMinutes, settings.maxContinuousMinutes);
  const bookingMinutes = recordingMinutes + Math.max(0, segments.length - 1) * settings.minBreakMinutes;
  return { segments, bookingMinutes };
}
