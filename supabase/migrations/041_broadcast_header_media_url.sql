-- ============================================================
-- 041_broadcast_header_media_url
--
-- Image/video/document-header templates must carry the media link on
-- EVERY send — Meta approval does not attach a reusable image. The
-- dashboard wizard collects that URL in the Personalize step and sends
-- it with each batch, but never persisted it. A server-side Resume /
-- Retry-failed pass (migration 038) therefore only had the template
-- row's header_media_url to fall back on — which is NULL for templates
-- imported via "Sync from Meta" — and every resumed recipient failed
-- with "image header requires a media link or id at send time".
--
-- Freezing the URL on the broadcast row lets a resume send exactly
-- what the original pass sent.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS header_media_url TEXT;

COMMENT ON COLUMN broadcasts.header_media_url IS
  'Media link for an IMAGE/VIDEO/DOCUMENT template header, as chosen in the broadcast wizard. Reused by resume/retry passes. NULL for text/no-header templates and for broadcasts created before migration 041 (resume then falls back to message_templates.header_media_url).';
