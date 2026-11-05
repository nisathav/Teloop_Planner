"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Sparkles, XCircle } from "lucide-react";
import { buildDeviceTimeline, type TimelineItem } from "@/lib/rules/timeline";
import { validateBooking } from "@/lib/rules/validate";
import { deviceDayUtilization } from "@/lib/rules/utilization";
import { generateOpenSlots, type OpenSlot } from "@/lib/rules/fillGaps";
import { bookingLengthFor, isOccupying, splitRecording } from "@/lib/rules/bookings";
import { MIN, addDays, atColombo, clock, dayKey, dayRange, hm } from "@/lib/rules/time";
import type { RuleResult, ValidationContext } from "@/lib/rules/types";
import { saveBooking } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/format";
import { BookingPanel } from "./booking-panel";
import { SlotPanel } from "./slot-panel";
import type { BoardBooking, BoardData, Draft } from "./types";

const ROW_H = 46;
const SNAP = 15;

export const STATUS_COLOR: Record<string, string> = {
  planned: "bg-blue-500 border-blue-700 text-white",
  confirmed: "bg-violet-500 border-violet-700 text-white",
  "in-progress": "bg-amber-400 border-amber-600 text-amber-950",
  completed: "bg-emerald-500 border-emerald-700 text-white",
  cancelled: "bg-slate-300 border-slate-400 text-slate-600",
  "no-show": "bg-red-300 border-red-500 text-red-900",
};
const BUFFER_COLOR: Record<string, string> = {
  handoff: "bg-amber-200 hatch text-amber-900",
  offload: "bg-violet-200 hatch text-violet-900",
  charge: "bg-emerald-200 hatch text-emerald-900",
  maintenance: "bg-slate-300 hatch text-slate-800",
  manual: "bg-slate-200 hatch text-slate-800",
};

type DragKind = "create" | "move" | "resize-start" | "resize-end";
interface DragState {
  kind: DragKind;
  bookingId?: string;
  rowId: string;
  anchor: number; // ms under pointer at start (create) or offset (move)
  start: number;
  end: number;
  moved: boolean;
  pointerX: number;
  pointerY: number;
}

function defaultSegments(durationMin: number, s: BoardData["settings"], taskId: string) {
  // Fit as many max-length segments with breaks as the booking allows.
  const n = Math.max(1, Math.ceil((durationMin + s.minBreakMinutes) / (s.maxContinuousMinutes + s.minBreakMinutes)));
  const rec = Math.max(0, durationMin - (n - 1) * s.minBreakMinutes);
  return splitRecording(rec, s.maxContinuousMinutes).map((m) => ({ taskId, plannedMinutes: m }));
}

