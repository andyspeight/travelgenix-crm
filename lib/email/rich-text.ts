/**
 * Rich text for email — a small document the server can trust.
 *
 * The composer lets an agent bold a word, add a bullet list, paste in a
 * paragraph from a supplier's email. All of that has to become HTML that we
 * put in front of a customer, which makes it a security boundary: paste from
 * a web page and the clipboard carries scripts, event handlers, tracking
 * pixels and styling that will wreck the email.
 *
 * THE DECISION: we never accept HTML from the browser. The composer converts
 * what the agent typed into a tiny, strict document — paragraphs, headings,
 * lists, quotes, and spans that may be bold, italic, underlined or linked —
 * and the SERVER renders the HTML from that. There is no sanitiser to get
 * wrong, because there is no HTML to sanitise. Anything the browser sends
 * that is not in this shape is dropped, not "cleaned".
 *
 * A hand-written sanitiser is a bug waiting to reach a customer's inbox. A
 * whitelist you build the output from cannot leak what it cannot express.
 *
 * Every email also carries a plain-text alternative built from the same
 * document, because a customer reading in plain text should get the same
 * message rather than a wall of markup.
 *
 * Pure functions, no I/O, no DOM.
 */

export type Span = {
  text: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  /** http, https or mailto only. Anything else keeps the words, drops the link. */
  href?: string;
};

export type Block =
  | { type: "p" | "h3" | "quote"; spans: Span[] }
  | { type: "ul" | "ol"; items: Span[][] };

export type RichDoc = Block[];

/** Generous for an email, small enough that nothing here can be a weapon. */
export const LIMITS = {
  blocks: 300,
  spansPerBlock: 200,
  itemsPerList: 100,
  totalChars: 20_000,
} as const;

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

const BLOCK_TYPES = new Set(["p", "h3", "quote", "ul", "ol"]);

export type ValidationResult =
  | { ok: true; doc: RichDoc }
  | { ok: false; error: string };

/**
 * Turn whatever arrived over the wire into a document, or refuse it.
 *
 * Deliberately strict and silent about detail: unknown block types, unknown
 * span keys and unsafe links are dropped rather than reported, because the
 * only client that produces them is one that should not be trusted with a
 * more helpful error. Size limits DO produce an error, because an agent who
 * pasted a whole brochure deserves to be told.
 */
export function validateRichDoc(input: unknown): ValidationResult {
  if (!Array.isArray(input)) return { ok: false, error: "Message body is not in the expected format." };
  if (input.length > LIMITS.blocks) {
    return { ok: false, error: "That message is too long to send. Trim it or attach it as a file." };
  }

  const doc: RichDoc = [];
  let chars = 0;

  const spansFrom = (value: unknown): Span[] => {
    if (!Array.isArray(value)) return [];
    const out: Span[] = [];
    for (const raw of value.slice(0, LIMITS.spansPerBlock)) {
      const s = (raw ?? {}) as Record<string, unknown>;
      if (typeof s.text !== "string" || s.text.length === 0) continue;
      chars += s.text.length;
      const span: Span = { text: s.text };
      if (s.b === true) span.b = true;
      if (s.i === true) span.i = true;
      if (s.u === true) span.u = true;
      // The words always survive; only the link is dropped.
      if (typeof s.href === "string" && SAFE_LINK.test(s.href.trim())) {
        span.href = s.href.trim();
      }
      out.push(span);
    }
    return out;
  };

  for (const raw of input) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const type = typeof b.type === "string" ? b.type : "";
    if (!BLOCK_TYPES.has(type)) continue;

    if (type === "ul" || type === "ol") {
      const items = Array.isArray(b.items) ? b.items.slice(0, LIMITS.itemsPerList) : [];
      const built = items.map(spansFrom).filter((spans) => spans.length > 0);
      if (built.length) doc.push({ type, items: built });
      continue;
    }

    const spans = spansFrom(b.spans);
    // An empty paragraph is a blank line the agent typed on purpose.
    if (spans.length > 0 || type === "p") {
      doc.push({ type: type as "p" | "h3" | "quote", spans });
    }
  }

  if (chars > LIMITS.totalChars) {
    return { ok: false, error: "That message is too long to send. Trim it or attach it as a file." };
  }
  return { ok: true, doc };
}

