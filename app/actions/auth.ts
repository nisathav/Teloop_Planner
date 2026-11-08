"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SHARE_COOKIE, adminToken, safeEqual, shareToken } from "@/lib/session";

/**
 * Session cookie options. Over HTTPS (directly or behind a proxy such as GitHub Codespaces) the cookie is
 * Secure + SameSite=None + Partitioned so sign-in also works when the app is embedded in an editor preview pane.
 * Server actions are still protected by Next.js's Origin check.
 */
async function cookieOpts() {
  const h = await headers();
  const https = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
  const base = { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 30 };
  if (https) return { ...base, secure: true, sameSite: "none" as const, partitioned: true };
  return { ...base, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1" };
}

export async function login(_: unknown, form: FormData): Promise<{ error?: string }> {
  const pw = String(form.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return { error: "ADMIN_PASSWORD is not set in .env" };
  if (!safeEqual(pw, expected)) return { error: "Wrong password" };
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await adminToken(), await cookieOpts());
  jar.delete(SHARE_COOKIE);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  // Expire with the same attributes they were set with (a partitioned cookie is only cleared that way).
  const opts = { ...(await cookieOpts()), maxAge: 0 };
  jar.set(ADMIN_COOKIE, "", opts);
  jar.set(SHARE_COOKIE, "", opts);
  redirect("/login");
}

export async function enterShare(token: string): Promise<boolean> {
  const expected = process.env.SHARE_TOKEN ?? "";
  if (!expected || !safeEqual(token, expected)) return false;
  (await cookies()).set(SHARE_COOKIE, await shareToken(), await cookieOpts());
  return true;
}
