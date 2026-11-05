"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { atColombo, addDays } from "@/lib/rules/time";

export async function recordPayment(form: FormData) {
  await requireAdmin();
  const from = String(form.get("from"));
  const to = String(form.get("to"));
  await prisma.payment.create({
    data: {
      operatorId: String(form.get("operatorId")),
      projectId: String(form.get("projectId") || "") || null,
      periodStart: new Date(atColombo(from, 0)),
      periodEnd: new Date(atColombo(addDays(to, 1), 0)),
      hours: Number(form.get("hours")) || 0,
      amount: Number(form.get("amount")) || 0,
      reference: String(form.get("reference") ?? ""),
      paidAt: new Date(),
    },
  });
  revalidatePath("/", "layout");
}

export async function deletePayment(id: string) {
  await requireAdmin();
  await prisma.payment.delete({ where: { id } });
  revalidatePath("/", "layout");
}
