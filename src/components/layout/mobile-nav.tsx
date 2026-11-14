"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Users, Radio, Zap, Settings } from "lucide-react";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { cn } from "@/lib/utils";

interface MobileNavProps {
  hidden?: boolean;
}

export function MobileNav({ hidden }: MobileNavProps) {
  const pathname = usePathname();
  const unreadCount = useTotalUnread();

  if (hidden) return null;

  const navItems = [
    {
      label: "Chats",
      href: "/inbox",
      icon: MessageSquare,
      active: pathname.startsWith("/inbox"),
    },
    {
      label: "Contacts",
      href: "/contacts",
      icon: Users,
      active: pathname.startsWith("/contacts"),
    },
    {
      label: "Broadcasts",
      href: "/broadcasts",
      icon: Radio,
      active: pathname.startsWith("/broadcasts"),
    },
    {
      label: "Automations",
      href: "/automations",
      icon: Zap,
      active: pathname.startsWith("/automations"),
    },
    {
      label: "Settings",
      href: "/settings",
      icon: Settings,
      active: pathname.startsWith("/settings"),
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-border bg-card/95 backdrop-blur-md pb-safe lg:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center py-2 text-[11px] font-medium transition-colors active:scale-95",
              item.active
                ? "text-primary font-bold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="relative">
              <Icon className={cn("h-5 w-5", item.active && "stroke-[2.5]")} />
              {item.href === "/inbox" && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            <span className="mt-1 leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
