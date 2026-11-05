import { PrismaClient } from "@prisma/client";
import { generateOpenSlots, rankOperatorsForSlot } from "../lib/rules/fillGaps";
import { buildDeviceTimeline } from "../lib/rules/timeline";
import { DEFAULT_SETTINGS, type BookingLite, type ValidationContext } from "../lib/rules/types";
import { addDays, dayKey, dayRange } from "../lib/rules/time";

const prisma = new PrismaClient();
const OFFSET = 330 * 60_000; // Asia/Colombo

function colomboMidnight(d = new Date()): Date {
  const local = new Date(d.getTime() + OFFSET);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET);
}

async function main() {
  const demo = process.env.SEED_DEMO === "1" || process.argv.includes("--demo");
  const existing = await prisma.project.count();
  if (existing > 0 && !demo) {
    console.log("Seed: data already present, skipping (run `npm run db:reset` for a fresh database).");
    return;
  }

  let project = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (!project) {
    const start = colomboMidnight();
    const deadline = new Date(start.getTime() + 7 * 24 * 3600_000);
    project = await prisma.project.create({
      data: {
        name: "Household tasks – 1,000 h",
        client: "Client",
        targetHours: 1000,
        startDate: start,
        deadline,
        tasks: {
          create: [
            { name: "Cleaning", targetHours: 250, requirements: "" },
            { name: "Organizing", targetHours: 250, requirements: "" },
            { name: "Vegetable cutting", targetHours: 250, requirements: "needs kitchen" },
            { name: "Cooking", targetHours: 250, requirements: "needs kitchen" },
          ],
        },
      },
    });
    for (let i = 1; i <= 10; i++) {
      const n = String(i).padStart(2, "0");
      await prisma.device.upsert({ where: { code: `DEV-${n}` }, update: {}, create: { code: `DEV-${n}` } });
      await prisma.powerBank.upsert({ where: { code: `PB-${n}` }, update: {}, create: { code: `PB-${n}` } });
    }
    console.log(`Seed: created project "${project.name}", 4 tasks, DEV-01..10, PB-01..10.`);
  }

  if (demo && (await prisma.operator.count()) === 0) {
    const areas = ["Nugegoda", "Maharagama", "Dehiwala", "Kotte", "Battaramulla", "Kottawa", "Rajagiriya", "Boralesgamuwa"];
    const names = ["Amali Perera", "Bandara Silva", "Chathuri Fernando", "Dilini Jayasinghe", "Eranga Wickrama", "Fathima Rizvi", "Gayan Kumara", "Harini de Silva", "Ishara Gunawardena", "Janaki Ratnayake", "Kasun Herath", "Lakmini Abeysekara"];
    const taskSets = ["Cleaning, Organizing", "Cooking, Vegetable cutting", "Cleaning, Cooking, Vegetable cutting", "Organizing, Cleaning, Cooking, Vegetable cutting"];
    for (let i = 0; i < names.length; i++) {
      await prisma.operator.create({
        data: {
          name: names[i],
          phone: `07${(10000000 + i * 1234567).toString().slice(0, 8)}`,
          area: areas[i % areas.length],
          address: `${10 + i} Temple Road, ${areas[i % areas.length]}`,
          supportedTasks: taskSets[i % taskSets.length],
          status: i < 10 ? "active" : "prospect",
        },
      });
    }
    console.log("Seed: added 12 demo operators.");
  }

  if (demo && (await prisma.booking.count()) === 0) await demoBookings(project.id);
}

/** Demo only: moves the project start 3 days back and fills devices using the Fill-gaps engine. */
async function demoBookings(projectId: string) {
  const now = Date.now();
  const today = dayKey(now);
  const start = colomboMidnight(new Date(now - 3 * 86400_000));
  const project = await prisma.project.update({ where: { id: projectId }, data: { startDate: start, deadline: new Date(start.getTime() + 7 * 86400_000) } });
  const [devices, operators, tasks, banks] = await Promise.all([
    prisma.device.findMany({ orderBy: { code: "asc" } }),
    prisma.operator.findMany(),
    prisma.task.findMany({ where: { projectId } }),
    prisma.powerBank.findMany({ orderBy: { code: "asc" } }),
  ]);
  const settings = { ...DEFAULT_SETTINGS };
  const bookings: BookingLite[] = [];
  const ctx: ValidationContext = {
    settings,
    project: { start: project.startDate.getTime(), deadline: project.deadline.getTime() },
    bookings,
    devices: devices.map((d) => ({ id: d.id, code: d.code, status: d.status })),
    operators: operators.map((o) => ({ id: o.id, name: o.name, status: o.status, supportedTasks: o.supportedTasks.split(",").map((x) => x.trim()) })),
    tasks: tasks.map((t) => ({ id: t.id, name: t.name, targetHours: t.targetHours, perPersonCapHours: t.perPersonCapHours, active: t.active })),
  };
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const days = dayRange(dayKey(start.getTime()), addDays(today, 1));
  for (const day of days) {
    // Fill ~70% of slots so idle gaps are visible.
    const slots = generateOpenSlots({ devices: ctx.devices, days: [day], bookings, settings });
    for (const slot of slots) {
      if (rand() < 0.3) continue;
      const cand = rankOperatorsForSlot(slot, ctx)[0];
      if (!cand) continue;
      const past = slot.end < now;
      // leave a few recent past sessions unlogged to show the alert
      const unlogged = past && slot.end > now - 86400_000 && rand() < 0.2;
      const b: BookingLite = {
        id: `demo-${bookings.length}`,
        deviceId: slot.deviceId,
        operatorId: cand.operatorId,
        start: slot.start,
        end: slot.end,
        status: past ? (rand() < 0.08 ? "no-show" : "completed") : "planned",
        segments: cand.tasks.map((t) => ({ taskId: t.taskId, plannedMinutes: t.minutes, actualMinutes: past && !unlogged ? Math.max(0, t.minutes - Math.round(rand() * 20)) : null })),
        powerBankIds: slot.needsPowerBank ? [banks[bookings.filter((x) => x.start < slot.end && slot.start < x.end).length % banks.length].id] : [],
      };
      bookings.push(b);
    }
  }
  for (const b of bookings) {
    const unlogged = b.status === "completed" && b.segments.some((x) => x.actualMinutes == null);
    await prisma.booking.create({
      data: {
        projectId,
        deviceId: b.deviceId,
        operatorId: b.operatorId,
        start: new Date(b.start),
        end: new Date(b.end),
        status: b.status,
        loggedAt: b.status === "completed" && !unlogged ? new Date(b.end) : null,
        segments: { create: b.segments.map((s, i) => ({ taskId: s.taskId, plannedMinutes: s.plannedMinutes, actualMinutes: s.actualMinutes, order: i })) },
        powerBanks: { create: b.powerBankIds.map((powerBankId) => ({ powerBankId })) },
      },
    });
  }
  for (const d of devices) {
    const tl = buildDeviceTimeline(d.id, bookings, settings);
    const data = tl.items
      .filter((it) => it.auto)
      .map((it) => ({ deviceId: d.id, type: it.kind, start: new Date(it.start), end: new Date(it.end), auto: true, done: it.end < now - 6 * 3600_000 }));
    if (data.length) await prisma.deviceEvent.createMany({ data });
  }
  console.log(`Seed: added ${bookings.length} demo bookings over ${days.length} days.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
