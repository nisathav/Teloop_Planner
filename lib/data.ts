import "server-only";
import { cookies } from "next/headers";
import type { Booking, BookingPowerBank, Operator, Project, Segment, Task } from "@prisma/client";
import { prisma } from "./db";
import { parseList } from "./utils";
import type { BookingLite, OperatorLite, Settings, TaskLite, ValidationContext, OffloadTrigger } from "./rules/types";

export const PROJECT_COOKIE = "fp_project";

export async function listProjects() {
  return prisma.project.findMany({ orderBy: [{ status: "asc" }, { startDate: "desc" }] });
}

/** Current project from the top-bar cookie, falling back to the newest active project. */
export async function getCurrentProject(): Promise<Project | null> {
  const id = (await cookies()).get(PROJECT_COOKIE)?.value;
  if (id) {
    const p = await prisma.project.findUnique({ where: { id } });
    if (p) return p;
  }
  return (
    (await prisma.project.findFirst({ where: { status: "active" }, orderBy: { startDate: "desc" } })) ??
    (await prisma.project.findFirst({ orderBy: { startDate: "desc" } }))
  );
}

export function settingsOf(p: Project): Settings {
  return {
    maxHoursPerOperatorPerTask: p.maxHoursPerOperatorPerTask,
    dailySoftHoursPerOperator: p.dailySoftHoursPerOperator,
    dailyHardHoursPerOperator: p.dailyHardHoursPerOperator,
    maxContinuousMinutes: p.maxContinuousMinutes,
    minBreakMinutes: p.minBreakMinutes,
    deviceRuntimeHours: p.deviceRuntimeHours,
    powerBanksAvailable: p.powerBanksAvailable,
    rechargeMinutes: p.rechargeMinutes,
    windowStartMinutes: p.windowStartMinutes,
    windowEndMinutes: p.windowEndMinutes,
    deviceMaxActiveHours: p.deviceMaxActiveHours,
    offloadMinutes: p.offloadMinutes,
    offloadTrigger: p.offloadTrigger as OffloadTrigger,
    offloadAfterHours: p.offloadAfterHours,
    handoffMinutes: p.handoffMinutes,
    payRatePerHour: p.payRatePerHour,
    defaultSlotRecordingHours: p.defaultSlotRecordingHours,
  };
}

type BookingRow = Booking & { segments: Segment[]; powerBanks: BookingPowerBank[] };

export function toBookingLite(b: BookingRow): BookingLite {
  return {
    id: b.id,
    projectId: b.projectId,
    deviceId: b.deviceId,
    operatorId: b.operatorId,
    start: b.start.getTime(),
    end: b.end.getTime(),
    status: b.status,
    segments: [...b.segments]
      .sort((x, y) => x.order - y.order)
      .map((s) => ({ taskId: s.taskId, plannedMinutes: s.plannedMinutes, actualMinutes: s.actualMinutes })),
    powerBankIds: b.powerBanks.map((p) => p.powerBankId),
  };
}

export function toOperatorLite(o: Operator): OperatorLite {
  return { id: o.id, name: o.name, status: o.status, supportedTasks: parseList(o.supportedTasks) };
}

export function toTaskLite(t: Task): TaskLite {
  return { id: t.id, name: t.name, targetHours: t.targetHours, perPersonCapHours: t.perPersonCapHours, active: t.active };
}

export const bookingInclude = { segments: true, powerBanks: true } as const;

/** Everything the rules engine needs for the given project. Bookings span all projects (devices/operators are shared). */
export async function loadContext(project: Project): Promise<ValidationContext> {
  const [bookings, devices, operators, tasks, manual] = await Promise.all([
    prisma.booking.findMany({ where: { status: { notIn: ["cancelled"] } }, include: bookingInclude }),
    prisma.device.findMany({ orderBy: { code: "asc" } }),
    prisma.operator.findMany({ orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } }),
    prisma.deviceEvent.findMany({ where: { auto: false } }),
  ]);
  return {
    settings: settingsOf(project),
    project: { start: project.startDate.getTime(), deadline: project.deadline.getTime() },
    bookings: bookings.map(toBookingLite),
    devices: devices.map((d) => ({ id: d.id, code: d.code, status: d.status })),
    operators: operators.map(toOperatorLite),
    tasks: tasks.map(toTaskLite),
    manualEvents: manual.map((e) => ({ id: e.id, deviceId: e.deviceId, type: e.type, start: e.start.getTime(), end: e.end.getTime() })),
  };
}

export async function projectBookings(projectId: string) {
  return prisma.booking.findMany({ where: { projectId }, include: { ...bookingInclude, operator: true, device: true }, orderBy: { start: "asc" } });
}
