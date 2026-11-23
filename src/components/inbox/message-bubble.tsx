"use client";

import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  MapPin,
  LayoutTemplate,
  CornerDownLeft,
  Sparkles,
  Forward,
  Star,
  Pin,
  PencilLine,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  MediaAudioBubble,
  MediaDocumentBubble,
  MediaImageBubble,
  MediaUnavailable,
  MediaVideoBubble,
} from "./message-media";
import { InteractivePreview } from "@/components/interactive/interactive-preview";
import { WaText } from "./wa-text";
import { useTranslations } from "next-intl";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
  /**
   * Opens the thread's media viewer on this message. Only images and videos
   * call it; omitted when the parent renders no viewer, in which case media
   * stays inline and non-clickable.
   */
  onOpenMedia?: (messageId: string) => void;
  /**
   * First bubble in a run from the same side: draws the WhatsApp tail on
   * the top-outer corner. Defaults to true so standalone callers still
   * get a tail.
   */
  showTail?: boolean;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-wa-meta" aria-label="Sending" />;
    case "sent":
      return <Check className="h-4 w-4 text-wa-meta" aria-label="Sent" />;
    case "delivered":
      return <CheckCheck className="h-4 w-4 text-wa-meta" aria-label="Delivered" />;
    case "read":
      return <CheckCheck className="h-4 w-4 text-wa-tick" aria-label="Read" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />;
    default:
      return null;
  }
}

/**
 * Invisible inline box at the end of a text run that reserves room for
 * the absolutely-positioned time + ticks, so they sit on the last line
 * when it's short and wrap to their own line when it isn't — the
 * WhatsApp layout.
 */
function MetaSpacer({
  withTicks,
  withAi,
  icons,
}: {
  withTicks: boolean;
  withAi: boolean;
  /** Number of small star / pin icons before the time. */
  icons: number;
}) {
  const width = 66 + (withTicks ? 20 : 0) + (withAi ? 46 : 0) + icons * 16;
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 align-middle"
      style={{ width }}
    />
  );
}

function BodyText({ text, spacer }: { text: string; spacer?: React.ReactNode }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[16px] leading-[22px] lg:text-[15px] lg:leading-[21px]">
      <WaText text={text} />
      {spacer}
    </p>
  );
}

function MessageContent({
  message,
  t,
  spacer,
  onOpenMedia,
}: {
  message: Message;
  t: ReturnType<typeof useTranslations>;
  /** Present when the meta row overlays the last text line. */
  spacer: React.ReactNode;
  onOpenMedia?: (messageId: string) => void;
}) {
  // Passed to the media bubbles as a no-arg callback; `undefined` when the
  // parent wired up no viewer, which is what makes them non-clickable.
  const openMedia = onOpenMedia ? () => onOpenMedia(message.id) : undefined;

  switch (message.content_type) {
    case "text":
      return <BodyText text={message.content_text ?? ""} spacer={spacer} />;

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImageBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("photo")} t={t} />
          )}
          {message.content_text && (
            <div className="mt-1 px-1">
              <BodyText text={message.content_text} spacer={spacer} />
            </div>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideoBubble message={message} onOpen={openMedia} t={t} />
          ) : (
            <MediaUnavailable label={t("video")} t={t} />
          )}
          {message.content_text && (
            <div className="mt-1 px-1">
              <BodyText text={message.content_text} spacer={spacer} />
            </div>
          )}
        </div>
      );

    case "audio":
      return message.media_url ? (
        <MediaAudioBubble message={message} t={t} />
      ) : (
        <MediaUnavailable label={t("audio")} t={t} />
      );

    case "document":
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || t("document")} t={t} />;
      }
      return <MediaDocumentBubble message={message} t={t} />;

    case "template":
      // Fall back to the template's name when we have no stored body
      // (legacy rows sent before issue #483 was fixed).
      return (
        <div>
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-wa-quote px-1.5 py-0.5 text-[10px] font-medium text-wa-text-2">
            <LayoutTemplate className="h-3 w-3" />
            {t("template")}
          </span>
          {message.content_text ? (
            <BodyText text={message.content_text} spacer={spacer} />
          ) : (
            message.template_name && (
              <p className="break-words text-[16px] lg:text-[15px] italic opacity-80">
                {message.template_name}
                {spacer}
              </p>
            )
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-[16px] lg:text-[15px]">
          <MapPin className="h-4 w-4 shrink-0 text-wa-text-2" />
          <span>
            {message.content_text || t("locationShared")}
            {spacer}
          </span>
        </div>
      );

    case "interactive": {
      // Three cases share content_type='interactive':
      //  - OUTBOUND with payload (composer / automation / Flow send after
      //    migration 035): render the buttons/list as they appear on the phone.
      //  - INBOUND tap (customer chose an option, sender_type='customer'):
      //    no payload; show the tapped option's title with a reply affordance
      //    so agents can tell it's a tap, not the customer typing.
      //  - OUTBOUND with NO payload (legacy bot/Flow sends from before
      //    migration 035 backfilled the column): show the body text plainly —
      //    it is our own message, NOT a customer tap.
      if (message.interactive_payload) {
        return (
          <InteractivePreview
            payload={message.interactive_payload}
            className="-mx-1 max-w-[340px] rounded-none bg-transparent text-[16px] text-wa-text shadow-none ring-0 lg:text-[15px]"
          />
        );
      }
      if (message.sender_type === "customer") {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-wa-text-2">
              <CornerDownLeft className="h-3 w-3" />
              {t("buttonReply")}
            </span>
            <BodyText text={message.content_text || t("interactiveReply")} spacer={spacer} />
          </div>
        );
      }
      return <BodyText text={message.content_text || t("interactiveReply")} spacer={spacer} />;
    }

    default:
      return <BodyText text={message.content_text || t("unsupported")} spacer={spacer} />;
  }
}

