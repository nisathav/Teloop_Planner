"use client";
import { useState, useTransition } from "react";
import { logSession, setBookingStatus } from "@/app/actions/bookings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type B = {
  id: string;
  start: number;
  end: number;
  status: string;
  notes: string;
  device: string;
  operator: string;
  segments: { id: string; task: string; planned: number; actual: number | null }[];
};

export function LogRow({ b, highlight }: { b: B; highlight?: boolean }) {
  const [vals, setVals] = useState(() => b.segments.map((s) => s.actual ?? s.planned));
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const total = vals.reduce((a, x) => a + (Number(x) || 0), 0);

  return (
    <Card className={cn(highlight && "ring-2 ring-blue-500", saved && "opacity-60")}>
      <CardContent className="flex flex-wrap items-center gap-3 pt-3">
        <div className="w-44">
          <div className="text-sm font-medium">
            {fmtDateTime(b.start)}–{fmtTime(b.end)}
          </div>
          <div className="text-xs text-muted-foreground">
            {b.device} · {b.operator}
          </div>
          <StatusBadge status={b.status} />
        </div>
        <form
          className="flex flex-1 flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              await logSession(
                b.id,
                b.segments.map((s, i) => ({ segmentId: s.id, actualMinutes: Number(vals[i]) || 0 })),
              );
              setSaved(true);
            });
          }}
        >
          {b.segments.map((s, i) => (
            <label key={s.id} className="text-xs">
              <span className="block text-muted-foreground">
                {s.task} <span className="opacity-70">(plan {s.planned})</span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={vals[i]}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setVals((v) => v.map((x, k) => (k === i ? Number(e.target.value) : x)))}
                className={cn("h-9 w-20 rounded-md border px-2 text-right text-sm", vals[i] !== s.planned && "border-amber-500 bg-amber-50")}
              />
            </label>
          ))}
          <span className="pb-2 text-xs text-muted-foreground">= {(total / 60).toFixed(2)} h</span>
          <Button type="submit" disabled={pending} size="sm">
            {saved ? "Saved ✓" : pending ? "Saving…" : "Save"}
          </Button>
          {b.status !== "completed" ? (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { await setBookingStatus(b.id, "no-show"); setSaved(true); })}>
              No-show
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