export function ScheduleBoard({ data, date, view, rows, openBookingId }: { data: BoardData; date: string; view: "day" | "week"; rows: "device" | "operator"; openBookingId?: string }) {
  const router = useRouter();
  const s = data.settings;
  const [bookings, setBookings] = useState<BoardBooking[]>(data.bookings);
  useEffect(() => setBookings(data.bookings), [data.bookings]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [showSlots, setShowSlots] = useState(false);
  const [slotSel, setSlotSel] = useState<OpenSlot | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "warn" | "err" } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => (view === "week" ? dayRange(date, addDays(date, 6)) : [date]), [date, view]);
  const axisStart = Math.max(0, s.windowStartMinutes - 60);
  const axisEnd = Math.min(24 * 60, s.windowEndMinutes + 60);
  const axisLen = axisEnd - axisStart;

  const ctx: ValidationContext = useMemo(
    () => ({
      settings: s,
      project: { start: data.project.start, deadline: data.project.deadline },
      bookings,
      devices: data.devices,
      operators: data.operators,
      tasks: data.tasks,
      manualEvents: data.manualEvents,
    }),
    [s, data, bookings],
  );

  const timelines = useMemo(() => {
    const m = new Map<string, TimelineItem[]>();
    for (const d of data.devices) m.set(d.id, buildDeviceTimeline(d.id, bookings, s, data.manualEvents).items);
    return m;
  }, [data.devices, data.manualEvents, bookings, s]);

  const visibleBookings = useMemo(() => {
    const a = atColombo(days[0], 0);
    const b = atColombo(days[days.length - 1], 24 * 60);
    return bookings.filter((x) => x.end > a && x.start < b);
  }, [bookings, days]);

  const issues = useMemo(() => {
    const m = new Map<string, RuleResult[]>();
    for (const b of visibleBookings) if (isOccupying(b) && b.projectId === data.project.id) m.set(b.id, validateBooking(b, ctx));
    return m;
  }, [visibleBookings, ctx, data.project.id]);

  const rowList = useMemo(() => {
    if (rows === "device") return data.devices.filter((d) => d.status !== "retired").map((d) => ({ id: d.id, label: d.code, sub: d.status }));
    const busy = new Set(visibleBookings.map((b) => b.operatorId));
    return data.operators.filter((o) => o.status === "active" || busy.has(o.id)).map((o) => ({ id: o.id, label: o.name, sub: o.area }));
  }, [rows, data.devices, data.operators, visibleBookings]);

  // ---------- geometry ----------
  const pos = useCallback(
    (start: number, end: number, dayIdx: number) => {
      const day = days[dayIdx];
      const d0 = atColombo(day, axisStart);
      const d1 = atColombo(day, axisEnd);
      const a = Math.max(start, d0);
      const b = Math.min(end, d1);
      if (b <= a) return null;
      const left = ((dayIdx + (a - d0) / (d1 - d0)) / days.length) * 100;
      const width = (((b - a) / (d1 - d0)) / days.length) * 100;
      return { left: `${left}%`, width: `${width}%` };
    },
    [days, axisStart, axisEnd],
  );

  const pointerToMs = useCallback(
    (clientX: number) => {
      const el = bodyRef.current;
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const frac = Math.min(0.99999, Math.max(0, (clientX - r.left) / r.width));
      const idx = Math.floor(frac * days.length);
      const within = frac * days.length - idx;
      const minute = axisStart + within * axisLen;
      const snapped = Math.round(minute / SNAP) * SNAP;
      return atColombo(days[idx], snapped);
    },
    [days, axisStart, axisLen],
  );

  const pointerToRow = useCallback(
    (clientY: number) => {
      const el = bodyRef.current;
      if (!el) return rowList[0]?.id;
      const r = el.getBoundingClientRect();
      const i = Math.min(rowList.length - 1, Math.max(0, Math.floor((clientY - r.top) / ROW_H)));
      return rowList[i]?.id;
    },
    [rowList],
  );

  // ---------- drafts from drag ----------
  const dragDraft = useCallback(
    (d: DragState): Draft | null => {
      if (d.kind === "create") {
        const firstTask = data.tasks.find((t) => t.active)?.id ?? "";
        const dur = (d.end - d.start) / MIN;
        if (rows === "device") {
          return { deviceId: d.rowId, operatorId: "", start: d.start, end: d.end, status: "planned", notes: "", segments: defaultSegments(dur, s, firstTask), powerBankIds: [] };
        }
        const dev =
          data.devices.find(
            (dv) =>
              !validateBooking({ deviceId: dv.id, operatorId: d.rowId, start: d.start, end: d.end, segments: [], powerBankIds: [] }, ctx).some(
                (r) => r.level === "block" && r.rule.startsWith("device"),
              ),
          )?.id ?? "";
        return { deviceId: dev, operatorId: d.rowId, start: d.start, end: d.end, status: "planned", notes: "", segments: defaultSegments(dur, s, firstTask), powerBankIds: [] };
      }
      const b = bookings.find((x) => x.id === d.bookingId);
      if (!b) return null;
      return {
        id: b.id,
        deviceId: rows === "device" ? d.rowId : b.deviceId,
        operatorId: rows === "operator" ? d.rowId : b.operatorId,
        start: d.start,
        end: d.end,
        status: b.status,
        notes: b.notes,
        segments: b.segments,
        powerBankIds: b.powerBankIds,
      };
    },
    [bookings, data.devices, data.tasks, rows, s, ctx],
  );

  const liveResults = useMemo(() => {
    if (!drag || !drag.moved) return null;
    const d = dragDraft(drag);
    if (!d || !d.deviceId) return [];
    const res = validateBooking(drag.kind === "create" ? { ...d, operatorId: d.operatorId || "__new__", segments: [] } : d, ctx);
    return drag.kind === "create" ? res.filter((r) => r.rule.startsWith("device") || r.rule.startsWith("project")) : res;
  }, [drag, dragDraft, ctx]);

  function onPointerDownRow(e: React.PointerEvent, rowId: string) {
    if (data.readOnly || e.button !== 0) return;
    const t = pointerToMs(e.clientX);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind: "create", rowId, anchor: t, start: t, end: t + SNAP * MIN, moved: false, pointerX: e.clientX, pointerY: e.clientY });
  }

  function onPointerDownBooking(e: React.PointerEvent, b: BoardBooking, kind: DragKind, rowId: string) {
    e.stopPropagation();
    if (data.readOnly || e.button !== 0 || b.projectId !== data.project.id) {
      if (b.projectId === data.project.id) openBooking(b);
      return;
    }
    const t = pointerToMs(e.clientX);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ kind, bookingId: b.id, rowId, anchor: kind === "move" ? t - b.start : t, start: b.start, end: b.end, moved: false, pointerX: e.clientX, pointerY: e.clientY });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const t = pointerToMs(e.clientX);
    const moved = drag.moved || Math.abs(e.clientX - drag.pointerX) > 4 || Math.abs(e.clientY - drag.pointerY) > 4;
    let { start, end, rowId } = drag;
    if (drag.kind === "create") {
      start = Math.min(drag.anchor, t);
      end = Math.max(drag.anchor, t);
      if (end - start < SNAP * MIN) end = start + SNAP * MIN;
    } else if (drag.kind === "move") {
      const b = bookings.find((x) => x.id === drag.bookingId)!;
      const len = b.end - b.start;
      start = t - drag.anchor;
      start = Math.round(start / (SNAP * MIN)) * SNAP * MIN;
      end = start + len;
      rowId = pointerToRow(e.clientY) ?? drag.rowId;
    } else if (drag.kind === "resize-start") {
      start = Math.min(t, drag.end - SNAP * MIN);
    } else {
      end = Math.max(t, drag.start + SNAP * MIN);
    }
    setDrag({ ...drag, start, end, rowId, moved });
  }

  async function onPointerUp() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.kind === "create") {
      if (!d.moved) return;
      const nd = dragDraft(d);
      if (nd) {
        setDraft(nd);
        setDraftNote(null);
        setSlotSel(null);
      }
      return;
    }
    const b = bookings.find((x) => x.id === d.bookingId);
    if (!b) return;
    if (!d.moved || (d.start === b.start && d.end === b.end && (rows === "device" ? d.rowId === b.deviceId : d.rowId === b.operatorId))) {
      openBooking(b);
      return;
    }
    const nd = dragDraft(d)!;
    const res = validateBooking(nd, ctx);
    if (res.some((r) => r.level === "block")) {
      setDraft(nd);
      setDraftNote("This change breaks a rule. Fix it, or save with an override reason.");
      return;
    }
    // Optimistic update, then persist.
    setBookings((all) => all.map((x) => (x.id === b.id ? { ...x, ...nd, id: b.id } : x)));
    const r = await saveBooking({ ...nd, id: b.id });
    if (!r.ok) {
      setBookings(data.bookings);
      setToast({ text: r.error ?? "Could not save", tone: "err" });
    } else {
      const w = r.results.filter((x) => x.level === "warn").length;
      setToast({ text: `Saved ${clock(nd.start)}–${clock(nd.end)}${w ? ` with ${w} warning${w > 1 ? "s" : ""}` : ""}`, tone: w ? "warn" : "ok" });
      router.refresh();
    }
  }

  function openBooking(b: BoardBooking) {
    setSlotSel(null);
    setDraftNote(null);
    setDraft({ id: b.id, deviceId: b.deviceId, operatorId: b.operatorId, start: b.start, end: b.end, status: b.status, notes: b.notes, segments: b.segments, powerBankIds: b.powerBankIds });
  }

  useEffect(() => {
    if (!openBookingId) return;
    const b = bookings.find((x) => x.id === openBookingId);
    if (b) openBooking(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBookingId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- navigation ----------
  function go(params: Partial<{ date: string; view: string; rows: string }>) {
    const q = new URLSearchParams({ date, view, rows, ...params });
    router.push(`/schedule?${q.toString()}`);
  }

  // Open slots are recomputed whenever bookings change, so they never go stale.
  const slotDays = useMemo(() => days.filter((d) => d >= dayKey(data.now)), [days, data.now]);
  const slots = useMemo<OpenSlot[] | null>(
    () =>
      showSlots
        ? generateOpenSlots({ devices: data.devices, days: slotDays, bookings, settings: s, manualEvents: data.manualEvents, notBefore: data.now })
        : null,
    [showSlots, data.devices, slotDays, bookings, s, data.manualEvents, data.now],
  );

  function fillGaps() {
    if (showSlots) {
      setShowSlots(false);
      setSlotSel(null);
      return;
    }
    setShowSlots(true);
    const n = generateOpenSlots({ devices: data.devices, days: slotDays, bookings, settings: s, manualEvents: data.manualEvents, notBefore: data.now }).length;
    setToast({ text: `${n} open slot${n === 1 ? "" : "s"} on ${slotDays.length} day(s). Click one to see ranked operators.`, tone: n ? "ok" : "warn" });
  }

  // ---------- render helpers ----------
  const hours: number[] = [];
  for (let m = Math.ceil(axisStart / 60) * 60; m <= axisEnd; m += view === "week" ? 240 : 60) hours.push(m);

  const ghost = drag && drag.moved ? { rowId: drag.rowId, start: drag.start, end: drag.end } : null;
  const ghostBlocked = liveResults?.some((r) => r.level === "block");
  const draftBookingSlot = draft && !draft.id ? draft : null;

  const opName = (id: string) => data.operators.find((o) => o.id === id)?.name ?? "—";
  const devCode = (id: string) => data.devices.find((o) => o.id === id)?.code ?? "—";
  const taskName = (id: string) => data.tasks.find((t) => t.id === id)?.name ?? "";

  const nowDay = dayKey(data.now);
  const nowIdx = days.indexOf(nowDay);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">Schedule</h1>
        <div className="flex items-center rounded-md border bg-white">
          <Button variant="ghost" size="icon" onClick={() => go({ date: addDays(date, view === "week" ? -7 : -1) })} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input type="date" value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} className="h-8 border-x px-2 text-sm" />
          <Button variant="ghost" size="icon" onClick={() => go({ date: addDays(date, view === "week" ? 7 : 1) })} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => go({ date: nowDay })}>
          Today
        </Button>
        <div className="flex rounded-md border bg-white p-0.5 text-sm">
          {(["day", "week"] as const).map((v) => (
            <button key={v} onClick={() => go({ view: v })} className={cn("rounded px-2.5 py-1", view === v ? "bg-blue-600 text-white" : "")}>
              {v === "day" ? "Day" : "Week"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border bg-white p-0.5 text-sm">
          {(["device", "operator"] as const).map((v) => (
            <button key={v} onClick={() => go({ rows: v })} className={cn("rounded px-2.5 py-1", rows === v ? "bg-blue-600 text-white" : "")}>
              {v === "device" ? "Rows: devices" : "Rows: operators"}
            </button>
          ))}
        </div>
        {!data.readOnly && rows === "device" ? (
          <Button size="sm" variant={slots ? "secondary" : "default"} onClick={fillGaps}>
            <Sparkles className="h-4 w-4" /> {slots ? "Hide open slots" : "Fill gaps"}
          </Button>
        ) : null}
        <div className="ml-auto hidden flex-wrap items-center gap-2 text-[11px] text-muted-foreground lg:flex">
          {Object.entries(STATUS_COLOR)
            .filter(([k]) => k !== "cancelled" && k !== "no-show")
            .map(([k, c]) => (
              <span key={k} className="flex items-center gap-1">
                <span className={cn("inline-block h-3 w-3 rounded-sm border", c)} />
                {k}
              </span>
            ))}
          {["handoff", "offload", "charge"].map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={cn("inline-block h-3 w-3 rounded-sm", BUFFER_COLOR[k])} />
              {k}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="idle-red inline-block h-3 w-3 rounded-sm" /> idle
          </span>
        </div>
      </div>

      {drag && drag.moved && liveResults ? (
        <div className={cn("rounded-md border px-3 py-1.5 text-xs", ghostBlocked ? "border-red-300 bg-red-50 text-red-800" : liveResults.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>
          <b>
            {clock(drag.start)}–{clock(drag.end)} ({((drag.end - drag.start) / 3600000).toFixed(2)} h)
          </b>{" "}
          {liveResults.length === 0 ? "✓ no rule issues" : liveResults.map((r) => `${r.level === "block" ? "⛔" : "⚠"} ${r.message}`).join("  ·  ")}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {data.readOnly ? "Read-only view." : rows === "device" ? "Drag on a device row to create a booking. Drag a booking to move it (also between devices), drag its edges to resize. Click to open." : "Operator rows: drag to create (a free device is picked), drag to move between operators."}{" "}
          Hatched = automatic handoff / offload / charge buffers. Red = idle inside the operating window ({hm(s.windowStartMinutes)}–{hm(s.windowEndMinutes)}).
        </p>
      )}

      <div className="flex gap-3">
        <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border bg-white">
          <div style={{ minWidth: view === "week" ? 1300 : 860 }}>
            {/* header */}
            <div className="sticky top-0 z-20 flex border-b bg-white">
              <div className="w-28 shrink-0 border-r px-2 py-1 text-xs font-medium text-muted-foreground">{rows === "device" ? "Device" : "Operator"}</div>
              <div className="relative h-10 flex-1">
                {days.map((d, i) => (
                  <div key={d} className="absolute inset-y-0 border-l" style={{ left: `${(i / days.length) * 100}%`, width: `${100 / days.length}%` }}>
                    {view === "week" ? <div className={cn("px-1 text-[11px] font-medium", d === nowDay && "text-blue-700")}>{fmtDay(d)}</div> : null}
                  </div>
                ))}
                {days.map((d, i) =>
                  hours.map((m) => (
                    <div
                      key={`${d}-${m}`}
                      className="absolute bottom-0 -translate-x-1/2 text-[10px] text-muted-foreground"
                      style={{ left: `${((i + (m - axisStart) / axisLen) / days.length) * 100}%` }}
                    >
                      {view === "week" ? hm(m).slice(0, 2) : hm(m)}
                    </div>
                  )),
                )}
              </div>
            </div>

            {/* body */}
            <div className="flex">
              <div className="w-28 shrink-0 border-r">
                {rowList.map((r) => (
                  <div key={r.id} className="flex flex-col justify-center border-b px-2" style={{ height: ROW_H }}>
                    <span className="truncate text-sm font-medium">{r.label}</span>
                    <span className="truncate text-[10px] text-muted-foreground">{r.sub}</span>
                  </div>
                ))}
              </div>
              <div ref={bodyRef} className="relative flex-1 select-none touch-pan-y" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
                {/* background: outside-window shading + day separators */}
                {days.map((d, i) => {
                  const wl = pos(atColombo(d, axisStart), atColombo(d, s.windowStartMinutes), i);
                  const wr = pos(atColombo(d, s.windowEndMinutes), atColombo(d, axisEnd), i);
                  return (
                    <div key={d}>
                      {wl ? <div className="pointer-events-none absolute inset-y-0 bg-slate-100" style={wl} /> : null}
                      {wr ? <div className="pointer-events-none absolute inset-y-0 bg-slate-100" style={wr} /> : null}
                      <div className="pointer-events-none absolute inset-y-0 border-l border-slate-300" style={{ left: `${(i / days.length) * 100}%` }} />
                    </div>
                  );
                })}
                {view === "day"
                  ? hours.map((m) => (
                      <div key={m} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-100" style={{ left: `${((m - axisStart) / axisLen) * 100}%` }} />
                    ))
                  : null}
                {nowIdx >= 0 ? (
                  <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-red-500" style={{ left: pos(data.now, data.now + MIN, nowIdx)?.left }} />
                ) : null}

                {rowList.map((row) => {
                  const rowBookings = visibleBookings.filter((b) => isOccupying(b) && (rows === "device" ? b.deviceId === row.id : b.operatorId === row.id));
                  const items = rows === "device" ? (timelines.get(row.id) ?? []).filter((it) => it.kind !== "booking") : [];
                  const device = rows === "device" ? data.devices.find((d) => d.id === row.id) : null;
                  const unavailable = device && (device.status === "maintenance" || device.status === "retired");
                  return (
                    <div
                      key={row.id}
                      className={cn("relative border-b", unavailable && "bg-slate-200/60")}
                      style={{ height: ROW_H }}
                      onPointerDown={(e) => onPointerDownRow(e, row.id)}
                    >
                      {/* idle */}
                      {rows === "device" && !unavailable
                        ? days.map((d, i) =>
                            deviceDayUtilization(timelines.get(row.id) ?? [], d, s).idleGaps.map((g) => {
                              const p = pos(g.start, g.end, i);
                              return p ? (
                                <div key={`${d}-${g.start}`} className="idle-red pointer-events-none absolute inset-y-1 rounded-sm" style={p} title={`Idle ${clock(g.start)}–${clock(g.end)} (${Math.round(g.minutes)} min)`} />
                              ) : null;
                            }),
                          )
                        : null}
                      {/* buffers */}
                      {items.map((it, k) =>
                        days.map((d, i) => {
                          const p = pos(it.start, it.end, i);
                          return p ? (
                            <div
                              key={`${k}-${i}`}
                              className={cn("pointer-events-none absolute inset-y-1.5 overflow-hidden rounded-sm text-[9px] leading-tight", BUFFER_COLOR[it.kind] ?? "bg-slate-200")}
                              style={p}
                              title={`${it.kind} ${clock(it.start)}–${clock(it.end)}`}
                            >
                              {view === "day" ? <span className="px-0.5">{it.kind}</span> : null}
                            </div>
                          ) : null;
                        }),
                      )}
                      {/* open slots */}
                      {slots
                        ? slots
                            .filter((sl) => rows === "device" && sl.deviceId === row.id)
                            .map((sl) =>
                              days.map((d, i) => {
                                const p = pos(sl.start, sl.end, i);
                                return p ? (
                                  <button
                                    key={`${sl.key}-${i}`}
                                    className={cn(
                                      "absolute inset-y-1 z-[5] rounded border-2 border-dashed border-blue-500 bg-blue-50/80 text-[10px] text-blue-800 hover:bg-blue-100",
                                      slotSel?.key === sl.key && "ring-2 ring-blue-600",
                                    )}
                                    style={p}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => {
                                      setDraft(null);
                                      setSlotSel(sl);
                                    }}
                                  >
                                    open {clock(sl.start)}
                                  </button>
                                ) : null;
                              }),
                            )
                        : null}
                      {/* bookings */}
                      {rowBookings.map((b) =>
                        days.map((d, i) => {
                          const p = pos(b.start, b.end, i);
                          if (!p) return null;
                          const iss = issues.get(b.id) ?? [];
                          const blocked = iss.some((x) => x.level === "block");
                          const other = b.projectId !== data.project.id;
                          const dragging = drag?.moved && drag.bookingId === b.id;
                          return (
                            <div
                              key={`${b.id}-${i}`}
                              className={cn(
                                "group absolute inset-y-1 z-[6] cursor-grab overflow-hidden rounded border px-1 text-[11px] leading-tight shadow-sm",
                                other ? "border-slate-400 bg-slate-300 text-slate-700" : STATUS_COLOR[b.status],
                                dragging && "opacity-30",
                                draft?.id === b.id && "ring-2 ring-black",
                              )}
                              style={p}
                              title={`${opName(b.operatorId)} · ${devCode(b.deviceId)} · ${clock(b.start)}–${clock(b.end)} · ${b.status}${other ? " (other project)" : ""}${iss.length ? "\n" + iss.map((x) => `${x.level}: ${x.message}`).join("\n") : ""}`}
                              onPointerDown={(e) => onPointerDownBooking(e, b, "move", row.id)}
                            >
                              {!data.readOnly && !other ? (
                                <>
                                  <span className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onPointerDownBooking(e, b, "resize-start", row.id)} />
                                  <span className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" onPointerDown={(e) => onPointerDownBooking(e, b, "resize-end", row.id)} />
                                </>
                              ) : null}
                              <div className="flex items-center gap-0.5 truncate font-medium">
                                {blocked ? <XCircle className="h-3 w-3 shrink-0" /> : iss.length ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}
                                {rows === "device" ? opName(b.operatorId) : devCode(b.deviceId)}
                              </div>
                              {view === "day" ? (
                                <div className="truncate opacity-90">
                                  {clock(b.start)}–{clock(b.end)} · {[...new Set(b.segments.map((x) => taskName(x.taskId)))].join(", ")}
                                  {b.powerBankIds.length ? " · 🔋" : ""}
                                </div>
                              ) : null}
                            </div>
                          );
                        }),
                      )}
                      {/* ghost while dragging */}
                      {ghost && ghost.rowId === row.id
                        ? days.map((d, i) => {
                            const p = pos(ghost.start, ghost.end, i);
                            return p ? (
                              <div
                                key={`g-${i}`}
                                className={cn(
                                  "pointer-events-none absolute inset-y-0.5 z-20 rounded border-2 text-[10px] font-medium",
                                  ghostBlocked ? "border-red-600 bg-red-200/70 text-red-900" : liveResults?.length ? "border-amber-500 bg-amber-100/80" : "border-emerald-600 bg-emerald-100/80",
                                )}
                                style={p}
                              >
                                <span className="px-1">
                                  {clock(ghost.start)}–{clock(ghost.end)}
                                </span>
                              </div>
                            ) : null;
                          })
                        : null}
                      {/* unsaved new draft */}
                      {draftBookingSlot && (rows === "device" ? draftBookingSlot.deviceId === row.id : draftBookingSlot.operatorId === row.id)
                        ? days.map((d, i) => {
                            const p = pos(draftBookingSlot.start, draftBookingSlot.end, i);
                            return p ? <div key={`dr-${i}`} className="pointer-events-none absolute inset-y-0.5 z-20 rounded border-2 border-dashed border-black bg-white/60" style={p} /> : null;
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {draft ? (
          <BookingPanel
            key={draft.id ?? `new-${draft.start}-${draft.deviceId}-${draft.operatorId}`}
            data={data}
            ctx={ctx}
            draft={draft}
            note={draftNote}
            onChange={setDraft}
            onClose={() => {
              setDraft(null);
              setDraftNote(null);
            }}
            onSaved={(msg, tone) => {
              setDraft(null);
              setDraftNote(null);
              setSlotSel(null);
              setToast({ text: msg, tone });
              router.refresh();
            }}
          />
        ) : slotSel ? (
          <SlotPanel
            slot={slotSel}
            ctx={ctx}
            deviceCode={devCode(slotSel.deviceId)}
            onClose={() => setSlotSel(null)}
            onPick={(cand) => {
              const firstTask = data.tasks.find((t) => t.active)?.id ?? "";
              const segs = cand
                ? cand.tasks.map((t) => ({ taskId: t.taskId, plannedMinutes: t.minutes }))
                : slotSel.segments.map((m) => ({ taskId: firstTask, plannedMinutes: m }));
              setDraft({
                deviceId: slotSel.deviceId,
                operatorId: cand?.operatorId ?? "",
                start: slotSel.start,
                end: slotSel.end,
                status: "planned",
                notes: "",
                segments: segs,
                powerBankIds: [],
              });
              setDraftNote(slotSel.needsPowerBank ? "Battery will run past one charge in this slot: assign a power bank." : null);
            }}
          />
        ) : null}
      </div>

      {toast ? (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 max-w-sm rounded-md border px-3 py-2 text-sm shadow-lg",
            toast.tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : toast.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-red-300 bg-red-50 text-red-900",
          )}
        >
          {toast.text}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Default slot: {s.defaultSlotRecordingHours} h recording = {bookingLengthFor(Math.round(s.defaultSlotRecordingHours * 60), s).segments.join(" + ")} min with {s.minBreakMinutes} min breaks. Times are Asia/Colombo. Showing {days.length} day(s) from {fmtDay(days[0])}.
      </p>
    </div>
  );
}
