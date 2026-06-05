import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const { pathname } = request.nextUrl;

  if (
    host.startsWith("app.pro-object.online") &&
    pathname === "/"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"]
};
