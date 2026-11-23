"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**
 * Typing indicators for a conversation:
 *
 *  1. Teammates: a Supabase Realtime *broadcast* on `typing:<convId>`.
 *     Ephemeral — nothing is written to the database. Each client shows
 *     "Asha is typing…" for a few seconds after the last ping.
 *  2. Customer: while an agent types, POST /api/whatsapp/typing at most
 *     every 20 s, which shows "typing…" on the customer's phone (Meta
 *     displays it for up to 25 s and marks their messages read).
 *
 * WhatsApp never reports the CUSTOMER typing to businesses, so there is
 * no inbound indicator to show.
 */

interface TypingPayload {
  userId: string;
  name: string;
}

export interface Typer {
  userId: string;
  name: string;
}

/** How long a teammate stays "typing" after their last ping. */
const TYPER_TTL_MS = 4_000;
/** Min gap between our own broadcast pings. */
const BROADCAST_EVERY_MS = 2_500;
/** Min gap between customer-facing typing calls (Meta shows 25 s). */
const CUSTOMER_EVERY_MS = 20_000;

// ---- Shared, ref-counted broadcast channels --------------------------
//
// Broadcast peers must use the SAME topic, so unlike the postgres_changes
// hooks we can't give each mount a unique channel name. supabase-js also
// hands back an existing channel for a topic, and adding callbacks to an
// already-subscribed channel throws. So: one channel per topic, shared by
// every mount, with listeners fanned out from a Set. Release is delayed so
// React Strict Mode's mount → unmount → mount reuses the same channel.

type Listener = (payload: TypingPayload) => void;

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
  refs: number;
  releaseTimer: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();

function acquire(supabase: SupabaseClient, topic: string): Entry {
  let entry = registry.get(topic);
  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = supabase
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        listeners.forEach((l) => l(payload as TypingPayload));
      })
      .subscribe();
    entry = { channel, listeners, refs: 0, releaseTimer: null };
    registry.set(topic, entry);
  }
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }
  entry.refs++;
  return entry;
}

function release(supabase: SupabaseClient, topic: string) {
  const entry = registry.get(topic);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entry.releaseTimer = setTimeout(() => {
    if (entry.refs > 0) return;
    registry.delete(topic);
    void supabase.removeChannel(entry.channel);
  }, 1_000);
}

// ----------------------------------------------------------------------

export function useTyping({
  conversationId,
  userId,
  userName,
  /** Whether to push "typing…" to the customer's phone. */
  notifyCustomer,
}: {
  conversationId: string | null | undefined;
  userId: string | null | undefined;
  userName: string;
  notifyCustomer: boolean;
}) {
  const [typers, setTypers] = useState<Record<string, Typer & { until: number }>>({});
  const entryRef = useRef<Entry | null>(null);
  const lastBroadcastRef = useRef(0);
  const lastCustomerRef = useRef(0);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const topic = `typing:${conversationId}`;
    const entry = acquire(supabase, topic);
    entryRef.current = entry;

    const onTyping: Listener = (payload) => {
      if (!payload?.userId || payload.userId === userId) return;
      setTypers((prev) => ({
        ...prev,
        [payload.userId]: {
          userId: payload.userId,
          name: payload.name,
          until: Date.now() + TYPER_TTL_MS,
        },
      }));
    };
    entry.listeners.add(onTyping);

    return () => {
      entry.listeners.delete(onTyping);
      entryRef.current = null;
      release(supabase, topic);
      setTypers({});
      lastBroadcastRef.current = 0;
      lastCustomerRef.current = 0;
    };
  }, [conversationId, userId]);

  // Expire stale typers.
  const hasTypers = Object.keys(typers).length > 0;
  useEffect(() => {
    if (!hasTypers) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTypers((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, t]) => t.until > now),
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1_000);
    return () => clearInterval(timer);
  }, [hasTypers]);

  /** Call on every keystroke; throttled internally. */
  const notifyTyping = useCallback(() => {
    if (!conversationId || !userId) return;
    const now = Date.now();

    if (now - lastBroadcastRef.current > BROADCAST_EVERY_MS && entryRef.current) {
      lastBroadcastRef.current = now;
      void entryRef.current.channel.send({
        type: "broadcast",
        event: "typing",
        payload: { userId, name: userName } satisfies TypingPayload,
      });
    }

    if (notifyCustomer && now - lastCustomerRef.current > CUSTOMER_EVERY_MS) {
      lastCustomerRef.current = now;
      void fetch("/api/whatsapp/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId }),
      }).catch(() => {
        // Best-effort signal; nothing to surface to the agent.
      });
    }
  }, [conversationId, userId, userName, notifyCustomer]);

  return {
    typers: Object.values(typers).map(({ userId: id, name }) => ({ userId: id, name })),
    notifyTyping,
  };
}
