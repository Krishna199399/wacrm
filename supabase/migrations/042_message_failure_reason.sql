-- ============================================================
-- 042 — store WHY a message failed
--
-- Meta can reject a message AFTER accepting it (the send returned a
-- wamid, then the webhook reports status "failed"). The webhook's
-- statuses[].errors[0] carries the reason — e.g. 131049 "not delivered
-- to maintain healthy ecosystem engagement" (marketing limit), 131026
-- (not on WhatsApp), 131050 (user opted out of marketing). Until now the
-- reason was discarded and the inbox could only show a red ✕.
--
-- The webhook writes these on failed statuses; the inbox shows them on
-- the ✕. Nullable, no backfill (old failures' reasons are gone).
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_code  INTEGER;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error_title TEXT;

NOTIFY pgrst, 'reload schema';
