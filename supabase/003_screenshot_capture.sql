-- TagAuto AI v0.9 -- 스크린샷 캡처 + 익스텐션 단순화 스키마 변경

-- 1. analysis_sessions에 스크린샷 및 캡처 메타데이터 컬럼 추가
ALTER TABLE analysis_sessions
  ADD COLUMN IF NOT EXISTS screenshot_path TEXT,          -- Storage 경로: screenshots/{user_id}/{session_id}.png
  ADD COLUMN IF NOT EXISTS capture_metadata JSONB,        -- { viewport, devicePixelRatio, capturedAt }
  ADD COLUMN IF NOT EXISTS element_rects JSONB,           -- [{ selector, text, top, left, width, height, pageTop, pageLeft }]
  ADD COLUMN IF NOT EXISTS capture_source TEXT DEFAULT 'crawl';  -- 'extension' | 'crawl'

-- 2. Supabase Storage 버킷 생성 (Dashboard에서 수동 생성 필요)
-- 버킷명: screenshots
-- Public: false

-- 3. Storage RLS 정책
-- (Supabase Dashboard > Storage > screenshots > Policies에서 설정)
-- INSERT: authenticated, path starts with auth.uid()
-- SELECT: authenticated, path starts with auth.uid()

-- SQL로 설정하려면:
-- CREATE POLICY "Users upload own screenshots"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);

-- CREATE POLICY "Users read own screenshots"
-- ON storage.objects FOR SELECT TO authenticated
-- USING (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
