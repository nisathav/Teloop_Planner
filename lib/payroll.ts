import "server-only";
import { prisma } from "./db";
import { atColombo, addDays } from "./rules/time";

/** Owed = actual (logged) hours in completed bookings in [from, to] × project rate, minus payments already recorded for an overlapping period. */
export async function payroll(projectId: string, from: string, to: string) {
  const a = new Date(atColombo(from, 0));
  const b = new Date(atColombo(addDays(to, 1), 0));
  const [project, bookings, payments] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.booking.findMany({ where: { projectId, status: "completed", start: { gte: a, lt: b } }, include: { segments: true, operator: true } }),
    prisma.payment.findMany({ where: { projectId, periodStart: { lt: b }, periodEnd: { gt: a } }, include: { operator: true }, orderBy: { paidAt: "desc" } }),
  ]);
  const rows = new Map<string, { operatorId: string; name: string; phone: string; minutes: number; sessions: number; unlogged: number }>();
  for (const bk of bookings) {
    const r = rows.get(bk.operatorId) ?? { operatorId: bk.operatorId, name: bk.operator.name, phone: bk.operator.phone, minutes: 0, sessions: 0, unlogged: 0 };
    r.minutes += bk.segments.reduce((s, x) => s + (x.actualMinutes ?? 0), 0);
    r.sessions += 1;
    if (bk.segments.some((x) => x.actualMinutes == null)) r.unlogged += 1;
    rows.set(bk.operatorId, r);
  }
  const rate = project.payRatePerHour;
  const list = [...rows.values()]
    .map((r) => {
      const paid = payments.filter((p) => p.operatorId === r.operatorId).reduce((s, p) => s + p.amount, 0);
      const amount = (r.minutes / 60) * rate;
      return { ...r, hours: r.minutes / 60, amount, paid, owed: Math.max(0, amount - paid) };
    })
    .sort((x, y) => y.owed - x.owed || x.name.localeCompare(y.name));
  return { rate, list, payments };
}
