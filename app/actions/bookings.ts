"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { getCurrentProject, loadContext, settingsOf } from "@/lib/data";
import { regenerateDeviceEvents } from "@/lib/deviceEvents";
import { validateBooking, hasBlocks } from "@/lib/rules/validate";
import type { RuleResult } from "@/lib/rules/types";
import { BOOKING_STATUSES } from "@/lib/constants";

export interface BookingInput {
  id?: string;
  deviceId: string;
  operatorId: string;
  start: number;
  end: number;
  status?: string;
  notes?: string;
  segments: { taskId: string; plannedMinutes: number; actualMinutes?: number | null }[];
  powerBankIds: string[];
  overrideReason?: string;
}

export type SaveResult = { ok: true; id: string; results: RuleResult[] } | { ok: false; results: RuleResult[]; error?: string };

export async function saveBooking(input: BookingInput): Promise<SaveResult> {
  await requireAdmin();
  const project = await getCurrentProject();
  if (!project) return { ok: false, results: [], error: "No project selected." };
  if (!input.deviceId || !input.operatorId) return { ok: false, results: [], error: "Choose a device and an operator." };
  const status = input.status && BOOKING_STATUSES.includes(input.status) ? input.status : "planned";

  const ctx = await loadContext(project);
  const existing = input.id ? await prisma.booking.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) return { ok: false, results: [], error: "Booking no longer exists." };

  const results = validateBooking({ ...input, status, segments: input.segments.filter((s) => s.taskId) }, ctx);
  const blocks = results.filter((r) => r.level === "block");
  const reason = input.overrideReason?.trim();
  if (hasBlocks(results) && !reason) return { ok: false, results, error: "Blocked by a rule. Enter an override reason to save anyway." };

  const segments = input.segments
    .filter((s) => s.taskId && s.plannedMinutes >= 0)
    .map((s, i) => ({ taskId: s.taskId, plannedMinutes: Math.round(s.plannedMinutes), actualMinutes: s.actualMinutes ?? null, order: i }));

  const data = {
    deviceId: input.deviceId,
    operatorId: input.operatorId,
    start: new Date(input.start),
    end: new Date(input.end),
    status,
    notes: input.notes ?? "",
  };

  const id = await prisma.$transaction(async (tx) => {
    let bookingId: string;
    if (existing) {
      await tx.booking.update({ where: { id: existing.id }, data });
      await tx.segment.deleteMany({ where: { bookingId: existing.id } });
      await tx.bookingPowerBank.deleteMany({ where: { bookingId: existing.id } });
      bookingId = existing.id;
    } else {
      bookingId = (await tx.booking.create({ data: { ...data, projectId: project.id } })).id;
    }
    if (segments.length) await tx.segment.createMany({ data: segments.map((s) => ({ ...s, bookingId })) });
    if (input.powerBankIds.length) await tx.bookingPowerBank.createMany({ data: [...new Set(input.powerBankIds)].map((powerBankId) => ({ bookingId, powerBankId })) });
    if (blocks.length && reason) {
      await tx.overrideLog.createMany({
        data: blocks.map((b) => ({ projectId: project.id, rule: b.rule, message: b.message, entityType: "booking", entityId: bookingId, reason })),
      });
    }
    return bookingId;
  });

  const s = settingsOf(project);
  await regenerateDeviceEvents(input.deviceId, s);
  if (existing && existing.deviceId !== input.deviceId) await regenerateDeviceEvents(existing.deviceId, s);
  revalidatePath("/", "layout");
  return { ok: true, id, results };
}

/** Status change without re-validation (used by Today quick buttons and the side panel). */
export async function setBookingStatus(id: string, status: string) {
  await requireAdmin();
  if (!BOOKING_STATUSES.includes(status)) throw new Error("Unknown status");
  const project = await getCurrentProject();
  const b = await prisma.booking.update({ where: { id }, data: { status } });
  // Keep device status roughly in sync.
  const deviceStatus: Record<string, string | undefined> = { confirmed: "booked", "in-progress": "in-field", completed: "available", "no-show": "available", cancelled: undefined };
  const ds = deviceStatus[status];
  if (ds) {
    const dev = await prisma.device.findUnique({ where: { id: b.deviceId } });
    if (dev && dev.status !== "maintenance" && dev.status !== "retired") await prisma.device.update({ where: { id: b.deviceId }, data: { status: ds } });
  }
  if (project) await regenerateDeviceEvents(b.deviceId, settingsOf(project));
  revalidatePath("/", "layout");
}

export async function deleteBooking(id: string) {
  await requireAdmin();
  const project = await getCurrentProject();
  const b = await prisma.booking.delete({ where: { id } });
  if (project) await regenerateDeviceEvents(b.deviceId, settingsOf(project));
  revalidatePath("/", "layout");
}

/** Log actual minutes per segment and mark the booking completed. */
export async function logSession(bookingId: string, actuals: { segmentId: string; actualMinutes: number }[], notes?: string) {
  await requireAdmin();
  const project = await getCurrentProject();
  await prisma.$transaction([
    ...actuals.map((a) => prisma.segment.update({ where: { id: a.segmentId }, data: { actualMinutes: Math.max(0, Math.round(a.actualMinutes)) } })),
    prisma.booking.update({ where: { id: bookingId }, data: { status: "completed", loggedAt: new Date(), ...(notes != null ? { notes } : {}) } }),
  ]);
  const b = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (project) await regenerateDeviceEvents(b.deviceId, settingsOf(project));
  revalidatePath("/", "layout");
}
