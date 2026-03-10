-- TagAuto AI 초기 스키마

-- GTM OAuth 연결 정보
CREATE TABLE IF NOT EXISTS gtm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL DEFAULT '',
  container_id TEXT NOT NULL DEFAULT '',
  container_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 분석 세션
CREATE TABLE IF NOT EXISTS analysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  dom_snapshot JSONB,
  events JSONB,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | reviewing | deployed
  workspace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_analysis_sessions_user ON analysis_sessions(user_id);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gtm_connections_updated_at
  BEFORE UPDATE ON gtm_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
