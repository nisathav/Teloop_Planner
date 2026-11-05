"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { PROJECT_COOKIE } from "@/lib/data";
import { atColombo, addDays, dayKey } from "@/lib/rules/time";
import { regenerateDeviceEvents } from "@/lib/deviceEvents";
import { settingsOf } from "@/lib/data";

export async function selectProject(id: string) {
  (await cookies()).set(PROJECT_COOKIE, id, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

function num(form: FormData, k: string, fallback = 0): number {
  const v = Number(form.get(k));
  return Number.isFinite(v) ? v : fallback;
}

function hmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export async function createProject(form: FormData) {
  await requireAdmin();
  const startKey = String(form.get("startDate") || dayKey(Date.now()));
  const deadlineKey = String(form.get("deadline") || addDays(startKey, 7));
  const copyFrom = String(form.get("copyFrom") || "");
  const base = copyFrom ? await prisma.project.findUnique({ where: { id: copyFrom }, include: { tasks: true } }) : null;
  const p = await prisma.project.create({
    data: {
      name: String(form.get("name") || "New project"),
      client: String(form.get("client") || ""),
      targetHours: num(form, "targetHours", 1000),
      startDate: new Date(atColombo(startKey, 0)),
      deadline: new Date(atColombo(deadlineKey, 0)),
      ...(base ? settingsOf(base) : {}),
      tasks: base ? { create: base.tasks.map((t) => ({ name: t.name, description: t.description, targetHours: t.targetHours, perPersonCapHours: t.perPersonCapHours, requirements: t.requirements })) } : undefined,
    },
  });
  await selectProject(p.id);
  revalidatePath("/", "layout");
}

export async function updateProject(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  await prisma.project.update({
    where: { id },
    data: {
      name: String(form.get("name") || "Project"),
      client: String(form.get("client") || ""),
      targetHours: num(form, "targetHours", 0),
      startDate: new Date(atColombo(String(form.get("startDate")), 0)),
      deadline: new Date(atColombo(String(form.get("deadline")), 0)),
    },
  });
  revalidatePath("/", "layout");
}

export async function setProjectStatus(id: string, status: "active" | "archived") {
  await requireAdmin();
  await prisma.project.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
}

export async function deleteProject(id: string) {
  await requireAdmin();
  const n = await prisma.booking.count({ where: { projectId: id } });
  if (n > 0) throw new Error("Project has bookings; archive it instead.");
  await prisma.project.delete({ where: { id } });
  (await cookies()).delete(PROJECT_COOKIE);
  revalidatePath("/", "layout");
}

export async function updateSettings(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id"));
  const trigger = String(form.get("offloadTrigger"));
  const p = await prisma.project.update({
    where: { id },
    data: {
      targetHours: num(form, "targetHours", 1000),
      startDate: new Date(atColombo(String(form.get("startDate")), 0)),
      deadline: new Date(atColombo(String(form.get("deadline")), 0)),
      maxHoursPerOperatorPerTask: num(form, "maxHoursPerOperatorPerTask", 5),
      dailySoftHoursPerOperator: num(form, "dailySoftHoursPerOperator", 4),
      dailyHardHoursPerOperator: num(form, "dailyHardHoursPerOperator", 6),
      maxContinuousMinutes: Math.round(num(form, "maxContinuousHours", 2) * 60),
      minBreakMinutes: Math.round(num(form, "minBreakMinutes", 15)),
      deviceRuntimeHours: num(form, "deviceRuntimeHours", 10),
      powerBanksAvailable: Math.round(num(form, "powerBanksAvailable", 10)),
      rechargeMinutes: Math.round(num(form, "rechargeMinutes", 60)),
      windowStartMinutes: hmToMin(String(form.get("windowStart") || "06:00")),
      windowEndMinutes: hmToMin(String(form.get("windowEnd") || "22:00")),
      deviceMaxActiveHours: num(form, "deviceMaxActiveHours", 16),
      offloadMinutes: Math.round(num(form, "offloadMinutes", 60)),
      offloadTrigger: ["end_of_day", "after_hours", "both"].includes(trigger) ? trigger : "end_of_day",
      offloadAfterHours: num(form, "offloadAfterHours", 8),
      handoffMinutes: Math.round(num(form, "handoffMinutes", 45)),
      payRatePerHour: num(form, "payRatePerHour", 1000),
      defaultSlotRecordingHours: num(form, "defaultSlotRecordingHours", 4),
    },
  });
  // Buffers depend on settings: rebuild automatic device events.
  const devices = await prisma.device.findMany({ select: { id: true } });
  for (const d of devices) await regenerateDeviceEvents(d.id, settingsOf(p));
  revalidatePath("/", "layout");
  redirect("/settings?saved=1");
}
