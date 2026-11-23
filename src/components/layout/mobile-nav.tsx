"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle, Users, Megaphone, Zap, Settings } from "lucide-react";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  hidden?: boolean;
}

const ITEMS = [
  { labelKey: "chats", href: "/inbox", icon: MessageCircle },
  { labelKey: "contacts", href: "/contacts", icon: Users },
  { labelKey: "broadcasts", href: "/broadcasts", icon: Megaphone },
  { labelKey: "automations", href: "/automations", icon: Zap },
  { labelKey: "settings", href: "/settings", icon: Settings },
] as const;

/**
 * Bottom tab bar on phones, WhatsApp style: the active tab's icon sits
 * in a soft green pill and its label goes bold. Hidden on lg+, where
 * the nav rail takes over.
 */
export function MobileNav({ hidden }: MobileNavProps) {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const unreadCount = useTotalUnread();

  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-wa-divider bg-wa-panel pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] pt-1.5 lg:hidden">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors active:scale-95",
              active ? "font-semibold text-wa-text" : "font-medium text-wa-text-2",
            )}
          >
            <span
              className={cn(
                "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                active && "bg-wa-green-soft",
              )}
            >
              <Icon
                className={cn("h-[22px] w-[22px]", active && "text-wa-text")}
                strokeWidth={active ? 2.3 : 1.9}
              />
              {item.href === "/inbox" && unreadCount > 0 && (
                <span className="absolute -top-1 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-wa-green px-1 text-[10px] font-bold text-white ring-2 ring-wa-panel">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </span>
            <span className="leading-none">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
