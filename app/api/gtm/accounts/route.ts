import { NextResponse } from "next/server";
import { getGtmToken } from "@/lib/gtm-auth";

export async function GET() {
  try {
    const accessToken = await getGtmToken();

    const accountsRes = await fetch(
      "https://www.googleapis.com/tagmanager/v2/accounts",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const accountsData = await accountsRes.json();

    if (!accountsData.account?.length) {
      return NextResponse.json(
        { error: "GTM 계정 없음. 서비스 계정을 GTM 관리자로 추가했는지 확인하세요." },
        { status: 403 }
      );
    }

    const accounts = await Promise.all(
      accountsData.account.map(async (acc: { accountId: string; name: string }) => {
        const containersRes = await fetch(
          `https://www.googleapis.com/tagmanager/v2/accounts/${acc.accountId}/containers`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const containersData = await containersRes.json();
        return {
          accountId: acc.accountId,
          name: acc.name,
          containers: (containersData.container || []).map(
            (c: { containerId: string; name: string; publicId: string }) => ({
              containerId: c.containerId,
              name: c.name,
              publicId: c.publicId,
            })
          ),
        };
      })
    );

    return NextResponse.json({ accounts, connected: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "GTM 연결 실패" },
      { status: 500 }
    );
  }
}
