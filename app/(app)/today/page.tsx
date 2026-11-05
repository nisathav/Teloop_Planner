import Link from "next/link";
import { getCurrentProject } from "@/lib/data";
import { getRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { NoProject } from "@/components/no-project";
import { DAY, addDays, atColombo, dayKey } from "@/lib/rules/time";
import { fmtDay, fmtTime } from "@/lib/format";
import { StatusButtons, EventDone } from "./quick";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const { date } = await searchParams;
  const day = date ?? dayKey(Date.now());
  const d0 = new Date(atColombo(day, 0));
  const d1 = new Date(atColombo(day, 0) + DAY);
  const admin = (await getRole()) === "admin";

  const [bookings, events] = await Promise.all([
    prisma.booking.findMany({
      where: { projectId: p.id, start: { gte: d0, lt: d1 } },
      include: { operator: true, device: true, segments: { include: { task: true }, orderBy: { order: "asc" } }, powerBanks: { include: { powerBank: true } } },
      orderBy: { start: "asc" },
    }),
    prisma.deviceEvent.findMany({ where: { start: { gte: d0, lt: d1 }, type: { in: ["offload", "charge", "maintenance", "handoff"] } }, include: { device: true }, orderBy: { start: "asc" } }),
  ]);

  type Row = { at: Date; kind: "booking"; b: (typeof bookings)[number] } | { at: Date; kind: "event"; e: (typeof events)[number] };
  const rows: Row[] = [...bookings.map((b) => ({ at: b.start, kind: "booking" as const, b })), ...events.filter((e) => e.type !== "handoff").map((e) => ({ at: e.start, kind: "event" as const, e }))].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const handoffs = new Map(events.filter((e) => e.type === "handoff" && e.bookingId).map((e) => [e.bookingId!, e]));
  const pbs = bookings.flatMap((b) => b.powerBanks.map((x) => ({ code: x.powerBank.code, dev: b.device.code, op: b.operator.name, at: b.start })));
  const active = bookings.filter((b) => !["cancelled", "no-show"].includes(b.status));

  return (
    <div className="space-y-4">
      <PageHeader title={`Today · ${fmtDay(day)}`} description={`${active.length} bookings · ${events.filter((e) => e.type === "offload").length} offloads · ${events.filter((e) => e.type === "charge").length} charges · ${pbs.length} power bank assignments`}>
        <Link className="rounded-md border bg-white px-3 py-1.5 text-sm" href={`/today?date=${addDays(day, -1)}`}>
          ← Prev
        </Link>
        <Link className="rounded-md border bg-white px-3 py-1.5 text-sm" href="/today">
          Today
        </Link>
        <Link className="rounded-md border bg-white px-3 py-1.5 text-sm" href={`/today?date=${addDays(day, 1)}`}>
          Next →
        </Link>
      </PageHeader>

      {rows.length === 0 ? <Empty>Nothing scheduled for this day.</Empty> : null}

      <div className="space-y-2">
        {rows.map((r) =>
          r.kind === "booking" ? (
            <Card key={r.b.id} className={["cancelled", "no-show"].includes(r.b.status) ? "opacity-60" : ""}>
              <CardContent className="flex flex-wrap items-start gap-3 pt-3">
                <div className="w-24 shrink-0">
                  <div className="text-lg font-semibold tabular-nums">{fmtTime(r.b.start)}</div>
                  <div className="text-xs text-muted-foreground">to {fmtTime(r.b.end)}</div>
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="blue">{r.b.device.code}</Badge>→
                    <Link className="font-medium hover:underline" href={`/operators/${r.b.operatorId}`}>
                      {r.b.operator.name}
                    </Link>
                    <StatusBadge status={r.b.status} />
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {admin ? r.b.operator.address || r.b.operator.area : r.b.operator.area}{" "}
                    {admin && r.b.operator.phone ? <>· <a href={`tel:${r.b.operator.phone}`} className="underline">{r.b.operator.phone}</a></> : null}
                  </div>
                  <div className="mt-1 text-xs">
                    {r.b.segments.map((s) => `${s.task.name} ${s.plannedMinutes}m`).join(" · ")}
                    {r.b.powerBanks.length ? <> · 🔋 {r.b.powerBanks.map((x) => x.powerBank.code).join(", ")}</> : null}
                  </div>
                  {handoffs.get(r.b.id) ? <div className="mt-0.5 text-[11px] text-amber-800">Handoff / travel from {fmtTime(handoffs.get(r.b.id)!.start)}</div> : null}
                  {r.b.notes ? <div className="mt-0.5 text-xs italic">{r.b.notes}</div> : null}
                </div>
                {admin ? <StatusButtons id={r.b.id} status={r.b.status} /> : null}
              </CardContent>
            </Card>
          ) : (
            <div key={r.e.id} className="flex items-center gap-3 rounded-md border border-dashed bg-white px-3 py-2 text-sm">
              <div className="w-24 shrink-0 tabular-nums">
                {fmtTime(r.e.start)}–{fmtTime(r.e.end)}
              </div>
              <Badge tone={r.e.type === "offload" ? "violet" : r.e.type === "charge" ? "green" : "red"}>{r.e.type}</Badge>
              <span className="font-medium">{r.e.device.code}</span>
              {r.e.note ? <span className="text-xs text-muted-foreground">{r.e.note}</span> : null}
              {admin ? <EventDone id={r.e.id} done={r.e.done} /> : null}
            </div>
          ),
        )}
      </div>

      {pbs.length ? (
        <Card>
          <CardContent className="pt-3">
            <h3 className="mb-1 text-sm font-semibold">Power bank assignments</h3>
            <ul className="grid gap-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {pbs.map((x, i) => (
                <li key={i}>
                  <b>{x.code}</b> with {x.dev} → {x.op} at {fmtTime(x.at)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
