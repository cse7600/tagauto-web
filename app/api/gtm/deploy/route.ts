import { NextRequest, NextResponse } from "next/server";
import { getGtmToken } from "@/lib/gtm-auth";

interface TaxonomyEvent {
  event_name: string;
  trigger_type: "Click Text" | "Click ID" | "Form Submit" | "CSS Selector";
  trigger_selector: string;
  trigger_text: string;
  parameters: Record<string, string>;
}

function buildTrigger(event: TaxonomyEvent, accountId: string, containerId: string) {
  const base = { accountId, containerId, name: `[AI] ${event.event_name}` };

  switch (event.trigger_type) {
    case "Click Text":
      return {
        ...base, type: "CLICK",
        filter: [{
          type: "CONTAINS",
          parameter: [
            { type: "TEMPLATE", key: "arg0", value: "{{Click Text}}" },
            { type: "TEMPLATE", key: "arg1", value: event.trigger_text },
          ],
        }],
        waitForTags: { type: "BOOLEAN", value: "true" },
        checkValidation: { type: "BOOLEAN", value: "true" },
        waitForTagsTimeout: { type: "TEMPLATE", value: "2000" },
      };
    case "Click ID":
      return {
        ...base, type: "CLICK",
        filter: [{
          type: "EQUALS",
          parameter: [
            { type: "TEMPLATE", key: "arg0", value: "{{Click ID}}" },
            { type: "TEMPLATE", key: "arg1", value: event.trigger_selector.replace("#", "") },
          ],
        }],
      };
    case "Form Submit":
      return {
        ...base, type: "FORM_SUBMISSION",
        checkValidation: { type: "BOOLEAN", value: "true" },
        waitForTags: { type: "BOOLEAN", value: "true" },
        waitForTagsTimeout: { type: "TEMPLATE", value: "2000" },
      };
    default:
      return {
        ...base, type: "CLICK",
        filter: [{
          type: "MATCHES_CSS_SELECTOR",
          parameter: [
            { type: "TEMPLATE", key: "arg0", value: "{{Click Element}}" },
            { type: "TEMPLATE", key: "arg1", value: event.trigger_selector },
          ],
        }],
      };
  }
}

function buildTag(event: TaxonomyEvent, triggerId: string, accountId: string, containerId: string) {
  const eventParameters = Object.entries(event.parameters).map(([key, value]) => ({
    type: "MAP",
    map: [
      { type: "TEMPLATE", key: "name", value: key },
      { type: "TEMPLATE", key: "value", value },
    ],
  }));

  return {
    accountId, containerId,
    name: `[AI] GA4 - ${event.event_name}`,
    type: "gaawe",
    parameter: [
      { type: "TEMPLATE", key: "eventName", value: event.event_name },
      ...(eventParameters.length ? [{ type: "LIST", key: "eventParameters", list: eventParameters }] : []),
    ],
    firingTriggerId: [triggerId],
  };
}

export async function POST(req: NextRequest) {
  const { events, accountId, containerId } = await req.json();
  if (!events?.length) return NextResponse.json({ error: "배포할 이벤트 없음" }, { status: 400 });
  if (!accountId || !containerId) return NextResponse.json({ error: "GTM 계정/컨테이너 필요" }, { status: 400 });

  try {
    const accessToken = await getGtmToken();
    const wsBase = `https://www.googleapis.com/tagmanager/v2/accounts/${accountId}/containers/${containerId}`;
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };

    // AI_Draft Workspace 생성
    const wsRes = await fetch(`${wsBase}/workspaces`, {
      method: "POST", headers,
      body: JSON.stringify({ name: "AI_Draft", description: "TagAuto AI 자동 생성" }),
    });
    const workspace = await wsRes.json();
    const workspaceId = workspace.workspaceId;
    if (!workspaceId) return NextResponse.json({ error: "Workspace 생성 실패", detail: workspace }, { status: 500 });

    const tagWsBase = `${wsBase}/workspaces/${workspaceId}`;
    const deployed: string[] = [];

    for (const event of events as TaxonomyEvent[]) {
      const triggerRes = await fetch(`${tagWsBase}/triggers`, {
        method: "POST", headers,
        body: JSON.stringify(buildTrigger(event, accountId, containerId)),
      });
      const trigger = await triggerRes.json();
      if (!trigger.triggerId) continue;

      await fetch(`${tagWsBase}/tags`, {
        method: "POST", headers,
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
