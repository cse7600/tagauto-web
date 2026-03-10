import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;
let _admin: SupabaseClient | null = null;

export function getSupabase() {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { fetch: (url, opts) => fetch(url, { ...opts, cache: "no-store" }) } }
    );
  }
  return _client;
}

export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _admin;
}

// DB 타입
export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  // 조인 필드
  session_count?: number;
  last_url?: string;
}

export interface AnalysisSession {
  id: string;
  project_id: string | null;
  user_id: string;
  url: string;
  domain: string | null;
  path: string | null;
  status: "pending" | "analyzing" | "completed" | "error";
  events: TaxonomyEvent[] | null;
  approved_events: TaxonomyEvent[] | null;
  gtm_workspace_id: string | null;
  error_message: string | null;
  screenshot_path: string | null;
  capture_metadata: {
    viewport?: { width: number; height: number };
    devicePixelRatio?: number;
    scrollY?: number;
    scrollX?: number;
    capturedAt?: string;
  } | null;
  element_rects: Array<{
    selector?: string;
    text?: string;
    eventName?: string;
    top: number;
    left: number;
    width: number;
    height: number;
  }> | null;
  capture_source: "extension" | "crawl" | null;
  created_at: string;
  updated_at: string;
}

export interface TaxonomyEvent {
  event_name: string;
  priority?: "high" | "medium" | "low";
  location?: string;
  description_ko?: string;
  marketer_insight?: string;
  trigger_type: string;
  trigger_selector: string;
  trigger_text: string;
  parameters: Record<string, string>;
  param_example?: string;
  notes?: string;
  status: "pending" | "approved" | "rejected";
}
