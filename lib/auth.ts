import "server-only";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, SHARE_COOKIE, adminToken, safeEqual, shareToken } from "./session";

export type Role = "admin" | "share" | null;

export async function getRole(): Promise<Role> {
  const jar = await cookies();
  const a = jar.get(ADMIN_COOKIE)?.value;
  if (a && safeEqual(a, await adminToken())) return "admin";
  const s = jar.get(SHARE_COOKIE)?.value;
  if (s && process.env.SHARE_TOKEN && safeEqual(s, await shareToken())) return "share";
  return null;
}

/** Every server action that writes data must call this first. */
export async function requireAdmin(): Promise<void> {
  if ((await getRole()) !== "admin") throw new Error("Not authorised: admin login required.");
}
