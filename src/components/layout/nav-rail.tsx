"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { NAV_ITEMS, SETTINGS_ITEM, isNavActive, type NavItem } from "./nav-items";

/**
 * Desktop-only vertical navigation rail in the WhatsApp Business style:
 * dark-green column, icon above a short label, the active item on a
 * lighter rounded tile. Sits under the top app bar, left of the white
 * content card. Mobile uses the bottom tab bar + drawer instead.
 */
export function NavRail() {
  const t = useTranslations("Sidebar");
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-[88px] shrink-0 flex-col bg-wa-bar pb-3 pl-safe lg:flex"
    >
      <ul className="scrollbar-none flex flex-1 flex-col gap-1 overflow-y-auto px-1.5 pt-1">
        {NAV_ITEMS.filter((item) => !item.railHidden).map((item) => (
          <li key={item.href}>
            <RailLink
              item={item}
              label={t(item.labelKey)}
              active={isNavActive(pathname, item.href)}
              badge={item.href === "/inbox" ? totalUnread : 0}
              badgeLabel={
                item.href === "/inbox" && totalUnread > 0
                  ? t("unreadConversations", { count: totalUnread })
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
      <div className="px-1.5 pt-2">
        <RailLink
          item={SETTINGS_ITEM}
          label={t(SETTINGS_ITEM.labelKey)}
          active={isNavActive(pathname, SETTINGS_ITEM.href)}
        />
      </div>
    </nav>
  );
}

function RailLink({
  item,
  label,
  active,
  badge = 0,
  badgeLabel,
}: {
  item: NavItem;
  label: string;
  active: boolean;
  badge?: number;
  badgeLabel?: string;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl px-0.5 py-2.5 text-[11px] font-medium leading-tight tracking-tight transition-colors",
        active
          ? "bg-wa-bar-active text-wa-bar-fg"
          : "text-wa-bar-muted hover:bg-wa-bar-hover hover:text-wa-bar-fg",
      )}
    >
      <span className="relative">
        <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} />
        {badge > 0 && (
          <span
            aria-label={badgeLabel}
            className="absolute -right-3 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-wa-green px-1 text-[10px] font-bold text-white ring-2 ring-wa-bar"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center">{label}</span>
    </Link>
  );
}
