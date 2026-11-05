import { getCurrentProject, loadContext } from "@/lib/data";
import { getRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NoProject } from "@/components/no-project";
import { dayKey } from "@/lib/rules/time";
import { ScheduleBoard } from "./board";
import type { BoardData } from "./types";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; rows?: string; booking?: string }> }) {
  const sp = await searchParams;
  const p = await getCurrentProject();
  if (!p) return <NoProject />;
  const [ctx, role, banks, notes, ops] = await Promise.all([
    loadContext(p),
    getRole(),
    prisma.powerBank.findMany({ orderBy: { code: "asc" } }),
    prisma.booking.findMany({ select: { id: true, notes: true } }),
    prisma.operator.findMany({ select: { id: true, area: true } }),
  ]);
  const noteMap = new Map(notes.map((n) => [n.id, n.notes]));
  const areaMap = new Map(ops.map((o) => [o.id, o.area]));
  const now = Date.now();
  const today = dayKey(now);
  const startKey = dayKey(p.startDate.getTime());
  const defaultDate = sp.date ?? (today < startKey ? startKey : today);

  const data: BoardData = {
    settings: ctx.settings,
    project: { id: p.id, start: ctx.project.start, deadline: ctx.project.deadline },
    bookings: ctx.bookings.map((b) => ({ ...b, notes: noteMap.get(b.id) ?? "", projectId: b.projectId ?? p.id })),
    devices: ctx.devices,
    operators: ctx.operators.map((o) => ({ ...o, area: areaMap.get(o.id) ?? "" })),
    tasks: ctx.tasks,
    powerBanks: banks.map((b) => ({ id: b.id, code: b.code })),
    manualEvents: ctx.manualEvents ?? [],
    readOnly: role !== "admin",
    now,
  };
  return <ScheduleBoard data={data} date={defaultDate} view={sp.view === "week" ? "week" : "day"} rows={sp.rows === "operator" ? "operator" : "device"} openBookingId={sp.booking} />;
}
