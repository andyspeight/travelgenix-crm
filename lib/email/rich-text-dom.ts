/**
 * Reading the editor — turning what is on screen into the document we send.
 *
 * The composer is a contenteditable, so the browser decides the markup: a
 * paste from Word arrives as nested spans with mso styles, a paste from a
 * website brings classes, scripts and tracking images, and every browser
 * produces a slightly different shape for the same keystrokes.
 *
 * This walks that mess and keeps only what we can express: paragraphs,
 * headings, lists, quotes, and bold / italic / underline / link. Everything
 * else is thrown away here, and thrown away AGAIN by validateRichDoc on the
 * server, because the browser is not a trustworthy narrator.
 *
 * Typed against a minimal node shape rather than the DOM so it can be tested
 * without a browser.
 */

import type { Block, RichDoc, Span } from "@/lib/email/rich-text";

export type MiniNode = {
  nodeType: number;
  nodeName: string;
  textContent?: string | null;
  childNodes?: ArrayLike<MiniNode>;
  getAttribute?: (name: string) => string | null;
};

const ELEMENT = 1;
const TEXT = 3;

const BLOCK_LEVEL = new Set([
  "DIV", "P", "UL", "OL", "LI", "BLOCKQUOTE",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "TABLE", "TR", "TD", "SECTION", "ARTICLE", "HEADER", "FOOTER",
]);

/** Never read, never rendered — whatever they pasted from. */
const IGNORED = new Set(["SCRIPT", "STYLE", "IMG", "IFRAME", "OBJECT", "EMBED", "SVG", "VIDEO", "AUDIO", "META", "LINK"]);

const kids = (n: MiniNode): MiniNode[] => Array.from(n.childNodes ?? []);

type Marks = { b?: boolean; i?: boolean; u?: boolean; href?: string };

/** Same marks in a row is one span — keeps the document small and readable. */
function pushSpan(out: Span[], text: string, marks: Marks): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (
    last &&
    Boolean(last.b) === Boolean(marks.b) &&
    Boolean(last.i) === Boolean(marks.i) &&
    Boolean(last.u) === Boolean(marks.u) &&
    last.href === marks.href
  ) {
    last.text += text;
    return;
  }
  const span: Span = { text };
  if (marks.b) span.b = true;
  if (marks.i) span.i = true;
  if (marks.u) span.u = true;
  if (marks.href) span.href = marks.href;
  out.push(span);
}

function inlineSpans(node: MiniNode, marks: Marks, out: Span[]): void {
  if (node.nodeType === TEXT) {
    // Collapse the whitespace the browser adds for indentation, but keep the
    // single spaces the agent actually typed.
    pushSpan(out, (node.textContent ?? "").replace(/[\t\r\n]+/g, " "), marks);
    return;
  }
  if (node.nodeType !== ELEMENT) return;

  const tag = node.nodeName.toUpperCase();
  if (IGNORED.has(tag)) return;
  if (tag === "BR") {
    pushSpan(out, "\n", marks);
    return;
  }

  const next: Marks = { ...marks };
  if (tag === "B" || tag === "STRONG") next.b = true;
  if (tag === "I" || tag === "EM") next.i = true;
  if (tag === "U") next.u = true;
  if (tag === "A") {
    const href = node.getAttribute?.("href")?.trim();
    // Anything that is not plainly a web or mail link keeps its words and
    // loses its link. The server checks this again.
    if (href && /^(https?:\/\/|mailto:)/i.test(href)) next.href = href;
  }

  for (const child of kids(node)) inlineSpans(child, next, out);
}

const hasBlockChild = (node: MiniNode): boolean =>
  kids(node).some((c) => c.nodeType === ELEMENT && BLOCK_LEVEL.has(c.nodeName.toUpperCase()));

const trimSpans = (spans: Span[]): Span[] => {
  const out = spans.filter((s) => s.text.length > 0);
  if (out.length) {
    out[0] = { ...out[0], text: out[0].text.replace(/^ +/, "") };
    const lastIndex = out.length - 1;
    out[lastIndex] = { ...out[lastIndex], text: out[lastIndex].text.replace(/ +$/, "") };
  }
  return out.filter((s) => s.text.length > 0);
};

function walk(node: MiniNode, out: RichDoc, pending: Span[]): void {
  const flush = () => {
    const spans = trimSpans(pending.splice(0, pending.length));
    if (spans.length) out.push({ type: "p", spans });
  };

  for (const child of kids(node)) {
    if (child.nodeType === TEXT) {
      inlineSpans(child, {}, pending);
      continue;
    }
    if (child.nodeType !== ELEMENT) continue;

    const tag = child.nodeName.toUpperCase();
    if (IGNORED.has(tag)) continue;

    if (tag === "UL" || tag === "OL") {
      flush();
      const items: Span[][] = [];
      for (const li of kids(child)) {
        if (li.nodeType !== ELEMENT || li.nodeName.toUpperCase() !== "LI") continue;
        const spans: Span[] = [];
        inlineSpans(li, {}, spans);
        const trimmed = trimSpans(spans);
        if (trimmed.length) items.push(trimmed);
      }
      if (items.length) out.push({ type: tag === "UL" ? "ul" : "ol", items } as Block);
      continue;
    }

    if (tag === "BLOCKQUOTE" || /^H[1-6]$/.test(tag)) {
      flush();
      const spans: Span[] = [];
      inlineSpans(child, {}, spans);
      const trimmed = trimSpans(spans);
      // Every heading level becomes h3: an email is not a document, and
      // three sizes of heading in a reply looks like a newsletter.
      if (trimmed.length) out.push({ type: tag === "BLOCKQUOTE" ? "quote" : "h3", spans: trimmed });
      continue;
    }

    if (tag === "DIV" || tag === "P" || BLOCK_LEVEL.has(tag)) {
      flush();
      if (hasBlockChild(child)) {
        walk(child, out, pending);
        flush();
      } else {
        const spans: Span[] = [];
        inlineSpans(child, {}, spans);
        const trimmed = trimSpans(spans);
        // A bare <div><br></div> is the agent pressing return: keep it as the
        // blank line they meant, rather than silently closing the gap.
        out.push({ type: "p", spans: trimmed });
      }
      continue;
    }

    inlineSpans(child, {}, pending);
  }

  flush();
}

/** The editor's contents as a document we are willing to send. */
export function domToRichDoc(root: MiniNode): RichDoc {
  const out: RichDoc = [];
  walk(root, out, []);
  // Trailing empty paragraphs are the cursor sitting at the end, not content.
  while (out.length) {
    const last = out[out.length - 1];
    if ("spans" in last && last.spans.length === 0) out.pop();
    else break;
  }
  return out;
}
