import "server-only";
import type { Project } from "@prisma/client";
import { prisma } from "./db";
import { bookingInclude, toBookingLite, toTaskLite } from "./data";
import { taskProgress } from "./rules/metrics";
import { DAY } from "./rules/time";

export function elapsedFraction(p: Project, now = Date.now()): number {
  const total = p.deadline.getTime() - p.startDate.getTime();
  if (total <= 0) return 1;
  return Math.max(0, Math.min(1, (now - p.startDate.getTime()) / total));
}

export function projectDays(p: Project): number {
  return Math.max(1, Math.round((p.deadline.getTime() - p.startDate.getTime()) / DAY));
}

export async function loadTaskProgress(p: Project) {
  const [tasks, bookings] = await Promise.all([
    prisma.task.findMany({ where: { projectId: p.id }, orderBy: { createdAt: "asc" } }),
    prisma.booking.findMany({ where: { projectId: p.id }, include: bookingInclude }),
  ]);
  const lites = bookings.map(toBookingLite);
  return { tasks, bookings: lites, progress: taskProgress(tasks.map(toTaskLite), lites, p.maxHoursPerOperatorPerTask, elapsedFraction(p)) };
}
