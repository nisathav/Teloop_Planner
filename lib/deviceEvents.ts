import "server-only";
import { prisma } from "./db";
import { bookingInclude, toBookingLite } from "./data";
import { buildDeviceTimeline } from "./rules/timeline";
import type { Settings } from "./rules/types";

/**
 * Recreates the automatic handoff / offload / charge events for a device from its bookings.
 * Manual events are kept; an auto event is skipped when a manual event of the same type overlaps it
 * (that is how an admin "edits" an auto buffer). "done" ticks survive regeneration.
 */
export async function regenerateDeviceEvents(deviceId: string, settings: Settings) {
  const [bookings, existing] = await Promise.all([
    prisma.booking.findMany({ where: { deviceId, status: { notIn: ["cancelled", "no-show"] } }, include: bookingInclude }),
    prisma.deviceEvent.findMany({ where: { deviceId } }),
  ]);
  const manual = existing.filter((e) => !e.auto);
  const doneKeys = new Set(existing.filter((e) => e.auto && e.done).map((e) => `${e.type}|${e.start.getTime()}`));
  const tl = buildDeviceTimeline(deviceId, bookings.map(toBookingLite), settings);
  const data = tl.items
    .filter((it) => it.auto && (it.kind === "handoff" || it.kind === "offload" || it.kind === "charge"))
    .filter((it) => !manual.some((m) => m.type === it.kind && m.start.getTime() < it.end && it.start < m.end.getTime()))
    .map((it) => ({
      deviceId,
      type: it.kind,
      start: new Date(it.start),
      end: new Date(it.end),
      auto: true,
      bookingId: it.bookingId ?? null,
      done: doneKeys.has(`${it.kind}|${it.start}`),
    }));
  await prisma.$transaction([prisma.deviceEvent.deleteMany({ where: { deviceId, auto: true } }), prisma.deviceEvent.createMany({ data })]);
}
