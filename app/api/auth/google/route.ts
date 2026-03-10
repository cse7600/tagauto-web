import { NextRequest, NextResponse } from "next/server";
import { getOAuthUrl } from "@/lib/gtm-oauth";

export async function GET(req: NextRequest) {
  // state: 콜백 후 돌아올 URL (익스텐션 iframe 대응)
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const url = getOAuthUrl(encodeURIComponent(returnTo));
  return NextResponse.redirect(url);
}
