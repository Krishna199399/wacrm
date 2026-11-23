"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CONVERSATION_SELECT,
  matchesContactFilters,
  normalizeConversations,
} from "@/lib/inbox/conversations";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus, Tag } from "@/types";
import {
  Search,
  X,
  Check,
  Loader2,
  MessageCirclePlus,
  MoreVertical,
  Pin,
  SquarePen,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCan } from "@/hooks/use-can";
import { formatWhatsAppTime, formatUnreadCount } from "@/lib/inbox/whatsapp-helpers";
import { ContactAvatar } from "./contact-avatar";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
  /**
   * Increment to force the fetch effect below to refire. The parent
   * bumps this on realtime reconnect / tab visibility → visible so the
   * list catches up on any events sent while the WS was disconnected
   * or the tab was throttled. Optional so existing callers keep working.
   */
  resyncToken?: number;
  /**
   * Find-or-create a conversation for a typed phone number. Resolves
   * true once the new thread is selected. Optional: without it the
   * "start new chat" row never shows.
   */
  onStartChat?: (phone: string) => Promise<boolean>;
}

type InboxFilter = ConversationStatus | "all" | "unread";

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
  resyncToken = 0,
  onStartChat,
}: ConversationListProps) {
  const t = useTranslations("Inbox.conversationList");
  const canStartChat = useCan("send-messages");
  const searchRef = useRef<HTMLInputElement>(null);
  const [startingChat, setStartingChat] = useState(false);
  
  const FILTER_OPTIONS: { label: string; value: InboxFilter }[] = useMemo(() => [
    { label: t("filterAll"), value: "all" },
    { label: t("filterUnread"), value: "unread" },
    { label: t("filterOpen"), value: "open" },
    { label: t("filterPending"), value: "pending" },
    { label: t("filterClosed"), value: "closed" },
  ], [t]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  // Contact-based filters (issue #272). Tags use OR logic (a conversation
  // matches if its contact carries any selected tag), consistent with
  // Broadcast audience filtering. Company is an exact match on the field.
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(normalizeConversations(data ?? []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // `resyncToken` is included so the parent can force a refetch when
    // the realtime channel reconnects or the tab regains focus — catches
    // up on any events sent while the WS was disconnected or throttled.
  }, [resyncToken]);

  // Tag definitions for the filter picker — loaded once so labels/colours
  // stay stable regardless of which conversations happen to be loaded.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("tags").select("*").order("name");
      if (!cancelled && data) setTags(data as Tag[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Company options are derived from the loaded conversations — there's no
  // separate companies table, and only companies with a live conversation
  // are worth offering as an inbox filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const co = c.contact?.company?.trim();
      if (co) set.add(co);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const tagsById = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.id, t);
    return m;
  }, [tags]);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === "unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    // Contact-based filters (tags via OR logic, exact company match).
    if (selectedTagIds.length > 0 || selectedCompany !== null) {
      result = result.filter((c) =>
        matchesContactFilters(c, {
          tagIds: selectedTagIds,
          company: selectedCompany,
        })
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    // Pinned chats first (most recently pinned on top), like WhatsApp.
    // Stable sort keeps the recency order within each group.
    if (result.some((c) => c.pinned_at)) {
      result = [...result].sort((a, b) => {
        if (!!a.pinned_at !== !!b.pinned_at) return a.pinned_at ? -1 : 1;
        if (a.pinned_at && b.pinned_at) return b.pinned_at.localeCompare(a.pinned_at);
        return 0;
      });
    }

    return result;
  }, [conversations, filter, search, selectedTagIds, selectedCompany]);

  const toggleTag = useCallback((id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }, []);

  const clearContactFilters = useCallback(() => {
    setSelectedTagIds([]);
    setSelectedCompany(null);
  }, []);

  const hasContactFilters = selectedTagIds.length > 0 || selectedCompany !== null;

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const unreadChats = useMemo(
    () => conversations.filter((c) => (c.unread_count ?? 0) > 0).length,
    [conversations],
  );

  // "Start a new chat" — offered when the search looks like a phone
  // number that no loaded conversation already has.
  const searchDigits = search.replace(/\D/g, "");
  const looksLikePhone =
    /^\+?[\d\s()-]+$/.test(search.trim()) && searchDigits.length >= 8;
  const hasPhoneMatch =
    looksLikePhone &&
    conversations.some((c) => {
      const d = c.contact?.phone?.replace(/\D/g, "") ?? "";
      return d.length > 0 && (d === searchDigits || d.endsWith(searchDigits));
    });
  const showStartChat =
    !!onStartChat && canStartChat && looksLikePhone && !hasPhoneMatch;

  const handleStartChat = useCallback(async () => {
    if (!onStartChat || startingChat) return;
    setStartingChat(true);
    const ok = await onStartChat(search.trim());
    setStartingChat(false);
    if (ok) setSearch("");
  }, [onStartChat, search, startingChat]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden border-r border-wa-divider bg-wa-panel">
      {/* Title row — "Chats" + new chat + filter menu */}
      <div className="flex shrink-0 items-center justify-between gap-2 pb-2 pl-5 pr-3 pt-3 lg:pt-4">
        <h2 className="text-[25px] font-bold lg:text-[23px] tracking-tight text-wa-text">
          {t("title")}
        </h2>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => searchRef.current?.focus()}
            title={t("newChat")}
            aria-label={t("newChat")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-wa-icon transition-colors hover:bg-wa-surface"
          >
            <SquarePen className="h-[22px] w-[22px]" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              title={t("filterMenu")}
              aria-label={t("filterMenu")}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-wa-icon transition-colors hover:bg-wa-surface data-popup-open:bg-wa-surface"
            >
              <MoreVertical className="h-[22px] w-[22px]" />
              {hasContactFilters && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-wa-green" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 w-60">
              {tags.length === 0 && companies.length === 0 ? (
                <DropdownMenuItem disabled className="text-sm">
                  {t("noFilters")}
                </DropdownMenuItem>
              ) : null}
              {tags.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("tags")}</DropdownMenuLabel>
                  {tags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                      className="text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              )}
              {tags.length > 0 && companies.length > 0 && <DropdownMenuSeparator />}
              {companies.length > 0 && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("company")}</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => setSelectedCompany(null)}
                    className="text-sm"
                  >
                    <span className="flex-1">{t("allCompanies")}</span>
                    {selectedCompany === null && <Check className="h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                  {companies.map((co) => (
                    <DropdownMenuItem
                      key={co}
                      onClick={() => setSelectedCompany(co)}
                      className="text-sm"
                    >
                      <span className="flex-1 truncate">{co}</span>
                      {selectedCompany === co && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              )}
              {hasContactFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={clearContactFilters} className="text-sm">
                    <X className="h-3.5 w-3.5" />
                    {t("clearAll")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search pill */}
      <div className="shrink-0 px-3 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-wa-text-2" />
          <input
            ref={searchRef}
            value={search}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && showStartChat) {
                e.preventDefault();
                void handleStartChat();
              } else if (e.key === "Escape") {
                setSearch("");
              }
            }}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-11 w-full rounded-full bg-wa-surface pl-12 pr-10 text-[16px] lg:h-10 lg:text-[15px] text-wa-text outline-none ring-wa-green/60 transition-shadow placeholder:text-wa-text-2 focus:ring-2"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                searchRef.current?.focus();
              }}
              aria-label={t("clearSearch")}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-wa-text-2 hover:bg-wa-hover"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="scrollbar-none flex shrink-0 items-center gap-2 overflow-x-auto px-3 pb-3">
        {FILTER_OPTIONS.map((opt) => {
          const active = filter === opt.value;
          const count = opt.value === "unread" ? unreadChats : 0;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(opt.value)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15.5px] font-medium transition-colors lg:h-8 lg:px-3.5 lg:text-[14px]",
                active
                  ? "bg-wa-green text-white"
                  : "border border-wa-divider bg-wa-panel text-wa-text-2 hover:bg-wa-hover",
              )}
            >
              {opt.label}
              {count > 0 && (
                <span
                  className={cn(
                    "flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[12px] font-bold",
                    active ? "bg-white text-wa-green" : "bg-wa-green text-white",
                  )}
                >
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {hasContactFilters && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-2.5">
          {selectedTagIds.map((id) => {
            const tag = tagsById.get(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleTag(id)}
                className="inline-flex items-center gap-1 rounded-full bg-wa-surface px-2.5 py-1 text-xs text-wa-text hover:bg-wa-selected"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag?.color }}
                />
                <span className="max-w-24 truncate">{tag?.name ?? t("tags")}</span>
                <X className="h-3 w-3" />
              </button>
            );
          })}
          {selectedCompany && (
            <button
              type="button"
              onClick={() => setSelectedCompany(null)}
              className="inline-flex items-center gap-1 rounded-full bg-wa-surface px-2.5 py-1 text-xs text-wa-text hover:bg-wa-selected"
            >
              <span className="max-w-24 truncate">{selectedCompany}</span>
              <X className="h-3 w-3" />
            </button>
          )}
          <button
            type="button"
            onClick={clearContactFilters}
            className="px-1 text-xs font-medium text-wa-green hover:underline"
          >
            {t("clearAll")}
          </button>
        </div>
      )}

      {/* Conversation rows.
          `min-h-0` is load-bearing: a flex child defaults to
          min-height:auto, so without it this ScrollArea grows to fit
          every conversation instead of shrinking to the remaining
          space — the list then overflows and gets clipped by the
          parent's overflow-hidden with no scrollbar (issue #229). */}
      <ScrollArea className="min-h-0 w-full min-w-0 flex-1 overflow-hidden border-t border-wa-divider">
        {showStartChat && (
          <button
            type="button"
            onClick={() => void handleStartChat()}
            disabled={startingChat}
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-wa-hover disabled:opacity-60"
          >
            <span className="flex h-[49px] w-[49px] shrink-0 items-center justify-center rounded-full bg-wa-green text-white">
              {startingChat ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <MessageCirclePlus className="h-6 w-6" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-[17.5px] font-medium text-wa-text lg:text-[16.5px]">
                {t("startChat")}
              </span>
              <span className="block truncate text-[15.5px] text-wa-text-2 lg:text-[14.5px]">
                {search.trim()}
              </span>
            </span>
          </button>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-wa-green border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          showStartChat ? null : (
            <div className="px-6 py-12 text-center">
              <p className="text-[15px] text-wa-text-2">{t("noConversations")}</p>
            </div>
          )
        ) : (
          <div className="flex w-full min-w-0 flex-col overflow-hidden pb-28 lg:pb-4">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
                t={t}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
  t: ReturnType<typeof useTranslations>;
}

const STATUS_LABEL_KEY: Partial<Record<ConversationStatus, string>> = {
  pending: "filterPending",
  closed: "filterClosed",
};

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  t,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || t("unknown");

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const rawDate = conversation.last_message_at || conversation.updated_at;
  const time = rawDate ? formatWhatsAppTime(rawDate, t("yesterday")) : "";

  const unread = conversation.unread_count ?? 0;
  const isUnread = unread > 0;
  const statusKey = STATUS_LABEL_KEY[conversation.status];

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "group flex w-full min-w-0 max-w-full items-center gap-3 pl-3 text-left transition-colors",
        isActive ? "bg-wa-selected" : "hover:bg-wa-hover",
      )}
    >
      <ContactAvatar name={displayName} src={contact?.avatar_url} size={49} />

      {/* Divider is inset past the avatar, like WhatsApp. */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 border-b border-wa-divider py-3 pr-4 group-last:border-b-0">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[17.5px] font-medium text-wa-text lg:text-[16.5px]">
            {displayName}
          </span>
          {time && (
            <span
              className={cn(
                "shrink-0 whitespace-nowrap text-[13.5px] lg:text-[12.5px]",
                isUnread ? "font-medium text-wa-green" : "text-wa-text-2",
              )}
            >
              {time}
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center justify-between gap-2">
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[15.5px] leading-6 lg:text-[14.5px] lg:leading-5",
              isUnread ? "text-wa-text" : "text-wa-text-2",
            )}
          >
            {conversation.last_message_text || t("noMessagesYet")}
          </p>
          {statusKey && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide",
                conversation.status === "pending"
                  ? "bg-amber-500/15 text-amber-700"
                  : "bg-wa-surface text-wa-text-2",
              )}
            >
              {t(statusKey)}
            </span>
          )}
          {conversation.pinned_at && (
            <Pin
              className="h-4 w-4 shrink-0 rotate-45 text-wa-text-2"
              aria-label={t("pinned")}
            />
          )}
          {isUnread && (
            <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-wa-green px-1.5 text-[12px] font-bold text-white">
              {formatUnreadCount(unread)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
