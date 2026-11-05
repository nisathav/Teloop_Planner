import { NextResponse, type NextRequest } from "next/server";
import { enterShare } from "@/app/actions/auth";

/** Read-only share link: /share?token=... */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await enterShare(token);
  return NextResponse.redirect(new URL(ok ? "/" : "/login", req.url));
}
