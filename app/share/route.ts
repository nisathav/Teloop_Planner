import { NextResponse, type NextRequest } from "next/server";
import { enterShare } from "@/app/actions/auth";

/** Read-only share link: /share?token=... */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ok = await enterShare(token);
  // Relative redirect: behind a proxy (Codespaces, tunnels) req.url points at localhost.
  return new NextResponse(null, { status: 307, headers: { Location: ok ? "/" : "/login" } });
}
