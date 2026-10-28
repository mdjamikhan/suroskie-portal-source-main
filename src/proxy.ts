import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: redirects visitors without a session cookie to sign-in before any
// page work happens. Real authentication/authorisation runs server-side on every request.
const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/invite", "/forbidden"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has("suroskie.session_token") || req.cookies.has("__Secure-suroskie.session_token");
  if (!hasSession && !PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Pages only; API routes return 401 JSON themselves.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
