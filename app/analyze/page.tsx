"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import {
  Zap, ArrowLeft, CheckCircle2, AlertCircle, Loader2,
  MapPin, Tag, MousePointerClick, RefreshCw, Rocket, FileSpreadsheet,
  CheckCheck, RotateCcw, ScanSearch, Lightbulb, TrendingUp, ChevronDown
} from "lucide-react";

interface TaxonomyEvent {
  event_name: string;
  priority?: "high" | "medium" | "low";
  location?: string;
  description_ko?: string;
  marketer_insight?: string;
  trigger_type: "Click Text" | "Click ID" | "Form Submit" | "CSS Selector" | "Page View";
  trigger_selector: string;
  trigger_text: string;
  parameters: Record<string, string>;
  param_example?: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
}

interface ValidationResult {
  event_name: string;
  status: "ok" | "no_data" | "name_mismatch";
  ga4_event_name?: string;
  count?: number;
  message: string;
}

type Step = "input" | "crawling" | "reviewing" | "deploying" | "done" | "validating" | "validated";
type ViewMode = "marketer" | "developer";

const STORAGE_KEY = "tagauto_taxonomy_draft";

const STEP_LABELS = ["입력", "분석", "검수", "배포", "GA4 검증"];
const STEP_IDX: Record<Step, number> = { input: 0, crawling: 1, reviewing: 2, deploying: 3, done: 4, validating: 4, validated: 4 };

function AnalyzePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialUrl  = searchParams.get("url") || "";
  const accountId   = searchParams.get("accountId") || "";
  const containerId = searchParams.get("containerId") || "";

  const [url, setUrl]               = useState(initialUrl);
  const [projectName, setProjectName] = useState("");
  const [step, setStep]             = useState<Step>("input");
  const [events, setEvents]         = useState<TaxonomyEvent[]>([]);
  const [error, setError]           = useState("");
  const [deployedWorkspace, setDeployedWorkspace] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [validationSummary, setValidationSummary] = useState<{ ok: number; no_data: number; name_mismatch: number } | null>(null);
  const [viewMode, setViewMode]     = useState<ViewMode>("marketer");
  const [hasDraft, setHasDraft]     = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [fromExtension, setFromExtension] = useState(false);

  const hasGtm = !!(accountId && containerId);
  const approvedEvents = events.filter((e) => e.status === "approved");
  const approvedCount  = approvedEvents.length;

  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY)) setHasDraft(true); } catch {}
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.type !== "TAGAUTO_DOM_CAPTURE") return;
      const { url: capturedUrl, domSnapshot } = event.data;
      if (!domSnapshot) return;
      setFromExtension(true);
      if (capturedUrl) setUrl(capturedUrl);
      runGeminiAnalysis(capturedUrl || url, domSnapshot);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  async function runGeminiAnalysis(targetUrl: string, domSnapshot: unknown) {
    setStep("crawling"); setError("");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl, domSnapshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvents((data.events || []).map((e: Omit<TaxonomyEvent, "status">) => ({ ...e, status: "pending" as const })));
      setStep("reviewing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 분석 실패");
      setStep("input");
    }
  }

  async function handleAnalyze() {
    if (!url) return;
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    if (normalized !== url) setUrl(normalized);
    setStep("crawling"); setError("");
    try {
      const crawlRes = await fetch("/api/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: normalized }) });
      const crawlData = await crawlRes.json();
      if (!crawlRes.ok) throw new Error(crawlData.error);
      await runGeminiAnalysis(normalized, crawlData.domSnapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 중 오류 발생");
      setStep("input");
    }
  }

  async function handleDeploy() {
    setStep("deploying");
    try {
      const res = await fetch("/api/gtm/deploy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: approvedEvents, accountId, containerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDeployedWorkspace(data.workspaceId);
      try { localStorage.removeItem(STORAGE_KEY); setHasDraft(false); } catch {}
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "배포 중 오류 발생");
      setStep("reviewing");
    }
  }

  async function handleValidate() {
    if (!ga4PropertyId) return;
    setStep("validating"); setError("");
    try {
      const res = await fetch("/api/validate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: ga4PropertyId.replace(/^properties\//, ""), eventNames: approvedEvents.map((e) => e.event_name) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error + (data.hint ? `\n${data.hint}` : ""));
      setValidationResults(data.results);
      setValidationSummary(data.summary);
      setStep("validated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "GA4 검증 실패");
      setStep("done");
    }
  }

  async function handleDownloadExcel() {
    if (!approvedCount) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/taxonomy/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events, url, projectName }),
      });
      const blob = await res.blob();
      const burl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = burl;
      a.download = `${projectName || new URL(url || "https://example.com").hostname}_GA4_택소노미.xlsx`;
      a.click();
      URL.revokeObjectURL(burl);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, projectName, events, savedAt: new Date().toISOString() })); setHasDraft(true); } catch {}
    } catch {}
    setDownloading(false);
  }

  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
      setUrl(d.url || ""); setProjectName(d.projectName || ""); setEvents(d.events || []); setStep("reviewing");
    } catch {}
  }

  function toggleEvent(i: number) {
    setEvents((prev) => prev.map((e, idx) => idx === i ? { ...e, status: e.status === "approved" ? "rejected" : "approved" } : e));
  }

  function resetAll() { setStep("input"); setEvents([]); setUrl(""); setProjectName(""); }

  const valIcon  = { ok: "✅", no_data: "⚠️", name_mismatch: "❌" };
  const valColor = { ok: "border-green-800/60 bg-green-950/20", no_data: "border-yellow-800/60 bg-yellow-950/20", name_mismatch: "border-red-800/60 bg-red-950/20" };

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* Header */}
      <header className="px-4 py-3 flex items-center justify-between border-b border-gray-900">
        <button onClick={() => router.push("/")} className="flex items-center gap-2 group">
          <ArrowLeft className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
          <div className="w-6 h-6 bg-blue-500 rounded-md flex items-center justify-center">
            <Zap className="w-3 h-3 text-white" fill="white" />
          </div>
          <span className="font-bold text-sm">TagAuto AI</span>
        </button>
        <div className="flex items-center gap-2">
          {fromExtension && (
            <span className="flex items-center gap-1 text-xs text-purple-400 bg-purple-950/40 border border-purple-900/50 px-2 py-0.5 rounded-full">
              <ScanSearch className="w-3 h-3" /> 익스텐션 캡처
            </span>
          )}
          {hasGtm && (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-950/40 border border-green-900/50 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" /> GTM 연결됨
            </span>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-4 pt-4 pb-1">
        <div className="flex gap-1 mb-2">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${i <= STEP_IDX[step] ? "bg-blue-500" : "bg-gray-800"}`} />
          ))}
        </div>
        <div className="flex justify-between">
          {STEP_LABELS.map((s, i) => (
            <span key={s} className={`text-xs transition-colors ${i <= STEP_IDX[step] ? "text-gray-400" : "text-gray-700"}`}>{s}</span>
          ))}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {/* ── 입력 ── */}
        {step === "input" && (
          <div className="space-y-4">
            {hasDraft && (
              <div className="flex items-center justify-between p-3 bg-blue-950/30 border border-blue-900/50 rounded-xl text-xs">
                <span className="text-blue-300">이전 분석 결과가 있습니다</span>
                <div className="flex gap-2">
                  <button onClick={loadDraft} className="text-blue-300 hover:text-blue-200 underline">불러오기</button>
                  <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setHasDraft(false); }} className="text-gray-500 hover:text-gray-300">삭제</button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">프로젝트명 <span className="text-gray-600">(선택)</span></label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="예: 쿠팡, GYMBOXX, 무신사"
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">분석할 페이지 URL</label>
              <p className="text-xs text-gray-600">핵심 전환 페이지를 입력하세요 (메인, 회원가입, 장바구니, 결제 등)</p>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                placeholder="puzl.co.kr 또는 https://puzl.co.kr"
                autoFocus
                className="w-full bg-gray-900 border border-gray-800 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-red-400 text-xs bg-red-950/20 border border-red-900/40 rounded-xl px-3 py-2.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap">{error}</span>
              </div>
            )}

            <button onClick={handleAnalyze} disabled={!url}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20">
              <ScanSearch className="w-4 h-4" /> AI 분석 시작
            </button>

            {!hasGtm && (
              <p className="text-center text-xs text-gray-600">GTM 미연결 — 택소노미 생성 및 Excel 다운로드 가능</p>
            )}
          </div>
        )}

        {/* ── 분석 중 ── */}
        {step === "crawling" && (
          <div className="flex flex-col items-center justify-center min-h-64 gap-5">
            <div className="w-14 h-14 bg-blue-950/50 border border-blue-900/50 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-sm font-semibold">페이지 분석 중...</p>
              <p className="text-xs text-gray-500 font-mono break-all max-w-[280px]">{url}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              {fromExtension
                ? <><span className="text-purple-400">DOM 캡처 완료</span><span>→</span><span>Gemini 분석</span><span>→</span><span>택소노미</span></>
                : <><span>크롤링</span><span>→</span><span>Gemini 분석</span><span>→</span><span>택소노미</span></>
              }
            </div>
          </div>
        )}

        {/* ── 검수 ── */}
        {step === "reviewing" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">이벤트 제안 <span className="text-blue-400 font-normal">{approvedCount}/{events.length}</span></p>
                <p className="text-xs text-gray-600 mt-0.5">카드를 클릭해 승인/해제</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => setEvents((p) => p.map((e) => ({ ...e, status: "approved" })))}
                  className="flex items-center gap-1 text-blue-400 hover:text-blue-300">
                  <CheckCheck className="w-3.5 h-3.5" /> 전체 승인
                </button>
                <button onClick={() => { setStep("input"); setEvents([]); }}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-300">
                  <RotateCcw className="w-3.5 h-3.5" /> 재분석
                </button>
              </div>
            </div>

            {/* 뷰 토글 */}
            <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-0.5">
              {(["marketer", "developer"] as ViewMode[]).map((m) => (
                <button key={m} onClick={() => setViewMode(m)}
                  className={`flex-1 py-1.5 text-xs rounded-lg transition-colors font-medium ${viewMode === m ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"}`}>
                  {m === "marketer" ? "마케터 뷰" : "개발자 뷰"}
                </button>
              ))}
            </div>

            {/* 이벤트 목록 */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {/* high/medium 먼저, low는 뒤에 */}
              {[...events]
                .map((e, i) => ({ ...e, _idx: i }))
                .sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2, undefined: 1 };
                  return (order[a.priority as keyof typeof order] ?? 1) - (order[b.priority as keyof typeof order] ?? 1);
                })
                .map((event) => {
                const i = event._idx;
                const approved = event.status === "approved";
                const isLow = event.priority === "low";
                return (
                  <div key={i} onClick={() => toggleEvent(i)}
                    className={`border rounded-2xl cursor-pointer transition-all ${
                      isLow ? "opacity-60 hover:opacity-80" : ""
                    } ${
                      approved ? "border-blue-600/50 bg-blue-950/20" : "border-gray-800 bg-gray-900/40 hover:border-gray-700"
                    }`}>
                    <div className="p-3.5">
                    {viewMode === "marketer" ? (
                      <div className="flex gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* 상단: 위치 + 행동 설명 */}
                          <div className="flex items-start gap-2 flex-wrap">
                            {event.location && (
                              <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-lg shrink-0 mt-0.5">
                                <MapPin className="w-2.5 h-2.5" />{event.location}
                              </span>
                            )}
                            <span className="text-sm font-medium leading-snug">
                              {event.description_ko || event.trigger_text || event.event_name}
                            </span>
                          </div>

                          {/* 이벤트명 */}
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3 h-3 text-blue-400/50" />
                            <span className="text-xs font-mono text-blue-300/60">{event.event_name}</span>
                            {event.priority === "high" && (
                              <span className="text-xs text-orange-400 bg-orange-950/40 border border-orange-900/40 px-1.5 py-0 rounded-md flex items-center gap-0.5">
                                <TrendingUp className="w-2.5 h-2.5" /> 핵심
                              </span>
                            )}
                            {isLow && (
                              <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0 rounded-md flex items-center gap-0.5">
                                <ChevronDown className="w-2.5 h-2.5" /> 참고용
                              </span>
                            )}
                          </div>

                          {/* 마케터 인사이트 */}
                          {event.marketer_insight && !isLow && (
                            <div className="flex items-start gap-1.5 bg-blue-950/20 border border-blue-900/30 rounded-xl px-2.5 py-2">
                              <Lightbulb className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                              <p className="text-xs text-blue-200/70 leading-relaxed">{event.marketer_insight}</p>
                            </div>
                          )}

                          {/* 수집 데이터 */}
                          {Object.keys(event.parameters).length > 0 && (
                            <p className="text-xs text-gray-500">
                              수집: <span className="text-gray-400">{Object.keys(event.parameters).join(", ")}</span>
                            </p>
                          )}
                        </div>
                        <CheckDot checked={approved} />
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <MousePointerClick className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-sm font-mono text-blue-300">{event.event_name}</span>
                            {event.priority === "high" && <span className="text-xs text-orange-400">핵심</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-lg border border-gray-700">{event.trigger_type}</span>
                            <span className="text-xs text-gray-600 font-mono truncate max-w-[180px]">{event.trigger_text || event.trigger_selector}</span>
                          </div>
                          {Object.keys(event.parameters).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(event.parameters).map(([k, v]) => (
                                <span key={k} className="text-xs bg-gray-800/80 text-gray-400 px-1.5 py-0.5 rounded-lg font-mono border border-gray-700/50">
                                  {k}: <span className="text-gray-500">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <CheckDot checked={approved} />
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <div className="flex items-center gap-2 text-red-400 text-xs bg-red-950/20 border border-red-900/40 rounded-xl px-3 py-2"><AlertCircle className="w-3.5 h-3.5" />{error}</div>}

            <div className="space-y-2 pt-1">
              <button onClick={handleDownloadExcel} disabled={!approvedCount || downloading}
                className="w-full flex items-center justify-center gap-2 border border-blue-800/60 text-blue-400 hover:bg-blue-950/40 disabled:opacity-40 rounded-xl py-2.5 text-sm font-medium transition-colors">
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {downloading ? "Excel 생성 중..." : `택소노미 Excel 다운로드 (${approvedCount}개)`}
              </button>

              {hasGtm ? (
                <button onClick={handleDeploy} disabled={!approvedCount}
                  className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded-xl py-2.5 text-sm font-semibold transition-colors">
                  <Rocket className="w-4 h-4" /> {approvedCount}개 이벤트 GTM 배포
                </button>
              ) : (
                <div className="text-center py-2.5 border border-gray-800 rounded-xl">
                  <p className="text-xs text-gray-500">GTM 배포는 홈에서 GTM 계정 연결 후 가능합니다</p>
                  <button onClick={() => router.push("/")} className="text-xs text-blue-400 hover:text-blue-300 mt-0.5">GTM 연결하러 가기 →</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 배포 중 ── */}
        {step === "deploying" && (
          <div className="flex flex-col items-center justify-center min-h-64 gap-5">
            <div className="w-14 h-14 bg-green-950/50 border border-green-900/50 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-green-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">GTM 배포 중...</p>
              <p className="text-xs text-gray-500 mt-1">AI_Draft Workspace 생성 중</p>
            </div>
          </div>
        )}

        {/* ── 배포 완료 ── */}
        {step === "done" && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 py-5 text-center">
              <div className="w-14 h-14 bg-green-950/50 border border-green-900/50 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-green-400" />
              </div>
              <div>
                <p className="font-semibold">GTM 배포 완료!</p>
                <p className="text-xs text-gray-500 mt-1">GTM &gt; AI_Draft (Workspace #{deployedWorkspace}) 확인 후 게시하세요</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold">GA4 정합성 검증</p>
                <p className="text-xs text-gray-500 mt-0.5">GTM 게시 후 이벤트를 발생시키고 검증하세요</p>
              </div>
              <input type="text" value={ga4PropertyId} onChange={(e) => setGa4PropertyId(e.target.value)}
                placeholder="GA4 Property ID (예: 123456789)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all" />
              <p className="text-xs text-gray-600">GA4 관리 → 속성 설정 → 속성 ID</p>
              {error && <div className="flex items-start gap-2 text-red-400 text-xs bg-red-950/20 border border-red-900/40 rounded-xl px-3 py-2"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span className="whitespace-pre-wrap">{error}</span></div>}
              <button onClick={handleValidate} disabled={!ga4PropertyId}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> GA4 정합성 검증
              </button>
            </div>

            <button onClick={resetAll} className="w-full text-sm text-gray-500 hover:text-gray-300 border border-gray-800 hover:border-gray-700 rounded-xl py-2.5 transition-colors flex items-center justify-center gap-2">
              <RefreshCw className="w-3.5 h-3.5" /> 새 페이지 분석
            </button>
          </div>
        )}

        {/* ── GA4 검증 중 ── */}
        {step === "validating" && (
          <div className="flex flex-col items-center justify-center min-h-64 gap-5">
            <div className="w-14 h-14 bg-blue-950/50 border border-blue-900/50 rounded-2xl flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold">GA4 정합성 검증 중...</p>
              <p className="text-xs text-gray-500 mt-1">Realtime API로 이벤트 수신 확인</p>
            </div>
          </div>
        )}

        {/* ── 검증 결과 ── */}
        {step === "validated" && validationSummary && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "정상",   count: validationSummary.ok,            color: "text-green-400",  bg: "bg-green-950/30 border-green-900/50" },
                { label: "미수신", count: validationSummary.no_data,        color: "text-yellow-400", bg: "bg-yellow-950/30 border-yellow-900/50" },
                { label: "불일치", count: validationSummary.name_mismatch,  color: "text-red-400",    bg: "bg-red-950/30 border-red-900/50" },
              ].map((s) => (
                <div key={s.label} className={`border rounded-2xl p-3 text-center ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.count}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {validationResults.map((r, i) => (
                <div key={i} className={`border rounded-2xl p-3.5 ${valColor[r.status]}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm">{valIcon[r.status]}</span>
                    <span className="text-sm font-mono">{r.event_name}</span>
                    {r.count !== undefined && r.count > 0 && (
                      <span className="ml-auto text-xs text-green-400">{r.count}건</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">{r.message}</p>
                  {r.ga4_event_name && (
                    <p className="text-xs text-red-300 mt-1 font-mono">→ GA4에서는 &quot;{r.ga4_event_name}&quot; 로 수신 중</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep("done")}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm text-gray-400 border border-gray-700 hover:border-gray-600 rounded-xl py-2.5 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> 재검증
              </button>
              <button onClick={resetAll}
                className="flex-1 text-sm bg-blue-600 hover:bg-blue-500 rounded-xl py-2.5 font-medium transition-colors">
                새 페이지 분석
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckDot({ checked }: { checked: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
      checked ? "border-blue-500 bg-blue-500" : "border-gray-600"
    }`}>
      {checked && <CheckCircle2 className="w-3 h-3 text-white" fill="white" strokeWidth={0} />}
    </div>
  );
}

export default function Page() {
  return <Suspense><AnalyzePage /></Suspense>;
}
