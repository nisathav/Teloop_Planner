import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, SHARE_COOKIE, adminToken, safeEqual, shareToken } from "./lib/session";

/** Pages a read-only share link may open (GET only). */
const SHARE_PAGES = ["/", "/schedule", "/tasks", "/capacity", "/today"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/login") || pathname.startsWith("/share")) return NextResponse.next();

  const admin = req.cookies.get(ADMIN_COOKIE)?.value;
  if (admin && safeEqual(admin, await adminToken())) return NextResponse.next();

  const share = req.cookies.get(SHARE_COOKIE)?.value;
  if (share && process.env.SHARE_TOKEN && safeEqual(share, await shareToken())) {
    const isAction = req.method !== "GET" || req.headers.has("next-action");
    if (!isAction && SHARE_PAGES.includes(pathname)) return NextResponse.next();
    if (isAction) return new NextResponse("Read-only share link", { status: 403 });
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (pathname.startsWith("/api/")) return new NextResponse("Unauthorised", { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
