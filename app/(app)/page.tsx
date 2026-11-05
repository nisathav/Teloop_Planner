import Link from "next/link";
import { AlertTriangle, BatteryWarning, Clock, FileWarning, ShieldAlert, TrendingDown } from "lucide-react";
import { getCurrentProject, loadContext } from "@/lib/data";
import { prisma } from "@/lib/db";
import { loadOperatorStats } from "@/lib/operatorStats";
import { elapsedFraction } from "@/lib/projectData";
import { burnUp, pace, taskProgress, recordedByDay } from "@/lib/rules/metrics";
import { buildDeviceTimeline } from "@/lib/rules/timeline";
import { addUtil, deviceDayUtilization, emptyUtil, pct, type Utilization } from "@/lib/rules/utilization";
import { addDays, clock, dayKey, dayRange } from "@/lib/rules/time";
import { isUnlogged, recordedMinutes } from "@/lib/rules/bookings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProject } from "@/components/no-project";
import { BurnUpChart, TaskBars, UtilBars } from "@/components/charts";
import { OperatorTable, type OpRow } from "@/components/operator-table";
import { fmtDay, lkr } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-2xl font-semibold tabular-nums", tone === "bad" && "text-red-700", tone === "good" && "text-emerald-700")}>{value}</div>
        {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export default async function Dashboard() {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const now = Date.now();
  const today = dayKey(now);
  const ctx = await loadContext(p);
  const s = ctx.settings;
  const projBookings = ctx.bookings.filter((b) => b.projectId === p.id);

  const [overrides, overdue, opStats] = await Promise.all([
    prisma.overrideLog.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.deviceEvent.findMany({ where: { type: "offload", done: false, end: { lt: new Date(now) } }, include: { device: true }, orderBy: { end: "asc" }, take: 20 }),
    loadOperatorStats(p),
  ]);

  // ---- headline ----
  const pc = pace(projBookings, p.targetHours, p.deadline.getTime(), now);
  const bu = burnUp(projBookings, p.startDate.getTime(), p.deadline.getTime(), p.targetHours, now).map((x) => ({ ...x, label: fmtDay(x.day) }));
  const tp = taskProgress(ctx.tasks.filter((t) => t.active), projBookings, s.maxHoursPerOperatorPerTask, elapsedFraction(p, now));
  const late = pc.projectedCompletion == null ? pc.recordedHours < p.targetHours : pc.projectedCompletion > dayKey(p.deadline.getTime() - 1);

  // ---- utilization ----
  const weekStart = (() => {
    const d = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 Sun
    return addDays(today, -((d + 6) % 7));
  })();
  const week = dayRange(weekStart, addDays(weekStart, 6));
  const devices = ctx.devices.filter((d) => d.status !== "retired" && d.status !== "maintenance");
  const perDevice = devices.map((d) => {
    const items = buildDeviceTimeline(d.id, ctx.bookings, s, ctx.manualEvents).items;
    const t = deviceDayUtilization(items, today, s);
    // Week to date: past days in full, today up to the end of its window (future days aren't lost yet).
    const w = week.filter((k) => k <= today).map((k) => deviceDayUtilization(items, k, s)).reduce(addUtil, emptyUtil());
    return { d, today: t, week: w };
  });
  const fleetToday = perDevice.map((x) => x.today).reduce(addUtil, emptyUtil());
  const fleetWeek = perDevice.map((x) => x.week).reduce(addUtil, emptyUtil());
  const toPct = (name: string, u: Utilization) => ({
    name,
    recording: pct(u.recording, u.windowMinutes),
    handoff: pct(u.handoff, u.windowMinutes),
    offload: pct(u.offload, u.windowMinutes),
    charge: pct(u.charge, u.windowMinutes),
    idle: pct(u.idle, u.windowMinutes),
  });
  const gaps = perDevice
    .flatMap((x) => x.week.idleGaps.map((g) => ({ ...g, code: x.d.code, id: x.d.id })))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  // ---- operators ----
  const opRows: OpRow[] = opStats
    .filter((o) => o.status === "active" || o.projectRecorded > 0 || o.projectPlanned > 0)
    .map((o) => ({
      id: o.operatorId,
      name: o.name,
      total: o.projectRecorded / 60,
      today: o.today / 60,
      capLeft: Object.values(o.byTask).reduce((a, x) => a + x.capLeft, 0) / 60,
      earnings: o.earnings,
      paid: o.paid,
      owed: o.owed,
      byTask: Object.fromEntries(Object.entries(o.byTask).map(([k, v]) => [k, v.recorded / 60])),
    }));
  const leaders = [...opRows].sort((a, b) => b.total - a.total).filter((x) => x.total > 0).slice(0, 5);
  const activeOps = opStats.filter((o) => o.status === "active").length;

  // ---- alerts ----
  const idleNow = perDevice.flatMap((x) => x.today.idleGaps.filter((g) => g.minutes > 120 && g.end > now).map((g) => ({ ...g, code: x.d.code })));
  const last3 = [addDays(today, -2), addDays(today, -1), today];
  const unlogged = projBookings.filter(isUnlogged);
  const pastNotLogged = projBookings.filter((b) => ["planned", "confirmed", "in-progress"].includes(b.status) && b.end < now);
  const taskAlerts = tp
    .map((t) => {
      const rec3 = projBookings.filter((b) => last3.includes(dayKey(b.start))).reduce((a, b) => a + recordedMinutes(b, t.taskId), 0) / 60 / 3;
      const projected = t.recorded + rec3 * pc.daysLeft;
      return { ...t, rec3, projected };
    })
    .filter((t) => t.target > 0 && t.projected < t.target);
  const capOverrides = overrides.filter((o) => o.rule === "operator-task-cap");
  const byDay = recordedByDay(projBookings);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <p className="text-sm text-muted-foreground">
            Will we hit {p.targetHours.toLocaleString()} h by {fmtDay(dayKey(p.deadline.getTime() - 1))}, and where are we losing device time?
          </p>
        </div>
        <div className={cn("rounded-md px-3 py-1.5 text-sm font-semibold", late ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>
          {pc.recordedHours >= p.targetHours ? "Target reached" : late ? "At risk: current pace misses the deadline" : "On track at current pace"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Recorded / target" value={`${pc.recordedHours.toFixed(1)} h`} sub={`of ${p.targetHours.toLocaleString()} h · ${pc.plannedHours.toFixed(1)} h planned`} />
        <Stat label="Complete" value={`${pc.percent.toFixed(1)}%`} sub={<div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-blue-600" style={{ width: `${Math.min(100, pc.percent)}%` }} /></div>} />
        <Stat label="Days left" value={pc.daysLeft} sub={`deadline ${fmtDay(dayKey(p.deadline.getTime() - 1))}`} />
        <Stat label="Required pace" value={`${pc.requiredPace.toFixed(1)} h/day`} sub="to hit the target" />
        <Stat label="Actual pace (3 days)" value={`${pc.actualPace3d.toFixed(1)} h/day`} tone={pc.actualPace3d >= pc.requiredPace ? "good" : "bad"} sub={pc.actualPace3d >= pc.requiredPace ? "ahead of required" : `${(pc.requiredPace - pc.actualPace3d).toFixed(1)} h/day short`} />
        <Stat label="Projected completion" value={pc.projectedCompletion ? fmtDay(pc.projectedCompletion) : "—"} tone={late ? "bad" : "good"} sub={pc.projectedCompletion ? "at 3-day pace" : "no recent recordings"} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Burn-up</CardTitle>
            <CardDescription>Cumulative recorded hours (logged actuals) vs the ideal line; dashed = recorded + planned.</CardDescription>
          </CardHeader>
          <CardContent>
            <BurnUpChart data={bu} target={p.targetHours} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Table view</summary>
              <table className="mt-1 w-full">
                <tbody>
                  {bu.map((x) => (
                    <tr key={x.day} className="border-b">
                      <td>{x.label}</td>
                      <td className="text-right">{((byDay.get(x.day) ?? 0) / 60).toFixed(1)} h that day</td>
                      <td className="text-right">{x.recorded ?? "—"} cumulative</td>
                      <td className="text-right">{x.ideal} ideal</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Task progress</CardTitle>
            <CardDescription>⚠ red = behind (recorded share below elapsed share of the project).</CardDescription>
          </CardHeader>
          <CardContent>
            <TaskBars data={tp.map((t) => ({ name: t.name, recorded: +t.recorded.toFixed(2), planned: +t.planned.toFixed(2), remaining: +t.remaining.toFixed(2), behind: t.behind }))} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Device utilization · today</CardTitle>
            <CardDescription>
              Fleet: <b className="text-base text-foreground">{pct(fleetToday.recording, fleetToday.windowMinutes).toFixed(0)}%</b> of the operating window booked for recording · idle {pct(fleetToday.idle, fleetToday.windowMinutes).toFixed(0)}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UtilBars data={perDevice.map((x) => toPct(x.d.code, x.today))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Device utilization · this week to date</CardTitle>
            <CardDescription>
              {fmtDay(week[0])}–{fmtDay(today)} · fleet <b className="text-base text-foreground">{pct(fleetWeek.recording, fleetWeek.windowMinutes).toFixed(0)}%</b> recording
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UtilBars data={perDevice.map((x) => toPct(x.d.code, x.week))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Largest idle gaps</CardTitle>
            <CardDescription>Inside the operating window, this week to date (including the rest of today).</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {gaps.map((g, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <Link className="text-primary hover:underline" href={`/schedule?date=${dayKey(g.start)}`}>
                    {g.code} · {fmtDay(dayKey(g.start))} {clock(g.start)}–{clock(g.end)}
                  </Link>
                  <span className="font-medium tabular-nums">{(g.minutes / 60).toFixed(1)} h</span>
                </li>
              ))}
              {gaps.length === 0 ? <li className="text-muted-foreground">No idle time 🎉</li> : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Operators</CardTitle>
            <CardDescription>{activeOps} active operators · hours are logged actuals for this project · click headers to sort</CardDescription>
          </CardHeader>
          <CardContent>
            <OperatorTable rows={opRows} tasks={ctx.tasks.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name }))} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {taskAlerts.map((t) => (
                <Alert key={t.taskId} icon={<TrendingDown className="h-4 w-4" />} tone="red">
                  <b>{t.name}</b> will miss its target at current pace: ~{t.projected.toFixed(0)} of {t.target} h by the deadline ({t.rec3.toFixed(1)} h/day).
                </Alert>
              ))}
              {unlogged.length + pastNotLogged.length > 0 ? (
                <Alert icon={<FileWarning className="h-4 w-4" />} tone="amber">
                  <Link href="/log" className="underline">
                    {unlogged.length + pastNotLogged.length} finished booking(s) not logged
                  </Link>{" "}
                  — they don&apos;t count as recorded yet.
                </Alert>
              ) : null}
              {overdue.length ? (
                <Alert icon={<BatteryWarning className="h-4 w-4" />} tone="amber">
                  Offloads overdue: {overdue.map((e) => `${e.device.code} (${clock(e.end.getTime())} ${fmtDay(dayKey(e.end.getTime()))})`).join(", ")}. Tick them done on{" "}
                  <Link className="underline" href="/today">Today</Link>.
                </Alert>
              ) : null}
              {idleNow.slice(0, 6).map((g, i) => (
                <Alert key={i} icon={<Clock className="h-4 w-4" />} tone="amber">
                  {g.code} idle {clock(g.start)}–{clock(g.end)} today ({(g.minutes / 60).toFixed(1)} h). <Link className="underline" href={`/schedule?date=${today}`}>Fill it</Link>
                </Alert>
              ))}
              {idleNow.length > 6 ? <p className="text-xs text-muted-foreground">+{idleNow.length - 6} more idle gaps over 2 h today.</p> : null}
              {capOverrides.map((o) => (
                <Alert key={o.id} icon={<ShieldAlert className="h-4 w-4" />} tone="blue">
                  Cap override: {o.message} <span className="italic">Reason: {o.reason}</span>
                </Alert>
              ))}
              {taskAlerts.length + unlogged.length + pastNotLogged.length + overdue.length + idleNow.length + capOverrides.length === 0 ? <p className="text-muted-foreground">No alerts.</p> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-1 text-sm">
                {leaders.map((l, i) => (
                  <li key={l.id} className="flex justify-between">
                    <span>
                      {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {l.name}
                    </span>
                    <span className="tabular-nums">
                      {l.total.toFixed(1)} h · {lkr(l.earnings)}
                    </span>
                  </li>
                ))}
                {leaders.length === 0 ? <li className="text-muted-foreground">No logged hours yet.</li> : null}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Alert({ icon, tone, children }: { icon: React.ReactNode; tone: "red" | "amber" | "blue"; children: React.ReactNode }) {
  const cls = { red: "border-red-200 bg-red-50 text-red-900", amber: "border-amber-200 bg-amber-50 text-amber-900", blue: "border-blue-200 bg-blue-50 text-blue-900" }[tone];
  return (
    <div className={cn("flex gap-2 rounded-md border px-2 py-1.5", cls)}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertTriangle className="h-4 w-4" />}</span>
      <div>{children}</div>
    </div>
  );
}
