import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  atColombo,
  buildDeviceTimeline,
  computeCapacity,
  dayKey,
  deviceDayUtilization,
  generateOpenSlots,
  minuteOfDay,
  pace,
  rankOperatorsForSlot,
  recordedMinutes,
  plannedMinutes,
  taskProgress,
  totalRecorded,
  validateBooking,
  burnUp,
  type BookingLite,
  type DraftBooking,
  type Settings,
  type ValidationContext,
} from "./index";

const DAY = "2026-11-10";
const t = (hhmm: string, day = DAY) => {
  const [h, m] = hhmm.split(":").map(Number);
  return atColombo(day, h * 60 + m);
};

let idn = 0;
function booking(p: Partial<BookingLite> & { start: number; end: number }): BookingLite {
  return {
    id: p.id ?? `b${++idn}`,
    deviceId: p.deviceId ?? "d1",
    operatorId: p.operatorId ?? "o1",
    status: p.status ?? "planned",
    segments: p.segments ?? [{ taskId: "cook", plannedMinutes: Math.round((p.end - p.start) / 60000) }],
    powerBankIds: p.powerBankIds ?? [],
    start: p.start,
    end: p.end,
  };
}

function ctx(over: Partial<ValidationContext> = {}, settings: Partial<Settings> = {}): ValidationContext {
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    project: { start: t("00:00", "2026-11-01"), deadline: t("00:00", "2026-11-30") },
    bookings: [],
    devices: [
      { id: "d1", code: "DEV-01", status: "available" },
      { id: "d2", code: "DEV-02", status: "available" },
      { id: "dm", code: "DEV-09", status: "maintenance" },
      { id: "dr", code: "DEV-10", status: "retired" },
    ],
    operators: [
      { id: "o1", name: "Amali", status: "active", supportedTasks: ["Cooking", "Cleaning"] },
      { id: "o2", name: "Bandara", status: "active", supportedTasks: ["Cleaning"] },
      { id: "o3", name: "Chathu", status: "prospect", supportedTasks: [] },
    ],
    tasks: [
      { id: "cook", name: "Cooking", targetHours: 100, perPersonCapHours: null, active: true },
      { id: "clean", name: "Cleaning", targetHours: 100, perPersonCapHours: 8, active: true },
      { id: "old", name: "Old task", targetHours: 10, perPersonCapHours: null, active: false },
    ],
    ...over,
  };
}

function draft(p: Partial<DraftBooking> & { start: number; end: number }): DraftBooking {
  return {
    deviceId: "d1",
    operatorId: "o1",
    segments: [{ taskId: "cook", plannedMinutes: 120 }],
    powerBankIds: [],
    ...p,
  };
}

const rules = (r: { rule: string; level: string }[]) => r.map((x) => `${x.level}:${x.rule}`);

describe("time helpers (Asia/Colombo)", () => {
  it("maps Colombo wall-clock to instants and back", () => {
    const ms = t("06:00");
    expect(new Date(ms).toISOString()).toBe("2026-11-10T00:30:00.000Z");
    expect(dayKey(ms)).toBe(DAY);
    expect(minuteOfDay(ms)).toBe(360);
    expect(dayKey(t("23:59"))).toBe(DAY);
  });
});

describe("a clean booking", () => {
  it("has no results", () => {
    expect(validateBooking(draft({ start: t("08:00"), end: t("10:00") }), ctx())).toEqual([]);
  });
});

