import { committedMinutes, isOccupying, taskCapMinutes, splitRecording } from "./bookings";
import { activeMinutesOnDay, buildDeviceTimeline } from "./timeline";
import { MIN, atColombo, clock, dayKey, hm, minuteOfDay } from "./time";
import type { BookingLite, DraftBooking, RuleResult, ValidationContext } from "./types";

const h = (min: number) => `${(min / 60).toFixed(min % 60 === 0 ? 0 : 1)} h`;

export const DRAFT_ID = "__draft__";

function asBooking(draft: DraftBooking): BookingLite {
  return { ...draft, id: draft.id ?? DRAFT_ID, status: draft.status && isOccupying({ status: draft.status }) ? draft.status : "planned" };
}

/**
 * Validates a booking draft against every scheduling rule.
 * Returns a list of block/warn results. A "block" may only be saved with an override reason.
 * The UI calls this on every create, edit and drag; the server calls it again before saving.
 */
export function validateBooking(draft: DraftBooking, ctx: ValidationContext): RuleResult[] {
  const results: RuleResult[] = [];
  const s = ctx.settings;
  const b = asBooking(draft);
  const others = ctx.bookings.filter((o) => o.id !== b.id && isOccupying(o));
  const durMin = (b.end - b.start) / MIN;

  if (!(b.end > b.start)) {
    return [{ level: "block", rule: "invalid-time", message: "Booking end must be after its start." }];
  }

  // ---------------- Device rules ----------------
  const device = ctx.devices.find((d) => d.id === b.deviceId);
  if (device && (device.status === "maintenance" || device.status === "retired")) {
    results.push({ level: "block", rule: "device-status", message: `${device.code} is in ${device.status} and cannot be booked.` });
  }

  const day = dayKey(b.start);
  const startMin = minuteOfDay(b.start);
  const endDay = dayKey(b.end - 1);
  const endMin = endDay === day ? minuteOfDay(b.end - 1) + 1 : 24 * 60 + minuteOfDay(b.end - 1) + 1;
  if (endDay !== day || startMin < s.windowStartMinutes || endMin > s.windowEndMinutes) {
    results.push({
      level: "block",
      rule: "device-window",
      message: `Booking ${clock(b.start)}–${clock(b.end)} is outside the device operating window ${hm(s.windowStartMinutes)}–${hm(s.windowEndMinutes)}.`,
    });
  }

  const deviceBookings = [...others.filter((o) => o.deviceId === b.deviceId), b];
  const manual = (ctx.manualEvents ?? []).filter((e) => e.deviceId === b.deviceId);
  const tl = buildDeviceTimeline(b.deviceId, deviceBookings, s, manual);
  const code = device?.code ?? "Device";

  for (const o of deviceBookings) {
    if (o.id !== b.id && o.start < b.end && b.start < o.end) {
      results.push({ level: "block", rule: "device-overlap", message: `${code} is already booked ${clock(o.start)}–${clock(o.end)} on ${dayKey(o.start)}.` });
    }
  }
  for (const c of tl.conflicts) {
    if (c.prevId !== b.id && c.nextId !== b.id) continue;
    const prev = deviceBookings.find((x) => x.id === c.prevId)!;
    const next = deviceBookings.find((x) => x.id === c.nextId)!;
    if (prev.end > next.start) continue; // already reported as a direct overlap
    results.push({
      level: "block",
      rule: "device-overlap",
      message: `${code} needs ${c.requiredMinutes} min between the booking ending ${clock(prev.end)} and the one starting ${clock(next.start)} (${c.parts.join(" + ")}); only ${Math.round(c.actualMinutes)} min.`,
    });
  }
  for (const e of manual) {
    if (e.start < b.end && b.start < e.end) {
      results.push({ level: "block", rule: "device-manual-event", message: `${code} has a ${e.type} event ${clock(e.start)}–${clock(e.end)}.` });
    }
  }

  const active = activeMinutesOnDay(tl.items, day);
  if (active > s.deviceMaxActiveHours * 60 + 0.01) {
    results.push({
      level: "block",
      rule: "device-daily-max",
      message: `${code} would be active ${h(active)} on ${day} (bookings + buffers), above the ${s.deviceMaxActiveHours} h daily max.`,
    });
  }

  const windowEnd = atColombo(day, s.windowEndMinutes);
  for (const it of tl.items) {
    if (it.kind === "offload" && it.bookingId === b.id && it.end > windowEnd) {
      results.push({
        level: "warn",
        rule: "device-offload-window",
        message: `The offload after this booking runs until ${clock(it.end)}, past the window end ${hm(s.windowEndMinutes)}.`,
      });
    }
  }

  // Battery and power banks
  const bat = tl.battery.find((x) => x.bookingId === b.id);
  if (bat && !bat.coveredByPowerBank) {
    results.push({
      level: "warn",
      rule: "battery",
      message: `Battery: ${h(bat.runtimeBeforeMinutes)} used since last charge + ${h(bat.bookingMinutes)} booking exceeds ${h(bat.capMinutes)} per charge. Assign a power bank or leave a ${s.rechargeMinutes} min charge gap.`,
    });
  }
  const overlappingAll = ctx.bookings.filter((o) => o.id !== b.id && isOccupying(o) && o.start < b.end && b.start < o.end);
  for (const pb of b.powerBankIds) {
    const clash = overlappingAll.find((o) => o.powerBankIds.includes(pb));
    if (clash) {
      results.push({ level: "block", rule: "power-bank-conflict", message: `A selected power bank is already assigned to another booking at ${clock(clash.start)}–${clock(clash.end)}.` });
    }
  }
  if (bat && !bat.coveredByPowerBank && b.powerBankIds.length === 0) {
    const inUse = new Set(overlappingAll.flatMap((o) => o.powerBankIds));
    if (inUse.size >= s.powerBanksAvailable) {
      results.push({ level: "warn", rule: "power-banks-exhausted", message: `All ${s.powerBanksAvailable} power banks are already assigned at this time.` });
    }
  }

  // ---------------- Operator rules ----------------
  const op = ctx.operators.find((o) => o.id === b.operatorId);
  const opName = op?.name ?? "Operator";
  if (op && op.status !== "active") {
    results.push({ level: "warn", rule: "operator-status", message: `${opName} is ${op.status}, not active.` });
  }
  const opBookings = others.filter((o) => o.operatorId === b.operatorId);
  for (const o of opBookings) {
    if (o.start < b.end && b.start < o.end) {
      results.push({ level: "block", rule: "operator-overlap", message: `${opName} already has a booking ${clock(o.start)}–${clock(o.end)} on ${dayKey(o.start)}.` });
    }
  }

  // Per-task cap. The booking's own minutes: actual when it is completed and logged, else planned.
  const ownMinutes = (seg: { plannedMinutes: number; actualMinutes?: number | null }) =>
    b.status === "completed" && seg.actualMinutes != null ? seg.actualMinutes : seg.plannedMinutes;
  const draftByTask = new Map<string, number>();
  for (const seg of b.segments) draftByTask.set(seg.taskId, (draftByTask.get(seg.taskId) ?? 0) + ownMinutes(seg));
  for (const [taskId, mins] of draftByTask) {
    const task = ctx.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    const cap = taskCapMinutes(task, s);
    const existing = opBookings.reduce((sum, o) => sum + committedMinutes(o, taskId), 0);
    if (existing + mins > cap) {
      results.push({
        level: "block",
        rule: "operator-task-cap",
        message: `${opName} would reach ${h(existing + mins)} of ${task.name} (completed + planned), above the ${h(cap)} per-person cap.`,
      });
    }
  }

  // Daily limits (recorded/planned hours on the booking's day)
  const dayTotal =
    opBookings.filter((o) => dayKey(o.start) === day).reduce((sum, o) => sum + committedMinutes(o), 0) +
    b.segments.reduce((sum, x) => sum + ownMinutes(x), 0);
  if (dayTotal > s.dailyHardHoursPerOperator * 60) {
    results.push({ level: "block", rule: "operator-daily-hard", message: `${opName} would record ${h(dayTotal)} on ${day}, above the hard daily limit of ${s.dailyHardHoursPerOperator} h.` });
  } else if (dayTotal > s.dailySoftHoursPerOperator * 60) {
    results.push({ level: "warn", rule: "operator-daily-soft", message: `${opName} would record ${h(dayTotal)} on ${day}, above the recommended ${s.dailySoftHoursPerOperator} h.` });
  }

  // Segments
  const segTotal = b.segments.reduce((sum, x) => sum + x.plannedMinutes, 0);
  if (b.segments.length === 0) {
    results.push({ level: "warn", rule: "segments-missing", message: "No task segments planned for this booking." });
  }
  if (segTotal > durMin) {
    results.push({ level: "block", rule: "segments-exceed-booking", message: `Segments total ${h(segTotal)}, longer than the ${h(durMin)} booking.` });
  }
  b.segments.forEach((seg, i) => {
    if (seg.plannedMinutes > s.maxContinuousMinutes) {
      const parts = splitRecording(seg.plannedMinutes, s.maxContinuousMinutes);
      results.push({
        level: "warn",
        rule: "segment-continuous",
        message: `Segment ${i + 1} is ${h(seg.plannedMinutes)} of continuous recording (max ${h(s.maxContinuousMinutes)}). Split it into ${parts.map((p) => `${p} min`).join(" + ")} with a ${s.minBreakMinutes} min break.`,
        suggestion: { type: "split-segment", segmentIndex: i, parts },
      });
    }
  });
  if (b.segments.length > 1 && segTotal <= durMin) {
    const perBreak = (durMin - segTotal) / (b.segments.length - 1);
    if (perBreak < s.minBreakMinutes) {
      results.push({
        level: "warn",
        rule: "segment-break",
        message: `Only ${Math.floor(perBreak)} min of break between segments; minimum is ${s.minBreakMinutes} min.`,
      });
    }
  }

  if (op) {
    const supported = new Set(op.supportedTasks.map((t) => t.trim().toLowerCase()).filter(Boolean));
    for (const taskId of draftByTask.keys()) {
      const task = ctx.tasks.find((t) => t.id === taskId);
      if (task && !supported.has(task.name.trim().toLowerCase())) {
        results.push({ level: "warn", rule: "household-support", message: `${opName}'s household does not list "${task.name}" as supported.` });
      }
    }
  }

  // ---------------- Task and project rules ----------------
  for (const [taskId, mins] of draftByTask) {
    const task = ctx.tasks.find((t) => t.id === taskId);
    if (!task) continue;
    if (!task.active) results.push({ level: "warn", rule: "task-inactive", message: `Task "${task.name}" is inactive.` });
    const total = others.reduce((sum, o) => sum + committedMinutes(o, taskId), 0) + mins;
    if (total > task.targetHours * 60) {
      results.push({
        level: "warn",
        rule: "task-target",
        message: `${task.name} would have ${h(total)} recorded + planned, above its ${task.targetHours} h target.`,
      });
    }
  }
  if (b.end > ctx.project.deadline) {
    results.push({ level: "warn", rule: "project-deadline", message: "Booking ends after the project deadline." });
  }
  if (b.start < ctx.project.start) {
    results.push({ level: "warn", rule: "project-start", message: "Booking starts before the project start date." });
  }

  return dedupe(results);
}

function dedupe(results: RuleResult[]): RuleResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const k = `${r.level}|${r.rule}|${r.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function hasBlocks(results: RuleResult[]): boolean {
  return results.some((r) => r.level === "block");
}