/** Paragraph, heading or quote — the blocks that hold spans rather than items. */
export const isSpanBlock = (
  block: Block
): block is { type: "p" | "h3" | "quote"; spans: Span[] } =>
  block.type === "p" || block.type === "h3" || block.type === "quote";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function spanHtml(span: Span): string {
  let html = escapeHtml(span.text).replace(/\n/g, "<br>");
  if (span.b) html = `<strong>${html}</strong>`;
  if (span.i) html = `<em>${html}</em>`;
  if (span.u) html = `<u>${html}</u>`;
  if (span.href) {
    // Built from the whitelist, escaped again on the way out.
    html = `<a href="${escapeHtml(span.href)}" style="color:#1f5eff;text-decoration:underline">${html}</a>`;
  }
  return html;
}

/**
 * The HTML an email client receives. Inline styles only, no stylesheet, no
 * classes, no external anything — Gmail strips <style> blocks and Outlook
 * ignores half of CSS, so anything that matters has to be on the element.
 */
export function renderEmailHtml(doc: RichDoc): string {
  const body = doc
    .map((block) => {
      // Checked the positive way round: narrowing a discriminant DOWN to
      // never leaves the member in the union, and the compiler then can't
      // see the spans.
      if (!isSpanBlock(block)) {
        const tag = block.type;
        const items = block.items
          .map((spans) => `<li style="margin:0 0 6px 0">${spans.map(spanHtml).join("")}</li>`)
          .join("");
        return `<${tag} style="margin:0 0 14px 0;padding-left:22px">${items}</${tag}>`;
      }
      const inner = block.spans.map(spanHtml).join("");
      if (block.type === "h3") {
        return `<h3 style="margin:0 0 10px 0;font-size:17px;font-weight:700;line-height:1.35">${inner}</h3>`;
      }
      if (block.type === "quote") {
        return `<blockquote style="margin:0 0 14px 0;padding:2px 0 2px 14px;border-left:3px solid #d9dce3;color:#555c6b">${inner}</blockquote>`;
      }
      // A genuinely empty paragraph is a deliberate blank line.
      return inner
        ? `<p style="margin:0 0 14px 0">${inner}</p>`
        : `<p style="margin:0 0 14px 0">&nbsp;</p>`;
    })
    .join("");

  return [
    '<!doctype html><html lang="en-GB"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#ffffff">',
    '<div style="max-width:640px;margin:0;padding:0;',
    'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;',
    'font-size:15px;line-height:1.6;color:#1a1d23">',
    body,
    "</div></body></html>",
  ].join("");
}

/**
 * The plain-text alternative, built from the same document so the two can
 * never say different things. Sent alongside the HTML: some people read in
 * plain text, and a message with no text part looks like spam to filters.
 */
export function richDocToText(doc: RichDoc): string {
  const spansText = (spans: Span[]): string =>
    spans
      .map((s) => (s.href && s.href !== s.text ? `${s.text} (${s.href})` : s.text))
      .join("");

  return doc
    .map((block) => {
      if (!isSpanBlock(block)) {
        return block.type === "ul"
          ? block.items.map((i) => `- ${spansText(i)}`).join("\n")
          : block.items.map((i, n) => `${n + 1}. ${spansText(i)}`).join("\n");
      }
      if (block.type === "quote") return `> ${spansText(block.spans)}`;
      return spansText(block.spans);
    })
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain text in, document out — for drafts that never went near the editor. */
export function textToRichDoc(text: string): RichDoc {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => ({
      type: "p" as const,
      spans: para.trim() ? [{ text: para.trim() }] : [],
    }));
}

/** Is there anything to send, or is it all empty paragraphs? */
export const isEmptyDoc = (doc: RichDoc): boolean => richDocToText(doc).trim().length === 0;

/**
 * Does this document carry formatting that plain text cannot hold?
 *
 * "Improve writing" is a plain-text round trip — Luna rewrites the words, and
 * the words come back with no bold, no links, no lists. If the agent had
 * formatted their draft, applying the suggestion silently flattens it. The
 * composer uses this to warn them first rather than let them discover it in
 * the sent copy. True when any span is bold/italic/underlined/linked, or any
 * block is a list, a heading or a quote.
 */
export function docHasFormatting(doc: RichDoc): boolean {
  return doc.some((block) => {
    if (!isSpanBlock(block)) return true; // ul, ol
    if (block.type === "h3" || block.type === "quote") return true;
    return block.spans.some((s) => s.b || s.i || s.u || Boolean(s.href));
  });
}
