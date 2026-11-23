-- ============================================================
-- 040_inbox_whatsapp_features
--
-- Schema for the WhatsApp-style inbox features. Everything here is
-- CRM-side state: the WhatsApp Cloud API has no star, pin or edit
-- operations for businesses, so none of it is pushed to Meta.
--
--   messages.is_forwarded / is_frequently_forwarded
--     Copied from Meta's inbound `context.forwarded` and
--     `context.frequently_forwarded` flags (the latter = forwarded
--     more than five times). Drives the "Forwarded" label.
--
--   messages.starred_at / starred_by
--     Shared across the account (team inbox): a starred message shows
--     the star for every member. NULL = not starred.
--
--   messages.pinned_at / pinned_by
--     A message pinned in its chat; shown in a banner at the top of
--     the thread. Shared across the account.
--
--   messages.correction_of_message_id
--     The Cloud API cannot edit a sent message, so "Edit" sends a new
--     message that replies to the original. This column marks such a
--     message as a correction of an earlier one of ours.
--
--   conversations.pinned_at
--     Pinned chats sort to the top of the inbox list. Shared.
--
-- RLS: no policy changes. The existing messages_modify and
-- conversations_update policies (migration 017) already let account
-- agents update these rows; viewers stay read-only.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_frequently_forwarded BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS starred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS starred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_of_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Starred / pinned lookups are per conversation and sparse.
CREATE INDEX IF NOT EXISTS idx_messages_starred
  ON messages (conversation_id, starred_at)
  WHERE starred_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON messages (conversation_id, pinned_at)
  WHERE pinned_at IS NOT NULL;
