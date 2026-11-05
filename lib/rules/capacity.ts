import { bookingLengthFor, taskCapMinutes } from "./bookings";
import { generateOpenSlots } from "./fillGaps";
import { buildDeviceTimeline, activeMinutesOnDay } from "./timeline";
import type { Settings } from "./types";

export interface CapacityInput {
  targetHours: number;
  days: number;
  devices: number;
  slotRecordingHours: number;
  settings: Settings;
  /** Per-task targets and caps. If empty, the target is split evenly over `taskCount` tasks. */
  tasks?: { name: string; targetHours: number; perPersonCapHours: number | null }[];
  taskCount?: number;
  /** Realistic number of tasks a typical operator records (for the "plan for" estimate). */
  tasksPerOperator?: number;
}

export interface CapacityResult {
  bookingMinutes: number;
  segments: number[];
  slotsPerDevicePerDay: number;
  recordingPerDevicePerDay: number; // hours
  deviceActivePerDay: number; // hours incl. buffers
  neededPerDay: number;
  neededPerDevicePerDay: number;
  achievable: number;
  feasible: boolean;
  shortfall: number;
  fixes: { extraDevices: number; extraDays: number; extraHoursPerDevicePerDay: number; devicesNeeded: number; daysNeeded: number };
  bookingsNeeded: number;
  operators: {
    absoluteMinimum: number;
    planFor: number;
    perTask: { name: string; targetHours: number; capHours: number; minOperators: number }[];
    limitingFactor: string;
  };
  cost: number;
  daySchedule: { kind: string; startMin: number; endMin: number }[];
}

/** What-if capacity calculator. Simulates one device-day with the real scheduling rules. */
export function computeCapacity(input: CapacityInput): CapacityResult {
  const s = input.settings;
  const recMin = Math.round(input.slotRecordingHours * 60);
  const { segments, bookingMinutes } = bookingLengthFor(recMin, s);

  // Simulate one empty device on one day (a fixed reference date) using the rules engine.
  const refDay = "2030-01-07";
  const slots = generateOpenSlots({
    devices: [{ id: "sim", code: "SIM", status: "available" }],
    days: [refDay],
    bookings: [],
    settings: s,
    recordingMinutes: recMin,
  });
  const slotsPerDay = slots.length;
  const recPerDevDay = (slotsPerDay * recMin) / 60;
  const sims = slots.map((x, i) => ({
    id: x.key,
    deviceId: "sim",
    operatorId: `op${i}`,
    start: x.start,
    end: x.end,
    status: "planned",
    segments: x.segments.map((m) => ({ taskId: "t", plannedMinutes: m })),
    powerBankIds: x.needsPowerBank ? ["pb"] : [],
  }));
  const tl = buildDeviceTimeline("sim", sims, s);
  const deviceActive = activeMinutesOnDay(tl.items, refDay) / 60;
  const base = slots.length ? slots[0].start - s.windowStartMinutes * 60000 : 0;
  const daySchedule = tl.items.map((it) => ({ kind: it.kind, startMin: Math.round((it.start - base) / 60000), endMin: Math.round((it.end - base) / 60000) }));

  const days = Math.max(1, input.days);
  const devices = Math.max(0, input.devices);
  const target = input.targetHours;
  const achievable = recPerDevDay * devices * days;
  const feasible = achievable + 1e-9 >= target;
  const devicesNeeded = recPerDevDay > 0 ? Math.ceil(target / (recPerDevDay * days)) : Infinity;
  const daysNeeded = recPerDevDay > 0 && devices > 0 ? Math.ceil(target / (recPerDevDay * devices)) : Infinity;
  const neededPerDevicePerDay = devices > 0 ? target / days / devices : Infinity;

  // Operators
  const capDefault = s.maxHoursPerOperatorPerTask;
  let tasks = (input.tasks ?? []).filter((t) => t.targetHours > 0);
  if (tasks.length === 0) {
    const n = Math.max(1, input.taskCount ?? 4);
    tasks = Array.from({ length: n }, (_, i) => ({ name: `Task ${i + 1}`, targetHours: target / n, perPersonCapHours: null }));
  }
  const perTask = tasks.map((t) => {
    const capHours = taskCapMinutes(t, s) / 60;
    return { name: t.name, targetHours: t.targetHours, capHours, minOperators: Math.ceil(t.targetHours / capHours) };
  });
  const maxPerPersonAllTasks = perTask.reduce((sum, t) => sum + t.capHours, 0); // one person doing every task to its cap
  const byTime = Math.ceil(target / (s.dailySoftHoursPerOperator * days));
  const byCaps = maxPerPersonAllTasks > 0 ? Math.ceil(target / maxPerPersonAllTasks) : 0;
  const byTask = Math.max(0, ...perTask.map((t) => t.minOperators));
  const absoluteMinimum = Math.max(byTime, byCaps, byTask);
  const limitingFactor =
    absoluteMinimum === byCaps ? "per-task caps × number of tasks" : absoluteMinimum === byTime ? `daily limit (${s.dailySoftHoursPerOperator} h/day × ${days} days)` : "largest single task ÷ cap";
  const tpo = Math.max(1, Math.min(input.tasksPerOperator ?? 3, perTask.length));
  const avgCap = perTask.reduce((sum, t) => sum + t.capHours, 0) / perTask.length || capDefault;
  const planFor = Math.max(absoluteMinimum, Math.ceil(target / (tpo * avgCap)));

  return {
    bookingMinutes,
    segments,
    slotsPerDevicePerDay: slotsPerDay,
    recordingPerDevicePerDay: recPerDevDay,
    deviceActivePerDay: deviceActive,
    neededPerDay: target / days,
    neededPerDevicePerDay,
    achievable,
    feasible,
    shortfall: Math.max(0, target - achievable),
    fixes: {
      devicesNeeded,
      daysNeeded,
      extraDevices: Math.max(0, devicesNeeded - devices),
      extraDays: Math.max(0, daysNeeded - days),
      extraHoursPerDevicePerDay: Math.max(0, neededPerDevicePerDay - recPerDevDay),
    },
    bookingsNeeded: recMin > 0 ? Math.ceil((target * 60) / recMin) : 0,
    operators: { absoluteMinimum, planFor, perTask, limitingFactor },
    cost: target * s.payRatePerHour,
    daySchedule,
  };
}