describe("device rules", () => {
  it("1. blocks overlapping bookings on the same device", () => {
    const c = ctx({ bookings: [booking({ start: t("08:00"), end: t("10:00"), operatorId: "o2" })] });
    const r = validateBooking(draft({ start: t("09:00"), end: t("11:00") }), c);
    expect(rules(r)).toContain("block:device-overlap");
  });

  it("1. ACCEPTANCE: two bookings on one device less than 45 min apart (different operators) are blocked", () => {
    const c = ctx({ bookings: [booking({ start: t("08:00"), end: t("10:00"), operatorId: "o2" })] });
    const r = validateBooking(draft({ start: t("10:30"), end: t("12:30") }), c);
    expect(rules(r)).toContain("block:device-overlap");
    expect(r.find((x) => x.rule === "device-overlap")!.message).toMatch(/needs 45 min/);
    // Exactly 45 minutes is fine.
    const ok = validateBooking(draft({ start: t("10:45"), end: t("12:45") }), c);
    expect(rules(ok)).not.toContain("block:device-overlap");
  });

  it("1. the gap check also applies when the draft is BEFORE the existing booking", () => {
    const c = ctx({ bookings: [booking({ start: t("12:00"), end: t("14:00"), operatorId: "o2" })] });
    expect(rules(validateBooking(draft({ start: t("09:30"), end: t("11:30") }), c))).toContain("block:device-overlap");
    expect(rules(validateBooking(draft({ start: t("09:00"), end: t("11:15") }), c))).not.toContain("block:device-overlap");
  });

  it("1. same operator back-to-back needs no handoff buffer", () => {
    const c = ctx({ bookings: [booking({ start: t("08:00"), end: t("10:00"), operatorId: "o1" })] });
    const r = validateBooking(draft({ start: t("10:00"), end: t("11:00"), segments: [{ taskId: "clean", plannedMinutes: 60 }] }), c);
    expect(rules(r)).not.toContain("block:device-overlap");
  });

  it("1. handoff buffer setting is respected", () => {
    const c = ctx({ bookings: [booking({ start: t("08:00"), end: t("10:00"), operatorId: "o2" })] }, { handoffMinutes: 20 });
    expect(rules(validateBooking(draft({ start: t("10:30"), end: t("12:30") }), c))).not.toContain("block:device-overlap");
  });

  it("1. ignores cancelled / no-show bookings", () => {
    const c = ctx({ bookings: [booking({ start: t("08:00"), end: t("10:00"), status: "cancelled" }), booking({ start: t("08:00"), end: t("10:00"), status: "no-show" })] });
    expect(validateBooking(draft({ start: t("08:00"), end: t("10:00") }), c)).toEqual([]);
  });

  it("1. offload after N hours widens the required gap", () => {
    const c = ctx(
      { bookings: [booking({ start: t("06:00"), end: t("10:00"), operatorId: "o2", segments: [{ taskId: "clean", plannedMinutes: 240 }] })] },
      { offloadTrigger: "after_hours", offloadAfterHours: 4 },
    );
    // 45 min handoff + 60 min offload = 105 min needed
    const r = validateBooking(draft({ start: t("11:00"), end: t("12:00") }), c);
    expect(r.find((x) => x.rule === "device-overlap")?.message).toMatch(/needs 105 min/);
    expect(rules(validateBooking(draft({ start: t("11:45"), end: t("12:45") }), c))).not.toContain("block:device-overlap");
  });

  it("1. blocks over a manual maintenance event", () => {
    const c = ctx({ manualEvents: [{ deviceId: "d1", type: "maintenance", start: t("09:00"), end: t("09:30") }] });
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("10:00") }), c))).toContain("block:device-manual-event");
  });

  it("2. blocks bookings outside the operating window", () => {
    expect(rules(validateBooking(draft({ start: t("05:00"), end: t("07:00") }), ctx()))).toContain("block:device-window");
    expect(rules(validateBooking(draft({ start: t("21:00"), end: t("22:30") }), ctx()))).toContain("block:device-window");
    expect(rules(validateBooking(draft({ start: t("20:00"), end: t("22:00") }), ctx()))).not.toContain("block:device-window");
    // Changing the setting takes effect.
    expect(rules(validateBooking(draft({ start: t("05:00"), end: t("07:00") }), ctx({}, { windowStartMinutes: 300 })))).not.toContain("block:device-window");
  });

  it("3. blocks when bookings + buffers exceed the daily max active hours", () => {
    const c = ctx(
      {
        bookings: [
          booking({ start: t("06:00"), end: t("10:00"), operatorId: "o2", segments: [{ taskId: "clean", plannedMinutes: 120 }] }),
          booking({ start: t("10:45"), end: t("14:45"), operatorId: "o3", segments: [{ taskId: "clean", plannedMinutes: 120 }] }),
        ],
      },
      { deviceMaxActiveHours: 10 },
    );
    // 4 + 0.75 + 4 + 0.75 + 2 + offload 1 = 12.5 h > 10 h
    const r = validateBooking(draft({ start: t("15:30"), end: t("17:30") }), c);
    expect(rules(r)).toContain("block:device-daily-max");
    expect(rules(validateBooking(draft({ start: t("15:30"), end: t("17:30") }), { ...c, settings: { ...c.settings, deviceMaxActiveHours: 16 } }))).not.toContain(
      "block:device-daily-max",
    );
  });

  it("4. ACCEPTANCE: a booking beyond 10 h of battery is flagged unless a power bank is assigned", () => {
    const c = ctx({
      bookings: [
        booking({ start: t("06:00"), end: t("10:00"), operatorId: "o2", segments: [{ taskId: "clean", plannedMinutes: 120 }] }),
        booking({ start: t("10:45"), end: t("14:45"), operatorId: "o3", segments: [{ taskId: "clean", plannedMinutes: 120 }] }),
      ],
    });
    // 8 h used, no room to charge (only 45 min gap), +4 h => 12 h > 10 h
    const r = validateBooking(draft({ start: t("15:30"), end: t("19:30") }), c);
    expect(rules(r)).toContain("warn:battery");
    const withPb = validateBooking(draft({ start: t("15:30"), end: t("19:30"), powerBankIds: ["pb1"] }), c);
    expect(rules(withPb)).not.toContain("warn:battery");
  });

  it("4. a single booking longer than the runtime is flagged", () => {
    const c = ctx({}, { deviceRuntimeHours: 3 });
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("12:00") }), c))).toContain("warn:battery");
  });

  it("4. a long enough gap inserts a charge and clears the battery warning", () => {
    const c = ctx({
      bookings: [
        booking({ start: t("06:00"), end: t("10:00"), operatorId: "o2" }),
        booking({ start: t("10:45"), end: t("14:45"), operatorId: "o3" }),
      ],
    });
    // gap 14:45 -> 16:30 = 105 min >= 45 handoff + 60 charge
    const r = validateBooking(draft({ start: t("16:30"), end: t("20:30") }), c);
    expect(rules(r)).not.toContain("warn:battery");
    const tl = buildDeviceTimeline("d1", [...c.bookings, { ...booking({ start: t("16:30"), end: t("20:30") }), id: "x" }], c.settings);
    expect(tl.items.some((i) => i.kind === "charge")).toBe(true);
  });

  it("4. blocks a power bank double-assigned at the same time, warns when all banks are in use", () => {
    const c = ctx(
      {
        bookings: [
          booking({ deviceId: "d2", operatorId: "o2", start: t("08:00"), end: t("12:00"), powerBankIds: ["pb1"] }),
          booking({ start: t("06:00"), end: t("10:00"), operatorId: "o2", deviceId: "d1" }),
        ],
      },
      { powerBanksAvailable: 1, deviceRuntimeHours: 5 },
    );
    expect(rules(validateBooking(draft({ start: t("10:45"), end: t("12:45"), powerBankIds: ["pb1"] }), c))).toContain("block:power-bank-conflict");
    const r = validateBooking(draft({ start: t("10:45"), end: t("12:45") }), c);
    expect(rules(r)).toContain("warn:battery");
    expect(rules(r)).toContain("warn:power-banks-exhausted");
  });

  it("5. ACCEPTANCE: offload gaps are inserted automatically after the trigger", () => {
    const s = { ...DEFAULT_SETTINGS };
    const bs = [
      booking({ start: t("06:00"), end: t("10:15"), operatorId: "a" }),
      booking({ start: t("11:00"), end: t("15:15"), operatorId: "b" }),
      booking({ start: t("06:00", "2026-11-11"), end: t("10:00", "2026-11-11"), operatorId: "c" }),
    ];
    // end_of_day: one offload after the last booking of each day
    const eod = buildDeviceTimeline("d1", bs, s);
    const offloads = eod.items.filter((i) => i.kind === "offload");
    expect(offloads).toHaveLength(2);
    expect(offloads[0].start).toBe(t("15:15"));
    expect(offloads[0].end).toBe(t("16:15"));
    // after_hours (N = 4 h): offload after the first booking too
    const ah = buildDeviceTimeline("d1", bs, { ...s, offloadTrigger: "after_hours", offloadAfterHours: 4 });
    expect(ah.items.filter((i) => i.kind === "offload").map((i) => i.start)).toContain(t("10:15"));
    // and a handoff before the 2nd booking
    expect(eod.items.find((i) => i.kind === "handoff")).toMatchObject({ start: t("10:15"), end: t("11:00") });
  });

  it("5. warns when the end-of-day offload runs past the window", () => {
    expect(rules(validateBooking(draft({ start: t("20:00"), end: t("22:00") }), ctx()))).toContain("warn:device-offload-window");
  });

  it("6. maintenance and retired devices cannot be booked", () => {
    expect(rules(validateBooking(draft({ deviceId: "dm", start: t("08:00"), end: t("10:00") }), ctx()))).toContain("block:device-status");
    expect(rules(validateBooking(draft({ deviceId: "dr", start: t("08:00"), end: t("10:00") }), ctx()))).toContain("block:device-status");
  });
});

