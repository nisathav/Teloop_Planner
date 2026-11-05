// Edge-safe session helpers (used by middleware and server code).
export const ADMIN_COOKIE = "fp_session";
export const SHARE_COOKIE = "fp_share";

function secret(): string {
  return process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD || "fleet-planner";
}

async function hmac(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token changes whenever the password changes, so old cookies stop working. */
export async function adminToken(): Promise<string> {
  return hmac(`admin:${process.env.ADMIN_PASSWORD ?? ""}`);
}

export async function shareToken(): Promise<string> {
  return hmac(`share:${process.env.SHARE_TOKEN ?? ""}`);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
