"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, CheckCircle2, Clock, Loader2, AlertCircle,
  RefreshCw, Trash2, FileSpreadsheet, MapPin, MousePointerClick, Tag, X,
  Lightbulb, TrendingUp, ChevronDown, Download
} from "lucide-react";
import { getSupabase, type TaxonomyEvent } from "@/lib/supabase";

interface Session {
  id: string;
  url: string;
  domain: string;
  path: string;
  status: "pending" | "analyzing" | "completed" | "error";
  events: TaxonomyEvent[] | null;
  approved_events: TaxonomyEvent[] | null;
  error_message: string | null;
  created_at: string;
}

interface Project { id: string; name: string; }

type ViewMode = "marketer" | "developer";

const STATUS = {
  completed: { icon: CheckCircle2, label: "완료",    cls: "text-green-400 bg-green-950/40 border-green-900/50" },
  analyzing: { icon: Loader2,      label: "분석 중", cls: "text-blue-400 bg-blue-950/40 border-blue-900/50" },
  pending:   { icon: Clock,        label: "대기",    cls: "text-gray-500 bg-gray-800 border-gray-700" },
  error:     { icon: AlertCircle,  label: "오류",    cls: "text-red-400 bg-red-950/40 border-red-900/50" },
} as const;

export default function ProjectPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [project, setProject]     = useState<Project | null>(null);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("session"));
  const [urlInput, setUrlInput]   = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [viewMode, setViewMode]   = useState<ViewMode>("marketer");
  const [downloading, setDownloading] = useState(false);
  const [inputError, setInputError] = useState("");

  const supabase = getSupabase();

  const loadData = useCallback(async () => {
    const { data: proj } = await supabase.from("projects").select("id, name").eq("id", projectId).single();
    if (proj) setProject(proj);
    const { data: sess } = await supabase.from("analysis_sessions").select("*").eq("project_id", projectId).order("created_at");
    if (sess) {
      setSessions(sess as Session[]);
      if (!selectedId && sess.length) setSelectedId(sess[sess.length - 1].id);
    }
  }, [projectId, supabase, selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  // 분석 중 세션 폴링
  useEffect(() => {
    const analyzing = sessions.filter((s) => s.status === "analyzing");
    if (!analyzing.length) return;
    const timer = setInterval(async () => {
      const { data } = await supabase.from("analysis_sessions").select("*").in("id", analyzing.map((s) => s.id));
      if (data) setSessions((prev) => prev.map((s) => (data.find((u) => u.id === s.id) as Session) || s));
    }, 3000);
    return () => clearInterval(timer);
  }, [sessions, supabase]);

  async function addUrl() {
    if (!urlInput.trim()) return;
    setInputError(""); setAddingUrl(true);
    const normalized = urlInput.startsWith("http") ? urlInput : `https://${urlInput}`;
    let domain = "", path = "";
    try { const u = new URL(normalized); domain = u.hostname; path = u.pathname; } catch {}

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/auth/login"); return; }

    const { data: session, error } = await supabase
      .from("analysis_sessions")
      .insert({ project_id: projectId, user_id: user.id, url: normalized, domain, path, status: "analyzing" })
      .select().single();

    if (error) { setInputError(error.message); setAddingUrl(false); return; }

    setSessions((prev) => [...prev, session as Session]);
    setSelectedId(session.id);
    setUrlInput(""); setAddingUrl(false);
    runAnalysis(session.id, normalized);
  }

  async function runAnalysis(sessionId: string, url: string) {
    try {
      const crawlRes = await fetch("/api/crawl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const crawlData = await crawlRes.json();
      if (!crawlRes.ok) throw new Error(crawlData.error);

      const analyzeRes = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, domSnapshot: crawlData.domSnapshot }) });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(analyzeData.error);

      const events = (analyzeData.events || []).map((e: Omit<TaxonomyEvent, "status">) => ({ ...e, status: "pending" as const }));
      await supabase.from("analysis_sessions").update({ status: "completed", events, approved_events: [] }).eq("id", sessionId);
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "completed", events, approved_events: [] } : s));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "분석 실패";
      await supabase.from("analysis_sessions").update({ status: "error", error_message: msg }).eq("id", sessionId);
      setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, status: "error", error_message: msg } : s));
    }
  }

  async function toggleEvent(sessionId: string, idx: number) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.events) return;
    const updated = session.events.map((e, i) => i === idx ? { ...e, status: e.status === "approved" ? "rejected" : "approved" } : e) as TaxonomyEvent[];
    const approved = updated.filter((e) => e.status === "approved");
    await supabase.from("analysis_sessions").update({ events: updated, approved_events: approved }).eq("id", sessionId);
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, events: updated, approved_events: approved } : s));
  }

  async function approveAll(sessionId: string) {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.events) return;
    const updated = session.events.map((e) => ({ ...e, status: "approved" as const }));
    await supabase.from("analysis_sessions").update({ events: updated, approved_events: updated }).eq("id", sessionId);
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, events: updated, approved_events: updated } : s));
  }

  async function deleteSession(sessionId: string) {
    await supabase.from("analysis_sessions").delete().eq("id", sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (selectedId === sessionId) setSelectedId(sessions.find((s) => s.id !== sessionId)?.id || null);
  }

  async function downloadExcel(onlySession?: string) {
    setDownloading(true);
    const targets = onlySession
      ? sessions.filter((s) => s.id === onlySession)
      : sessions.filter((s) => s.status === "completed");
    const allEvents = targets.flatMap((s) => s.events || []);
    const res = await fetch("/api/taxonomy/export", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: allEvents, url: targets[0]?.url || "", projectName: project?.name || "" }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${project?.name || "택소노미"}_GA4.xlsx`; a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  const selected = sessions.find((s) => s.id === selectedId);
  const totalApproved = sessions.reduce((s, x) => s + (x.approved_events?.length || 0), 0);

  return (
    <div className="h-screen bg-gray-950 text-white font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 px-4 py-3 flex items-center gap-3 bg-gray-950">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          대시보드
        </Link>
        <span className="text-gray-700">·</span>
        <span className="text-sm font-semibold truncate text-gray-200">{project?.name || "프로젝트"}</span>

        {totalApproved > 0 && (
          <button
            onClick={() => downloadExcel()}
            disabled={downloading}
            className="ml-auto flex items-center gap-1.5 text-xs border border-blue-800 text-blue-400 hover:bg-blue-950/50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            전체 Excel ({totalApproved}개)
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 사이드바 */}
        <aside className="w-60 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
          {/* URL 입력 */}
          <div className="p-3 space-y-2 border-b border-gray-800">
            <div className="relative">
              <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrl()}
                placeholder="URL 추가..."
                className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-2.5 py-2 text-xs focus:outline-none focus:border-blue-500 transition-all placeholder:text-gray-600"
              />
            </div>
            {inputError && <p className="text-red-400 text-xs">{inputError}</p>}
            <button
              onClick={addUrl}
              disabled={!urlInput.trim() || addingUrl}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg py-1.5 text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
            >
              {addingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {addingUrl ? "추가 중..." : "URL 분석"}
            </button>
          </div>

          {/* URL 목록 */}
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-6 px-3">URL을 추가하면<br/>분석이 시작됩니다</p>
            ) : sessions.map((s) => {
              const st = STATUS[s.status] || STATUS.pending;
              const Icon = st.icon;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`group flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                    selectedId === s.id ? "bg-blue-950/50 border border-blue-800/60" : "hover:bg-gray-900 border border-transparent"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${s.status === "analyzing" ? "animate-spin" : ""} ${selectedId === s.id ? "text-blue-400" : "text-gray-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono truncate text-gray-300">{s.path || "/"}</p>
                    <p className="text-xs text-gray-600 truncate">{s.domain}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s.approved_events && s.approved_events.length > 0 && (
                      <span className="text-xs text-gray-500">{s.approved_events.length}</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* 메인 */}
        <main className="flex-1 overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
              <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center">
                <Plus className="w-7 h-7" />
              </div>
              <p className="text-sm">왼쪽에서 URL을 추가하세요</p>
            </div>
          ) : selected.status === "analyzing" ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 bg-blue-950/50 border border-blue-900/50 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">페이지 분석 중...</p>
                <p className="text-xs text-gray-500 font-mono">{selected.url}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>크롤링</span><span>→</span>
                <span>Gemini 분석</span><span>→</span>
                <span>택소노미 생성</span>
              </div>
            </div>
          ) : selected.status === "error" ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-12 h-12 bg-red-950/40 border border-red-900/50 rounded-2xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-red-300">분석 실패</p>
                <p className="text-xs text-gray-500">{selected.error_message}</p>
              </div>
              <button
                onClick={() => {
                  setSessions((p) => p.map((s) => s.id === selected.id ? { ...s, status: "analyzing" } : s));
                  runAnalysis(selected.id, selected.url);
                }}
                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-900 px-3 py-1.5 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                재시도
              </button>
            </div>
          ) : selected.status === "completed" && selected.events ? (
            <div className="p-5 space-y-4">
              {/* 상단 컨트롤 */}
              <div className="space-y-2">
                {/* URL + 버튼 행 */}
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-xs text-gray-500 font-mono truncate flex-1 min-w-0">{selected.url}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => approveAll(selected.id)}
                      className="text-xs text-blue-400 hover:text-blue-300 border border-blue-900/60 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      전체 승인
                    </button>
                    {(selected.approved_events?.length || 0) > 0 && (
                      <button
                        onClick={() => downloadExcel(selected.id)}
                        disabled={downloading}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 border border-gray-700 px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Excel
                      </button>
                    )}
                    <button onClick={() => deleteSession(selected.id)} className="text-gray-600 hover:text-red-400 transition-colors p-1.5">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {/* 이벤트 제안 카운트 */}
                <p className="text-base font-semibold">
                  이벤트 제안{" "}
                  <span className="text-blue-400 font-normal text-sm">
                    {selected.approved_events?.length || 0} / {selected.events.length}
                  </span>
                </p>
              </div>

              {/* 뷰 토글 */}
              <div className="flex bg-gray-900 border border-gray-800 rounded-xl p-0.5 w-fit">
                {(["marketer", "developer"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-colors font-medium ${
                      viewMode === m ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {m === "marketer" ? "마케터 뷰" : "개발자 뷰"}
                  </button>
                ))}
              </div>

              {/* 이벤트 카드들 */}
              <div className="space-y-2">
                {[...selected.events]
                  .map((e, i) => ({ ...e, _idx: i }))
                  .sort((a, b) => {
                    const o = { high: 0, medium: 1, low: 2 };
                    return (o[a.priority as keyof typeof o] ?? 1) - (o[b.priority as keyof typeof o] ?? 1);
                  })
                  .map((event) => {
                  const i = event._idx;
                  const approved = event.status === "approved";
                  const isLow = event.priority === "low";
                  return (
                    <div key={i} onClick={() => toggleEvent(selected.id, i)}
                      className={`border rounded-2xl p-4 cursor-pointer transition-all ${isLow ? "opacity-60 hover:opacity-80" : ""} ${
                        approved
                          ? "border-blue-600/50 bg-blue-950/20 shadow-sm shadow-blue-900/20"
                          : "border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/60"
                      }`}>
                      {viewMode === "marketer" ? (
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-start gap-2 flex-wrap">
                              {event.location && (
                                <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg shrink-0 mt-0.5">
                                  <MapPin className="w-3 h-3" />{event.location}
                                </span>
                              )}
                              <span className="text-sm font-medium text-white leading-snug">
                                {event.description_ko || event.trigger_text || event.event_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Tag className="w-3 h-3 text-blue-400/60" />
                              <span className="text-xs font-mono text-blue-300/70">{event.event_name}</span>
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
                            {event.marketer_insight && !isLow && (
                              <div className="flex items-start gap-1.5 bg-blue-950/20 border border-blue-900/30 rounded-xl px-2.5 py-2">
                                <Lightbulb className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-200/70 leading-relaxed">{event.marketer_insight}</p>
                              </div>
                            )}
                            {Object.keys(event.parameters).length > 0 && (
                              <p className="text-xs text-gray-500">수집: <span className="text-gray-400">{Object.keys(event.parameters).join(", ")}</span></p>
                            )}
                          </div>
                          <CheckCircleBtn checked={approved} />
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                              <MousePointerClick className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="text-sm font-mono text-blue-300">{event.event_name}</span>
                              {event.priority === "high" && <span className="text-xs text-orange-400">핵심</span>}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg border border-gray-700">{event.trigger_type}</span>
                              {(event.trigger_text || event.trigger_selector) && (
                                <span className="text-xs text-gray-600 font-mono truncate max-w-xs">{event.trigger_text || event.trigger_selector}</span>
                              )}
                            </div>
                            {Object.keys(event.parameters).length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {Object.entries(event.parameters).map(([k, v]) => (
                                  <span key={k} className="text-xs bg-gray-800/80 text-gray-400 px-2 py-0.5 rounded-lg font-mono border border-gray-700/50">
                                    {k}: <span className="text-gray-500">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <CheckCircleBtn checked={approved} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              <Clock className="w-4 h-4 mr-2" /> 대기 중...
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CheckCircleBtn({ checked }: { checked: boolean }) {
  return (
    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
      checked ? "bg-green-500 border-green-500" : "border-gray-600"
    }`}>
      {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
    </div>
  );
}
