import { describe, expect, it } from "vitest";
import {
  validateRichDoc,
  renderEmailHtml,
  richDocToText,
  textToRichDoc,
  isEmptyDoc,
  type RichDoc,
} from "@/lib/email/rich-text";
import { domToRichDoc, type MiniNode } from "@/lib/email/rich-text-dom";

// ─── A tiny fake DOM, so the editor walker can be tested without a browser ──
const text = (s: string): MiniNode => ({ nodeType: 3, nodeName: "#text", textContent: s });
const el = (
  name: string,
  children: MiniNode[] = [],
  attrs: Record<string, string> = {}
): MiniNode => ({
  nodeType: 1,
  nodeName: name,
  childNodes: children,
  getAttribute: (k: string) => attrs[k] ?? null,
});

describe("what the server will accept", () => {
  it("keeps the shape it understands", () => {
    const result = validateRichDoc([
      { type: "p", spans: [{ text: "Hello" }] },
      { type: "ul", items: [[{ text: "One" }], [{ text: "Two" }]] },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toHaveLength(2);
  });

  it("drops a block type it does not know rather than trying to clean it", () => {
    const result = validateRichDoc([
      { type: "script", spans: [{ text: "alert(1)" }] },
      { type: "p", spans: [{ text: "Real text" }] },
    ]);
    expect(result.ok && result.doc).toHaveLength(1);
  });

  it("keeps the words but drops a javascript link", () => {
    const result = validateRichDoc([
      { type: "p", spans: [{ text: "Click", href: "javascript:steal()" }] },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc[0]).toMatchObject({ spans: [{ text: "Click" }] });
      expect(JSON.stringify(result.doc)).not.toContain("javascript");
    }
  });

  it("allows the three link kinds an email actually needs", () => {
    const result = validateRichDoc([
      { type: "p", spans: [
        { text: "a", href: "https://x.io" },
        { text: "b", href: "http://x.io" },
        { text: "c", href: "mailto:hi@x.io" },
      ] },
    ]);
    expect(result.ok && (result.doc[0] as { spans: { href?: string }[] }).spans.every((s) => s.href)).toBe(true);
  });

  it("refuses something that is not a document at all", () => {
    expect(validateRichDoc("<b>hi</b>").ok).toBe(false);
    expect(validateRichDoc({ type: "p" }).ok).toBe(false);
  });

  it("says so plainly when someone pastes a brochure", () => {
    const huge = [{ type: "p", spans: [{ text: "x".repeat(25_000) }] }];
    const result = validateRichDoc(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/too long/);
  });
});

describe("the HTML a customer receives", () => {
  it("escapes text so markup in a message stays text", () => {
    const doc: RichDoc = [{ type: "p", spans: [{ text: "<script>alert(1)</script>" }] }];
    const html = renderEmailHtml(doc);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the formatting the agent chose", () => {
    const html = renderEmailHtml([
      { type: "p", spans: [{ text: "Bold", b: true }, { text: " and " }, { text: "linked", href: "https://x.io" }] },
      { type: "ul", items: [[{ text: "First" }]] },
    ]);
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('href="https://x.io"');
    expect(html).toContain("<li");
  });

  it("carries no stylesheet, because Gmail would strip it", () => {
    const html = renderEmailHtml([{ type: "p", spans: [{ text: "Hi" }] }]);
    expect(html).not.toContain("<style");
    expect(html).toContain("style=");
  });
});

describe("the plain-text half", () => {
  it("says the same thing without the markup", () => {
    const doc: RichDoc = [
      { type: "p", spans: [{ text: "Morning Rachel," }] },
      { type: "ul", items: [[{ text: "Flights included" }], [{ text: "Transfers included" }]] },
    ];
    expect(richDocToText(doc)).toBe("Morning Rachel,\n\n- Flights included\n- Transfers included");
  });

  it("spells a link out, since plain text cannot click", () => {
    expect(richDocToText([{ type: "p", spans: [{ text: "the quote", href: "https://x.io/q/1" }] }])).toBe(
      "the quote (https://x.io/q/1)"
    );
  });

  it("numbers an ordered list properly", () => {
    expect(richDocToText([{ type: "ol", items: [[{ text: "A" }], [{ text: "B" }]] }])).toBe("1. A\n2. B");
  });

  it("knows an empty draft from a real one", () => {
    expect(isEmptyDoc(textToRichDoc("   \n\n  "))).toBe(true);
    expect(isEmptyDoc(textToRichDoc("Hello"))).toBe(false);
  });
});

describe("reading the editor", () => {
  it("turns typed lines into paragraphs", () => {
    const doc = domToRichDoc(el("DIV", [el("DIV", [text("Line one")]), el("DIV", [text("Line two")])]));
    expect(richDocToText(doc)).toBe("Line one\n\nLine two");
  });

  it("carries bold, italic and links through", () => {
    const doc = domToRichDoc(
      el("DIV", [
        el("DIV", [
          text("Hi "),
          el("B", [text("Rachel")]),
          text(", see "),
          el("A", [text("the quote")], { href: "https://x.io/q" }),
        ]),
      ])
    );
    expect(doc[0]).toMatchObject({
      type: "p",
      spans: [
        { text: "Hi " },
        { text: "Rachel", b: true },
        { text: ", see " },
        { text: "the quote", href: "https://x.io/q" },
      ],
    });
  });

  it("keeps a list as a list", () => {
    const doc = domToRichDoc(
      el("DIV", [el("UL", [el("LI", [text("Flights")]), el("LI", [text("Transfers")])])])
    );
    expect(doc[0]).toMatchObject({ type: "ul" });
    expect(richDocToText(doc)).toBe("- Flights\n- Transfers");
  });

  it("throws away a script pasted in from a web page", () => {
    const doc = domToRichDoc(
      el("DIV", [el("DIV", [text("Real words"), el("SCRIPT", [text("steal()")])])])
    );
    expect(richDocToText(doc)).toBe("Real words");
  });

  it("throws away a javascript link but keeps what it said", () => {
    const doc = domToRichDoc(
      el("DIV", [el("DIV", [el("A", [text("Click me")], { href: "javascript:steal()" })])])
    );
    expect(doc[0]).toMatchObject({ spans: [{ text: "Click me" }] });
    expect((doc[0] as { spans: { href?: string }[] }).spans[0].href).toBeUndefined();
  });

  it("does not lose the words inside a table pasted from a supplier", () => {
    const doc = domToRichDoc(
      el("DIV", [el("TABLE", [el("TR", [el("TD", [text("Room only")]), el("TD", [text("£1,240")])])])])
    );
    expect(richDocToText(doc)).toContain("Room only");
    expect(richDocToText(doc)).toContain("£1,240");
  });

  it("treats a line break as a break, not a lost line", () => {
    const doc = domToRichDoc(el("DIV", [el("DIV", [text("One"), el("BR"), text("Two")])]));
    expect(richDocToText(doc)).toBe("One\nTwo");
  });

  it("ignores the empty paragraph left by a resting cursor", () => {
    const doc = domToRichDoc(el("DIV", [el("DIV", [text("Done")]), el("DIV", []), el("DIV", [])]));
    expect(doc).toHaveLength(1);
  });

  it("survives a round trip through the server's validator", () => {
    const doc = domToRichDoc(
      el("DIV", [el("DIV", [text("Hi "), el("B", [text("there")])]), el("UL", [el("LI", [text("One")])])])
    );
    const result = validateRichDoc(JSON.parse(JSON.stringify(doc)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(richDocToText(result.doc)).toBe("Hi there\n\n- One");
  });
});
