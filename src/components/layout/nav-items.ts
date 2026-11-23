import {
  Bell,
  Bot,
  GitBranch,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  Settings,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

export interface NavItem {
  href: string;
  /** Key in the `Sidebar` i18n namespace. */
  labelKey: string;
  icon: typeof LayoutDashboard;
  /** Renders a small "Beta" chip in the drawer. Informational only. */
  beta?: boolean;
  /**
   * Hidden from the desktop rail because the top app bar already
   * exposes it (the bell). Still listed in the mobile drawer.
   */
  railHidden?: boolean;
}

/** Primary navigation, WhatsApp Business order: chats first. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inbox", labelKey: "chats", icon: MessageCircle },
  { href: "/contacts", labelKey: "contacts", icon: Users },
  { href: "/broadcasts", labelKey: "broadcasts", icon: Megaphone },
  { href: "/automations", labelKey: "automations", icon: Zap },
  { href: "/flows", labelKey: "flows", icon: Workflow, beta: true },
  { href: "/agents", labelKey: "aiAgents", icon: Bot },
  { href: "/pipelines", labelKey: "pipelines", icon: GitBranch },
  { href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { href: "/notifications", labelKey: "notifications", icon: Bell, railHidden: true },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  labelKey: "settings",
  icon: Settings,
};

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}
