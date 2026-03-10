"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2,
  FileSpreadsheet, Rocket, ScanSearch, X, Sparkles, Clock, MousePointerClick,
  TrendingUp, BookOpen, Coffee
} from "lucide-react";

interface Container { containerId: string; name: string; publicId: string; }
interface Account   { accountId: string; name: string; containers: Container[]; }

export default function Home() {
  const router = useRouter();
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [accounts, setAccounts]         = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount]     = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [showGtm, setShowGtm]           = useState(false);

  useEffect(() => {
    fetch("/api/gtm/accounts")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setAccounts(data.accounts || []);
        if (data.accounts?.[0]) {
          setSelectedAccount(data.accounts[0].accountId);
          setSelectedContainer(data.accounts[0].containers?.[0]?.containerId || "");
        }
      })
      .catch(() => setError("서버 연결 실패"))
      .finally(() => setLoading(false));
  }, []);

  const selectedAccountData = accounts.find((a) => a.accountId === selectedAccount);
  const gtmConnected = !loading && !error && accounts.length > 0;

  function handleStart(withGtm: boolean) {
    if (withGtm && selectedAccount && selectedContainer) {
      router.push(`/analyze?accountId=${selectedAccount}&containerId=${selectedContainer}`);
    } else {
      router.push("/analyze");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-gray-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="font-bold text-lg tracking-tight">TagAuto AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors">대시보드</Link>
          <Link href="/auth/login" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">로그인</Link>
          <Link href="/auth/signup" className="text-sm bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors font-medium">
            무료 시작
          </Link>
        </div>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-14">
        <div className="w-full max-w-xl space-y-10">

          {/* ── Hero ── */}
          <div className="text-center space-y-4">
            {/* 자극 뱃지 */}
            <div className="inline-flex items-center gap-2 text-xs text-orange-400 bg-orange-950/50 border border-orange-900/60 px-3 py-1.5 rounded-full">
              <Sparkles className="w-3 h-3" />
              GTM 태그 설정, 이제 AI가 대신합니다
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
              GTM 공부<br />
              <span className="text-blue-400">안 해도 됩니다.</span>
            </h1>

            <p className="text-gray-400 text-base leading-relaxed">
              URL 하나 넣으면 GA4 이벤트 택소노미가 완성됩니다<br />
              <span className="text-gray-500 text-sm">더 이상 개발자한테 부탁 안 해도 돼요</span>
            </p>

            {/* CTA */}
            <button
              onClick={() => handleStart(false)}
              className="w-full bg-blue-600 hover:bg-blue-500 rounded-xl py-4 text-base font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 hover:shadow-blue-900/60 hover:scale-[1.01]"
            >
              <ScanSearch className="w-5 h-5" />
              지금 바로 분석하기 — 무료
            </button>
            <p className="text-xs text-gray-600">신용카드 없음 · 설치 없음 · 5분이면 충분</p>
          </div>

          {/* ── Before / After ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Before */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-red-950/60 border border-red-900/50 flex items-center justify-center">
                  <X className="w-3 h-3 text-red-400" />
                </div>
                <span className="text-xs font-semibold text-red-300">기존 방식</span>
              </div>
              <ul className="space-y-2 text-xs text-gray-500">
                {[
                  [BookOpen,         "GTM 강의 수십 시간"],
                  [Clock,            "이벤트 설계 며칠 소요"],
                  [MousePointerClick,"개발자와 핑퐁 커뮤니케이션"],
                  [FileSpreadsheet,  "엑셀 수작업 정리"],
                ].map(([Icon, label]) => (
                  <li key={label as string} className="flex items-center gap-2">
                    <Icon className="w-3 h-3 shrink-0 text-gray-600" />
                    {label as string}
                  </li>
                ))}
              </ul>
            </div>

            {/* After */}
            <div className="bg-blue-950/20 border border-blue-900/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-950/60 border border-green-900/50 flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 text-green-400" />
                </div>
                <span className="text-xs font-semibold text-green-300">TagAuto AI</span>
              </div>
              <ul className="space-y-2 text-xs text-gray-300">
                {[
                  [Zap,              "URL 입력 하나"],
                  [Clock,            "5분 안에 완성"],
                  [TrendingUp,       "마케터 인사이트 자동 포함"],
                  [FileSpreadsheet,  "엑셀 명세서 즉시 다운로드"],
                ].map(([Icon, label]) => (
                  <li key={label as string} className="flex items-center gap-2">
                    <Icon className="w-3 h-3 shrink-0 text-blue-400" />
                    {label as string}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ── 한줄 훅 ── */}
          <div className="text-center py-3 border-y border-gray-900 space-y-1">
            <p className="text-sm text-gray-400">
              <span className="text-white font-semibold">구매 완료, 장바구니, 회원가입</span> 페이지도
            </p>
            <p className="text-sm text-gray-500">
              크롬 익스텐션으로 로그인 상태 그대로 캡처 → 즉시 분석
            </p>
          </div>

          {/* ── GTM 연결 (선택) ── */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowGtm((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 text-gray-500 animate-spin" />
                ) : gtmConnected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-500" />
                )}
                <span className="text-gray-300 text-sm">
                  {loading
                    ? "GTM 연결 확인 중..."
                    : gtmConnected
                    ? "GTM 연결됨 — 바로 배포 가능"
                    : "GTM 연결 (선택) — 없어도 엑셀 다운로드 가능"}
                </span>
              </div>
              {showGtm
                ? <ChevronUp className="w-4 h-4 text-gray-600" />
                : <ChevronDown className="w-4 h-4 text-gray-600" />}
            </button>

            {showGtm && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-800 space-y-3">
                {loading ? (
                  <p className="text-xs text-gray-500 py-2">GTM 계정 불러오는 중...</p>
                ) : error ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-300">{error}</p>
                    <p className="text-xs text-gray-500">
                      서비스 계정을 GTM 관리자로 추가하세요:<br />
                      <span className="text-blue-400 font-mono text-xs">tagauto-ai@puzlagency.iam.gserviceaccount.com</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">GTM 계정</label>
                      <select
                        value={selectedAccount}
                        onChange={(e) => {
                          setSelectedAccount(e.target.value);
                          const acc = accounts.find((a) => a.accountId === e.target.value);
                          setSelectedContainer(acc?.containers[0]?.containerId || "");
                        }}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      >
                        {accounts.map((a) => (
                          <option key={a.accountId} value={a.accountId}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-gray-500">컨테이너</label>
                      <select
                        value={selectedContainer}
                        onChange={(e) => setSelectedContainer(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                      >
                        {selectedAccountData?.containers.map((c) => (
                          <option key={c.containerId} value={c.containerId}>
                            {c.name} ({c.publicId})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={() => handleStart(true)}
                      disabled={!selectedAccount || !selectedContainer}
                      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                    >
                      <Rocket className="w-4 h-4" />
                      GTM 연결 후 분석 + 자동 배포
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── 소셜 훅 ── */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-600">
            <Coffee className="w-3.5 h-3.5" />
            <span>커피 한 잔 마시는 동안 GA4 셋업 끝납니다</span>
          </div>

        </div>
      </div>
    </div>
  );
}
