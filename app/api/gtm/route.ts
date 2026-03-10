import { NextRequest, NextResponse } from "next/server";

interface TaxonomyEvent {
  event_name: string;
  trigger_type: string;
  trigger_selector: string;
  trigger_text: string;
  parameters: Record<string, string>;
}

// GTM API: 트리거 생성
function buildTrigger(event: TaxonomyEvent, accountId: string, containerId: string) {
  const base = {
    accountId,
    containerId,
    name: `[AI] ${event.event_name}`,
  };

  if (event.trigger_type === "Click Text") {
    return {
      ...base,
      type: "CLICK",
      filter: [
        {
          type: "CONTAINS",
          parameter: [
            { type: "TEMPLATE", key: "arg0", value: "{{Click Text}}" },
            { type: "TEMPLATE", key: "arg1", value: event.trigger_text },
          ],
        },
      ],
      waitForTags: { type: "BOOLEAN", value: "true" },
      checkValidation: { type: "BOOLEAN", value: "true" },
      waitForTagsTimeout: { type: "TEMPLATE", value: "2000" },
    };
  }

  if (event.trigger_type === "Click ID") {
    return {
      ...base,
      type: "CLICK",
      filter: [
        {
          type: "EQUALS",
          parameter: [
            { type: "TEMPLATE", key: "arg0", value: "{{Click ID}}" },
            { type: "TEMPLATE", key: "arg1", value: event.trigger_selector.replace("#", "") },
          ],
        },
      ],
    };
  }

  if (event.trigger_type === "Form Submit") {
    return {
      ...base,
      type: "FORM_SUBMISSION",
      checkValidation: { type: "BOOLEAN", value: "true" },
      waitForTags: { type: "BOOLEAN", value: "true" },
      waitForTagsTimeout: { type: "TEMPLATE", value: "2000" },
    };
  }

  // 기본: Click Element
  return {
    ...base,
    type: "CLICK",
    filter: [
      {
        type: "CSS_SELECTOR",
        parameter: [
          { type: "TEMPLATE", key: "arg0", value: event.trigger_selector },
        ],
      },
    ],
  };
}

// GTM API: GA4 이벤트 태그 생성
function buildTag(event: TaxonomyEvent, triggerId: string, accountId: string, containerId: string) {
  const eventParameters = Object.entries(event.parameters).map(([key, value]) => ({
    type: "MAP",
    map: [
      { type: "TEMPLATE", key: "name", value: key },
      { type: "TEMPLATE", key: "value", value },
    ],
  }));

  return {
    accountId,
    containerId,
    name: `[AI] GA4 - ${event.event_name}`,
    type: "gaawe",
    parameter: [
      { type: "TEMPLATE", key: "eventName", value: event.event_name },
      { type: "LIST", key: "eventParameters", list: eventParameters },
    ],
    firingTriggerId: [triggerId],
  };
}

export async function POST(req: NextRequest) {
  const { events, accessToken, accountId, containerId } = await req.json();

  if (!events?.length) {
    return NextResponse.json({ error: "배포할 이벤트가 없습니다." }, { status: 400 });
  }

  if (!accessToken || !accountId || !containerId) {
    return NextResponse.json({ error: "GTM 인증 정보가 필요합니다." }, { status: 401 });
  }

  const baseUrl = `https://www.googleapis.com/tagmanager/v2/accounts/${accountId}/containers/${containerId}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  try {
    // 1. AI_Draft Workspace 생성 또는 기존 것 사용
    const wsRes = await fetch(`${baseUrl}/workspaces`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "AI_Draft", description: "TagAuto AI 자동 생성" }),
    });
    const workspace = await wsRes.json();
    const workspaceId = workspace.workspaceId;

    const wsBase = `${baseUrl}/workspaces/${workspaceId}`;
    const deployed: string[] = [];

    for (const event of events as TaxonomyEvent[]) {
      // 2. 트리거 생성
      const triggerRes = await fetch(`${wsBase}/triggers`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildTrigger(event, accountId, containerId)),
      });
      const trigger = await triggerRes.json();

      // 3. 태그 생성
      await fetch(`${wsBase}/tags`, {
        method: "POST",
        headers,
        body: JSON.stringify(buildTag(event, trigger.triggerId, accountId, containerId)),
      });

      deployed.push(event.event_name);
    }

    return NextResponse.json({ success: true, deployed, workspaceId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "GTM 배포 실패" },
      { status: 500 }
    );
  }
}