describe("operator rules", () => {
  it("1. blocks overlapping bookings for the same operator (any device)", () => {
    const c = ctx({ bookings: [booking({ deviceId: "d2", start: t("08:00"), end: t("10:00") })] });
    expect(rules(validateBooking(draft({ start: t("09:00"), end: t("11:00") }), c))).toContain("block:operator-overlap");
  });

  it("2. ACCEPTANCE: a 6th hour of one task is blocked when the cap is 5 h", () => {
    const c = ctx({
      bookings: [
        // 3 h completed (actual) + 2 h planned of cooking = 5 h
        booking({ id: "c1", deviceId: "d2", start: t("08:00", "2026-11-08"), end: t("11:15", "2026-11-08"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 120, actualMinutes: 180 }] }),
        booking({ id: "p1", deviceId: "d2", start: t("08:00", "2026-11-09"), end: t("10:00", "2026-11-09"), segments: [{ taskId: "cook", plannedMinutes: 120 }] }),
      ],
    });
    const r = validateBooking(draft({ start: t("08:00"), end: t("09:00"), segments: [{ taskId: "cook", plannedMinutes: 60 }] }), c);
    expect(rules(r)).toContain("block:operator-task-cap");
    // Other tasks are not affected; per-task override (8 h for cleaning) applies.
    const r2 = validateBooking(draft({ start: t("08:00"), end: t("09:00"), segments: [{ taskId: "clean", plannedMinutes: 60 }] }), c);
    expect(rules(r2)).not.toContain("block:operator-task-cap");
    // Raising the project cap in settings allows it.
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("09:00"), segments: [{ taskId: "cook", plannedMinutes: 60 }] }), { ...c, settings: { ...c.settings, maxHoursPerOperatorPerTask: 6 } }))).not.toContain(
      "block:operator-task-cap",
    );
  });

  it("2. a logged booking counts its actual minutes, not planned, against the cap", () => {
    const done = booking({ id: "done1", deviceId: "d2", start: t("08:00", "2026-11-08"), end: t("12:15", "2026-11-08"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 240, actualMinutes: 200 }] });
    const other = booking({ id: "p2", deviceId: "d2", start: t("08:00", "2026-11-09"), end: t("09:40", "2026-11-09"), segments: [{ taskId: "cook", plannedMinutes: 100 }] });
    // 200 actual + 100 planned = 300 = cap -> re-validating the logged booking must not block
    expect(rules(validateBooking(done, ctx({ bookings: [done, other] })))).not.toContain("block:operator-task-cap");
  });

  it("2. a task-level cap override is used", () => {
    const c = ctx({ bookings: [booking({ deviceId: "d2", start: t("08:00", "2026-11-08"), end: t("15:30", "2026-11-08"), segments: [{ taskId: "clean", plannedMinutes: 420 }] })] });
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("09:00"), segments: [{ taskId: "clean", plannedMinutes: 60 }] }), c))).not.toContain("block:operator-task-cap");
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("10:00"), segments: [{ taskId: "clean", plannedMinutes: 120 }] }), c))).toContain("block:operator-task-cap");
  });

  it("3. daily soft limit warns, hard limit blocks", () => {
    const c = ctx({ bookings: [booking({ deviceId: "d2", start: t("06:00"), end: t("09:15"), segments: [{ taskId: "clean", plannedMinutes: 180 }] })] });
    const soft = validateBooking(draft({ start: t("12:00"), end: t("14:00"), segments: [{ taskId: "cook", plannedMinutes: 120 }] }), c);
    expect(rules(soft)).toContain("warn:operator-daily-soft");
    expect(rules(soft)).not.toContain("block:operator-daily-hard");
    const hard = validateBooking(
      draft({ start: t("12:00"), end: t("16:15"), segments: [{ taskId: "cook", plannedMinutes: 120 }, { taskId: "cook", plannedMinutes: 120 }] }),
      c,
    );
    expect(rules(hard)).toContain("block:operator-daily-hard");
  });

  it("4. warns on a segment longer than the continuous max and suggests a split", () => {
    const r = validateBooking(draft({ start: t("08:00"), end: t("11:00"), segments: [{ taskId: "cook", plannedMinutes: 180 }] }), ctx());
    const w = r.find((x) => x.rule === "segment-continuous")!;
    expect(w.level).toBe("warn");
    expect(w.suggestion).toEqual({ type: "split-segment", segmentIndex: 0, parts: [90, 90] });
  });

  it("4. warns when the break between segments is too short; blocks when segments exceed the booking", () => {
    const short = validateBooking(draft({ start: t("08:00"), end: t("12:05"), segments: [{ taskId: "cook", plannedMinutes: 120 }, { taskId: "clean", plannedMinutes: 120 }] }), ctx());
    expect(rules(short)).toContain("warn:segment-break");
    const ok = validateBooking(draft({ start: t("08:00"), end: t("12:15"), segments: [{ taskId: "cook", plannedMinutes: 120 }, { taskId: "clean", plannedMinutes: 120 }] }), ctx());
    expect(rules(ok)).not.toContain("warn:segment-break");
    const over = validateBooking(draft({ start: t("08:00"), end: t("09:00"), segments: [{ taskId: "cook", plannedMinutes: 90 }] }), ctx());
    expect(rules(over)).toContain("block:segments-exceed-booking");
  });

  it("5. warns if the household doesn't list the task", () => {
    const r = validateBooking(draft({ operatorId: "o2", start: t("08:00"), end: t("10:00") }), ctx());
    expect(rules(r)).toContain("warn:household-support");
  });

  it("warns when the operator is not active", () => {
    expect(rules(validateBooking(draft({ operatorId: "o3", start: t("08:00"), end: t("10:00") }), ctx()))).toContain("warn:operator-status");
  });
});

