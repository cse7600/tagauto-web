import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { url, domSnapshot } = await req.json();

  if (!domSnapshot) {
    return NextResponse.json({ error: "DOM 스냅샷이 필요합니다." }, { status: 400 });
  }

  const prompt = `
당신은 GA4 데이터 전략가이자 GTM 전문가입니다.
아래 웹페이지 DOM을 분석하여 비즈니스 가치 높은 GA4 이벤트 택소노미를 생성하세요.

페이지 URL: ${url}
페이지 제목: ${domSnapshot.title}

클릭 가능한 요소들:
${JSON.stringify(domSnapshot.elements, null, 2)}

규칙:
1. 이벤트명은 snake_case (예: purchase_click, begin_checkout, sign_up)
2. 트리거는 id, text, data 속성 우선 (CSS class 최소화)
3. 첫 번째 이벤트는 반드시 페이지 뷰 이벤트 (page_view)를 포함할 것:
   - event_name: "page_view", trigger_type: "Page View", priority: "high"
   - marketer_insight: "어떤 채널에서 이 페이지로 유입되는지, 페이지별 이탈률과 체류시간을 분석해 랜딩 페이지 최적화에 활용할 수 있습니다"
4. priority: "high" = 전환/수익 직결, "medium" = 행동 분석 가능, "low" = 참고용 (low는 기본 rejected 상태로)
5. marketer_insight: 이 이벤트를 수집하면 마케터가 구체적으로 무엇을 알 수 있는지, 어떤 액션을 취할 수 있는지 1-2문장으로
6. location: 페이지 섹션명 (헤더, 메인, 장바구니, CTA, FAQ 등)
7. description_ko: 마케터용 한국어 트리거 설명 (예: "구매하기 버튼 클릭 시")

반드시 아래 JSON 형식으로만 응답 (다른 텍스트 없이):
{
  "events": [
    {
      "event_name": "이벤트명",
      "priority": "high | medium | low",
      "location": "페이지 섹션명",
      "description_ko": "마케터용 한국어 트리거 설명",
      "marketer_insight": "이 데이터로 마케터가 할 수 있는 것",
      "trigger_type": "Click Text | Click ID | CSS Selector | Form Submit",
      "trigger_selector": "CSS 선택자 또는 빈 문자열",
      "trigger_text": "버튼 텍스트",
      "parameters": { "파라미터명": "값 또는 {{변수명}}" },
      "param_example": "파라미터명=예시값",
      "notes": "구현 주의사항 (선택)"
    }
  ]
}
`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 응답 파싱 실패");

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI 분석 실패" },
      { status: 500 }
    );
  }
}
