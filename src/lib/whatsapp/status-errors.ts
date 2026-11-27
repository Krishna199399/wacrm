/**
 * Meta delivery-status helpers.
 *
 * When a message fails AFTER Meta accepted it, the webhook `statuses[]` entry
 * carries the reason in `errors[]`. Without it, the inbox can only show a red
 * "failed" mark and nobody knows why (marketing limit? not on WhatsApp?).
 */

/** A `statuses[]` entry from Meta's webhook. `errors` is present on `failed`. */
export interface MetaStatusUpdate {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  errors?: Array<{
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  }>;
}

export interface FailureReason {
  code: number | null;
  title: string;
}

/**
 * Meta's reason for a failed message, e.g.
 *   { code: 131049, title: "This message was not delivered to maintain healthy ecosystem engagement." }
 * Returns null for any status other than `failed`.
 */
export function failureReason(status: Pick<MetaStatusUpdate, "status" | "errors">): FailureReason | null {
  if (status.status !== "failed") return null;
  const e = status.errors?.[0];
  if (!e) return { code: null, title: "Failed (Meta gave no reason)" };
  const title = [e.title || e.message, e.error_data?.details]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 500);
  return { code: typeof e.code === "number" ? e.code : null, title: title || "Failed" };
}

/** Plain-language explanations for the failure codes agents actually hit. */
const HINTS: Record<number, string> = {
  131049: "Meta limits how many marketing messages one person receives. Try again in a few days, or wait for the customer to message you first.",
  131050: "The customer has turned off marketing messages from businesses.",
  131026: "This number can't receive the message (not on WhatsApp, or an old WhatsApp version).",
  131047: "More than 24 hours since the customer's last message — only an approved template can be sent.",
  130472: "Meta is running a marketing-message experiment that includes this number; it was not delivered.",
  131042: "Payment issue on the WhatsApp Business account.",
  132000: "The template's variables don't match what Meta approved.",
  132001: "The template doesn't exist in this language on Meta.",
  132015: "The template is paused by Meta for low quality.",
  132016: "The template is disabled by Meta.",
};

/** One line for the agent: "131049: <Meta title> — <what it means>" */
export function describeFailure(code: number | null | undefined, title: string | null | undefined): string {
  const hint = code ? HINTS[code] : undefined;
  const base = [code, title].filter(Boolean).join(": ") || "Failed";
  return hint ? `${base}\n${hint}` : base;
}
