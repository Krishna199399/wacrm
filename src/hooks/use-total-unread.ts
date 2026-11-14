"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";

/**
 * Count of conversations with at least one unread inbound message for
 * the current user. Used by the sidebar to surface a green dot on the
 * Inbox nav entry when the user is elsewhere in the app.
 *
 * Lives on its own realtime channel (distinct from the inbox page's
 * "inbox-realtime") so both can coexist without sharing state.
 */
export function useTotalUnread(): number {
  const [total, setTotal] = useState(0);

  // Keep a live local mirror of {id: unread_count} so INSERT/UPDATE/DELETE
  // events can adjust the total in O(1) without refetching.
  const countsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // Initial load. RLS scopes this to the signed-in user automatically —
    // no explicit user_id filter needed here.
    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, unread_count");
      if (cancelled || error || !data) return;

      const map = new Map<string, number>();
      let sum = 0;
      for (const row of data as { id: string; unread_count: number }[]) {
        const n = row.unread_count ?? 0;
        map.set(row.id, n);
        if (n > 0) sum += 1;
      }
      countsRef.current = map;
      setTotal(sum);
    })();

    // Use a unique channel name per mount so React Strict Mode double-invoke
    // and fast page navigation never try to add listeners to an already-
    // subscribed channel (which Supabase rejects with "cannot add callbacks
    // after subscribe").
    const channelName = `total-unread-${Date.now()}-${Math.random()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        (payload) => {
          const map = countsRef.current;
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Conversation>;
            if (oldRow.id) map.delete(oldRow.id);
          } else {
            const row = payload.new as Conversation;
            map.set(row.id, row.unread_count ?? 0);
          }
          // Recompute — cheap, conversations per user stay small.
          let sum = 0;
          for (const n of map.values()) if (n > 0) sum += 1;
          setTotal(sum);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Synchronize Mobile Home Screen App Badge (iOS / Android) and Browser Tab
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Mobile Home Screen App Badge (iPhone PWA / Android)
    if ("setAppBadge" in navigator) {
      if (total > 0) {
        (navigator as any).setAppBadge(total).catch(() => {});
      } else {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    }

    // 2. Browser Tab Title e.g. "(3) WhatsApp CRM"
    if (typeof document !== "undefined") {
      const cleanTitle = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = total > 0 ? `(${total}) ${cleanTitle}` : cleanTitle;
    }
  }, [total]);

  return total;
}
