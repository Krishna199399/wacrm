"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePresence } from "@/hooks/use-presence";
import { PresenceDot } from "@/components/presence/presence-dot";
import { presenceLabel, type PresenceRow, type PresenceStatus } from "@/lib/presence";
import { cn } from "@/lib/utils";
import type {
  Conversation,
  Message,
  MessageReaction,
  Contact,
  ConversationStatus,
  MessageTemplate,
  Profile,
  InteractiveMessagePayload,
} from "@/types";
import {
  MessageCircle,
  ChevronDown,
  UserPlus,
  Check,
  Clock,
  ArrowLeft,
  RefreshCw,
  PanelRightOpen,
  PanelRightClose,
  Phone,
  Search,
  MoreVertical,
  X,
  Pin,
  PinOff,
} from "lucide-react";
import { useTyping } from "@/hooks/use-typing";
import { useCan } from "@/hooks/use-can";
import { format, isToday, isYesterday, differenceInHours } from "date-fns";
import { useTranslations } from "next-intl";
import { ContactAvatar } from "./contact-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageBubble } from "./message-bubble";
import { MessageActions } from "./message-actions";
import { MediaLightbox } from "./media-lightbox";
import { collectMediaGallery } from "@/lib/media/gallery";
import {
  MessageComposer,
  CHAT_MEDIA_BUCKET,
  type SendMediaPayload,
} from "./message-composer";
import { deleteAccountMedia } from "@/lib/storage/upload-media";
import { TemplatePicker } from "./template-picker";
import { AiThreadBanner } from "./ai-thread-banner";
import { buildReplyPreview } from "./reply-quote";
import { renderTemplateBody } from "@/lib/whatsapp/template-body";
import { toast } from "sonner";

interface ReplyDraft {
  id: string;
  authorLabel: string;
  preview: string;
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  onAssignChange: (
    conversationId: string,
    assignedAgentId: string | null,
  ) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
  /**
   * Increment to force the messages + reactions fetch effects to refire.
   * Parent bumps this on realtime reconnect / tab visibility → visible
   * so the open thread catches up on any events sent while the WS was
   * disconnected or the tab was throttled. Optional so existing callers
   * keep working.
   */
  resyncToken?: number;
  /**
   * Fired by the manual-refresh button in the thread header. The parent
   * typically bumps the same `resyncToken` it controls — this gives the
   * user a way to force a refetch when they suspect realtime missed an
   * event (or they're impatient). Optional so existing callers keep
   * working; the button is only rendered when this is provided.
   */
  onRefresh?: () => void;
  /**
   * Desktop-only contact-panel toggle. The page owns the open/closed
   * state (it's the one that renders the sidebar), so the thread just
   * reflects it and asks the page to flip it. Both optional so existing
   * callers keep working; the toggle button only renders when
   * `onToggleContactPanel` is wired up.
   */
  contactPanelOpen?: boolean;
  onToggleContactPanel?: () => void;
  initialComposerText?: string;
  /** Pin / unpin the whole chat (sorts to the top of the list). */
  onPinChatChange?: (conversationId: string, pinnedAt: string | null) => void;
}

