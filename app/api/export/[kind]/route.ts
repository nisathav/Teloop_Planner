import { NextResponse, type NextRequest } from "next/server";
import { getRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentProject, toBookingLite, toTaskLite } from "@/lib/data";
import { payroll } from "@/lib/payroll";
import { loadOperatorStats } from "@/lib/operatorStats";
import { taskProgress } from "@/lib/rules/metrics";
import { elapsedFraction } from "@/lib/projectData";
import { dayKey, clock } from "@/lib/rules/time";
import { toCsv, toXlsx, type Sheet } from "@/lib/exporter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  if ((await getRole()) !== "admin") return new NextResponse("Unauthorised", { status: 401 });
  const { kind } = await params;
  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const p = await getCurrentProject();
  if (!p) return new NextResponse("No project", { status: 400 });

  const sheets: Sheet[] = [];
  const want = (k: string) => kind === k || kind === "all";

  if (want("bookings")) {
    const bs = await prisma.booking.findMany({
      where: { projectId: p.id },
      include: { operator: true, device: true, segments: { include: { task: true }, orderBy: { order: "asc" } }, powerBanks: { include: { powerBank: true } } },
      orderBy: { start: "asc" },
    });
    sheets.push({
      name: "Bookings",
      columns: ["Booking ID", "Date", "Start", "End", "Device", "Operator", "Status", "Task", "Segment #", "Planned min", "Actual min", "Power banks", "Notes"],
      rows: bs.flatMap((b) =>
        (b.segments.length ? b.segments : [null]).map((s, i) => [
          b.id,
          dayKey(b.start.getTime()),
          clock(b.start.getTime()),
          clock(b.end.getTime()),
          b.device.code,
          b.operator.name,
          b.status,
          s?.task.name ?? "",
          s ? i + 1 : null,
          s?.plannedMinutes ?? null,
          s?.actualMinutes ?? null,
          b.powerBanks.map((x) => x.powerBank.code).join(" "),
          b.notes,
        ]),
      ),
    });
  }

  if (want("operator-hours")) {
    const [stats, tasks] = await Promise.all([loadOperatorStats(p), prisma.task.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "asc" } })]);
    sheets.push({
      name: "Operator hours",
      columns: ["Operator", "Status", "Area", "Recorded h (project)", "Planned h", ...tasks.map((t) => `${t.name} h`), ...tasks.map((t) => `${t.name} cap left h`), "Earnings LKR (all projects)", "Paid LKR", "Owed LKR"],
      rows: stats.map((s) => [
        s.name,
        s.status,
        s.area,
        +(s.projectRecorded / 60).toFixed(2),
        +(s.projectPlanned / 60).toFixed(2),
        ...tasks.map((t) => +((s.byTask[t.id]?.recorded ?? 0) / 60).toFixed(2)),
        ...tasks.map((t) => +((s.byTask[t.id]?.capLeft ?? 0) / 60).toFixed(2)),
        Math.round(s.earnings),
        Math.round(s.paid),
        Math.round(s.owed),
      ]),
    });
  }

  if (want("task-progress")) {
    const [tasks, bookings] = await Promise.all([
      prisma.task.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "asc" } }),
      prisma.booking.findMany({ where: { projectId: p.id }, include: { segments: true, powerBanks: true } }),
    ]);
    const tp = taskProgress(tasks.map(toTaskLite), bookings.map(toBookingLite), p.maxHoursPerOperatorPerTask, elapsedFraction(p));
    sheets.push({
      name: "Task progress",
      columns: ["Task", "Target h", "Cap / person h", "Recorded h", "Planned h", "Remaining h", "Operators still needed", "Behind"],
      rows: tp.map((t) => [t.name, t.target, t.capHours, +t.recorded.toFixed(2), +t.planned.toFixed(2), +t.remaining.toFixed(2), t.operatorsNeeded, t.behind ? "yes" : "no"]),
    });
  }

  if (want("payments")) {
    const from = req.nextUrl.searchParams.get("from") ?? dayKey(p.startDate.getTime());
    const to = req.nextUrl.searchParams.get("to") ?? dayKey(Date.now());
    const { list, payments, rate } = await payroll(p.id, from, to);
    sheets.push({
      name: "Owed",
      columns: ["Operator", "Phone", "Sessions", "Hours", `Rate LKR`, "Amount LKR", "Paid LKR", "Owed LKR", "From", "To"],
      rows: list.map((r) => [r.name, r.phone, r.sessions, +r.hours.toFixed(2), rate, Math.round(r.amount), Math.round(r.paid), Math.round(r.owed), from, to]),
    });
    sheets.push({
      name: "Payments",
      columns: ["Paid at", "Operator", "Period start", "Period end", "Hours", "Amount LKR", "Reference"],
      rows: payments.map((x) => [dayKey(x.paidAt.getTime()), x.operator.name, dayKey(x.periodStart.getTime()), dayKey(x.periodEnd.getTime() - 1), x.hours, x.amount, x.reference]),
    });
  }

  if (!sheets.length) return new NextResponse("Unknown export", { status: 404 });
  const base = `${p.name.replace(/[^\w-]+/g, "_")}_${kind}_${dayKey(Date.now())}`;
  if (format === "xlsx") {
    const buf = await toXlsx(sheets);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  return new NextResponse(toCsv(sheets[0]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
