/**
 * WhatsApp-style UI helpers shared by the inbox panels:
 * pastel avatar colours, initials, and list / bubble time formats.
 */

/**
 * Pastel background + matching darker ink for letter avatars. Fixed
 * hex pairs (not theme tokens) so a contact keeps the same colour in
 * light and dark mode, like WhatsApp.
 */
const AVATAR_PALETTE: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: "#d1f4e0", fg: "#0b6b45" }, // mint
  { bg: "#fde2e4", fg: "#a3223a" }, // rose
  { bg: "#e6dcfb", fg: "#5b3aa6" }, // lavender
  { bg: "#d6ebfb", fg: "#1b5f95" }, // sky
  { bg: "#fdebd3", fg: "#9a5410" }, // peach
  { bg: "#d4f1f1", fg: "#0f6c6c" }, // teal
  { bg: "#fbe1f2", fg: "#9b2a75" }, // pink
  { bg: "#f2efc9", fg: "#6d6312" }, // sand
];

export interface AvatarColors {
  bg: string;
  fg: string;
}

/** Stable pastel colour pair for a contact, derived from its name. */
export function getAvatarColors(name: string | null | undefined): AvatarColors {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/** Background colour only. Kept for callers that predate getAvatarColors. */
export function getAvatarColor(name: string): string {
  return getAvatarColors(name).bg;
}

/**
 * 1–2 letter initials. "John Doe" → "JD", "Alice" → "A". Phone-only
 * names (no letters) fall back to the first character.
 */
export function getInitials(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const words = trimmed.replace(/^[~\s]+|[~\s]+$/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return trimmed.charAt(0).toUpperCase();
  if (words.length === 1 || !/[a-z]/i.test(words[words.length - 1].charAt(0))) {
    return words[0].charAt(0).toUpperCase();
  }
  return (
    words[0].charAt(0).toUpperCase() +
    words[words.length - 1].charAt(0).toUpperCase()
  );
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Conversation-list timestamp, WhatsApp Business style:
 * - Today      → "10:24 AM"
 * - Yesterday  → "Yesterday"
 * - This year  → "Nov 19"
 * - Older      → "19/11/24"
 *
 * `yesterdayLabel` lets the caller pass a translated string.
 */
export function formatWhatsAppTime(
  date: Date | string,
  yesterdayLabel = "Yesterday",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);

  if (diffDays <= 0) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (diffDays === 1) return yesterdayLabel;
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** Bubble timestamp — always the time: "10:30 AM". */
export function formatMessageTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Unread badge text: "99+" for 100 or more. */
export function formatUnreadCount(count: number): string {
  if (!count || count <= 0) return "";
  if (count > 99) return "99+";
  return count.toString();
}
