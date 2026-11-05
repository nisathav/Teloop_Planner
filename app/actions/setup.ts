"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { atColombo, dayKey } from "@/lib/rules/time";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------- Tasks ----------
export async function saveTask(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const data = {
    name: str(form, "name") || "Task",
    description: str(form, "description"),
    targetHours: numOrNull(form, "targetHours") ?? 0,
    perPersonCapHours: numOrNull(form, "perPersonCapHours"),
    requirements: str(form, "requirements"),
    active: form.get("active") != null,
  };
  if (id) await prisma.task.update({ where: { id }, data });
  else await prisma.task.create({ data: { ...data, active: true, projectId: str(form, "projectId") } });
  revalidatePath("/", "layout");
}

export async function deleteTask(id: string) {
  await requireAdmin();
  const used = await prisma.segment.count({ where: { taskId: id } });
  if (used > 0) {
    await prisma.task.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.task.delete({ where: { id } });
  }
  revalidatePath("/", "layout");
}

// ---------- Devices ----------
export async function addDevices(form: FormData) {
  await requireAdmin();
  const count = Math.max(1, Math.min(100, Number(form.get("count")) || 1));
  const prefix = str(form, "prefix") || "DEV-";
  const existing = await prisma.device.findMany({ select: { code: true } });
  const nums = existing.map((d) => Number(d.code.replace(prefix, ""))).filter((n) => Number.isFinite(n));
  let next = (nums.length ? Math.max(...nums) : 0) + 1;
  const codes = new Set(existing.map((d) => d.code));
  for (let i = 0; i < count; i++) {
    let code = `${prefix}${String(next).padStart(2, "0")}`;
    while (codes.has(code)) code = `${prefix}${String(++next).padStart(2, "0")}`;
    codes.add(code);
    await prisma.device.create({ data: { code } });
    next++;
  }
  revalidatePath("/", "layout");
}

export async function updateDevice(form: FormData) {
  await requireAdmin();
  await prisma.device.update({ where: { id: str(form, "id") }, data: { status: str(form, "status"), notes: str(form, "notes"), code: str(form, "code") || undefined } });
  revalidatePath("/", "layout");
}

export async function setDeviceStatus(id: string, status: string) {
  await requireAdmin();
  await prisma.device.update({ where: { id }, data: { status } });
  revalidatePath("/", "layout");
}

export async function addDeviceEvent(form: FormData) {
  await requireAdmin();
  const day = str(form, "day") || dayKey(Date.now());
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  await prisma.deviceEvent.create({
    data: {
      deviceId: str(form, "deviceId"),
      type: str(form, "type") || "maintenance",
      start: new Date(atColombo(day, toMin(str(form, "start") || "06:00"))),
      end: new Date(atColombo(day, toMin(str(form, "end") || "07:00"))),
      note: str(form, "note"),
      auto: false,
    },
  });
  revalidatePath("/", "layout");
}

/** Editing an auto buffer turns it into a manual event (kept across regeneration). */
export async function updateDeviceEvent(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const ev = await prisma.deviceEvent.findUniqueOrThrow({ where: { id } });
  const day = dayKey(ev.start.getTime());
  const toMin = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  await prisma.deviceEvent.update({
    where: { id },
    data: {
      start: new Date(atColombo(day, toMin(str(form, "start")))),
      end: new Date(atColombo(day, toMin(str(form, "end")))),
      note: str(form, "note"),
      auto: false,
    },
  });
  revalidatePath("/", "layout");
}

export async function deleteDeviceEvent(id: string) {
  await requireAdmin();
  await prisma.deviceEvent.delete({ where: { id } });
  revalidatePath("/", "layout");
}

export async function setEventDone(id: string, done: boolean) {
  await requireAdmin();
  await prisma.deviceEvent.update({ where: { id }, data: { done } });
  revalidatePath("/", "layout");
}

// ---------- Power banks ----------
export async function addPowerBanks(form: FormData) {
  await requireAdmin();
  const count = Math.max(1, Math.min(100, Number(form.get("count")) || 1));
  const existing = await prisma.powerBank.findMany({ select: { code: true } });
  const codes = new Set(existing.map((d) => d.code));
  let n = existing.length + 1;
  for (let i = 0; i < count; i++) {
    let code = `PB-${String(n).padStart(2, "0")}`;
    while (codes.has(code)) code = `PB-${String(++n).padStart(2, "0")}`;
    codes.add(code);
    await prisma.powerBank.create({ data: { code } });
    n++;
  }
  revalidatePath("/", "layout");
}

export async function updatePowerBank(form: FormData) {
  await requireAdmin();
  const deviceId = str(form, "deviceId");
  await prisma.powerBank.update({ where: { id: str(form, "id") }, data: { status: str(form, "status"), deviceId: deviceId || null } });
  revalidatePath("/", "layout");
}

export async function deletePowerBank(id: string) {
  await requireAdmin();
  await prisma.powerBank.delete({ where: { id } });
  revalidatePath("/", "layout");
}

// ---------- Operators ----------
export async function saveOperator(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const supported = form.getAll("supportedTasks").map(String).filter(Boolean);
  const extra = str(form, "supportedOther");
  const data = {
    name: str(form, "name") || "Operator",
    phone: str(form, "phone"),
    area: str(form, "area"),
    address: str(form, "address"),
    householdNotes: str(form, "householdNotes"),
    supportedTasks: [...supported, ...extra.split(",").map((x) => x.trim()).filter(Boolean)].join(", "),
    status: str(form, "status") || "active",
  };
  if (id) await prisma.operator.update({ where: { id }, data });
  else await prisma.operator.create({ data });
  revalidatePath("/", "layout");
}

export async function deleteOperator(id: string) {
  await requireAdmin();
  const n = await prisma.booking.count({ where: { operatorId: id } });
  if (n > 0) await prisma.operator.update({ where: { id }, data: { status: "inactive" } });
  else await prisma.operator.delete({ where: { id } });
  revalidatePath("/", "layout");
}