describe("task and project rules", () => {
  it("1. warns when planned + completed hours exceed the task target", () => {
    const c = ctx();
    c.tasks[0].targetHours = 3;
    const others = [booking({ deviceId: "d2", operatorId: "o2", start: t("06:00"), end: t("08:00"), segments: [{ taskId: "cook", plannedMinutes: 120 }] })];
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("10:00") }), { ...c, bookings: others }))).toContain("warn:task-target");
  });

  it("2. warns after the deadline", () => {
    const c = ctx({ project: { start: t("00:00", "2026-11-01"), deadline: t("00:00", "2026-11-09") } });
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("10:00") }), c))).toContain("warn:project-deadline");
  });

  it("warns for inactive tasks", () => {
    expect(rules(validateBooking(draft({ start: t("08:00"), end: t("10:00"), segments: [{ taskId: "old", plannedMinutes: 60 }] }), ctx()))).toContain("warn:task-inactive");
  });
});

describe("recorded vs planned hours", () => {
  it("recorded comes only from actualMinutes of completed bookings; planned is separate", () => {
    const done = booking({ start: t("08:00"), end: t("10:00"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 120, actualMinutes: 100 }] });
    const unlogged = booking({ start: t("11:00"), end: t("13:00"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 120 }] });
    const planned = booking({ start: t("14:00"), end: t("16:00"), segments: [{ taskId: "cook", plannedMinutes: 120 }] });
    const cancelled = booking({ start: t("14:00"), end: t("16:00"), status: "cancelled", segments: [{ taskId: "cook", plannedMinutes: 120, actualMinutes: 120 }] });
    const all = [done, unlogged, planned, cancelled];
    expect(recordedMinutes(done)).toBe(100);
    expect(recordedMinutes(unlogged)).toBe(0);
    expect(recordedMinutes(planned)).toBe(0);
    expect(recordedMinutes(cancelled)).toBe(0);
    expect(plannedMinutes(planned)).toBe(120);
    expect(plannedMinutes(unlogged)).toBe(120);
    expect(plannedMinutes(done)).toBe(0);
    expect(totalRecorded(all)).toBe(100);
  });
});

