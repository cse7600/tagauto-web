import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// 프로젝트 목록 조회
export async function GET(req: NextRequest) {
  const supabase = getSupabase();

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    await supabase.auth.setSession({
      access_token: authHeader.replace("Bearer ", ""),
      refresh_token: "",
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { data: projects, error } = await supabase
    .from("projects")
    .select(`
      id, name, created_at, updated_at,
      analysis_sessions(id, url, domain, path, status, approved_events, created_at)
    `)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ projects });
}

// 프로젝트 생성
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    await supabase.auth.setSession({
      access_token: authHeader.replace("Bearer ", ""),
      refresh_token: "",
    });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "프로젝트명이 필요합니다." }, { status: 400 });

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: name.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: data });
}
