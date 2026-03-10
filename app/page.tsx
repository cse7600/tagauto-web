"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, Rocket, ScanSearch } from "lucide-react";

interface Container {
  containerId: string;
  name: string;
  publicId: string;
}

interface Account {
  accountId: string;
  name: string;
  containers: Container[];
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedContainer, setSelectedContainer] = useState("");
  const [showGtm, setShowGtm] = useState(false);

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
            시작하기
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-1.5 text-xs text-blue-400 bg-blue-950/60 border border-blue-900 px-3 py-1 rounded-full mb-2">
              <Zap className="w-3 h-3" />
              AI 기반 GA4 이벤트 자동화
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              URL 하나로<br />GA4 택소노미 완성
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              페이지를 분석하고 GA4 이벤트 명세서를 자동 생성합니다<br />
              마케터도 개발자도 5분 안에 완료
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={() => handleStart(false)}
            className="w-full bg-blue-600 hover:bg-blue-500 rounded-xl py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30"
          >
            <ScanSearch className="w-4 h-4" />
            무료로 분석 시작
          </button>

          {/* Feature pills */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: ScanSearch, label: "AI 크롤링" },
              { icon: FileSpreadsheet, label: "Excel 명세서" },
              { icon: Rocket, label: "GTM 자동 배포" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col items-center gap-2">
                <Icon className="w-5 h-5 text-blue-400" />
                <span className="text-xs text-gray-400">{label}</span>
              </div>
            ))}
          </div>

          {/* GTM 연결 (선택) */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
                    : "GTM 미연결 — 택소노미만 생성"}
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
                      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Rocket className="w-4 h-4" />
                      GTM 연결 후 분석 시작
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