describe("fill gaps helper", () => {
  it("generates back-to-back 4 h slots with buffers (3 per device per day with defaults)", () => {
    const slots = generateOpenSlots({ devices: [{ id: "d1", code: "DEV-01", status: "available" }], days: [DAY], bookings: [], settings: DEFAULT_SETTINGS });
    expect(slots.map((s) => [minuteOfDay(s.start), minuteOfDay(s.end)])).toEqual([
      [360, 615], // 06:00-10:15
      [660, 915], // 11:00-15:15
      [960, 1215], // 16:00-20:15
    ]);
    expect(slots[0].segments).toEqual([120, 120]);
    expect(slots[2].needsPowerBank).toBe(true);
  });

  it("works around existing bookings and skips maintenance devices", () => {
    const slots = generateOpenSlots({
      devices: [
        { id: "d1", code: "DEV-01", status: "available" },
        { id: "dm", code: "DEV-09", status: "maintenance" },
      ],
      days: [DAY],
      bookings: [booking({ start: t("09:00"), end: t("13:00"), operatorId: "o2" })],
      settings: DEFAULT_SETTINGS,
    });
    expect(slots.every((s) => s.deviceId === "d1")).toBe(true);
    for (const s of slots) {
      const v = validateBooking(
        { deviceId: "d1", operatorId: "zz", start: s.start, end: s.end, segments: [], powerBankIds: [] },
        ctx({ bookings: [booking({ start: t("09:00"), end: t("13:00"), operatorId: "o2" })] }),
      );
      expect(v.filter((x) => x.rule === "device-overlap")).toEqual([]);
    }
    expect(minuteOfDay(slots[0].start)).toBe(13 * 60 + 45);
  });

  it("ranks operators: excludes clashes, prefers tasks behind and household support", () => {
    const c = ctx({
      bookings: [
        booking({ deviceId: "d2", operatorId: "o2", start: t("09:00"), end: t("10:00"), segments: [{ taskId: "clean", plannedMinutes: 60 }] }),
        // cooking is mostly done -> cleaning is further behind
        booking({ deviceId: "d2", operatorId: "o3", start: t("06:00", "2026-11-09"), end: t("07:00", "2026-11-09"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 60, actualMinutes: 60 }] }),
      ],
    });
    c.tasks[0].targetHours = 2;
    const slot = { key: "s", deviceId: "d1", start: t("08:00"), end: t("12:15"), segments: [120, 120], needsPowerBank: false };
    const ranked = rankOperatorsForSlot(slot, c);
    expect(ranked.map((r) => r.operatorId)).toEqual(["o1"]); // o2 clashes, o3 is a prospect
    expect(ranked[0].tasks[0].taskId).toBe("clean");
  });
});

