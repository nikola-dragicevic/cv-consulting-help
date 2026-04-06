import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AFFILIATE_COOKIE_MAX_AGE_SECONDS, AFFILIATE_COOKIE_NAME, normalizeAffiliateCode } from "@/lib/affiliate";

export function middleware(req: NextRequest) {
  const referralCode = normalizeAffiliateCode(req.nextUrl.searchParams.get("ref"));

  if (referralCode) {
    const url = req.nextUrl.clone();
    url.searchParams.delete("ref");
    const res = NextResponse.redirect(url);
    res.cookies.set(AFFILIATE_COOKIE_NAME, referralCode, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: AFFILIATE_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  }

  if (req.nextUrl.pathname === "/ATS") {
    const url = req.nextUrl.clone();
    url.pathname = "/ats";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
