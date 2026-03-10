import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const BUILTIN_GTM: Record<string, string> = {
  click_text:    "{{Click Text}}",
  click_id:      "{{Click ID}}",
  click_classes: "{{Click Classes}}",
  click_url:     "{{Click URL}}",
  page_path:     "{{Page Path}}",
  page_url:      "{{Page URL}}",
};

function deriveGtmVar(paramName: string, gtmVarMap: Record<string, string>): string {
  if (BUILTIN_GTM[paramName]) return BUILTIN_GTM[paramName];
  if (gtmVarMap[paramName])   return gtmVarMap[paramName];
  // 유사 키 탐색
  const found = Object.keys(gtmVarMap).find(k => k.includes(paramName) || paramName.includes(k));
  if (found) return gtmVarMap[found];
  return `{{DLV - ${paramName}}}`;
}

export async function POST(req: NextRequest) {
  const { element, dynamicVars = {}, builtins = {}, dlSnapshot = [], pageUrl, pageTitle } = await req.json();

  // GTM syntax를 AI에게 숨기고 순수 값/출처만 전달
  const cleanVars: Record<string, { value: string; source: string }> = {};
  Object.entries(dynamicVars as Record<string, { value: string; source: string; gtmVar: string }>)
    .forEach(([k, v]) => { cleanVars[k] = { value: v.value, source: v.source }; });

  // gtmVar 매핑 유지 (AI 결과에서 paramName 기반으로 나중에 매핑)
  const gtmVarMap: Record<string, string> = {};
  Object.entries({ ...dynamicVars, ...builtins } as Record<string, { gtmVar: string }>)
    .forEach(([k, v]) => { gtmVarMap[k] = v.gtmVar; });

  const prompt = `당신은 GA4 이벤트 설계 전문가이자 마케터 어시스턴트입니다.
비개발자 마케터가 웹페이지에서 클릭한 요소를 분석하여 GA4 이벤트를 자동 완성해주세요.

[클릭한 요소]
- HTML 태그: ${element.tag}
- 텍스트: "${element.text || ""}"
- aria-label: "${element.ariaLabel || ""}"
- 링크 URL: "${element.href || ""}"
- CSS 클래스: "${(element.classes || "").slice(0, 100)}"
- id: "${element.id || ""}"

[페이지에서 발견된 데이터]
${JSON.stringify(cleanVars, null, 1)}

[dataLayer 최근 이벤트]
${JSON.stringify(dlSnapshot, null, 1)}

[페이지 URL] ${pageUrl}
[페이지 제목] ${pageTitle || ""}

[이벤트 매핑 규칙]
- "장바구니", "담기", "cart" → add_to_cart
- "구매", "결제", "주문" → begin_checkout 또는 purchase
- "찜", "위시", "wish" → add_to_wishlist
- "쿠폰", "할인코드" → select_promotion
- "로그인", "login" → login
- "회원가입", "signup" → sign_up
- "검색" + form → search
- "공유", "share" → share
- 상품 카드 안 요소 → select_item
- form 태그 → form_submit
- 기타 → ${"`${텍스트기반}_click`"}

[중요 규칙]
1. displayName, description, whyThisMatters는 비개발자 마케터용 한국어
2. paramName은 GA4 표준 snake_case
3. label은 "상품 이름", "상품 가격" 같은 쉬운 한국어
4. value는 cleanVars에서 실제 발견된 값 (없으면 빈 문자열)
5. confidence: "detected"=실제값있음, "inferred"=AI추론, "manual"=값없음
6. isRequired: GA4 이커머스 필수 파라미터(item_name, item_id, price)만 true
7. 파라미터는 3~7개 적절히 선택

반드시 아래 JSON만 출력:
{
  "suggestion": {
    "eventName": "add_to_cart",
    "displayName": "장바구니 담기",
    "description": "상품 카드의 장바구니 버튼 클릭 시",
    "elementSummary": "장바구니 버튼",
    "confidence": "high",
    "whyThisMatters": "어떤 상품이 얼마나 담기는지 파악해 재고 전략과 프로모션 효율을 높일 수 있습니다"
  },
  "parameters": [
    {
      "label": "상품 이름",
      "paramName": "item_name",
      "value": "나이키 에어맥스",
      "isRequired": true,
      "confidence": "detected"
    }
  ],
  "_internal": {
    "triggerType": "Click Text",
    "triggerSelector": ".btn-cart",
    "triggerText": "장바구니 담기"
  }
}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 응답 파싱 실패");

    const parsed = JSON.parse(match[0]);

    // AI가 반환한 paramName으로 GTM 변수 자동 매핑 (마케터에게 숨김)
    if (Array.isArray(parsed.parameters)) {
      parsed.parameters = parsed.parameters.map((p: { paramName: string; confidence: string }) => ({
        ...p,
        gtmVariable: deriveGtmVar(p.paramName, gtmVarMap),
      }));
    }

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 분석 실패" },
      { status: 500 }
    );
  }
}