describe("capacity planner", () => {
  it("matches the spec: 10 devices x 7 days ~ 840 h, not feasible for 1,000 h", () => {
    const r = computeCapacity({ targetHours: 1000, days: 7, devices: 10, slotRecordingHours: 4, settings: DEFAULT_SETTINGS });
    expect(r.slotsPerDevicePerDay).toBe(3);
    expect(r.recordingPerDevicePerDay).toBe(12);
    expect(r.achievable).toBe(840);
    expect(r.feasible).toBe(false);
    expect(r.shortfall).toBe(160);
    expect(r.fixes.devicesNeeded).toBe(12);
    expect(r.fixes.daysNeeded).toBe(9);
    expect(r.bookingsNeeded).toBe(250);
    expect(r.cost).toBe(1_000_000);
    expect(Math.round(r.neededPerDevicePerDay * 10) / 10).toBe(14.3);
  });

  it("adding devices changes the result", () => {
    const r = computeCapacity({ targetHours: 1000, days: 7, devices: 12, slotRecordingHours: 4, settings: DEFAULT_SETTINGS });
    expect(r.achievable).toBe(1008);
    expect(r.feasible).toBe(true);
  });

  it("computes operator minimums", () => {
    const r = computeCapacity({
      targetHours: 1000,
      days: 7,
      devices: 10,
      slotRecordingHours: 4,
      settings: DEFAULT_SETTINGS,
      tasks: [
        { name: "A", targetHours: 400, perPersonCapHours: null },
        { name: "B", targetHours: 300, perPersonCapHours: null },
        { name: "C", targetHours: 200, perPersonCapHours: null },
        { name: "D", targetHours: 100, perPersonCapHours: null },
      ],
    });
    expect(r.operators.perTask.map((x) => x.minOperators)).toEqual([80, 60, 40, 20]);
    expect(r.operators.absoluteMinimum).toBe(80);
    const six = computeCapacity({ targetHours: 1000, days: 7, devices: 10, slotRecordingHours: 4, settings: DEFAULT_SETTINGS, taskCount: 8 });
    expect(six.operators.absoluteMinimum).toBe(36); // 1000 / (4 h x 7 days)
    expect(six.operators.planFor).toBe(67); // ~3 tasks x 5 h each
  });
});

