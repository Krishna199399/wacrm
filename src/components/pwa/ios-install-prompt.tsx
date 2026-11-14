"use client";

import { useState, useEffect } from "react";
import { Share, PlusSquare, X, Smartphone } from "lucide-react";

export function IosInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return;

    // Check if dismissed previously within 7 days
    const dismissedAt = localStorage.getItem("wacrm_ios_prompt_dismissed");
    if (dismissedAt) {
      const diffDays = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (diffDays < 7) return;
    }

    // Check if running in standalone mode (already installed on Home Screen)
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;

    if (isStandalone) return;

    // Detect iOS devices (iPhone, iPad, iPod)
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIos) {
      // Delay prompt slightly so page settles
      const timer = setTimeout(() => setShowPrompt(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("wacrm_ios_prompt_dismissed", String(Date.now()));
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed inset-x-3 bottom-16 z-50 rounded-2xl border border-primary/30 bg-card/95 p-4 shadow-2xl backdrop-blur-md sm:hidden animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Install App on iPhone
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Use like native WhatsApp Business
            </p>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5 rounded-xl bg-muted/60 p-3 text-xs text-foreground">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
            1
          </span>
          <span>
            Tap the <Share className="inline h-3.5 w-3.5 mx-1 text-primary" /> <strong>Share</strong> button in Safari
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
            2
          </span>
          <span>
            Scroll down and select <PlusSquare className="inline h-3.5 w-3.5 mx-1 text-primary" /> <strong>Add to Home Screen</strong>
          </span>
        </div>
      </div>

      <button
        onClick={handleDismiss}
        className="mt-3 w-full rounded-xl bg-primary py-2 text-center text-xs font-bold text-primary-foreground shadow-sm transition active:scale-95"
      >
        Got it!
      </button>
    </div>
  );
}
