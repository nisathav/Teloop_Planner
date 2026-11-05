"use client";
import { useMemo, useState } from "react";
import { computeCapacity } from "@/lib/rules/capacity";
import { hm } from "@/lib/rules/time";
import type { Settings } from "@/lib/rules/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { lkr } from "@/lib/format";
import { cn } from "@/lib/utils";

type TaskIn = { name: string; targetHours: number; perPersonCapHours: number | null };

function Slider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">
          <input type="number" value={value} min={min} step={step} onChange={(e) => onChange(Number(e.target.value) || min)} className="w-16 rounded border px-1 text-right" /> {suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-blue-700" />
    </label>
  );
}

const KIND_STYLE: Record<string, string> = {
  booking: "bg-blue-600",
  handoff: "bg-amber-400 hatch",
  offload: "bg-violet-500 hatch",
  charge: "bg-emerald-500 hatch",
};

export function CapacityPlanner({ settings, targetHours, days: d0, devices: n0, tasks }: { settings: Settings; targetHours: number; days: number; devices: number; tasks: TaskIn[] }) {
  const [target, setTarget] = useState(targetHours);
  const [devices, setDevices] = useState(n0);
  const [days, setDays] = useState(d0);
  const [slot, setSlot] = useState(settings.defaultSlotRecordingHours);
  const [handoff, setHandoff] = useState(settings.handoffMinutes);
  const [winEnd, setWinEnd] = useState(settings.windowEndMinutes);
  const [taskCount, setTaskCount] = useState(Math.max(1, tasks.length || 4));
  const [tpo, setTpo] = useState(3);
  const [useProjectTasks, setUseProjectTasks] = useState(tasks.length > 0);

  const s = useMemo(() => {
    // When the window is extended, let max active hours grow with it (otherwise the window change has no effect).
    const win = (winEnd - settings.windowStartMinutes) / 60;
    const maxActive = winEnd > settings.windowEndMinutes ? Math.max(settings.deviceMaxActiveHours, win) : settings.deviceMaxActiveHours;
    return { ...settings, handoffMinutes: handoff, windowEndMinutes: winEnd, deviceMaxActiveHours: maxActive };
  }, [settings, handoff, winEnd]);
  const scaledTasks = useMemo(() => {
    const sum = tasks.reduce((a, t) => a + t.targetHours, 0) || 1;
    return tasks.map((t) => ({ ...t, targetHours: (t.targetHours / sum) * target }));
  }, [tasks, target]);
  const r = useMemo(
    () =>
      computeCapacity({
        targetHours: target,
        days,
        devices,
        slotRecordingHours: slot,
        settings: s,
        tasks: useProjectTasks ? scaledTasks : [],
        taskCount,
        tasksPerOperator: tpo,
      }),
    [target, days, devices, slot, s, useProjectTasks, scaledTasks, taskCount, tpo],
  );
  const changed = handoff !== settings.handoffMinutes || winEnd !== settings.windowEndMinutes;

  const span = settings.windowStartMinutes;
  const width = Math.max(1, winEnd - span);

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
          <CardDescription>Start from the project; drag to explore.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Slider label="Target hours" value={target} min={10} max={5000} step={10} onChange={setTarget} suffix="h" />
          <Slider label="Devices" value={devices} min={1} max={60} step={1} onChange={setDevices} />
          <Slider label="Days" value={days} min={1} max={60} step={1} onChange={setDays} />
          <Slider label="Slot length (recording)" value={slot} min={0.5} max={8} step={0.5} onChange={setSlot} suffix="h" />
          <details className="rounded-md border p-2 text-sm">
            <summary className="cursor-pointer font-medium">More what-ifs</summary>
            <div className="mt-3 space-y-4">
              <Slider label="Handoff buffer" value={handoff} min={0} max={120} step={5} onChange={setHandoff} suffix="min" />
              <Slider label={`Window end (${hm(winEnd)})`} value={winEnd / 60} min={(settings.windowStartMinutes + 60) / 60} max={24} step={0.5} onChange={(v) => setWinEnd(Math.round(v * 60))} suffix="h" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useProjectTasks} disabled={tasks.length === 0} onChange={(e) => setUseProjectTasks(e.target.checked)} /> Use project task split ({tasks.length} tasks)
              </label>
              {!useProjectTasks ? <Slider label="Number of tasks (even split)" value={taskCount} min={1} max={20} step={1} onChange={setTaskCount} /> : null}
              <Slider label="Tasks a typical operator does" value={tpo} min={1} max={10} step={1} onChange={setTpo} />
            </div>
          </details>
          <p className="text-xs text-muted-foreground">
            Uses settings: window {hm(settings.windowStartMinutes)}–{hm(winEnd)}, max active {s.deviceMaxActiveHours} h, handoff {handoff} min, offload {settings.offloadMinutes} min ({settings.offloadTrigger.replaceAll("_", " ")}), segments ≤ {settings.maxContinuousMinutes} min with {settings.minBreakMinutes} min breaks.
            {changed ? " (What-if values differ from saved settings.)" : ""}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className={cn("border-2", r.feasible ? "border-emerald-500" : "border-red-500")}>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className={cn("rounded-md px-3 py-1.5 text-lg font-bold", r.feasible ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>
                {r.feasible ? "Feasible" : "Not feasible"}
              </div>
              <div className="text-sm">
                Achievable <b>{Math.round(r.achievable).toLocaleString()} h</b> of {target.toLocaleString()} h with {devices} devices in {days} days
                {r.feasible ? <> · <b>{Math.round(r.achievable - target)} h</b> slack</> : <> · short by <b className="text-red-700">{Math.round(r.shortfall)} h</b></>}
              </div>
            </div>
            {!r.feasible ? (
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <li className="rounded border bg-white p-2">
                  <b>{r.fixes.extraDevices}</b> more devices ({r.fixes.devicesNeeded} total)
                </li>
                <li className="rounded border bg-white p-2">
                  <b>{r.fixes.extraDays}</b> more days ({r.fixes.daysNeeded} total)
                </li>
                <li className="rounded border bg-white p-2">
                  <b>+{r.fixes.extraHoursPerDevicePerDay.toFixed(1)} h</b> recording per device per day (shorter buffers or longer window)
                </li>
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Needed per day", `${r.neededPerDay.toFixed(1)} h`, `fleet-wide`],
            ["Needed per device / day", `${r.neededPerDevicePerDay.toFixed(1)} h`, `vs ${r.recordingPerDevicePerDay.toFixed(1)} h achievable`],
            ["Bookings per device / day", `${r.slotsPerDevicePerDay}`, `${(r.bookingMinutes / 60).toFixed(2)} h each · ${r.bookingsNeeded} bookings total`],
            ["Operator cost", lkr(r.cost), `${target} h × ${lkr(settings.payRatePerHour)}`],
          ].map(([k, v, sub]) => (
            <Card key={k}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="text-xl font-semibold">{v}</div>
                <div className="text-xs text-muted-foreground">{sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>One device-day</CardTitle>
            <CardDescription>
              {r.slotsPerDevicePerDay} × {slot} h recording ({r.segments.map((m) => `${m} min`).join(" + ")} with breaks) · device active {r.deviceActivePerDay.toFixed(2)} h of max {s.deviceMaxActiveHours} h
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative h-8 w-full overflow-hidden rounded bg-red-100 idle-red">
              {r.daySchedule.map((it, i) => (
                <div
                  key={i}
                  title={`${it.kind} ${hm(it.startMin)}–${hm(it.endMin)}`}
                  className={cn("absolute inset-y-0 border-r border-white/60", KIND_STYLE[it.kind] ?? "bg-slate-400")}
                  style={{ left: `${((it.startMin - span) / width) * 100}%`, width: `${((it.endMin - it.startMin) / width) * 100}%` }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{hm(span)}</span>
              <span>{hm(winEnd)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              {Object.entries(KIND_STYLE).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={cn("inline-block h-3 w-4 rounded-sm", c)} /> {k === "booking" ? "recording booking" : k}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <span className="idle-red inline-block h-3 w-4 rounded-sm" /> idle
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operators to recruit</CardTitle>
            <CardDescription>
              Absolute minimum <b>{r.operators.absoluteMinimum}</b> (limited by {r.operators.limitingFactor}) · plan for <b>{r.operators.planFor}</b> if people do about {tpo} task{tpo > 1 ? "s" : ""} each
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Task</Th>
                  <Th className="text-right">Target</Th>
                  <Th className="text-right">Cap / person</Th>
                  <Th className="text-right">Min operators</Th>
                </tr>
              </thead>
              <tbody>
                {r.operators.perTask.map((t) => (
                  <tr key={t.name}>
                    <Td>{t.name}</Td>
                    <Td className="text-right">{t.targetHours.toFixed(0)} h</Td>
                    <Td className="text-right">{t.capHours} h</Td>
                    <Td className="text-right font-medium">{t.minOperators}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
