"use client";

import { useState, type ReactNode } from "react";
import {
  ChevronDown,
  CornerUpLeft,
  Copy,
  PencilLine,
  Pin,
  PinOff,
  SmilePlus,
  Star,
  StarOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Message } from "@/types";
import { useTranslations } from "next-intl";
import { useSwipeToReply } from "./use-swipe-to-reply";

// WhatsApp's own quick-reaction bar starts with these six. Picking the same
// set keeps the affordance familiar without pulling in a 300KB emoji library.
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface MessageActionsProps {
  message: Message;
  onReply: () => void;
  onReact: (emoji: string) => void;
  /** Toggle the shared star. Omitted → no menu item. */
  onToggleStar?: () => void;
  /** Toggle the in-chat pin. Omitted → no menu item. */
  onTogglePin?: () => void;
  /**
   * "Edit" — the Cloud API can't edit a sent message, so this opens the
   * composer to send a correction. Omitted for messages it can't apply to.
   */
  onEdit?: () => void;
  children: ReactNode;
}

/**
 * Hover/long-press toolbar wrapper around a `<MessageBubble>`. The bubble
 * itself stays a pure presenter — this component owns the action surface so
 * the bubble's render path is unaffected when the toolbar isn't visible.
 */
export function MessageActions({
  message,
  onReply,
  onReact,
  onToggleStar,
  onTogglePin,
  onEdit,
  children,
}: MessageActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isStarred = !!message.starred_at;
  const isPinned = !!message.pinned_at;
  const t = useTranslations("Inbox.actions");

  // Touch devices have no hover. Long-press fires `contextmenu`; we capture
  // it, suppress the native menu, and pin the toolbar open until the user
  // interacts elsewhere.
  const [touchOpen, setTouchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isAgent =
    message.sender_type === "agent" || message.sender_type === "bot";

  const handleContextMenu = (e: React.MouseEvent) => {
    // Leave the browser's own menu on links ("Copy link address",
    // "Open in new tab") — that's what agents want when they right-click
    // or long-press a URL.
    if ((e.target as HTMLElement).closest("a[href]")) return;
    e.preventDefault();
    setTouchOpen(true);
  };

  const handleCopy = async () => {
    const text = message.content_text ?? "";
    if (!text) {
      toast.error(t("nothingToCopy"));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
    setTouchOpen(false);
  };

  const handlePickEmoji = (emoji: string) => {
    onReact(emoji);
    setPickerOpen(false);
    setTouchOpen(false);
  };

  const handleReply = () => {
    onReply();
    setTouchOpen(false);
  };

  // Phones: swipe the bubble right to reply (WhatsApp gesture). Optimistic
  // "temp-" messages aren't on WhatsApp yet, so they can't be quoted.
  const swipe = useSwipeToReply(handleReply, !message.id.startsWith("temp-"));

  // Row alignment lives here (not in MessageBubble) so the `group/actions`
  // hover region matches the bubble's content width — hovering empty space
  // in the row no longer reveals the toolbar.
  return (
    <div
      className={cn(
        // pan-y + pinch-zoom: the browser keeps vertical scrolling and zoom,
        // horizontal drags come to us for swipe-to-reply
        "flex w-full touch-pan-y touch-pinch-zoom",
        isAgent ? "justify-end" : "justify-start",
      )}
      onContextMenu={handleContextMenu}
      onBlur={() => setTouchOpen(false)}
      {...swipe.handlers}
    >
      {/* `min-w-0` lets this flex child actually respect the 75% cap.
       *  Default `min-width: auto` lets content (a long quote preview,
       *  an unbroken URL) push past the cap and shove the row past
       *  100%, which used to bleed across into the contact-sidebar
       *  area. See issue #165. */}
      <div
        className={cn(
          "group/actions relative min-w-0 max-w-[88%] sm:max-w-[75%] xl:max-w-[65%]",
          // Snap back smoothly on release; follow the finger exactly while dragging
          !swipe.dragging && "transition-transform duration-200 ease-out",
        )}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {/* Reply icon revealed in the gap the swipe opens (travels with the bubble) */}
        {swipe.offset > 0 && (
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute right-full top-1/2 mr-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              swipe.progress >= 1 ? "bg-wa-green text-white" : "bg-muted text-muted-foreground",
            )}
            style={{ opacity: swipe.progress, transform: `translateY(-50%) scale(${0.6 + 0.4 * swipe.progress})` }}
          >
            <CornerUpLeft className="h-4 w-4" />
          </div>
        )}
        {children}
      <div
        data-touch-open={touchOpen || pickerOpen || menuOpen ? "true" : undefined}
        className={cn(
          "absolute -top-3 z-10 flex h-7 items-center gap-0.5 rounded-full border border-border bg-popover/95 px-1 shadow-md backdrop-blur-sm transition-opacity",
          // Hidden toolbar must not swallow clicks — it used to sit
          // invisibly over the bubble's top edge and block links there.
          "pointer-events-none opacity-0",
          "group-hover/actions:pointer-events-auto group-hover/actions:opacity-100",
          "group-focus-within/actions:pointer-events-auto group-focus-within/actions:opacity-100",
          "data-[touch-open=true]:pointer-events-auto data-[touch-open=true]:opacity-100",
          // Phones: over the bubble's top edge (opened by long-press).
          // sm+: beside the bubble, touching it so hover isn't lost on
          // the way, and never covering the message text.
          isAgent
            ? "right-3 sm:left-auto sm:right-full sm:top-1"
            : "left-3 sm:left-full sm:right-auto sm:top-1",
        )}
      >
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger
            className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("react")}
          >
            <SmilePlus className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent
            className="flex w-auto flex-row gap-1 p-1.5"
            sideOffset={6}
          >
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => handlePickEmoji(e)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-lg leading-none transition-transform hover:scale-125 hover:bg-muted"
                aria-label={t("reactWith", { emoji: e })}
              >
                {e}
              </button>
            ))}
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={handleReply}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("reply")}
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
          aria-label={t("copyText")}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {(onToggleStar || onTogglePin || onEdit) && (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              className="flex h-5 w-5 items-center justify-center rounded-full text-popover-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("more")}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isAgent ? "end" : "start"} className="min-w-44">
              <DropdownMenuItem onClick={handleReply} className="text-sm">
                <CornerUpLeft className="h-4 w-4" />
                {t("reply")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleCopy()} className="text-sm">
                <Copy className="h-4 w-4" />
                {t("copyText")}
              </DropdownMenuItem>
              {onToggleStar && (
                <DropdownMenuItem onClick={onToggleStar} className="text-sm">
                  {isStarred ? <StarOff className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                  {isStarred ? t("unstar") : t("star")}
                </DropdownMenuItem>
              )}
              {onTogglePin && (
                <DropdownMenuItem onClick={onTogglePin} className="text-sm">
                  {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  {isPinned ? t("unpin") : t("pin")}
                </DropdownMenuItem>
              )}
              {onEdit && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onEdit} className="text-sm">
                    <PencilLine className="h-4 w-4" />
                    {t("edit")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      </div>
    </div>
  );
}
