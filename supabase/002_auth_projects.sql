-- TagAuto AI v0.8 — 인증 + 프로젝트 관리 스키마

-- ────────────────────────────────────────────────
-- 1. 프로젝트 (유저가 만드는 작업 단위)
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_user ON projects(user_id);

-- ────────────────────────────────────────────────
-- 2. 분석 세션 (URL 단위, 프로젝트에 속함)
-- ────────────────────────────────────────────────
DROP TABLE IF EXISTS analysis_sessions CASCADE;

CREATE TABLE analysis_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url               TEXT NOT NULL,
  domain            TEXT,            -- "coupang.com"
  path              TEXT,            -- "/cart"
  status            TEXT NOT NULL DEFAULT 'pending',
                                     -- pending | analyzing | completed | error
  events            JSONB,           -- AI 생성 전체 이벤트
  approved_events   JSONB,           -- 승인된 이벤트
  gtm_workspace_id  TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_project  ON analysis_sessions(project_id);
CREATE INDEX idx_sessions_user     ON analysis_sessions(user_id);
CREATE INDEX idx_sessions_domain   ON analysis_sessions(domain);

-- ────────────────────────────────────────────────
-- 3. updated_at 자동 갱신
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON analysis_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────────
-- 4. RLS — 본인 데이터만 접근
-- ────────────────────────────────────────────────
ALTER TABLE projects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_projects"  ON projects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_sessions"  ON analysis_sessions
  FOR ALL USING (auth.uid() = user_id);
