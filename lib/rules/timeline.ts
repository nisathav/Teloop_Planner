import { isOccupying, deviceRecordingMinutes } from "./bookings";
import { DAY, MIN, atColombo, dayKey, overlapMinutes } from "./time";
import type { BookingLite, ManualEventLite, Settings } from "./types";

export type TimelineKind = "booking" | "handoff" | "offload" | "charge" | "maintenance" | "manual";

export interface TimelineItem {
  kind: TimelineKind;
  deviceId: string;
  start: number;
  end: number;
  /** For bookings: the booking id. For buffers: the booking the buffer follows (or precedes for handoff). */
  bookingId?: string;
  auto: boolean;
  label?: string;
}

export interface GapConflict {
  /** Booking before the gap. */
  prevId: string;
  /** Booking after the gap. */
  nextId: string;
  requiredMinutes: number;
  actualMinutes: number;
  parts: string[];
}

export interface BatteryIssue {
  bookingId: string;
  runtimeBeforeMinutes: number;
  bookingMinutes: number;
  capMinutes: number;
  coveredByPowerBank: boolean;
}

export interface DeviceTimeline {
  deviceId: string;
  items: TimelineItem[];
  conflicts: GapConflict[];
  battery: BatteryIssue[];
}

/**
 * Builds a device's day-by-day timeline: bookings plus the automatic buffers they require.
 *
 * Model (all durations from Settings):
 *  - After a booking, an OFFLOAD is inserted when the trigger fires:
 *      end_of_day  -> after the last booking of each Colombo day
 *      after_hours -> once recorded minutes since the last offload reach offloadAfterHours
 *      both        -> either condition
 *  - A CHARGE is inserted after a booking when the next booking would exceed the runtime per
 *    charge and the gap allows it. Each assigned power bank adds one full runtime. Battery is
 *    assumed full at the start of each day (overnight charge).
 *  - A HANDOFF buffer sits right before the next booking when it is on the same day and with
 *    a different operator (travel between homes).
 *  - Required gap between consecutive same-day bookings = offload (if due) + handoff (if needed).
 *    If the gap is shorter, a conflict is reported. A missing charge is a battery issue (warning).
 */
export function buildDeviceTimeline(
  deviceId: string,
  allBookings: BookingLite[],
  settings: Settings,
  manualEvents: ManualEventLite[] = [],
): DeviceTimeline {
  const bookings = allBookings
    .filter((b) => b.deviceId === deviceId && isOccupying(b))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const items: TimelineItem[] = [];
  const conflicts: GapConflict[] = [];
  const battery: BatteryIssue[] = [];

  const capMin = settings.deviceRuntimeHours * 60;
  const offloadEvery = settings.offloadAfterHours * 60;
  const useEod = settings.offloadTrigger === "end_of_day" || settings.offloadTrigger === "both";
  const useHours = settings.offloadTrigger === "after_hours" || settings.offloadTrigger === "both";

  let runtimeUsed = 0; // device battery minutes used since last charge
  let recSinceOffload = 0;

  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    const next = bookings[i + 1];
    const dur = (b.end - b.start) / MIN;
    const pbCover = b.powerBankIds.length * capMin;
    const consumption = Math.max(0, dur - pbCover);

    if (runtimeUsed + dur > capMin) {
      const covered = runtimeUsed + consumption <= capMin;
      battery.push({
        bookingId: b.id,
        runtimeBeforeMinutes: runtimeUsed,
        bookingMinutes: dur,
        capMinutes: capMin,
        coveredByPowerBank: covered && b.powerBankIds.length > 0,
      });
    }
    runtimeUsed = Math.min(capMin, runtimeUsed + consumption);

    items.push({ kind: "booking", deviceId, start: b.start, end: b.end, bookingId: b.id, auto: false });
    recSinceOffload += deviceRecordingMinutes(b);

    const sameDayNext = next != null && dayKey(next.start) === dayKey(b.start);
    const lastOfDay = !sameDayNext;
    let cursor = b.end;
    const parts: string[] = [];
    let required = 0;

    const offloadDue = (useEod && lastOfDay && recSinceOffload > 0) || (useHours && recSinceOffload >= offloadEvery && recSinceOffload > 0);
    if (offloadDue) {
      items.push({ kind: "offload", deviceId, start: cursor, end: cursor + settings.offloadMinutes * MIN, bookingId: b.id, auto: true });
      cursor += settings.offloadMinutes * MIN;
      required += settings.offloadMinutes;
      parts.push(`offload ${settings.offloadMinutes} min`);
      recSinceOffload = 0;
    }

    if (!next) continue;

    if (!sameDayNext) {
      // New day: overnight charge, no handoff buffer inside the window.
      runtimeUsed = 0;
      if (next.start < cursor) {
        conflicts.push({ prevId: b.id, nextId: next.id, requiredMinutes: required, actualMinutes: (next.start - b.end) / MIN, parts });
      }
      continue;
    }

    const needsHandoff = next.operatorId !== b.operatorId;
    const handoff = needsHandoff ? settings.handoffMinutes : 0;
    if (needsHandoff) parts.push(`handoff ${handoff} min`);
    required += handoff;

    // Charge if the next booking would run the battery past its runtime and the gap allows it.
    const nextDur = (next.end - next.start) / MIN;
    const nextConsumption = Math.max(0, nextDur - next.powerBankIds.length * capMin);
    const free = (next.start - cursor) / MIN - handoff;
    if (runtimeUsed > 0 && runtimeUsed + nextConsumption > capMin && free >= settings.rechargeMinutes) {
      items.push({ kind: "charge", deviceId, start: cursor, end: cursor + settings.rechargeMinutes * MIN, bookingId: b.id, auto: true });
      cursor += settings.rechargeMinutes * MIN;
      runtimeUsed = 0;
    } else if (runtimeUsed > 0 && free >= settings.rechargeMinutes) {
      // Plenty of idle time: device can top up opportunistically (no event shown).
      runtimeUsed = 0;
    }

    if (needsHandoff) {
      items.push({ kind: "handoff", deviceId, start: next.start - handoff * MIN, end: next.start, bookingId: next.id, auto: true });
    }

    const actual = (next.start - b.end) / MIN;
    if (actual < required) {
      conflicts.push({ prevId: b.id, nextId: next.id, requiredMinutes: required, actualMinutes: actual, parts });
    }
  }

  for (const e of manualEvents.filter((m) => m.deviceId === deviceId)) {
    items.push({ kind: e.type === "maintenance" ? "maintenance" : "manual", deviceId, start: e.start, end: e.end, auto: false, label: e.type });
  }

  items.sort((a, b) => a.start - b.start);
  return { deviceId, items, conflicts, battery };
}

/** Device-active minutes (bookings + buffers) on a Colombo day. */
export function activeMinutesOnDay(items: TimelineItem[], key: string): number {
  const d0 = atColombo(key, 0);
  const d1 = d0 + DAY;
  return items.reduce((sum, it) => sum + overlapMinutes(it.start, it.end, d0, d1), 0);
}
