import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 세션 목록 조회
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = getSupabase();

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    await supabase.auth.setSession({ access_token: authHeader.replace("Bearer ", ""), refresh_token: "" });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data, error } = await supabase
    .from("analysis_sessions")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sessions: data });
}

// 세션 추가 (URL 큐에 추가)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = getSupabase();

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    await supabase.auth.setSession({ access_token: authHeader.replace("Bearer ", ""), refresh_token: "" });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL이 필요합니다." }, { status: 400 });

  // URL 파싱 → domain, path 분리
  let domain = "";
  let path = "";
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    domain = parsed.hostname;
    path = parsed.pathname;
  } catch {}

  const { data, error } = await supabase
    .from("analysis_sessions")
    .insert({ project_id: projectId, user_id: user.id, url, domain, path, status: "pending" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ session: data });
}
