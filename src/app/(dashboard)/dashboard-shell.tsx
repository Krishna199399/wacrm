"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { NavRail } from "@/components/layout/nav-rail";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { MobileNav } from "@/components/layout/mobile-nav";
import { IosInstallPrompt } from "@/components/pwa/ios-install-prompt";
import { cn } from "@/lib/utils";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isInbox = pathname.startsWith("/inbox");

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    // WhatsApp Business frame: a dark-green top app bar across the full
    // width, a green nav rail on the left (desktop), and the page itself
    // on a light card with a rounded top-left corner.
    <div className="flex h-dvh flex-col overflow-hidden bg-wa-bar">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      {/* Mobile-only drawer (hamburger in the top bar opens it). */}
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <Header onOpenSidebar={() => setSidebarOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <NavRail />
        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto lg:rounded-tl-[18px]",
            isInbox
              ? "overflow-hidden bg-wa-panel p-0"
              : "bg-background p-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] sm:p-6 lg:pb-6",
          )}
        >
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          {children}
        </main>
      </div>
      {/* Bottom tab bar for mobile like WhatsApp Business */}
      <MobileNav />
      {/* Floating Add-to-Home-Screen prompt for iPhone users */}
      <IosInstallPrompt />
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}