function formatDateSeparator(dateStr: string, t: ReturnType<typeof useTranslations>): string {
  const date = new Date(dateStr);
  if (isToday(date)) return t("today");
  if (isYesterday(date)) return t("yesterday");
  return format(date, "MMMM d, yyyy");
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: { label: string; value: ConversationStatus; dot: string }[] = [
  { label: "Open", value: "open", dot: "bg-wa-green" },
  { label: "Pending", value: "pending", dot: "bg-amber-500" },
  { label: "Closed", value: "closed", dot: "bg-wa-text-2" },
];

const isOutbound = (m: Message) =>
  m.sender_type === "agent" || m.sender_type === "bot";

const HEADER_ICON_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-wa-icon transition-colors hover:bg-wa-hover disabled:opacity-60";

const HEADER_PILL =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-wa-divider bg-wa-panel px-3 text-[13px] font-medium text-wa-text transition-colors hover:bg-wa-hover data-popup-open:bg-wa-hover";

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onAssignChange,
  onBack,
  resyncToken = 0,
  onRefresh,
  contactPanelOpen,
  onToggleContactPanel,
  initialComposerText,
  onPinChatChange,
}: MessageThreadProps) {
  const t = useTranslations("Inbox.messageThread");
  const tTimer = useTranslations("Inbox.sessionTimer");
  const tQuote = useTranslations("Inbox.replyQuote");

  const { user, profile } = useAuth();
  const canSend = useCan("send-messages");
  // "Edit" = send a correction (the Cloud API can't edit a sent message).
  const [correcting, setCorrecting] = useState<ReplyDraft | null>(null);
  // Which pinned message the banner shows (cycles on click), and which
  // row to flash after jumping to it.
  const [pinIndex, setPinIndex] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const { getPresence, getRow, now } = usePresence();
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [reactions, setReactions] = useState<MessageReaction[]>([]);
  // Purely visual spin state for the manual-refresh button. The actual
  // refetch is fire-and-forget through `onRefresh` (which bumps the
  // parent's resyncToken); the 700ms spin is just feedback so the click
  // doesn't feel like a no-op. Cleared via the timer ref on unmount.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);
  const handleRefreshClick = useCallback(() => {
    if (isRefreshing || !onRefresh) return;
    setIsRefreshing(true);
    onRefresh();
    refreshTimerRef.current = setTimeout(() => {
      setIsRefreshing(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [isRefreshing, onRefresh]);
  const [replyTo, setReplyTo] = useState<ReplyDraft | null>(null);
  // In-thread search (header magnifier). Filters the visible bubbles to
  // the ones whose text contains the query; cleared on thread switch.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Which attachment the media viewer is showing. Lives here rather than in
  // the bubble so the viewer can page through every image/video in the
  // thread (issue #373). Paired with the conversation it belongs to and read
  // back through that check below, so switching threads closes the viewer
  // without an effect racing the messages refetch.
  const [openMedia, setOpenMedia] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);

  // Profiles are bounded by RLS to rows the current user is allowed to
  // see — today that's just the current user, but the dropdown keeps the
  // shape ready for shared-team workspaces without a refactor.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("*")
      .order("full_name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to fetch profiles:", error);
          return;
        }
        setProfiles((data as Profile[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: "" };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === "customer");

    if (!lastCustomerMsg) return { expired: true, remaining: "No customer messages" };

    const hoursSince = differenceInHours(new Date(), new Date(lastCustomerMsg.created_at));
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: tTimer("expired") };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? tTimer("xhRemaining", { hours: Math.floor(hoursLeft) })
        : tTimer("xmRemaining", { minutes: Math.floor(hoursLeft * 60) });

    return { expired, remaining };
  }, [messages, tTimer]);

  const { typers, notifyTyping } = useTyping({
    conversationId: conversation?.id,
    userId: user?.id,
    userName: profile?.full_name || t("teammate"),
    notifyCustomer: canSend && !sessionInfo.expired,
  });

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  const mediaMessageId =
    openMedia && openMedia.conversationId === conversationId
      ? openMedia.messageId
      : null;
  const handleMediaChange = useCallback(
    (messageId: string | null) => {
      setOpenMedia(
        messageId && conversationId ? { conversationId, messageId } : null,
      );
    },
    [conversationId],
  );

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch messages:", error);
      } else {
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus —
    // realtime is best-effort and any message events sent while the WS
    // was disconnected or throttled are otherwise lost.
  }, [conversationId, resyncToken]);

  // Reactions fetch — pulls the current state from the DB. Kept separate
  // from the channel subscription below so a `resyncToken` bump just
  // refetches the rows without also tearing down and rebuilding the
  // realtime channel.
  useEffect(() => {
    if (!conversationId) {
      setReactions([]);
      return;
    }
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("*")
        .eq("conversation_id", conversationId);
      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch reactions:", error);
        return;
      }
      setReactions((data as MessageReaction[]) ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, resyncToken]);

  // Reactions realtime subscription per conversation. Subscribing here
  // (not at the page level) keeps the channel scoped to the visible
  // conversation and avoids cross-conversation chatter on a busy inbox.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`reactions:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => {
            if (prev.some((r) => r.id === row.id)) return prev;
            // Swap any matching optimistic temp row for the real one so
            // the pill doesn't double up after a successful POST.
            const tempIdx = prev.findIndex(
              (r) =>
                r.id.startsWith("temp-") &&
                r.message_id === row.message_id &&
                r.actor_type === row.actor_type &&
                r.actor_id === row.actor_id,
            );
            if (tempIdx >= 0) {
              const copy = prev.slice();
              copy[tempIdx] = row;
              return copy;
            }
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageReaction;
          setReactions((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "message_reactions",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const old = payload.old as Partial<MessageReaction>;
          if (!old?.id) return;
          setReactions((prev) => prev.filter((r) => r.id !== old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Clear any in-progress reply draft when the active conversation changes —
  // a quote pulled from conversation A shouldn't bleed into conversation B.
  useEffect(() => {
    setReplyTo(null);
    setCorrecting(null);
    setPinIndex(0);
    setSearchOpen(false);
    setSearchQuery("");
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(({ error }) => {
        if (error) console.error("Failed to reset unread_count:", error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string, replyToId?: string, correctionOfId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      // A correction replies to the original so the customer sees which
      // message it fixes (WhatsApp shows the quote on their phone).
      const effectiveReplyTo = correctionOfId ?? replyToId;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "text",
        content_text: text,
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: effectiveReplyTo,
        correction_of_message_id: correctionOfId ?? null,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);
      setCorrecting(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "text",
            content_text: text,
            reply_to_message_id: effectiveReplyTo,
            ...(correctionOfId ? { correction_of_message_id: correctionOfId } : {}),
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send message:", reason);
          toast.error(`Failed to send: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row. If realtime hasn't arrived yet, at least
        // flip status to 'sent' so the UI stops showing "sending".
        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send message:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendMedia = useCallback(
    async (payload: SendMediaPayload) => {
      if (!conversation) return;

      // Documents show their filename in our own bubble (and to the
      // recipient as the Meta caption when no caption was typed); other
      // kinds use the caption as-is. Audio carries no caption.
      const contentText =
        payload.kind === "document"
          ? payload.caption || payload.filename || "Document"
          : payload.caption;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: payload.kind,
        content_text: contentText,
        media_url: payload.mediaUrl,
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: payload.replyToId,
      };
      onNewMessage(optimisticMsg);
      setReplyTo(null);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: payload.kind,
            media_url: payload.mediaUrl,
            content_text: contentText,
            filename: payload.filename,
            reply_to_message_id: payload.replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send media:", reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          // The upload never reached the recipient — GC the orphaned
          // object rather than leaving it in the public bucket forever.
          void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send media:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
        void deleteAccountMedia(CHAT_MEDIA_BUCKET, payload.path).catch(() => {});
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  const handleSendInteractive = useCallback(
    async (payload: InteractiveMessagePayload, replyToId?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      // Optimistic bubble — renders the buttons/list immediately via the
      // interactive_payload, same as the persisted row will.
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "interactive",
        content_text: payload.body,
        interactive_payload: payload,
        status: "sending",
        created_at: new Date().toISOString(),
        reply_to_message_id: replyToId,
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "interactive",
            interactive_payload: payload,
            reply_to_message_id: replyToId,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = data?.error || `HTTP ${res.status}`;
          console.error("Failed to send interactive message:", reason);
          toast.error(`Failed to send: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send interactive message:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ status })
        .eq("id", conversation.id);

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (
      template: MessageTemplate,
      values: {
        body: string[];
        headerText?: string;
        buttonParams?: Record<number, string>;
      },
    ) => {
      if (!conversation) return;

      const renderedBody = renderTemplateBody(template.body_text, values.body);
      const tempId = `temp-${Date.now()}`;

      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "template",
        content_text: renderedBody,
        template_name: template.name,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "template",
            template_name: template.name,
            template_language: template.language,
            // Structured params drive the new send-builder path
            // (header media + URL button substitution). Body values
            // are mirrored under both shapes so the route can fall
            // back if the template row isn't found locally.
            template_message_params: {
              body: values.body,
              headerText: values.headerText,
              buttonParams: values.buttonParams,
            },
            template_params: values.body,
            content_text: renderedBody,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send template:", reason);
          toast.error(`Failed to send template: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send template:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send template: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage],
  );

  // Build a quick id → Message map so reply quotes can be rendered without
  // an extra fetch — the thread already holds the full conversation.
  const messagesById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  // Images + videos in the thread, in order — the set the media viewer
  // pages through with ← / →.
  const mediaGallery = useMemo(() => collectMediaGallery(messages), [messages]);

  // Bucket reactions by their target message_id for O(1) per-bubble lookup.
  const reactionsByMessageId = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactions) {
      const bucket = map.get(r.message_id);
      if (bucket) bucket.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);

  const contactDisplayName = contact?.name || contact?.phone || "Customer";

  // Author label for a quoted message: "You" when we sent the parent,
  // contact name when the customer sent it.
  const authorLabelFor = useCallback(
    (m: Message): string => {
      const isAgentMsg =
        m.sender_type === "agent" || m.sender_type === "bot";
      return isAgentMsg ? "You" : contactDisplayName;
    },
    [contactDisplayName],
  );

  const handleStartReply = useCallback(
    (msg: Message) => {
      setReplyTo({
        id: msg.id,
        authorLabel: authorLabelFor(msg),
        preview: buildReplyPreview(msg, tQuote),
      });
    },
    [authorLabelFor],
  );

  // Single reaction-set primitive. emoji === "" removes; otherwise adds/swaps.
  // The "toggle" semantic (pill click) is computed at the call site where the
  // current reactions for the bubble are already in scope — keeps this
  // function dependency-free w.r.t. the reaction list.
  const postReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id || !conversation) {
        console.warn("[reactions] missing user or conversation");
        return;
      }
      if (messageId.startsWith("temp-")) {
        toast.error("Wait for the message to finish sending");
        return;
      }

      const convId = conversation.id;
      const userId = user.id;
      let snapshot: MessageReaction[] = [];

      // Functional updater — captures the freshest reactions list, never a
      // stale closure. Snapshot stored for rollback on POST failure.
      setReactions((prev) => {
        snapshot = prev;
        const own = prev.find(
          (r) =>
            r.message_id === messageId &&
            r.actor_type === "agent" &&
            r.actor_id === userId,
        );
        if (emoji === "") return own ? prev.filter((r) => r !== own) : prev;
        if (own) return prev.map((r) => (r === own ? { ...own, emoji } : r));
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            message_id: messageId,
            conversation_id: convId,
            actor_type: "agent",
            actor_id: userId,
            emoji,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetch("/api/whatsapp/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_id: messageId, emoji }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Reaction failed: ${reason}`);
        setReactions(snapshot);
      }
    },
    [conversation, user?.id],
  );

  // Star / pin are CRM-only, shared with the team (migration 040). RLS
  // lets agents update messages directly; realtime syncs teammates.
  const updateMessageFlag = useCallback(
    async (
      msg: Message,
      patch: Pick<Message, "starred_at" | "starred_by"> | Pick<Message, "pinned_at" | "pinned_by">,
      errorKey: string,
    ) => {
      if (msg.id.startsWith("temp-")) return;
      const previous = Object.fromEntries(
        Object.keys(patch).map((k) => [k, msg[k as keyof Message] ?? null]),
      ) as Partial<Message>;
      onUpdateMessage(msg.id, patch);
      const supabase = createClient();
      const { error } = await supabase.from("messages").update(patch).eq("id", msg.id);
      if (error) {
        console.error("Failed to update message:", error);
        onUpdateMessage(msg.id, previous);
        toast.error(t(errorKey));
      }
    },
    [onUpdateMessage, t],
  );

  const handleToggleStar = useCallback(
    (msg: Message) =>
      updateMessageFlag(
        msg,
        msg.starred_at
          ? { starred_at: null, starred_by: null }
          : { starred_at: new Date().toISOString(), starred_by: user?.id ?? null },
        "starFailed",
      ),
    [updateMessageFlag, user?.id],
  );

  const handleTogglePin = useCallback(
    (msg: Message) => {
      setPinIndex(0);
      return updateMessageFlag(
        msg,
        msg.pinned_at
          ? { pinned_at: null, pinned_by: null }
          : { pinned_at: new Date().toISOString(), pinned_by: user?.id ?? null },
        "pinFailed",
      );
    },
    [updateMessageFlag, user?.id],
  );

  const handleStartCorrection = useCallback(
    (msg: Message) => {
      setReplyTo(null);
      setCorrecting({
        id: msg.id,
        authorLabel: t("editingMessage"),
        preview: msg.content_text ?? "",
      });
    },
    [t],
  );

  const handleTogglePinChat = useCallback(async () => {
    if (!conversation || !onPinChatChange) return;
    const next = conversation.pinned_at ? null : new Date().toISOString();
    onPinChatChange(conversation.id, next);
    const supabase = createClient();
    const { error } = await supabase
      .from("conversations")
      .update({ pinned_at: next })
      .eq("id", conversation.id);
    if (error) {
      console.error("Failed to pin chat:", error);
      onPinChatChange(conversation.id, conversation.pinned_at ?? null);
      toast.error(t("pinFailed"));
    }
  }, [conversation, onPinChatChange, t]);

  // Pinned messages, newest pin first, for the banner under the header.
  const pinnedMessages = useMemo(
    () =>
      messages
        .filter((m) => m.pinned_at)
        .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? "")),
    [messages],
  );

  const jumpToMessage = useCallback((id: string) => {
    setSearchQuery("");
    requestAnimationFrame(() => {
      document
        .getElementById(`msg-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setHighlightId(id);
    setTimeout(() => setHighlightId((cur) => (cur === id ? null : cur)), 1600);
  }, []);

  const handleAssignChange = useCallback(
    async (agentId: string | null) => {
      if (!conversation) return;

      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_agent_id: agentId })
        .eq("id", conversation.id);

      if (error) {
        console.error("Failed to update assignment:", error);
        toast.error("Failed to update assignment");
        return;
      }

      onAssignChange(conversation.id, agentId);
    },
    [conversation, onAssignChange],
  );

  // Empty state — WhatsApp's "pick a chat" landing panel: soft
  // background, a large icon, short copy, and the signature green bar
  // along the bottom edge.
  if (!conversation || !contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center border-b-[6px] border-wa-green bg-wa-panel-header px-6 text-center">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-wa-green-soft">
          <MessageCircle className="h-14 w-14 text-wa-green" strokeWidth={1.6} />
        </div>
        <h3 className="mt-6 text-[28px] font-light text-wa-text">
          {t("selectConversation")}
        </h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-wa-text-2">
          {t("selectConversationHint")}
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleMessages = normalizedQuery
    ? messages.filter((m) =>
        (m.content_text ?? "").toLowerCase().includes(normalizedQuery),
      )
    : messages;
  const messageGroups = groupMessagesByDate(visibleMessages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );
  const assignedAgentId = conversation.assigned_agent_id ?? null;
  const currentAssignee = profiles.find((p) => p.user_id === assignedAgentId);
  const assignLabel = assignedAgentId
    ? (currentAssignee?.full_name ?? t("assigned"))
    : t("assign");

  return (
    // `min-w-0` is load-bearing: the page already puts min-w-0 on the
    // thread's flex *wrapper* (issue #165), but this root keeps the
    // default `min-width: auto`, so a single wide message (long unbroken
    // URL/word) expands the whole thread past its flex share and the chat
    // paints on top of the contact sidebar at lg+ — outgoing bubbles get
    // clipped and the hover toolbar overlaps the Tags panel. Letting the
    // root shrink lets the bubbles' break-words / max-w caps apply.
    // Issue #257.
    <div className="wa-wallpaper flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header — opaque so the wallpaper never shows behind the name.
          Safe-area top padding for the iPhone notch when the thread is
          full-screen on mobile. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-wa-divider bg-wa-panel-header px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] sm:px-4 lg:py-2.5">
        <div className="flex min-w-0 items-center gap-1 sm:gap-3">
          {/* Back-to-list button — mobile only. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t("backToConversations")}
              className={cn(HEADER_ICON_BUTTON, "lg:hidden")}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          {/* Avatar + name. On desktop, clicking opens the contact
              panel — WhatsApp's "contact info" gesture. */}
          <button
            type="button"
            onClick={onToggleContactPanel}
            disabled={!onToggleContactPanel}
            title={onToggleContactPanel ? t("contactInfo") : undefined}
            className="flex min-w-0 items-center gap-3 rounded-lg text-left disabled:cursor-default lg:cursor-pointer"
          >
            <ContactAvatar name={displayName} src={contact.avatar_url} size={42} />
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-medium leading-tight text-wa-text">
                {displayName}
              </span>
              {typers.length > 0 ? (
                <span className="flex items-center gap-1 truncate text-[13px] leading-tight text-wa-green">
                  <TypingDots />
                  {typers.length === 1
                    ? t("teammateTyping", { name: typers[0].name })
                    : t("teammatesTyping", { count: typers.length })}
                </span>
              ) : (
                <span className="block truncate text-[13px] leading-tight text-wa-text-2">
                  {contact.name && contact.name !== contact.phone
                    ? contact.phone
                    : sessionInfo.remaining}
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {/* 24h customer-service window. */}
          <span
            title={sessionInfo.remaining}
            className={cn(
              "hidden h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium xl:inline-flex",
              sessionInfo.expired
                ? "bg-red-500/10 text-red-600"
                : "bg-wa-green-soft text-wa-text",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {sessionInfo.remaining}
          </span>

          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(HEADER_PILL, "hidden sm:inline-flex")}>
              <span className={cn("h-2 w-2 rounded-full", currentStatus?.dot ?? "bg-wa-text-2")} />
              {currentStatus ? t(`status${currentStatus.label}`) : t("status")}
              <ChevronDown className="h-3.5 w-3.5 text-wa-text-2" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-popover">
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className="text-sm"
                >
                  <span className={cn("h-2 w-2 rounded-full", opt.dot)} />
                  <span className="flex-1">{t(`status${opt.label}`)}</span>
                  {opt.value === conversation.status && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(HEADER_PILL, "hidden sm:inline-flex")}
              title={assignLabel}
            >
              {assignedAgentId ? (
                <AgentAvatar
                  name={currentAssignee?.full_name ?? assignLabel}
                  src={currentAssignee?.avatar_url}
                  status={getPresence(assignedAgentId)}
                />
              ) : (
                <UserPlus className="h-3.5 w-3.5 text-wa-icon" />
              )}
              <span className="hidden max-w-28 truncate 2xl:inline">{assignLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-wa-text-2" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border bg-popover">
              <AssigneeItems
                profiles={profiles}
                assignedAgentId={assignedAgentId}
                currentUserId={user?.id}
                meSuffix={t("me")}
                noTeammatesLabel={t("noTeammates")}
                unassignLabel={t("unassign")}
                getPresence={getPresence}
                getRow={getRow}
                now={now}
                onAssign={handleAssignChange}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mx-1 hidden h-6 w-px bg-wa-divider sm:block" />

          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              aria-label={t("call")}
              title={t("call")}
              className={HEADER_ICON_BUTTON}
            >
              <Phone className="h-5 w-5" />
            </a>
          )}

          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open);
              setSearchQuery("");
            }}
            aria-label={t("searchMessages")}
            title={t("searchMessages")}
            aria-pressed={searchOpen}
            className={cn(HEADER_ICON_BUTTON, searchOpen && "bg-wa-hover")}
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Overflow menu: contact panel toggle (desktop), refresh, and
              on phones the status/assign controls that don't fit. */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("moreOptions")}
              title={t("moreOptions")}
              className={cn(HEADER_ICON_BUTTON, "data-popup-open:bg-wa-hover")}
            >
              <MoreVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-52 border-border bg-popover">
              {onToggleContactPanel && (
                <DropdownMenuItem
                  onClick={onToggleContactPanel}
                  className="hidden text-sm lg:flex"
                >
                  {contactPanelOpen ? (
                    <PanelRightClose className="h-4 w-4" />
                  ) : (
                    <PanelRightOpen className="h-4 w-4" />
                  )}
                  {contactPanelOpen ? t("hideContact") : t("contactInfo")}
                </DropdownMenuItem>
              )}
              {onPinChatChange && canSend && (
                <DropdownMenuItem onClick={() => void handleTogglePinChat()} className="text-sm">
                  {conversation.pinned_at ? (
                    <PinOff className="h-4 w-4" />
                  ) : (
                    <Pin className="h-4 w-4" />
                  )}
                  {conversation.pinned_at ? t("unpinChat") : t("pinChat")}
                </DropdownMenuItem>
              )}
              {onRefresh && (
                <DropdownMenuItem
                  onClick={handleRefreshClick}
                  disabled={isRefreshing}
                  className="text-sm"
                >
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  {t("refreshConversation")}
                </DropdownMenuItem>
              )}
              {/* Phones: status + assignment live here. */}
              <div className="sm:hidden">
                <DropdownMenuSeparator className="bg-border" />
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  {sessionInfo.remaining}
                </p>
                {STATUS_OPTIONS.map((opt) => (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    className="text-sm"
                  >
                    <span className={cn("h-2 w-2 rounded-full", opt.dot)} />
                    <span className="flex-1">{t(`status${opt.label}`)}</span>
                    {opt.value === conversation.status && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-border" />
                <AssigneeItems
                  profiles={profiles}
                  assignedAgentId={assignedAgentId}
                  currentUserId={user?.id}
                  meSuffix={t("me")}
                  noTeammatesLabel={t("noTeammates")}
                  unassignLabel={t("unassign")}
                  getPresence={getPresence}
                  getRow={getRow}
                  now={now}
                  onAssign={handleAssignChange}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* In-thread search bar */}
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-wa-divider bg-wa-panel px-3 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wa-text-2" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder={t("searchMessages")}
              aria-label={t("searchMessages")}
              className="h-9 w-full rounded-lg bg-wa-surface pl-9 pr-3 text-sm text-wa-text outline-none placeholder:text-wa-text-2 focus:ring-2 focus:ring-wa-green/50"
            />
          </div>
          {normalizedQuery && (
            <span className="shrink-0 text-xs text-wa-text-2">
              {t("searchResults", { count: visibleMessages.length })}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            aria-label={t("closeSearch")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-wa-icon hover:bg-wa-hover"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pinned-message banner — newest pin first; clicking jumps to it
          and advances to the next pin, like WhatsApp. */}
      {pinnedMessages.length > 0 && (() => {
        const pinned = pinnedMessages[pinIndex % pinnedMessages.length];
        return (
          <div className="flex shrink-0 items-center gap-2 border-b border-wa-divider bg-wa-panel px-3 py-1.5">
            <button
              type="button"
              onClick={() => {
                jumpToMessage(pinned.id);
                setPinIndex((i) => (i + 1) % pinnedMessages.length);
              }}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 text-left hover:bg-wa-hover"
            >
              {pinnedMessages.length > 1 && (
                <span className="flex h-7 flex-col justify-center gap-0.5" aria-hidden="true">
                  {pinnedMessages.slice(0, 3).map((m, i) => (
                    <span
                      key={m.id}
                      className={cn(
                        "h-2 w-[3px] rounded-full",
                        i === pinIndex % pinnedMessages.length ? "bg-wa-green" : "bg-wa-divider",
                      )}
                    />
                  ))}
                </span>
              )}
              <Pin className="h-4 w-4 shrink-0 rotate-45 text-wa-icon" />
              <span className="min-w-0 flex-1 truncate text-sm text-wa-text">
                {buildReplyPreview(pinned, tQuote)}
              </span>
              {pinnedMessages.length > 1 && (
                <span className="shrink-0 text-xs text-wa-text-2">
                  {t("pinnedCount", {
                    index: (pinIndex % pinnedMessages.length) + 1,
                    count: pinnedMessages.length,
                  })}
                </span>
              )}
            </button>
            {canSend && (
              <button
                type="button"
                onClick={() => void handleTogglePin(pinned)}
                aria-label={t("unpinMessage")}
                title={t("unpinMessage")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-wa-icon hover:bg-wa-hover"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })()}

      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="wa-scroll flex-1 overflow-y-auto px-3 pb-4 sm:px-[5%] xl:px-[7%]"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-wa-green border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="max-w-sm rounded-lg bg-wa-chip px-4 py-3 text-center shadow-sm">
              <p className="text-sm font-medium text-wa-text">{t("noMessagesYet")}</p>
              <p className="mt-0.5 text-xs text-wa-chip-fg">{t("sendTemplateHint")}</p>
            </div>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="flex justify-center py-10">
            <span className="rounded-lg bg-wa-chip px-4 py-2 text-sm text-wa-chip-fg shadow-sm">
              {t("searchNoResults")}
            </span>
          </div>
        ) : (
          messageGroups.map((group) => (
            <section key={group.date} className="pb-1">
              {/* Date chip — sticky, like WhatsApp, so the day stays
                  visible while scrolling through it. */}
              <div className="sticky top-0 z-10 flex justify-center pb-2 pt-3">
                <span className="rounded-lg bg-wa-chip px-3 py-1.5 text-[12.5px] font-medium text-wa-chip-fg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  {formatDateSeparator(group.date, t)}
                </span>
              </div>
              {group.messages.map((msg, index) => {
                const prev = index > 0 ? group.messages[index - 1] : null;
                // A "run" is consecutive bubbles from the same side; only
                // its first bubble gets a tail and the larger top gap.
                const startsRun = !prev || isOutbound(prev) !== isOutbound(msg);
                const parent = msg.reply_to_message_id
                  ? messagesById.get(msg.reply_to_message_id)
                  : null;
                const reply = parent
                  ? {
                      authorLabel: isOutbound(parent)
                        ? t("you")
                        : contact?.name || contact?.phone || "Unknown",
                      preview: buildReplyPreview(parent, tQuote),
                    }
                  : null;
                const msgReactions = reactionsByMessageId.get(msg.id);
                // Toggle is computed at the call site — `msgReactions`
                // and `user?.id` are already in scope, no extra hook.
                const handlePillToggle = (emoji: string) => {
                  const own = msgReactions?.find(
                    (r) =>
                      r.actor_type === "agent" &&
                      r.actor_id === user?.id,
                  );
                  const next = own?.emoji === emoji ? "" : emoji;
                  void postReaction(msg.id, next);
                };
                return (
                  <div
                    key={msg.id}
                    id={`msg-${msg.id}`}
                    className={cn(
                      startsRun ? "mt-3" : "mt-0.5",
                      "-mx-2 rounded-lg px-4 transition-colors duration-700",
                      highlightId === msg.id && "bg-wa-green/15",
                    )}
                  >
                    <MessageActions
                      message={msg}
                      onReply={() => handleStartReply(msg)}
                      onReact={(emoji) => {
                        if (emoji) void postReaction(msg.id, emoji);
                      }}
                      onToggleStar={
                        canSend && !msg.id.startsWith("temp-")
                          ? () => void handleToggleStar(msg)
                          : undefined
                      }
                      onTogglePin={
                        canSend && !msg.id.startsWith("temp-")
                          ? () => void handleTogglePin(msg)
                          : undefined
                      }
                      onEdit={
                        canSend &&
                        !sessionInfo.expired &&
                        isOutbound(msg) &&
                        msg.content_type === "text" &&
                        !!msg.message_id &&
                        msg.status !== "failed"
                          ? () => handleStartCorrection(msg)
                          : undefined
                      }
                    >
                      <MessageBubble
                        message={msg}
                        reply={reply}
                        reactions={msgReactions}
                        currentUserId={user?.id}
                        onToggleReaction={handlePillToggle}
                        onOpenMedia={handleMediaChange}
                        showTail={startsRun}
                      />
                    </MessageActions>
                  </div>
                );
              })}
            </section>
          ))
        )}
      </div>

      {/* AI auto-reply banner — take over an active bot, or resume it
          after a handoff. Renders nothing unless the account has
          auto-reply configured. */}
      <AiThreadBanner
        conversationId={conversation.id}
        disabled={conversation.ai_autoreply_disabled ?? false}
        handoffSummary={conversation.ai_handoff_summary}
        assignedAgentId={assignedAgentId}
        currentUserId={user?.id}
        onChange={(patch) => {
          if ("assigned_agent_id" in patch) {
            onAssignChange(conversation.id, patch.assigned_agent_id ?? null);
          }
        }}
      />

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onTyping={notifyTyping}
        correcting={correcting}
        onCancelCorrection={() => setCorrecting(null)}
        typingNotice={
          typers.length === 1
            ? t("teammateReplying", { name: typers[0].name })
            : typers.length > 1
              ? t("teammatesTyping", { count: typers.length })
              : null
        }
        onSendMedia={handleSendMedia}
        onSendInteractive={handleSendInteractive}
        onOpenTemplates={handleOpenTemplates}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        initialText={initialComposerText}
      />

      <TemplatePicker
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        onSelect={handleSendTemplate}
      />

      {/* Full-size viewer for the thread's images/videos. Renders nothing
          until a bubble opens it. */}
      <MediaLightbox
        items={mediaGallery}
        activeId={mediaMessageId}
        onActiveIdChange={handleMediaChange}
        contactLabel={contactDisplayName}
      />
    </div>
  );
}

/**
 * Teammate rows for the assign menu. Shared by the desktop "Assign"
 * pill and the phone overflow menu so the two can't drift.
 */
function AssigneeItems({
  profiles,
  assignedAgentId,
  currentUserId,
  meSuffix,
  noTeammatesLabel,
  unassignLabel,
  getPresence,
  getRow,
  now,
  onAssign,
}: {
  profiles: Profile[];
  assignedAgentId: string | null;
  currentUserId?: string;
  meSuffix: string;
  noTeammatesLabel: string;
  unassignLabel: string;
  getPresence: (userId: string) => PresenceStatus;
  getRow: (userId: string) => PresenceRow | undefined;
  now: number;
  onAssign: (agentId: string | null) => void;
}) {
  if (profiles.length === 0) {
    return (
      <DropdownMenuItem disabled className="text-sm text-muted-foreground">
        {noTeammatesLabel}
      </DropdownMenuItem>
    );
  }
  return (
    <>
      {profiles.map((p) => {
        const isSelected = p.user_id === assignedAgentId;
        const presence = getPresence(p.user_id);
        return (
          <DropdownMenuItem
            key={p.id}
            onClick={() => onAssign(p.user_id)}
            className={cn("text-sm", isSelected ? "text-primary" : "text-popover-foreground")}
          >
            <PresenceDot
              status={presence}
              label={presenceLabel(presence, getRow(p.user_id)?.last_seen_at ?? null, now)}
              className="mr-2"
            />
            <span className="flex-1">
              {p.full_name}
              {p.user_id === currentUserId ? meSuffix : ""}
            </span>
            {isSelected && <Check className="ml-2 h-3 w-3" />}
          </DropdownMenuItem>
        );
      })}
      {assignedAgentId && (
        <>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={() => onAssign(null)}
            className="text-sm text-muted-foreground"
          >
            {unassignLabel}
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}

/** Three bouncing dots, WhatsApp's "typing…" animation. */
function TypingDots() {
  return (
    <span className="inline-flex items-end gap-[2px] pb-[2px]" aria-hidden="true">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1 w-1 animate-bounce rounded-full bg-current"
          style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
        />
      ))}
    </span>
  );
}

/** Small teammate avatar with a presence dot (green = online). */
function AgentAvatar({
  name,
  src,
  status,
}: {
  name: string;
  src?: string | null;
  status: PresenceStatus;
}) {
  return (
    <span className="relative inline-flex">
      <ContactAvatar name={name} src={src} size={20} />
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-wa-panel",
          status === "online"
            ? "bg-wa-green"
            : status === "away"
              ? "bg-amber-400"
              : "bg-wa-text-2/50",
        )}
      />
    </span>
  );
}
