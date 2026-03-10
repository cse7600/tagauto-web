import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

interface TaxonomyEvent {
  event_name: string;
  location?: string;
  description_ko?: string;
  trigger_type: string;
  trigger_selector: string;
  trigger_text: string;
  parameters: Record<string, string>;
  param_example?: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
}

export async function POST(req: NextRequest) {
  const { events, url, projectName } = await req.json();

  const approved: TaxonomyEvent[] = (events as TaxonomyEvent[]).filter(
    (e) => e.status === "approved"
  );

  const wb = XLSX.utils.book_new();
  const docTitle = projectName || new URL(url || "https://example.com").hostname;
  const today = new Date().toLocaleDateString("ko-KR");

  // ────────────────────────────────────────────────
  // Sheet 1: 마케터 뷰 — GA4 이벤트 리스트 (GYMBOXX 형식)
  // ────────────────────────────────────────────────
  const marketerMeta = [
    ["", "문서명", `GA4 이벤트 택소노미 설계 리스트`],
    ["", "URL", url || ""],
    ["", "작성일", today],
    ["", "생성 도구", "TagAuto AI"],
    [],
    [
      "no",
      "위치",
      "이벤트 발생 조건 (트리거)",
      "이벤트 이름",
      "매개변수명",
      "매개변수 값",
      "매개변수 예시",
      "플랫폼",
      "상태표시",
      "비고",
    ],
  ];

  let rowNo = 1;
  for (const ev of approved) {
    const paramKeys = Object.keys(ev.parameters);
    if (paramKeys.length === 0) {
      marketerMeta.push([
        String(rowNo),
        ev.location || "-",
        ev.description_ko || ev.trigger_text || ev.trigger_selector,
        ev.event_name,
        "",
        "",
        ev.param_example || "",
        "web",
        "",
        ev.notes || "",
      ]);
    } else {
      paramKeys.forEach((key, idx) => {
        marketerMeta.push([
          idx === 0 ? String(rowNo) : "",
          idx === 0 ? (ev.location || "-") : "",
          idx === 0 ? (ev.description_ko || ev.trigger_text || ev.trigger_selector) : "",
          idx === 0 ? ev.event_name : "",
          key,
          ev.parameters[key],
          idx === 0 ? (ev.param_example || `${key}=${ev.parameters[key]}`) : "",
          "web",
          "",
          idx === 0 ? (ev.notes || "") : "",
        ]);
      });
    }
    rowNo++;
  }

  const ws1 = XLSX.utils.aoa_to_sheet(marketerMeta);

  // 컬럼 너비 설정
  ws1["!cols"] = [
    { wch: 5 },   // no
    { wch: 12 },  // 위치
    { wch: 40 },  // 이벤트 발생 조건
    { wch: 28 },  // 이벤트 이름
    { wch: 22 },  // 매개변수명
    { wch: 30 },  // 매개변수 값
    { wch: 30 },  // 매개변수 예시
    { wch: 8 },   // 플랫폼
    { wch: 16 },  // 상태표시
    { wch: 35 },  // 비고
  ];

  XLSX.utils.book_append_sheet(wb, ws1, "GA4 이벤트 리스트");

  // ────────────────────────────────────────────────
  // Sheet 2: 개발자 뷰 — GTM 설정 정보
  // ────────────────────────────────────────────────
  const devHeader = [
    ["", "문서명", `GTM 태그 설정 명세서`],
    ["", "URL", url || ""],
    ["", "작성일", today],
    [],
    [
      "no",
      "이벤트명 (GA4)",
      "트리거 타입",
      "트리거 선택자",
      "트리거 텍스트",
      "파라미터",
      "위치",
    ],
  ];

  approved.forEach((ev, i) => {
    const paramStr = Object.entries(ev.parameters)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    devHeader.push([
      String(i + 1),
      ev.event_name,
      ev.trigger_type,
      ev.trigger_selector,
      ev.trigger_text,
      paramStr,
      ev.location || "-",
    ]);
  });

  const ws2 = XLSX.utils.aoa_to_sheet(devHeader);
  ws2["!cols"] = [
    { wch: 5 },
    { wch: 28 },
    { wch: 16 },
    { wch: 35 },
    { wch: 25 },
    { wch: 40 },
    { wch: 12 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, "GTM 설정 정보");

  // Excel 바이너리 생성
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const filename = encodeURIComponent(`${docTitle}_GA4_택소노미.xlsx`);

  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
