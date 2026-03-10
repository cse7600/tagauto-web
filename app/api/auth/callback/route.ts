import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/gtm-oauth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(new URL("/?error=auth_denied", req.url));
  }

  try {
    const tokens = await exchangeCode(code);

    // 간단한 user_id: 세션 쿠키 기반 (추후 Supabase Auth 연동 가능)
    const cookieStore = await cookies();
    let userId = cookieStore.get("tagauto_uid")?.value;

    if (!userId) {
      userId = crypto.randomUUID();
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // GTM 계정 목록 조회 (연결 확인용)
    const accountsRes = await fetch(
      "https://www.googleapis.com/tagmanager/v2/accounts",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    );
    const accountsData = await accountsRes.json();
    const firstAccount = accountsData.account?.[0];

    // Supabase에 토큰 저장
    await getSupabaseAdmin().from("gtm_connections").upsert(
      {
        user_id: userId,
        account_id: firstAccount?.accountId || "",
        container_id: "",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id" }
    );

    const returnTo = state ? decodeURIComponent(state) : "/";
    const response = NextResponse.redirect(new URL(returnTo, req.url));

    // uid 쿠키 설정 (30일)
    response.cookies.set("tagauto_uid", userId, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch (e) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
