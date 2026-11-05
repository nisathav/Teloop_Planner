import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProject } from "@/lib/data";
import { prisma } from "@/lib/db";
import { loadOperatorStats } from "@/lib/operatorStats";
import { deleteOperator } from "@/app/actions/setup";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, Td, Th } from "@/components/ui/table";
import { OperatorForm } from "@/components/operator-form";
import { ActionButton } from "@/components/forms/confirm-button";
import { fmtDate, fmtDateTime, fmtDay, fmtTime, lkr } from "@/lib/format";
import { dayKey } from "@/lib/rules/time";

export default async function OperatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getCurrentProject();
  const op = await prisma.operator.findUnique({
    where: { id },
    include: {
      bookings: { orderBy: { start: "desc" }, include: { device: true, segments: { include: { task: true } }, project: true } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!op) notFound();
  const [stats] = await loadOperatorStats(p, id);
  const tasks = p ? await prisma.task.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "asc" } }) : [];

  const perDay = new Map<string, number>();
  for (const b of op.bookings) {
    if (b.status !== "completed") continue;
    const k = dayKey(b.start.getTime());
    perDay.set(k, (perDay.get(k) ?? 0) + b.segments.reduce((s, x) => s + (x.actualMinutes ?? 0), 0));
  }

  return (
    <div className="space-y-4">
      <PageHeader title={op.name} description={`${op.area || "—"} · ${op.phone || "no phone"} · joined ${fmtDate(op.joinedAt)}`}>
        <StatusBadge status={op.status} />
        <ActionButton variant="ghost" size="sm" className="text-destructive" confirm="Delete operator? (Operators with bookings are set inactive instead.)" action={deleteOperator.bind(null, op.id)}>
          Delete
        </ActionButton>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Recorded (this project)", `${((stats?.projectRecorded ?? 0) / 60).toFixed(1)} h`],
          ["Earnings (all projects)", lkr(stats?.earnings ?? 0)],
          ["Paid", lkr(stats?.paid ?? 0)],
          ["Owed", lkr(stats?.owed ?? 0)],
        ].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-lg font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hours by task {p ? `· ${p.name}` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <Th>Task</Th>
                  <Th className="text-right">Recorded</Th>
                  <Th className="text-right">Planned</Th>
                  <Th className="text-right">Cap left</Th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const s = stats?.byTask[t.id];
                  return (
                    <tr key={t.id}>
                      <Td>{t.name}</Td>
                      <Td className="text-right">{((s?.recorded ?? 0) / 60).toFixed(1)} h</Td>
                      <Td className="text-right">{((s?.planned ?? 0) / 60).toFixed(1)} h</Td>
                      <Td className={`text-right ${s && s.capLeft === 0 ? "font-medium text-red-600" : ""}`}>{((s?.capLeft ?? 0) / 60).toFixed(1)} h</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <h4 className="mb-1 mt-4 text-sm font-semibold">Recorded hours per day</h4>
            <div className="flex flex-wrap gap-2">
              {[...perDay.entries()].sort().map(([k, m]) => (
                <span key={k} className="rounded border bg-slate-50 px-2 py-1 text-xs">
                  {fmtDay(k)}: <b>{(m / 60).toFixed(1)} h</b>
                </span>
              ))}
              {perDay.size === 0 ? <span className="text-sm text-muted-foreground">No logged sessions yet.</span> : null}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <OperatorForm operator={op} taskNames={tasks.map((t) => t.name)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Booking history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Project</Th>
                <Th>Device</Th>
                <Th>Segments</Th>
                <Th>Status</Th>
                <Th className="text-right">Recorded</Th>
              </tr>
            </thead>
            <tbody>
              {op.bookings.map((b) => (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">
                    {fmtDateTime(b.start)}–{fmtTime(b.end)}
                  </Td>
                  <Td className="text-xs">{b.project.name}</Td>
                  <Td>
                    <Link className="text-primary hover:underline" href={`/devices/${b.deviceId}`}>
                      {b.device.code}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {b.segments
                      .sort((a, c) => a.order - c.order)
                      .map((s) => `${s.task.name} ${s.actualMinutes ?? s.plannedMinutes}m`)
                      .join(" · ")}
                  </Td>
                  <Td>
                    <StatusBadge status={b.status} />
                  </Td>
                  <Td className="text-right">{b.status === "completed" ? `${(b.segments.reduce((s, x) => s + (x.actualMinutes ?? 0), 0) / 60).toFixed(1)} h` : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {op.payments.length ? (
            <>
              <h4 className="mb-1 mt-4 text-sm font-semibold">Payments</h4>
              <ul className="text-sm">
                {op.payments.map((pm) => (
                  <li key={pm.id}>
                    {fmtDate(pm.paidAt)} · {lkr(pm.amount)} for {pm.hours.toFixed(1)} h ({fmtDate(pm.periodStart)}–{fmtDate(pm.periodEnd)}) · ref {pm.reference || "—"}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
