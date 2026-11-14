/**
 * Plays a soft, clean incoming WhatsApp notification chime
 * using the Web Audio API (zero assets, zero latency, works offline).
 */
export function playNotificationSound() {
  if (typeof window === "undefined") return;

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Tone 1: Gentle ping (800 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(800, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Tone 2: Bright harmonic chime (1200 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1200, now + 0.08);
    gain2.gain.setValueAtTime(0.2, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);

    // Vibrate phone if supported on mobile
    if ("vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch (err) {
    // Ignore audio context autoplay restrictions before user gesture
  }
}

/**
 * Sends a native system notification (Lock Screen / Banner)
 */
export function showSystemNotification(title: string, body: string, conversationId?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      const notif = new Notification(title, {
        body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: conversationId || "wacrm-chat",
      });

      notif.onclick = () => {
        window.focus();
        if (conversationId) {
          window.location.href = `/inbox?c=${encodeURIComponent(conversationId)}`;
        }
      };
    } catch {}
  }
}
