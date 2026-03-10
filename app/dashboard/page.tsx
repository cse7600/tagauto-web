"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Zap, Plus, FolderOpen, Globe, FileText, ChevronDown, ChevronUp,
  LogOut, ScanSearch, CheckCircle2, Clock, Loader2, AlertCircle, ExternalLink
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";

interface Session {
  id: string;
  url: string;
  domain: string;
  path: string;
  status: string;
  approved_events: unknown[] | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  updated_at: string;
  analysis_sessions: Session[];
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  completed: { icon: <CheckCircle2 className="w-3 h-3" />, label: "완료", cls: "text-green-400 bg-green-950/40" },
  analyzing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: "분석 중", cls: "text-blue-400 bg-blue-950/40" },
  pending:   { icon: <Clock className="w-3 h-3" />, label: "대기", cls: "text-gray-500 bg-gray-800" },
  error:     { icon: <AlertCircle className="w-3 h-3" />, label: "오류", cls: "text-red-400 bg-red-950/40" },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email?: string; user_metadata?: { name?: string } } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function init() {
      const { data: { user } } = await getSupabase().auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      setUser(user);
      await loadProjects(user.id);
    }
    init();
  }, [router]);

  async function loadProjects(userId: string) {
    setLoading(true);
    const { data } = await getSupabase()
      .from("projects")
      .select("id, name, updated_at, analysis_sessions(id, url, domain, path, status, approved_events, created_at)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (data) {
      setProjects(data as Project[]);
      if (data.length) setExpanded(new Set([data[0].id]));
    }
    setLoading(false);
  }

  async function createProject() {
    if (!newProjectName.trim()) return;
    setCreating(true);
    const { data: { user } } = await getSupabase().auth.getUser();
    if (!user) return;
    const { data } = await getSupabase()
      .from("projects")
      .insert({ user_id: user.id, name: newProjectName.trim() })
      .select().single();
    if (data) {
      setProjects((p) => [{ ...data, analysis_sessions: [] }, ...p]);
      setExpanded((s) => new Set([...s, data.id]));
      setNewProjectName("");
      router.push(`/projects/${data.id}`);
    }
    setCreating(false);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function groupByDomain(sessions: Session[]) {
    const map: Record<string, Session[]> = {};
    for (const s of sessions) {
      const key = s.domain || "unknown";
      (map[key] = map[key] || []).push(s);
    }
    return map;
  }

  const displayName = user?.user_metadata?.name || user?.email?.split("@")[0];

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur border-b border-gray-900 px-5 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" fill="white" />
          </div>
          <span className="font-bold tracking-tight">TagAuto AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 hidden sm:block">{displayName}</span>
          <button
            onClick={async () => { await getSupabase().auth.signOut(); router.push("/"); }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            로그아웃
          </button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* 새 분석 시작 */}
        <Link
          href="/analyze"
          className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 rounded-xl py-3 text-sm font-semibold transition-colors shadow-lg shadow-blue-900/20"
        >
          <ScanSearch className="w-4 h-4" />
          새 분석 시작
        </Link>

        {/* 새 프로젝트 */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              placeholder="새 프로젝트명 입력 (Enter)"
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <button
            onClick={createProject}
            disabled={!newProjectName.trim() || creating}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 rounded-xl text-sm transition-colors font-medium"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "만들기"}
          </button>
        </div>

        {/* 섹션 타이틀 */}
        <div className="flex items-center gap-2 pt-1">
          <FolderOpen className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-400">내 프로젝트</span>
        </div>

        {/* 프로젝트 목록 */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 h-32 text-gray-600 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            불러오는 중...
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-14 h-14 bg-gray-900 border border-gray-800 rounded-2xl flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-sm text-gray-500">아직 프로젝트가 없어요</p>
            <p className="text-xs text-gray-600">위에서 분석을 시작하거나 프로젝트를 만들어보세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const isOpen = expanded.has(project.id);
              const sessions = project.analysis_sessions || [];
              const totalApproved = sessions.reduce((s, x) => s + (x.approved_events?.length || 0), 0);
              const grouped = groupByDomain(sessions);

              return (
                <div key={project.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                  <div
                    className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-800/40 transition-colors"
                    onClick={() => toggleExpand(project.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FolderOpen className="w-4 h-4 text-blue-400 shrink-0" />
                      <span className="text-sm font-medium truncate">{project.name}</span>
                      {totalApproved > 0 && (
                        <span className="text-xs text-blue-300 bg-blue-950/50 border border-blue-900/50 px-1.5 py-0.5 rounded-md shrink-0">
                          {totalApproved}개
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/projects/${project.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors px-1.5"
                      >
                        열기
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                      {isOpen
                        ? <ChevronUp className="w-4 h-4 text-gray-600" />
                        : <ChevronDown className="w-4 h-4 text-gray-600" />}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-gray-800/70 px-4 py-3 space-y-3">
                      {sessions.length === 0 ? (
                        <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                          <Plus className="w-3.5 h-3.5" />
                          URL 추가하여 분석 시작
                        </Link>
                      ) : (
                        Object.entries(grouped).map(([domain, domainSessions]) => {
                          const cfg = STATUS_CONFIG;
                          return (
                            <div key={domain}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Globe className="w-3 h-3 text-gray-600" />
                                <span className="text-xs text-gray-500 font-mono">{domain}</span>
                              </div>
                              <div className="ml-4 space-y-0.5">
                                {domainSessions.map((s) => {
                                  const st = cfg[s.status] || cfg.pending;
                                  return (
                                    <Link
                                      key={s.id}
                                      href={`/projects/${project.id}?session=${s.id}`}
                                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-colors group"
                                    >
                                      <span className="text-xs font-mono text-gray-400 group-hover:text-gray-200 truncate flex-1">
                                        {s.path || "/"}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                        {s.approved_events && s.approved_events.length > 0 && (
                                          <span className="text-xs text-gray-600">{s.approved_events.length}개</span>
                                        )}
                                        <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md ${st.cls}`}>
                                          {st.icon}
                                          {st.label}
                                        </span>
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
