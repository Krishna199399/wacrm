import { Fragment, type ReactNode } from "react";

/**
 * Renders message text the way WhatsApp does: `*bold*`, `_italic_`,
 * `~strike~`, ```mono```, and clickable http(s)/www links. Output is
 * plain React nodes (no innerHTML), so message content can't inject
 * markup. Formatting is single-level, which covers what customers and
 * templates actually send.
 */

// Top-level domains we linkify without a scheme ("belesu.in/books/…"),
// the way WhatsApp's own apps do. A fixed list (rather than "any
// letters") keeps things like "e.g." or "file.txt" from becoming links.
const BARE_TLDS =
  "com|in|org|net|io|co|app|dev|me|info|biz|shop|store|online|site|xyz|ai|edu|gov|uk|us|ca|au|de|fr|link|page|tech|live|club|blog|news|cloud|gg|tv|ly|to";

const TOKEN_RE = new RegExp(
  [
    // 1. Links: explicit scheme, www., or a bare domain with a known TLD.
    //    The lookbehind stops matches inside emails (x@belesu.in) and
    //    mid-word.
    `(https?:\\/\\/[^\\s<]+|www\\.[^\\s<]+|(?<![@\\w./-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${BARE_TLDS})(?![a-z0-9-])(?:\\/[^\\s<]*)?)`,
    // 2–5. *bold*, _italic_, ~strike~, \`\`\`mono\`\`\`
    `(?<![\\w*])\\*(?=\\S)([^*\\n]*?\\S)\\*(?![\\w*])`,
    `(?<![\\w_])_(?=\\S)([^_\\n]*?\\S)_(?![\\w_])`,
    `(?<![\\w~])~(?=\\S)([^~\\n]*?\\S)~(?![\\w~])`,
    "```([^`]+?)```",
  ].join("|"),
  "gi",
);

// Punctuation that usually ends a sentence rather than a URL.
const TRAILING_PUNCT = /[.,!?;:)\]'"]+$/;

export function WaText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));

    const [whole, url, bold, italic, strike, mono] = m;
    if (url) {
      const trail = url.match(TRAILING_PUNCT)?.[0] ?? "";
      const clean = trail ? url.slice(0, -trail.length) : url;
      const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
      nodes.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-wa-link hover:underline"
        >
          {clean}
        </a>,
      );
      if (trail) nodes.push(trail);
    } else if (bold) {
      nodes.push(<strong key={key++} className="font-semibold">{bold}</strong>);
    } else if (italic) {
      nodes.push(<em key={key++}>{italic}</em>);
    } else if (strike) {
      nodes.push(<s key={key++}>{strike}</s>);
    } else if (mono) {
      nodes.push(
        <code key={key++} className="font-mono text-[13px]">
          {mono}
        </code>,
      );
    } else {
      nodes.push(whole);
    }
    last = start + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));

  return <Fragment>{nodes}</Fragment>;
}
