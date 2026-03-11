import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

async function getBrowser() {
  // Vercel / 서버리스 환경: @sparticuz/chromium-min 사용
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION) {
    const chromium = await import("@sparticuz/chromium-min");
    const playwright = await import("playwright-core");
    return playwright.chromium.launch({
      args: chromium.default.args,
      executablePath: await chromium.default.executablePath(
        "https://github.com/Sparticuz/chromium/releases/download/v143.0.0/chromium-v143.0.0-pack.tar"
      ),
      headless: true,
    });
  }

  // 로컬 환경: 시스템 playwright 사용
  const { chromium } = await import("playwright");
  return chromium.launch({ headless: true });
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });
  }

  // https:// 없으면 자동 추가
  const normalizedUrl = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
  const targetUrl = normalizedUrl;

  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    // load 후 추가 2초 대기 (SPA 렌더링 대응)
    await page.goto(targetUrl, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(2000);

    // DOM 스냅샷: 클릭 가능한 요소들 추출
    const domSnapshot = await page.evaluate(() => {
      const elements: Array<{
        tag: string;
        id: string;
        text: string;
        classes: string;
        dataAttrs: Record<string, string>;
        href?: string;
        type?: string;
      }> = [];

      const selectors = "a, button, [role='button'], input[type='submit'], form";
      document.querySelectorAll(selectors).forEach((el) => {
        const htmlEl = el as HTMLElement;
        const dataAttrs: Record<string, string> = {};
        Array.from(htmlEl.attributes).forEach((attr) => {
          if (attr.name.startsWith("data-")) {
            dataAttrs[attr.name] = attr.value;
          }
        });

        elements.push({
          tag: htmlEl.tagName.toLowerCase(),
          id: htmlEl.id || "",
          text: (htmlEl.textContent || "").trim().slice(0, 100),
          classes: htmlEl.className || "",
          dataAttrs,
          href: (htmlEl as HTMLAnchorElement).href || undefined,
          type: (htmlEl as HTMLInputElement).type || undefined,
        });
      });

      return {
        title: document.title,
        url: window.location.href,
        elements: elements.slice(0, 50), // 최대 50개
      };
    });

    return NextResponse.json({ domSnapshot });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "크롤링 실패" },
      { status: 500 }
    );
  } finally {
    if (browser) await browser.close();
  }
}
