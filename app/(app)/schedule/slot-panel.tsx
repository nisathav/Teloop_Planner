"use client";
import { useMemo } from "react";
import { X } from "lucide-react";
import { rankOperatorsForSlot, type OpenSlot, type OperatorCandidate } from "@/lib/rules/fillGaps";
import { clock, dayKey } from "@/lib/rules/time";
import type { ValidationContext } from "@/lib/rules/types";
import { Button } from "@/components/ui/button";

export function SlotPanel({ slot, ctx, deviceCode, onClose, onPick }: { slot: OpenSlot; ctx: ValidationContext; deviceCode: string; onClose: () => void; onPick: (c: OperatorCandidate | null) => void }) {
  const ranked = useMemo(() => rankOperatorsForSlot(slot, ctx), [slot, ctx]);
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] w-full overflow-y-auto rounded-t-xl border bg-white p-4 shadow-2xl md:static md:max-h-none md:w-[380px] md:shrink-0 md:rounded-lg md:shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Open slot</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-sm">
        <b>{deviceCode}</b> · {dayKey(slot.start)} · {clock(slot.start)}–{clock(slot.end)}
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        {slot.segments.map((m) => `${m} min`).join(" + ")} recording with breaks{slot.needsPowerBank ? " · needs a power bank (battery)" : ""}. Suggestions only — nothing is booked until you save.
      </p>
      <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Ranked operators</h3>
      <ol className="space-y-2">
        {ranked.slice(0, 15).map((c, i) => (
          <li key={c.operatorId} className="rounded-md border p-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="mr-1 text-xs text-muted-foreground">#{i + 1}</span>
                <b className="text-sm">{c.name}</b> <span className="text-xs text-muted-foreground">score {c.score}</span>
              </div>
              <Button size="xs" onClick={() => onPick(c)}>
                Assign
              </Button>
            </div>
            <div className="mt-1 text-xs">{c.tasks.map((t) => `${t.taskName} ${t.minutes}m`).join(" · ")}</div>
            <ul className="mt-1 text-[11px] text-muted-foreground">
              {c.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {ranked.length === 0 ? <p className="text-sm text-muted-foreground">No active operator is free with cap and daily hours left. Recruit more operators or raise limits.</p> : null}
      <Button variant="outline" size="sm" className="mt-3" onClick={() => onPick(null)}>
        Assign manually
      </Button>
    </aside>
  );
}
