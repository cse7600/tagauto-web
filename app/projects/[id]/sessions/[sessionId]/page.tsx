"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, CheckCircle2, Loader2, AlertCircle, RefreshCw,
  MapPin, Tag, TrendingUp, ChevronDown, Lightbulb,
  Image as ImageIcon, List, BarChart3, MousePointerClick,
  ExternalLink, Download,
} from "lucide-react";
import { getSupabase, type TaxonomyEvent } from "@/lib/supabase";

interface SessionDetail {
  id: string;
  project_id: string;
  url: string;
  domain: string | null;
  path: string | null;
  status: string;
  events: TaxonomyEvent[] | null;
  approved_events: TaxonomyEvent[] | null;
  screenshot_path: string | null;
  capture_metadata: {
    viewport?: { width: number; height: number };
    devicePixelRatio?: number;
  } | null;
  element_rects: ElementRect[] | null;
  capture_source: string | null;
  error_message: string | null;
  created_at: string;
}

interface ElementRect {
  selector?: string;
  text?: string;
  eventName?: string;
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Project {
  id: string;
  name: string;
}

type TabMode = "visual" | "events" | "stats";

export default function SessionDetailPage() {
  const { id: projectId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabMode>("visual");
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);
  const [imgScale, setImgScale] = useState(1);

  const supabase = getSupabase();

  const loadData = useCallback(async () => {
    setLoading(true);

    const [projRes, sessRes] = await Promise.all([
      supabase.from("projects").select("id, name").eq("id", projectId).single(),
      supabase.from("analysis_sessions").select("*").eq("id", sessionId).single(),
    ]);

    if (projRes.data) setProject(projRes.data);
    if (sessRes.data) {
      const s = sessRes.data as SessionDetail;
      setSession(s);

      // 스크린샷 URL 생성
      if (s.screenshot_path) {
        const { data } = supabase.storage
          .from("screenshots")
          .getPublicUrl(s.screenshot_path);
        // RLS가 적용된 private 버킷이면 createSignedUrl 사용
        const { data: signedData } = await supabase.storage
          .from("screenshots")
          .createSignedUrl(s.screenshot_path, 3600); // 1시간 유효
        if (signedData?.signedUrl) {
          setScreenshotUrl(signedData.signedUrl);
        } else if (data?.publicUrl) {
          setScreenshotUrl(data.publicUrl);
        }
      }
    }

    setLoading(false);
  }, [projectId, sessionId, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  // 분석 중이면 폴링
  useEffect(() => {
    if (!session || session.status !== "analyzing") return;
    const timer = setInterval(async () => {
      const { data } = await supabase
        .from("analysis_sessions")
        .select("*")
        .eq("id", sessionId)
        .single();
      if (data && data.status !== "analyzing") {
        setSession(data as SessionDetail);
        clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [session, sessionId, supabase]);

  // 이미지 로드 후 스케일 계산
  function onImageLoad() {
    if (!imgRef.current || !session?.capture_metadata?.viewport) return;
    const displayWidth = imgRef.current.clientWidth;
    const originalWidth = session.capture_metadata.viewport.width;
    setImgScale(displayWidth / originalWidth);
  }

  async function toggleEvent(idx: number) {
    if (!session?.events) return;
    const updated = session.events.map((e, i) =>
      i === idx ? { ...e, status: e.status === "approved" ? "rejected" : "approved" } : e
    ) as TaxonomyEvent[];
    const approved = updated.filter((e) => e.status === "approved");
    await supabase
      .from("analysis_sessions")
      .update({ events: updated, approved_events: approved })
      .eq("id", sessionId);
    setSession((prev) => prev ? { ...prev, events: updated, approved_events: approved } : prev);
  }

  async function approveAll() {
    if (!session?.events) return;
    const updated = session.events.map((e) => ({ ...e, status: "approved" as const }));
    await supabase
      .from("analysis_sessions")
      .update({ events: updated, approved_events: updated })
      .eq("id", sessionId);
    setSession((prev) => prev ? { ...prev, events: updated, approved_events: updated } : prev);
  }

  async function downloadExcel() {
    if (!session?.events) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/taxonomy/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: session.events,
          url: session.url,
          projectName: project?.name || "",
        }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "택소노미"}_${session.domain || "session"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  // 이벤트와 element_rects 매칭
  function findRectForEvent(event: TaxonomyEvent): ElementRect | null {
    if (!session?.element_rects) return null;
    return session.element_rects.find(
      (r) =>
        r.eventName === event.event_name ||
        (r.text && event.trigger_text && r.text === event.trigger_text) ||
        (r.selector && event.trigger_selector && r.selector === event.trigger_selector)
    ) || null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-500">세션을 찾을 수 없습니다</p>
      </div>
    );
  }

  const events = session.events || [];
  const approvedCount = events.filter((e) => e.status === "approved").length;
  const highCount = events.filter((e) => e.priority === "high").length;
  const medCount = events.filter((e) => e.priority === "medium").length;
  const lowCount = events.filter((e) => e.priority === "low").length;

  const sortedEvents = [...events]
    .map((e, i) => ({ ...e, _idx: i }))
    .sort((a, b) => {
      const o = { high: 0, medium: 1, low: 2 };
      return (o[a.priority as keyof typeof o] ?? 1) - (o[b.priority as keyof typeof o] ?? 1);
    });

  return (
    <div className="h-screen bg-gray-950 text-white font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="shrink-0 border-b border-gray-800 px-4 py-3 flex items-center gap-3 bg-gray-950">
        <Link
          href={`/projects/${projectId}`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {project?.name || "프로젝트"}
        </Link>
        <span className="text-gray-700">/</span>
        <span className="text-xs font-mono text-gray-400 truncate">
          {session.domain}{session.path}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {session.capture_source === "extension" && (
            <span className="text-xs text-green-400 bg-green-950/40 border border-green-900/50 px-2 py-0.5 rounded-md">
              익스텐션 캡처
            </span>
          )}
          <a
            href={session.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            원본
          </a>
          {approvedCount > 0 && (
            <button
              onClick={downloadExcel}
              disabled={downloading}
              className="flex items-center gap-1.5 text-xs border border-blue-800 text-blue-400 hover:bg-blue-950/50 px-3 py-1.5 rounded-lg transition-colors"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Excel ({approvedCount})
            </button>
          )}
        </div>
      </header>

      {/* Status bar for analyzing/error */}
      {session.status === "analyzing" && (
        <div className="shrink-0 bg-blue-950/30 border-b border-blue-900/50 px-4 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          <span className="text-xs text-blue-300">AI 분석 진행 중... 잠시 기다려주세요</span>
        </div>
      )}
      {session.status === "error" && (
        <div className="shrink-0 bg-red-950/30 border-b border-red-900/50 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span className="text-xs text-red-300">{session.error_message || "분석 실패"}</span>
          <button
            onClick={() => loadData()}
            className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <RefreshCw className="w-3 h-3" />
            재시도
          </button>
        </div>
      )}

      {/* Tab selector */}
      <div className="shrink-0 border-b border-gray-800 px-4 py-2 flex items-center gap-1">
        {([
          { key: "visual" as TabMode, icon: ImageIcon, label: "시각 미리보기" },
          { key: "events" as TabMode, icon: List, label: `이벤트 (${events.length})` },
          { key: "stats" as TabMode, icon: BarChart3, label: "통계" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === key
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-900"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}

        {events.length > 0 && (
          <button
            onClick={approveAll}
            className="ml-auto text-xs text-blue-400 hover:text-blue-300 border border-blue-900/60 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            전체 승인
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "visual" && (
          <div className="h-full flex">
            {/* 스크린샷 + 오버레이 */}
            <div className="flex-1 overflow-auto p-4">
              {screenshotUrl ? (
                <div className="relative inline-block">
                  <img
                    ref={imgRef}
                    src={screenshotUrl}
                    alt="페이지 캡처"
                    className="max-w-full rounded-xl border border-gray-800 shadow-2xl"
                    onLoad={onImageLoad}
                  />
                  {/* 이벤트 마커 오버레이 */}
                  {session.element_rects && events.map((event, i) => {
                    const rect = findRectForEvent(event);
                    if (!rect) return null;
                    const isHovered = hoveredEvent === event.event_name;
                    const isApproved = event.status === "approved";
                    return (
                      <div
                        key={i}
                        className={`absolute border-2 rounded transition-all cursor-pointer ${
                          isHovered
                            ? "border-yellow-400 bg-yellow-400/20 z-20"
                            : isApproved
                            ? "border-green-400/60 bg-green-400/10 z-10"
                            : "border-blue-400/40 bg-blue-400/5 z-10"
                        }`}
                        style={{
                          top: rect.top * imgScale,
                          left: rect.left * imgScale,
                          width: rect.width * imgScale,
                          height: rect.height * imgScale,
                        }}
                        onMouseEnter={() => setHoveredEvent(event.event_name)}
                        onMouseLeave={() => setHoveredEvent(null)}
                        onClick={() => toggleEvent(i)}
                      >
                        {/* 라벨 */}
                        <div
                          className={`absolute -top-5 left-0 text-xs font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                            isHovered
                              ? "bg-yellow-400 text-black"
                              : isApproved
                              ? "bg-green-500 text-white"
                              : "bg-blue-500 text-white"
                          }`}
                          style={{ fontSize: "9px" }}
                        >
                          {event.event_name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                  <ImageIcon className="w-12 h-12" />
                  <p className="text-sm">스크린샷이 없습니다</p>
                  <p className="text-xs text-gray-700">
                    익스텐션에서 캡처하면 여기에 미리보기가 표시됩니다
                  </p>
                </div>
              )}
            </div>

            {/* 사이드 이벤트 목록 (시각 탭에서) */}
            <aside className="w-72 shrink-0 border-l border-gray-800 overflow-y-auto">
              <div className="p-3 border-b border-gray-800">
                <p className="text-xs text-gray-500">
                  이벤트 {approvedCount} / {events.length} 승인
                </p>
              </div>
              <div className="p-2 space-y-1">
                {sortedEvents.map((event) => {
                  const isApproved = event.status === "approved";
                  const isHovered = hoveredEvent === event.event_name;
                  return (
                    <div
                      key={event._idx}
                      className={`p-2 rounded-lg cursor-pointer transition-all text-xs ${
                        isHovered
                          ? "bg-yellow-950/30 border border-yellow-800/50"
                          : isApproved
                          ? "bg-green-950/20 border border-green-900/30"
                          : "bg-gray-900/40 border border-gray-800/50 hover:border-gray-700"
                      }`}
                      onMouseEnter={() => setHoveredEvent(event.event_name)}
                      onMouseLeave={() => setHoveredEvent(null)}
                      onClick={() => toggleEvent(event._idx)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isApproved ? "bg-green-500 border-green-500" : "border-gray-600"
                          }`}
                        >
                          {isApproved && <CheckCircle2 className="w-2 h-2 text-white" />}
                        </div>
                        <span className="font-mono text-blue-300 truncate flex-1">
                          {event.event_name}
                        </span>
                        {event.priority === "high" && (
                          <TrendingUp className="w-3 h-3 text-orange-400 shrink-0" />
                        )}
                      </div>
                      {event.description_ko && (
                        <p className="text-gray-500 mt-1 pl-5 truncate">{event.description_ko}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>
          </div>
        )}

        {tab === "events" && (
          <div className="overflow-y-auto h-full p-5 space-y-2 max-w-3xl mx-auto">
            {sortedEvents.map((event) => {
              const isApproved = event.status === "approved";
              const isLow = event.priority === "low";
              return (
                <div
                  key={event._idx}
                  onClick={() => toggleEvent(event._idx)}
                  className={`border rounded-2xl p-4 cursor-pointer transition-all ${
                    isLow ? "opacity-60 hover:opacity-80" : ""
                  } ${
                    isApproved
                      ? "border-blue-600/50 bg-blue-950/20 shadow-sm shadow-blue-900/20"
                      : "border-gray-800 bg-gray-900/40 hover:border-gray-700 hover:bg-gray-900/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-start gap-2 flex-wrap">
                        {event.location && (
                          <span className="inline-flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-lg shrink-0">
                            <MapPin className="w-3 h-3" />
                            {event.location}
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
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <MousePointerClick className="w-3 h-3" />
                        <span>{event.trigger_type}</span>
                        {event.trigger_text && (
                          <span className="font-mono text-gray-500 truncate max-w-xs">
                            "{event.trigger_text}"
                          </span>
                        )}
                      </div>
                      {Object.keys(event.parameters).length > 0 && (
                        <p className="text-xs text-gray-500">
                          수집: <span className="text-gray-400">{Object.keys(event.parameters).join(", ")}</span>
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isApproved ? "bg-green-500 border-green-500" : "border-gray-600"
                      }`}
                    >
                      {isApproved && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "stats" && (
          <div className="overflow-y-auto h-full p-5 max-w-xl mx-auto space-y-4">
            <h3 className="text-sm font-semibold">분석 요약</h3>

            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="전체 이벤트" value={events.length} color="blue" />
              <StatCard label="승인됨" value={approvedCount} color="green" />
              <StatCard label="핵심 (high)" value={highCount} color="orange" />
              <StatCard label="중간 (medium)" value={medCount} color="blue" />
            </div>

            {/* 우선순위 분포 */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-400">우선순위 분포</p>
              <div className="space-y-2">
                <PriorityBar label="핵심" count={highCount} total={events.length} color="bg-orange-500" />
                <PriorityBar label="중간" count={medCount} total={events.length} color="bg-blue-500" />
                <PriorityBar label="참고" count={lowCount} total={events.length} color="bg-gray-600" />
              </div>
            </div>

            {/* 섹션별 분포 */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-400">페이지 섹션별 이벤트</p>
              <div className="space-y-1">
                {Object.entries(
                  events.reduce<Record<string, number>>((acc, e) => {
                    const loc = e.location || "기타";
                    acc[loc] = (acc[loc] || 0) + 1;
                    return acc;
                  }, {})
                )
                  .sort(([, a], [, b]) => b - a)
                  .map(([location, count]) => (
                    <div key={location} className="flex items-center justify-between text-xs py-1">
                      <span className="text-gray-400">{location}</span>
                      <span className="text-gray-500">{count}개</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* 캡처 정보 */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-medium text-gray-400">캡처 정보</p>
              <div className="text-xs space-y-1 text-gray-500">
                <p>URL: <span className="text-gray-400 font-mono">{session.url}</span></p>
                <p>소스: <span className="text-gray-400">{session.capture_source || "웹 크롤링"}</span></p>
                <p>생성: <span className="text-gray-400">{new Date(session.created_at).toLocaleString("ko-KR")}</span></p>
                {session.capture_metadata?.viewport && (
                  <p>
                    뷰포트: <span className="text-gray-400">
                      {session.capture_metadata.viewport.width} x {session.capture_metadata.viewport.height}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-950/30 border-blue-900/50",
    green: "text-green-400 bg-green-950/30 border-green-900/50",
    orange: "text-orange-400 bg-orange-950/30 border-orange-900/50",
  };
  return (
    <div className={`border rounded-xl p-3 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}

function PriorityBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-8">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-2">
        <div className={`${color} rounded-full h-2 transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-6 text-right">{count}</span>
    </div>
  );
}
