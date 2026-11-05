import { bookingLengthFor, committedMinutes, isOccupying, taskCapMinutes } from "./bookings";
import { MIN, atColombo, dayKey } from "./time";
import { hasBlocks, validateBooking } from "./validate";
import type { BookingLite, DeviceLite, ManualEventLite, Settings, TaskLite, ValidationContext } from "./types";

export interface OpenSlot {
  key: string;
  deviceId: string;
  start: number;
  end: number;
  /** Planned recording minutes per segment, e.g. [120, 120]. */
  segments: number[];
  needsPowerBank: boolean;
}

const DEVICE_RULES = new Set(["device-window", "device-overlap", "device-manual-event", "device-daily-max", "device-status"]);

/**
 * Generates open (unassigned) slots on each device, back-to-back inside the operating window,
 * with the handoff / offload / charge buffers the rules require. Suggestions only.
 */
export function generateOpenSlots(args: {
  devices: DeviceLite[];
  days: string[];
  bookings: BookingLite[];
  settings: Settings;
  recordingMinutes?: number;
  manualEvents?: ManualEventLite[];
  notBefore?: number;
  stepMinutes?: number;
}): OpenSlot[] {
  const { settings: s } = args;
  const rec = args.recordingMinutes ?? Math.round(s.defaultSlotRecordingHours * 60);
  const { segments, bookingMinutes } = bookingLengthFor(rec, s);
  const step = args.stepMinutes ?? 15;
  const slots: OpenSlot[] = [];
  const virtual: BookingLite[] = args.bookings.filter(isOccupying);
  let n = 0;

  for (const device of args.devices) {
    if (device.status === "maintenance" || device.status === "retired") continue;
    for (const day of args.days) {
      const ctx: ValidationContext = {
        settings: s,
        project: { start: 0, deadline: Number.MAX_SAFE_INTEGER },
        bookings: virtual,
        devices: [device],
        operators: [],
        tasks: [],
        manualEvents: args.manualEvents,
      };
      let t = atColombo(day, s.windowStartMinutes);
      const lastStart = atColombo(day, s.windowEndMinutes - bookingMinutes);
      if (args.notBefore && t < args.notBefore) {
        const ceil = Math.ceil((args.notBefore - t) / (step * MIN)) * step * MIN;
        t += ceil;
      }
      while (t <= lastStart) {
        const draft: BookingLite = {
          id: `slot-${n}`,
          deviceId: device.id,
          operatorId: `__open_${n}`,
          start: t,
          end: t + bookingMinutes * MIN,
          status: "planned",
          segments: segments.map((m) => ({ taskId: "__open", plannedMinutes: m })),
          powerBankIds: [],
        };
        const all = validateBooking(draft, ctx);
        if (!hasBlocks(all.filter((r) => DEVICE_RULES.has(r.rule)))) {
          const battery = all.some((r) => r.rule === "battery");
          slots.push({ key: draft.id, deviceId: device.id, start: draft.start, end: draft.end, segments, needsPowerBank: battery });
          virtual.push(draft);
          n++;
          t = draft.end;
        } else {
          t += step * MIN;
        }
      }
    }
  }
  return slots;
}

export interface CandidateTask {
  taskId: string;
  taskName: string;
  minutes: number;
}

export interface OperatorCandidate {
  operatorId: string;
  name: string;
  score: number;
  tasks: CandidateTask[];
  reasons: string[];
  dailyLeftMinutes: number;
  supportsAll: boolean;
}

/**
 * Ranks operators for an open slot by: tasks furthest behind target, remaining per-task cap,
 * daily hours left, and household support. Operators with a clashing booking are excluded.
 */
export function rankOperatorsForSlot(slot: OpenSlot, ctx: ValidationContext): OperatorCandidate[] {
  const s = ctx.settings;
  const day = dayKey(slot.start);
  const slotRec = slot.segments.reduce((a, b) => a + b, 0);
  const active = ctx.bookings.filter(isOccupying);
  const tasks = ctx.tasks.filter((t) => t.active && t.targetHours > 0);

  const taskBehind = new Map<string, number>();
  for (const t of tasks) {
    const done = active.reduce((sum, b) => sum + committedMinutes(b, t.id), 0);
    taskBehind.set(t.id, Math.max(0, (t.targetHours * 60 - done) / (t.targetHours * 60)));
  }

  const out: OperatorCandidate[] = [];
  for (const op of ctx.operators) {
    if (op.status !== "active") continue;
    const mine = active.filter((b) => b.operatorId === op.id);
    if (mine.some((b) => b.start < slot.end && slot.start < b.end)) continue;
    const dayUsed = mine.filter((b) => dayKey(b.start) === day).reduce((sum, b) => sum + committedMinutes(b), 0);
    const dailyLeft = Math.max(0, s.dailyHardHoursPerOperator * 60 - dayUsed);
    const softLeft = Math.max(0, s.dailySoftHoursPerOperator * 60 - dayUsed);
    if (dailyLeft <= 0) continue;
    const supported = new Set(op.supportedTasks.map((x) => x.trim().toLowerCase()));

    const options = tasks
      .map((t) => {
        const used = mine.reduce((sum, b) => sum + committedMinutes(b, t.id), 0);
        const capLeft = Math.max(0, taskCapMinutes(t, s) - used);
        return { t, capLeft, behind: taskBehind.get(t.id) ?? 0, supports: supported.has(t.name.trim().toLowerCase()) };
      })
      .filter((o) => o.capLeft > 0 && o.behind > 0)
      .sort((a, b) => Number(b.supports) - Number(a.supports) || b.behind - a.behind || b.capLeft - a.capLeft);
    if (options.length === 0) continue;

    // Fill each slot segment with the best task that still has cap left.
    const capLeft = new Map(options.map((o) => [o.t.id, o.capLeft]));
    const assigned: CandidateTask[] = [];
    let budget = Math.min(slotRec, dailyLeft);
    for (const segMin of slot.segments) {
      if (budget <= 0) break;
      const pick = options.find((o) => (capLeft.get(o.t.id) ?? 0) > 0);
      if (!pick) break;
      const mins = Math.min(segMin, capLeft.get(pick.t.id)!, budget);
      capLeft.set(pick.t.id, capLeft.get(pick.t.id)! - mins);
      budget -= mins;
      assigned.push({ taskId: pick.t.id, taskName: pick.t.name, minutes: mins });
    }
    const assignedMin = assigned.reduce((a, x) => a + x.minutes, 0);
    const behindScore = assigned.reduce((a, x) => a + (taskBehind.get(x.taskId) ?? 0) * x.minutes, 0) / Math.max(1, assignedMin);
    const capScore = Math.min(1, assignedMin / Math.max(1, slotRec));
    const dailyScore = Math.min(1, softLeft / Math.max(1, slotRec));
    const supportsAll = assigned.every((x) => supported.has(x.taskName.trim().toLowerCase()));
    const score = Math.round(40 * behindScore + 30 * capScore + 20 * dailyScore + 10 * (supportsAll ? 1 : 0));

    const reasons = [
      `${Math.round(behindScore * 100)}% of assigned task(s) still to record`,
      `${(assignedMin / 60).toFixed(1)} of ${(slotRec / 60).toFixed(1)} h fits remaining caps`,
      `${(dailyLeft / 60).toFixed(1)} h left today (hard limit)`,
      supportsAll ? "household supports the task(s)" : "household support not listed",
    ];
    out.push({ operatorId: op.id, name: op.name, score, tasks: assigned, reasons, dailyLeftMinutes: dailyLeft, supportsAll });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
