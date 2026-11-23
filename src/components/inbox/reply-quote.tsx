"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { useTranslations } from "next-intl";

interface ReplyQuoteProps {
  /** Sender label of the quoted message: "You" for our own messages,
   *  contact name for customer-sent messages. Caller resolves this — the
   *  quote component doesn't see the parent Message. */
  authorLabel: string;
  /** Compact text preview. Falls back to a placeholder for media types. */
  preview: string;
  /** Present → renders the composer-chip variant with an X button. Absent →
   *  renders the embedded-in-bubble variant. */
  onDismiss?: () => void;
  /** Deprecated: bubbles are no longer primary-filled, so the quote
   *  reads the same on both sides. Accepted for compatibility. */
  onPrimary?: boolean;
}

/** WhatsApp-style quoted message: tinted card with a green left bar. */
export function ReplyQuote({ authorLabel, preview, onDismiss }: ReplyQuoteProps) {
  const t = useTranslations("Inbox.replyQuote");
  const isChip = !!onDismiss;
  return (
    <div
      className={cn(
        "flex items-start gap-2 overflow-hidden rounded-md border-l-4 border-wa-green px-2.5 py-1.5",
        isChip ? "bg-wa-surface" : "mb-1 bg-wa-quote",
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="truncate text-[13.5px] font-semibold text-wa-green">
          {authorLabel}
        </div>
        {/* Wrap the preview instead of truncating to a single line.
         *  `truncate` (white-space: nowrap) forced the quote onto one
         *  impossibly-wide line and — because the parent flex chain
         *  lacked `min-w-0` at every step — pushed the entire inbox
         *  layout wider, shoving the contact sidebar off-screen.
         *  `break-words` also wraps long URLs that have no whitespace
         *  to break on. Issue #165. */}
        <div className="line-clamp-3 whitespace-pre-wrap break-words text-[14.5px] text-wa-text-2 lg:text-[14px]">
          {preview}
        </div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("cancelReply")}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-wa-icon hover:bg-wa-hover"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Build the one-line preview text shown inside a reply quote. */
export function buildReplyPreview(message: Message, t: ReturnType<typeof useTranslations>): string {
  if (message.content_text) return message.content_text;
  switch (message.content_type) {
    case "image":
      return t("photo");
    case "video":
      return t("video");
    case "audio":
      return t("audio");
    case "document":
      return t("document");
    case "location":
      return t("location");
    case "template":
      return t("template");
    default:
      return t("message");
  }
}
