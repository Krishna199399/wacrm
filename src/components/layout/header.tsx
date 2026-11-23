"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Bell,
  BellRing,
  BadgeCheck,
  ChevronDown,
  LogOut,
  Menu,
  MessageCircle,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { usePresence } from "@/hooks/use-presence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/notifications": "notifications",
  "/contacts": "contacts",
  "/pipelines": "pipelines",
  "/broadcasts": "broadcasts",
  "/automations": "automations",
  "/settings": "settings",
};

function getPageTitleKey(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  const match = Object.entries(pageTitles).find(([path]) =>
    pathname.startsWith(path),
  );
  return match ? match[1] : "dashboard";
}

interface HeaderProps {
  /** Opens the mobile nav drawer. The hamburger is hidden on lg+. */
  onOpenSidebar?: () => void;
}

/**
 * Top app bar in the WhatsApp Business style: full-width dark green,
 * brand on the left (aligned over the nav rail on desktop), bell and
 * account menu on the right.
 */
export function Header({ onOpenSidebar }: HeaderProps) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  const { user, profile, account, signOut } = useAuth();
  const { getPresence } = usePresence();
  const myPresence = user ? getPresence(user.id) : "offline";
  const unreadNotifications = useUnreadNotifications();
  const titleKey = getPageTitleKey(pathname);

  const displayName = profile?.full_name ?? t("defaultUser");
  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";
  const brand = account?.name
    ? t("brandTitle", { name: account.name })
    : t("brandFallback");

  const [notifState, setNotifState] = useState<string>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      // Browser-only API: read after mount so SSR and the first client
      // render agree, then sync once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifState(Notification.permission);
    }
  }, []);

  const handleRequestNotifs = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.info(t("notificationsUnsupported"));
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifState(perm);
      if (perm === "granted") {
        toast.success(t("notificationsEnabled"));
      } else {
        toast.error(t("notificationsDenied"));
      }
    } catch {
      toast.error(t("notificationsError"));
    }
  };

  const iconButton =
    "relative flex h-10 w-10 items-center justify-center rounded-full text-wa-bar-fg/90 transition-colors hover:bg-wa-bar-hover hover:text-wa-bar-fg";

  return (
    <header
      className={cn(
        "flex shrink-0 items-center justify-between gap-3 bg-wa-bar text-wa-bar-fg",
        "pt-[env(safe-area-inset-top,0px)] pr-3 lg:pr-5",
        "min-h-[calc(3.5rem+env(safe-area-inset-top,0px))] lg:min-h-[calc(4rem+env(safe-area-inset-top,0px))]",
      )}
    >
      <div className="flex min-w-0 items-center">
        {/* Hamburger — mobile only. 44×44 hit target. */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label={t("openMenu")}
          className="ml-1 flex h-11 w-11 items-center justify-center rounded-full text-wa-bar-fg hover:bg-wa-bar-hover lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo tile — sits in an 88px column on desktop so it lines up
            with the nav rail directly below it. */}
        <Link
          href="/inbox"
          aria-label={brand}
          className="hidden w-[88px] shrink-0 items-center justify-center lg:flex"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-wa-bar shadow-sm">
            <MessageCircle className="h-6 w-6" strokeWidth={2.2} />
          </span>
        </Link>

        {/* Desktop: brand. Mobile: brand on Chats, else the page title. */}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-lg font-semibold tracking-tight lg:text-[22px]">
            <span className="lg:hidden">
              {pathname.startsWith("/inbox") ? brand : t(titleKey)}
            </span>
            <span className="hidden lg:inline">{brand}</span>
          </h1>
          <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
            <BadgeCheck
              aria-label={t("verified")}
              className="h-5 w-5 fill-wa-green text-wa-bar"
            />
            <span className="rounded-md bg-wa-green px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none tracking-wide text-white">
              {t("crmChip")}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 sm:gap-1.5">
        <ModeToggle className={cn(iconButton, "hidden sm:flex")} />

        <Link
          href="/notifications"
          aria-label={
            unreadNotifications > 0
              ? t("notificationsUnread", { count: unreadNotifications })
              : t("notifications")
          }
          title={t("notifications")}
          className={iconButton}
        >
          <Bell className="h-[22px] w-[22px]" />
          {unreadNotifications > 0 && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-wa-bar" />
          )}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-wa-bar-hover focus:outline-none data-popup-open:bg-wa-bar-hover sm:pr-3"
            aria-label={t("openAccountMenu")}
          >
            <span className="relative inline-flex">
            <Avatar className="size-9 ring-2 ring-white/80">
              {profile?.avatar_url ? (
                <AvatarImage src={profile.avatar_url} alt={displayName} />
              ) : null}
              <AvatarFallback className="bg-white text-sm font-semibold text-wa-bar">
                {initial}
              </AvatarFallback>
            </Avatar>
            {/* Your own presence, from the same heartbeat teammates see. */}
            <span
              title={t(`presence_${myPresence}`)}
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-wa-bar",
                myPresence === "online"
                  ? "bg-wa-green"
                  : myPresence === "away"
                    ? "bg-amber-400"
                    : "bg-gray-400",
              )}
            />
            </span>
            <span className="hidden max-w-40 truncate text-[15px] font-medium sm:inline">
              {displayName}
            </span>
            <ChevronDown className="hidden h-4 w-4 opacity-80 sm:block" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="min-w-56 bg-popover text-popover-foreground ring-border"
          >
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.email ?? ""}
              </p>
            </div>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=profile"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <User className="size-4" />
              {t("menuProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={
                <Link
                  href="/settings?tab=whatsapp"
                  className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
                />
              }
            >
              <SettingsIcon className="size-4" />
              {t("menuSettings")}
            </DropdownMenuItem>
            {notifState !== "granted" && (
              <DropdownMenuItem
                onClick={handleRequestNotifs}
                className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <BellRing className="size-4 text-amber-500" />
                {t("enableNotifications")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={signOut}
              className="text-popover-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <LogOut className="size-4" />
              {t("menuSignOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