/** Content types whose last element is a run of text the meta can overlay. */
function endsWithText(message: Message): boolean {
  switch (message.content_type) {
    case "image":
    case "video":
      return !!message.content_text;
    case "audio":
    case "document":
      return false;
    case "interactive":
      return !message.interactive_payload;
    case "template":
      return !!message.content_text || !!message.template_name;
    default:
      return true;
  }
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
  onOpenMedia,
  showTail = true,
}: MessageBubbleProps) {
  const t = useTranslations("Inbox.bubble");

  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "h:mm a");
  const inlineMeta = endsWithText(message);
  const isStarred = !!message.starred_at;
  const isPinned = !!message.pinned_at;
  const metaIcons = (isStarred ? 1 : 0) + (isPinned ? 1 : 0);
  const isMedia =
    (message.content_type === "image" || message.content_type === "video") &&
    !!message.media_url;

  const meta = (
    <span
      className={cn(
        "flex items-center gap-1 whitespace-nowrap text-[12px] leading-none text-wa-meta",
        inlineMeta ? "absolute bottom-[7px] right-2" : "mt-1 justify-end",
      )}
    >
      {/* AI badge — only on replies the auto-reply bot generated. Lets
          agents tell an AI reply from their own / a Flow's at a glance. */}
      {message.ai_generated && (
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-wa-green/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-wa-green"
          title={t("aiBadgeTitle")}
        >
          <Sparkles className="h-2.5 w-2.5" />
          {t("aiBadge")}
        </span>
      )}
      {isPinned && (
        <Pin className="h-3 w-3 rotate-45" aria-label={t("pinned")} />
      )}
      {isStarred && (
        <Star className="h-3 w-3 fill-current" aria-label={t("starred")} />
      )}
      <span>{time}</span>
      {isAgent && <StatusIcon status={message.status} />}
    </span>
  );

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div className={cn("flex flex-col", isAgent ? "items-end" : "items-start")}>
      <div
        className={cn(
          "relative rounded-lg text-wa-text shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          isMedia ? "p-[3px] pb-1" : "px-2 pb-[7px] pt-1.5",
          isAgent ? "bg-wa-out" : "bg-wa-in",
          showTail &&
            (isAgent
              ? "wa-bubble-tail-out rounded-tr-none"
              : "wa-bubble-tail-in rounded-tl-none"),
        )}
      >
        {message.is_forwarded && (
          <div className="mb-0.5 flex items-center gap-1 px-0.5 text-[13.5px] italic text-wa-text-2">
            <Forward className="h-3.5 w-3.5" />
            {message.is_frequently_forwarded && <Forward className="-ml-2 h-3.5 w-3.5" />}
            {message.is_frequently_forwarded ? t("forwardedMany") : t("forwarded")}
          </div>
        )}
        {message.correction_of_message_id && (
          <div className="mb-0.5 flex items-center gap-1 px-0.5 text-[13px] font-medium text-wa-text-2">
            <PencilLine className="h-3.5 w-3.5" />
            {t("correction")}
          </div>
        )}
        {reply && (
          <ReplyQuote authorLabel={reply.authorLabel} preview={reply.preview} />
        )}
        <MessageContent
          message={message}
          t={t}
          spacer={
            inlineMeta ? (
              <MetaSpacer
                withTicks={isAgent}
                withAi={!!message.ai_generated}
                icons={metaIcons}
              />
            ) : null
          }
          onOpenMedia={onOpenMedia}
        />
        <div className={cn(!inlineMeta && "px-1")}>{meta}</div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
