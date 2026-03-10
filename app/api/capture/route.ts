import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/capture
 *
 * 익스텐션에서 캡처한 데이터를 받아 세션을 생성하고 스크린샷을 저장한다.
 * Authorization 헤더로 사용자 JWT를 받는다.
 *
 * Body: {
 *   projectId: string,
 *   url: string,
 *   domSnapshot: object,           // 캡처된 DOM 메타데이터
 *   screenshotBase64: string,      // base64 PNG (captureVisibleTab 결과)
 *   captureMetadata: object,       // viewport, devicePixelRatio 등
 *   elementRects: array,           // 요소별 bounding rect
 * }
 */
export async function POST(req: NextRequest) {
  // 1. 인증 확인
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  // 2. 요청 파싱
  const {
    projectId,
    url,
    domSnapshot,
    screenshotBase64,
    captureMetadata,
    elementRects,
  } = await req.json();

  if (!projectId || !url) {
    return NextResponse.json({ error: "projectId와 url이 필요합니다" }, { status: 400 });
  }

  try {
    const urlObj = new URL(url);

    // 3. 세션 생성 (status: pending -- 아직 AI 분석 전)
    const { data: session, error: insertError } = await supabase
      .from("analysis_sessions")
      .insert({
        project_id: projectId,
        user_id: user.id,
        url,
        domain: urlObj.hostname,
        path: urlObj.pathname,
        status: "pending",
        capture_metadata: captureMetadata || null,
        element_rects: elementRects || null,
        capture_source: "extension",
      })
      .select("id")
      .single();

    if (insertError || !session) {
      return NextResponse.json(
        { error: insertError?.message || "세션 생성 실패" },
        { status: 500 }
      );
    }

    const sessionId = session.id;

    // 4. 스크린샷 업로드 (base64 -> Buffer -> Storage)
    let screenshotPath: string | null = null;
    if (screenshotBase64) {
      // "data:image/png;base64,..." 형식에서 base64 부분만 추출
      const base64Data = screenshotBase64.includes(",")
        ? screenshotBase64.split(",")[1]
        : screenshotBase64;
      const buffer = Buffer.from(base64Data, "base64");
      const storagePath = `${user.id}/${sessionId}.png`;

      const { error: uploadError } = await supabase.storage
        .from("screenshots")
        .upload(storagePath, buffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (!uploadError) {
        screenshotPath = storagePath;
        // DB에 경로 저장
        await supabase
          .from("analysis_sessions")
          .update({ screenshot_path: screenshotPath })
          .eq("id", sessionId);
      }
    }

    // 5. AI 분석 비동기 실행 (DOM 스냅샷이 있으면)
    if (domSnapshot) {
      // 상태를 analyzing으로 변경
      await supabase
        .from("analysis_sessions")
        .update({ status: "analyzing" })
        .eq("id", sessionId);

      // 비동기로 AI 분석 실행 (응답은 먼저 반환)
      analyzeInBackground(sessionId, url, domSnapshot, token).catch(console.error);
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      screenshotPath,
      webUrl: `/projects/${projectId}/sessions/${sessionId}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "캡처 처리 실패" },
      { status: 500 }
    );
  }
}

/**
 * AI 분석을 백그라운드에서 실행한다.
 * 결과를 DB에 직접 업데이트한다.
 */
async function analyzeInBackground(
  sessionId: string,
  url: string,
  domSnapshot: Record<string, unknown>,
  token: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    // 내부적으로 analyze API를 호출
    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const analyzeRes = await fetch(`${origin}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, domSnapshot }),
    });

    if (!analyzeRes.ok) {
      throw new Error(`분석 API 오류: ${analyzeRes.status}`);
    }

    const analyzeData = await analyzeRes.json();
    if (analyzeData.error) throw new Error(analyzeData.error);

    const events = (analyzeData.events || []).map(
      (e: Record<string, unknown>) => ({ ...e, status: "pending" })
    );

    await supabase
      .from("analysis_sessions")
      .update({ status: "completed", events, approved_events: [] })
      .eq("id", sessionId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "분석 실패";
    await supabase
      .from("analysis_sessions")
      .update({ status: "error", error_message: msg })
      .eq("id", sessionId);
  }
}
