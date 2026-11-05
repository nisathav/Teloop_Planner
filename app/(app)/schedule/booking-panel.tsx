"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
import { validateBooking } from "@/lib/rules/validate";
import { isOccupying } from "@/lib/rules/bookings";
import { atColombo, clock, dayKey, minuteOfDay } from "@/lib/rules/time";
import type { ValidationContext } from "@/lib/rules/types";
import { deleteBooking, saveBooking } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { BOOKING_STATUSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { BoardData, Draft } from "./types";

const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (ms: number) => clock(ms);

export function BookingPanel({
  data,
  ctx,
  draft,
  note,
  onChange,
  onClose,
  onSaved,
}: {
  data: BoardData;
  ctx: ValidationContext;
  draft: Draft;
  note: string | null;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSaved: (msg: string, tone: "ok" | "warn" | "err") => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ro = data.readOnly;

  const results = useMemo(() => (draft.deviceId && draft.operatorId ? validateBooking(draft, ctx) : []), [draft, ctx]);
  const blocks = results.filter((r) => r.level === "block");
  const day = dayKey(draft.start);
  const durMin = Math.round((draft.end - draft.start) / 60000);
  const segTotal = draft.segments.reduce((s, x) => s + x.plannedMinutes, 0);

  const pbInUse = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of ctx.bookings) {
      if (b.id === draft.id || !isOccupying(b) || !(b.start < draft.end && draft.start < b.end)) continue;
      for (const pb of b.powerBankIds) m.set(pb, data.devices.find((d) => d.id === b.deviceId)?.code ?? "another device");
    }
    return m;
  }, [ctx.bookings, draft, data.devices]);

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setTime = (which: "start" | "end", v: string) => {
    if (!v) return;
    const ms = atColombo(day, toMin(v));
    if (which === "start") {
      const len = draft.end - draft.start;
      set({ start: ms, end: ms + len });
    } else set({ end: ms > draft.start ? ms : draft.start + 15 * 60000 });
  };
  const setDay = (v: string) => {
    if (!v) return;
    set({ start: atColombo(v, minuteOfDay(draft.start)), end: atColombo(v, minuteOfDay(draft.start)) + (draft.end - draft.start) });
  };
  const setSeg = (i: number, patch: Partial<Draft["segments"][number]>) => set({ segments: draft.segments.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  function applySuggestion(i: number, parts: number[]) {
    const seg = draft.segments[i];
    const segs = [...draft.segments.slice(0, i), ...parts.map((m) => ({ taskId: seg.taskId, plannedMinutes: m })), ...draft.segments.slice(i + 1)];
    const needed = segs.reduce((s, x) => s + x.plannedMinutes, 0) + (segs.length - 1) * data.settings.minBreakMinutes;
    set({ segments: segs, end: Math.max(draft.end, draft.start + needed * 60000) });
  }

  function save() {
    setError(null);
    start(async () => {
      const r = await saveBooking({ ...draft, overrideReason: reason || undefined });
      if (!r.ok) {
        setError(r.error ?? "Could not save");
        return;
      }
      const w = r.results.filter((x) => x.level === "warn").length;
      const o = r.results.filter((x) => x.level === "block").length;
      onSaved(`Booking saved${o ? ` with ${o} override(s) logged` : ""}${w ? `, ${w} warning(s)` : ""}.`, o || w ? "warn" : "ok");
    });
  }

  function remove() {
    if (!draft.id || !confirm("Delete this booking? (Use status 'cancelled' to keep a record.)")) return;
    start(async () => {
      await deleteBooking(draft.id!);
      onSaved("Booking deleted.", "ok");
    });
  }

  const op = data.operators.find((o) => o.id === draft.operatorId);

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] w-full overflow-y-auto rounded-t-xl border bg-white p-4 shadow-2xl md:static md:max-h-none md:w-[380px] md:shrink-0 md:rounded-lg md:shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{draft.id ? "Booking" : "New booking"}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
      {note ? <p className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{note}</p> : null}

      <fieldset disabled={ro || pending} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Device</Label>
            <Select value={draft.deviceId} onChange={(e) => set({ deviceId: e.target.value })}>
              <option value="">— choose —</option>
              {data.devices.map((d) => (
                <option key={d.id} value={d.id} disabled={d.status === "retired"}>
                  {d.code} {d.status !== "available" ? `(${d.status})` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={draft.status} onChange={(e) => set({ status: e.target.value })}>
              {BOOKING_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Operator</Label>
          <Select value={draft.operatorId} onChange={(e) => set({ operatorId: e.target.value })}>
            <option value="">— choose —</option>
            {data.operators
              .filter((o) => o.status !== "inactive" || o.id === draft.operatorId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.area ? ` · ${o.area}` : ""}
                  {o.status !== "active" ? ` (${o.status})` : ""}
                </option>
              ))}
          </Select>
          {op ? (
            <p className="text-[11px] text-muted-foreground">
              Supports: {op.supportedTasks.join(", ") || "—"}{" "}
              <Link className="text-primary underline" href={`/operators/${op.id}`}>
                profile
              </Link>
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Day</Label>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="px-1 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start</Label>
            <Input type="time" step={900} value={hhmm(draft.start)} onChange={(e) => setTime("start", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End</Label>
            <Input type="time" step={900} value={hhmm(draft.end)} onChange={(e) => setTime("end", e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Booking {(durMin / 60).toFixed(2)} h · segments {(segTotal / 60).toFixed(2)} h · breaks {durMin - segTotal} min
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Segments (one per task block)</Label>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => set({ segments: [...draft.segments, { taskId: data.tasks.find((t) => t.active)?.id ?? "", plannedMinutes: 60 }] })}
            >
              <Plus className="h-3 w-3" /> Add
            </Button>
          </div>
          {draft.segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
              <Select value={seg.taskId} onChange={(e) => setSeg(i, { taskId: e.target.value })} className="h-8 flex-1 text-xs">
                <option value="">— task —</option>
                {data.tasks
                  .filter((t) => t.active || t.id === seg.taskId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              <Input type="number" min={0} step={15} value={seg.plannedMinutes} onChange={(e) => setSeg(i, { plannedMinutes: Number(e.target.value) || 0 })} className="h-8 w-20 text-xs" />
              <span className="text-[10px] text-muted-foreground">min</span>
              {seg.actualMinutes != null ? <span className="text-[10px] text-emerald-700">act {seg.actualMinutes}</span> : null}
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => set({ segments: draft.segments.filter((_, k) => k !== i) })}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Power banks</Label>
          <div className="flex flex-wrap gap-1">
            {data.powerBanks.map((pb) => {
              const on = draft.powerBankIds.includes(pb.id);
              const used = pbInUse.get(pb.id);
              return (
                <button
                  type="button"
                  key={pb.id}
                  title={used ? `In use on ${used} at this time` : undefined}
                  onClick={() => set({ powerBankIds: on ? draft.powerBankIds.filter((x) => x !== pb.id) : [...draft.powerBankIds, pb.id] })}
                  className={cn(
                    "rounded border px-1.5 py-0.5 text-[11px]",
                    on ? "border-emerald-600 bg-emerald-600 text-white" : used ? "border-slate-200 bg-slate-100 text-slate-400 line-through" : "bg-white hover:bg-slate-50",
                  )}
                >
                  {pb.code}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </fieldset>

      <div className="mt-3 space-y-1.5">
        <Label className="text-xs">Rule check</Label>
        {!draft.deviceId || !draft.operatorId ? <p className="text-xs text-muted-foreground">Choose a device and operator.</p> : null}
        {draft.deviceId && draft.operatorId && results.length === 0 ? <p className="text-xs text-emerald-700">✓ No rule issues.</p> : null}
        {results.map((r, i) => (
          <div key={i} className={cn("rounded border px-2 py-1 text-xs", r.level === "block" ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900")}>
            <b>{r.level === "block" ? "Block" : "Warning"}</b> · {r.message}
            {r.suggestion && !ro ? (
              <Button type="button" size="xs" variant="outline" className="ml-2 h-6" onClick={() => applySuggestion(r.suggestion!.segmentIndex, r.suggestion!.parts)}>
                Split + add break
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      {!ro ? (
        <div className="mt-3 space-y-2">
          {blocks.length ? (
            <div className="space-y-1">
              <Label className="text-xs text-red-800">Override reason (required to save a blocked booking — logged)</Label>
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Operator asked for extra hours; approved by owner" />
            </div>
          ) : null}
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || !draft.deviceId || !draft.operatorId || (blocks.length > 0 && !reason.trim())} variant={blocks.length ? "destructive" : "default"}>
              {pending ? "Saving…" : blocks.length ? "Save with override" : "Save"}
            </Button>
            {draft.id ? (
              <>
                <Button variant="outline" onClick={remove} disabled={pending}>
                  Delete
                </Button>
                {draft.status === "completed" || draft.end < Date.now() ? (
                  <Link href={`/log?booking=${draft.id}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent">
                    Log session
                  </Link>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
