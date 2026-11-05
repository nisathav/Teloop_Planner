import "server-only";
import type { Project } from "@prisma/client";
import { prisma } from "./db";
import { bookingInclude, toBookingLite } from "./data";
import { committedMinutes, plannedMinutes, recordedMinutes, taskCapMinutes } from "./rules/bookings";
import { dayKey } from "./rules/time";

export interface OperatorStats {
  operatorId: string;
  name: string;
  status: string;
  area: string;
  /** Recorded minutes in the current project (logged actuals only). */
  projectRecorded: number;
  projectPlanned: number;
  byTask: Record<string, { recorded: number; planned: number; capLeft: number }>;
  today: number;
  /** All-project earnings (LKR) = actual hours × each project's rate. */
  earnings: number;
  paid: number;
  owed: number;
  bookings: number;
}

export async function loadOperatorStats(project: Project | null, operatorId?: string): Promise<OperatorStats[]> {
  const [operators, bookings, payments, projects, tasks] = await Promise.all([
    prisma.operator.findMany({ where: operatorId ? { id: operatorId } : undefined, orderBy: { name: "asc" } }),
    prisma.booking.findMany({ where: operatorId ? { operatorId } : undefined, include: bookingInclude }),
    prisma.payment.groupBy({ by: ["operatorId"], _sum: { amount: true }, where: operatorId ? { operatorId } : undefined }),
    prisma.project.findMany({ select: { id: true, payRatePerHour: true } }),
    project ? prisma.task.findMany({ where: { projectId: project.id } }) : Promise.resolve([]),
  ]);
  const rate = new Map(projects.map((p) => [p.id, p.payRatePerHour]));
  const today = dayKey(Date.now());
  const settings = project ? { maxHoursPerOperatorPerTask: project.maxHoursPerOperatorPerTask } : { maxHoursPerOperatorPerTask: 5 };

  return operators.map((o) => {
    const mine = bookings.filter((b) => b.operatorId === o.id).map(toBookingLite);
    const proj = project ? mine.filter((b) => b.projectId === project.id) : [];
    const byTask: OperatorStats["byTask"] = {};
    for (const t of tasks) {
      const rec = proj.reduce((s, b) => s + recordedMinutes(b, t.id), 0);
      const pl = proj.reduce((s, b) => s + plannedMinutes(b, t.id), 0);
      const cap = taskCapMinutes(t, settings);
      byTask[t.id] = { recorded: rec, planned: pl, capLeft: Math.max(0, cap - proj.reduce((s, b) => s + committedMinutes(b, t.id), 0)) };
    }
    const earnings = mine.reduce((s, b) => s + (recordedMinutes(b) / 60) * (rate.get(b.projectId!) ?? 0), 0);
    const paid = payments.find((p) => p.operatorId === o.id)?._sum.amount ?? 0;
    return {
      operatorId: o.id,
      name: o.name,
      status: o.status,
      area: o.area,
      projectRecorded: proj.reduce((s, b) => s + recordedMinutes(b), 0),
      projectPlanned: proj.reduce((s, b) => s + plannedMinutes(b), 0),
      byTask,
      today: mine.filter((b) => dayKey(b.start) === today).reduce((s, b) => s + committedMinutes(b), 0),
      earnings,
      paid,
      owed: Math.max(0, earnings - paid),
      bookings: proj.length,
    };
  });
}