describe("utilization and dashboard metrics", () => {
  it("splits the window into recording, buffers and idle", () => {
    const bs = [booking({ start: t("06:00"), end: t("10:00"), operatorId: "a" }), booking({ start: t("10:45"), end: t("14:45"), operatorId: "b" })];
    const tl = buildDeviceTimeline("d1", bs, DEFAULT_SETTINGS);
    const u = deviceDayUtilization(tl.items, DAY, DEFAULT_SETTINGS);
    expect(u.windowMinutes).toBe(960);
    expect(u.recording).toBe(480);
    expect(u.handoff).toBe(45);
    expect(u.offload).toBe(60);
    expect(u.idle).toBe(960 - 480 - 45 - 60);
    expect(u.idleGaps).toHaveLength(1);
  });

  it("dashboard totals equal the sum of logged segments", () => {
    const bs = [
      booking({ start: t("06:00"), end: t("10:00"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 120, actualMinutes: 115 }, { taskId: "clean", plannedMinutes: 120, actualMinutes: 101 }] }),
      booking({ start: t("06:00", "2026-11-11"), end: t("08:00", "2026-11-11"), status: "completed", segments: [{ taskId: "cook", plannedMinutes: 120, actualMinutes: 77 }] }),
      booking({ start: t("06:00", "2026-11-12"), end: t("08:00", "2026-11-12"), segments: [{ taskId: "cook", plannedMinutes: 120 }] }),
    ];
    const now = t("12:00", "2026-11-12");
    const p = pace(bs, 1000, t("00:00", "2026-11-17"), now);
    expect(p.recordedHours * 60).toBe(115 + 101 + 77);
    expect(p.plannedHours * 60).toBe(120);
    const tp = taskProgress(ctx().tasks, bs, 5, 0.5);
    expect(tp.reduce((s, x) => s + x.recorded * 60, 0)).toBe(115 + 101 + 77);
    const bu = burnUp(bs, t("00:00", DAY), t("00:00", "2026-11-17"), 1000, now);
    expect(bu.find((x) => x.day === "2026-11-12")!.recorded).toBe(Math.round((293 / 60) * 10) / 10);
    expect(bu[bu.length - 1].ideal).toBe(1000);
  });
});
