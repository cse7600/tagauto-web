import { NextRequest, NextResponse } from "next/server";
import { getGtmToken } from "@/lib/gtm-auth";

export interface ValidationResult {
  event_name: string;
  status: "ok" | "no_data" | "name_mismatch";
  ga4_event_name?: string;   // 실제 GA4에서 받은 이름 (불일치 시)
  count?: number;             // 최근 수신 건수
  message: string;
}

export async function POST(req: NextRequest) {
  const { propertyId, eventNames } = await req.json();

  if (!propertyId) {
    return NextResponse.json({ error: "GA4 Property ID가 필요합니다." }, { status: 400 });
  }
  if (!eventNames?.length) {
    return NextResponse.json({ error: "검증할 이벤트 목록이 필요합니다." }, { status: 400 });
  }

  try {
    const accessToken = await getGtmToken();

    // GA4 Data API - 최근 30분 Realtime 이벤트 조회
    // scope 필요: analytics.readonly (서비스 계정에 GA4 뷰어 권한 필요)
    const realtimeRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dimensions: [{ name: "eventName" }],
          metrics: [{ name: "eventCount" }],
        }),
      }
    );

    if (!realtimeRes.ok) {
      const err = await realtimeRes.json();
      // GA4 접근 권한 없는 경우 안내 메시지 반환
      if (realtimeRes.status === 403) {
        return NextResponse.json({
          error: "GA4 접근 권한 없음",
          hint: `GA4 속성 관리 > 사용자 관리에서 tagauto-ai@puzlagency.iam.gserviceaccount.com 을 뷰어로 추가하세요.`,
          detail: err,
        }, { status: 403 });
      }
      throw new Error(JSON.stringify(err));
    }

    const realtimeData = await realtimeRes.json();

    // GA4에서 수신된 이벤트 맵 생성 { eventName: count }
    const ga4Events: Record<string, number> = {};
    for (const row of realtimeData.rows || []) {
      const name = row.dimensionValues?.[0]?.value;
      const count = parseInt(row.metricValues?.[0]?.value || "0");
      if (name) ga4Events[name] = count;
    }

    // 배포된 이벤트 ↔ GA4 교차 검증
    const results: ValidationResult[] = eventNames.map((eventName: string) => {
      // 정확히 일치
      if (ga4Events[eventName] !== undefined) {
        return {
          event_name: eventName,
          status: "ok",
          count: ga4Events[eventName],
          message: `GA4 수신 확인 (최근 ${ga4Events[eventName]}건)`,
        };
      }

      // 유사 이름 찾기 (snake_case 변형 허용)
      const normalized = eventName.replace(/-/g, "_").toLowerCase();
      const similar = Object.keys(ga4Events).find(
        (k) => k.replace(/-/g, "_").toLowerCase() === normalized
      );

      if (similar) {
        return {
          event_name: eventName,
          status: "name_mismatch",
          ga4_event_name: similar,
          count: ga4Events[similar],
          message: `이름 불일치 — GA4: "${similar}" / GTM: "${eventName}"`,
        };
      }

      return {
        event_name: eventName,
        status: "no_data",
        count: 0,
        message: "아직 GA4에서 수신되지 않음 (GTM 게시 후 이벤트를 발생시켜 주세요)",
      };
    });

    const summary = {
      ok: results.filter((r) => r.status === "ok").length,
      no_data: results.filter((r) => r.status === "no_data").length,
      name_mismatch: results.filter((r) => r.status === "name_mismatch").length,
    };

    return NextResponse.json({ results, summary, ga4_events: Object.keys(ga4Events) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "GA4 검증 실패" },
      { status: 500 }
    );
  }
}
