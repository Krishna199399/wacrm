"use client";

import { useCallback, useRef, useState, type TouchEvent } from "react";

/** How far (px) the bubble must be dragged before letting go triggers a reply. */
export const SWIPE_REPLY_THRESHOLD = 56;
/** The bubble never moves further than this, however far the finger goes. */
const MAX_OFFSET = 80;
/** Movement (px) needed before we decide between "swipe" and "scroll". */
const DECIDE_AFTER = 10;
/** Touches starting this close to the left screen edge belong to the OS back gesture. */
const EDGE_GUARD = 24;

type Phase = "idle" | "pending" | "swiping" | "scrolling";

/**
 * Pure: once the finger has moved (dx, dy) from where it started, is this a
 * reply swipe, a scroll, or still undecided? Exported for unit tests.
 */
export function classifyDrag(dx: number, dy: number): "pending" | "swiping" | "scrolling" {
  if (Math.abs(dy) > DECIDE_AFTER && Math.abs(dy) > Math.abs(dx)) return "scrolling";
  if (dx > DECIDE_AFTER && dx > Math.abs(dy) * 1.5) return "swiping";
  return "pending";
}

/**
 * Pure: how far the bubble moves for a finger travel of dx — 1:1 up to the
 * threshold, then elastic resistance, capped at MAX_OFFSET. Exported for tests.
 */
export function swipeOffset(dx: number): number {
  const raw = Math.max(0, dx - DECIDE_AFTER);
  return raw <= SWIPE_REPLY_THRESHOLD
    ? raw
    : Math.min(MAX_OFFSET, SWIPE_REPLY_THRESHOLD + (raw - SWIPE_REPLY_THRESHOLD) * 0.35);
}

/**
 * WhatsApp-style swipe-right-to-reply for touch screens.
 *
 * - Only a mostly-horizontal drag to the right engages; vertical drags stay
 *   normal scrolling (the row also sets `touch-action: pan-y`).
 * - Past SWIPE_REPLY_THRESHOLD the reply icon fills in and the phone gives a
 *   short vibration; releasing there calls `onReply`. Releasing earlier
 *   snaps back and does nothing.
 * - Ignores swipes that start on drag-type controls (inputs, sliders, media
 *   players) or at the very left edge (iOS/Android back gesture).
 * Mouse input never triggers it — desktop keeps the hover toolbar.
 */
export function useSwipeToReply(onReply: () => void, enabled = true) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const phase = useRef<Phase>("idle");
  const armed = useRef(false);

  const reset = useCallback(() => {
    phase.current = "idle";
    armed.current = false;
    setDragging(false);
    setOffset(0);
  }, []);

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const target = e.target as HTMLElement;
      // Links and image buttons stay swipeable (a drag never counts as a tap);
      // only controls that need horizontal drags themselves are excluded.
      if (target.closest('input, textarea, select, audio, video, [role="slider"], [data-no-swipe]')) return;
      const t = e.touches[0];
      if (t.clientX < EDGE_GUARD) return;
      start.current = { x: t.clientX, y: t.clientY };
      phase.current = "pending";
      armed.current = false;
    },
    [enabled],
  );

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (phase.current === "idle" || phase.current === "scrolling") return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;

    if (phase.current === "pending") {
      const decided = classifyDrag(dx, dy);
      if (decided === "pending") return;
      phase.current = decided;
      if (decided === "scrolling") return;
      setDragging(true);
    }

    const next = swipeOffset(dx);
    setOffset(next);

    const nowArmed = next >= SWIPE_REPLY_THRESHOLD;
    if (nowArmed && !armed.current) {
      // Tiny haptic tick where supported (Android Chrome); silently ignored elsewhere
      try {
        navigator.vibrate?.(12);
      } catch {
        /* not supported */
      }
    }
    armed.current = nowArmed;
  }, []);

  const onTouchEnd = useCallback(() => {
    if (phase.current === "swiping" && armed.current) onReply();
    reset();
  }, [onReply, reset]);

  return {
    /** Spread onto the swipeable row */
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
    /** Current horizontal shift of the bubble, px */
    offset,
    /** 0 → 1 as the drag approaches the reply threshold */
    progress: Math.min(1, offset / SWIPE_REPLY_THRESHOLD),
    /** True while a finger is actively dragging (disable the snap-back transition) */
    dragging,
  };
}
