"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

/**
 * /ext/auth?token=...&refresh=...&redirect=...
 *
 * Chrome 익스텐션에서 "웹으로 보내기" 클릭 시 이 페이지로 이동.
 * URL 파라미터의 Supabase JWT로 웹앱 세션을 설정한 뒤 redirect 경로로 이동한다.
 */
export default function ExtAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-400">로딩 중...</p>
          </div>
        </div>
      }
    >
      <ExtAuthContent />
    </Suspense>
  );
}

function ExtAuthContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function authenticate() {
      const token = searchParams.get("token");
      const refresh = searchParams.get("refresh");
      const redirect = searchParams.get("redirect") || "/dashboard";

      if (!token || !refresh) {
        setStatus("error");
        setErrorMsg("인증 토큰이 누락되었습니다. 익스텐션에서 다시 시도해주세요.");
        return;
      }

      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { error } = await supabase.auth.setSession({
          access_token: token,
          refresh_token: refresh,
        });

        if (error) {
          setStatus("error");
          setErrorMsg(`세션 설정 실패: ${error.message}`);
          return;
        }

        // 성공 -- redirect 경로로 이동
        router.replace(redirect);
      } catch (e) {
        setStatus("error");
        setErrorMsg(e instanceof Error ? e.message : "알 수 없는 오류");
      }
    }

    authenticate();
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3 max-w-sm">
          <div className="w-12 h-12 bg-red-950/50 border border-red-900/50 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-red-400 text-xl">!</span>
          </div>
          <p className="text-sm text-red-300">{errorMsg}</p>
          <button
            onClick={() => router.push("/auth/login")}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            로그인 페이지로 이동
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400">익스텐션에서 로그인 중...</p>
      </div>
    </div>
  );
}
