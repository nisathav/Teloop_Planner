"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SHARE_COOKIE, adminToken, safeEqual, shareToken } from "@/lib/session";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1", path: "/", maxAge: 60 * 60 * 24 * 30 };

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const pw = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return { error: "ADMIN_PASSWORD is not set in .env" };
  if (!safeEqual(pw, expected)) return { error: "Wrong password" };
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await adminToken(), cookieOpts);
  jar.delete(SHARE_COOKIE);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  jar.delete(SHARE_COOKIE);
  redirect("/login");
}

export async function enterShare(token: string): Promise<boolean> {
  const expected = process.env.SHARE_TOKEN ?? "";
  if (!expected || !safeEqual(token, expected)) return false;
  (await cookies()).set(SHARE_COOKIE, await shareToken(), cookieOpts);
  return true;
}
