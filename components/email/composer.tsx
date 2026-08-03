"use client";

/**
 * The email composer.
 *
 * One component for every place the CRM sends an email, because a reply from
 * the inbox and a reply to an enquiry are the same job and should not be two
 * slightly different boxes with two slightly different bugs.
 *
 * WHAT YOU SEE IS WHAT THEY GET. After a paste, the editor is rebuilt from
 * the document we would actually send: if a pasted image, script or styling
 * cannot survive the send, it does not survive the paste either. An agent
 * should never look at a formatted table on screen and discover the customer
 * received a wall of text.
 *
 * Spellcheck is the browser's, in British English. That is not a compromise:
 * it is instant, it is offline, it already knows the agent's own dictionary,
 * and it means the contents of a customer email are not sent to a third party
 * to be checked for typos.
 *
 * "Improve" is a suggestion, never an edit. It arrives beside the draft with
 * anything Luna added called out by name, and a rewrite that invented a fact
 * cannot be applied with one click at all.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SendIcon, BoldIcon, ItalicIcon, UnderlineIcon, ListIcon, OrderedListIcon,
  LinkIcon, QuoteIcon, PaperclipIcon, SmileIcon, EraserIcon, SparklesIcon,
  XIcon, CheckIcon,
} from "@/components/ui/icons";
import { domToRichDoc } from "@/lib/email/rich-text-dom";
import {
  richDocToText,
  textToRichDoc,
  isEmptyDoc,
  isSpanBlock,
  docHasFormatting,
  type RichDoc,
  type Span,
} from "@/lib/email/rich-text";
import { MODES, type ImproveMode, type RewriteIssue } from "@/lib/email/improve";
import { EMOJI_GROUPS, searchEmoji } from "@/lib/email/emoji";
import { mb, MAX_FILES } from "@/lib/email/attachments";

export type Attachment = {
  path: string;
  filename: string;
  contentType: string;
  bytes: number;
};

type Props = {
  /** Shown so the agent can see who this is going to. */
  toLabel: string;
  toEmail?: string | null;
  contactId?: string | null;
  householdId?: string | null;
  enquiryId?: string | null;
  defaultSubject?: string;
  /** Plain-text seed: an AI draft, a template, a quoted message. */
  defaultBody?: string;
  /** Where in the product this came from, for the audit row. */
  context: string;
  purpose?: "operational" | "marketing";
  /** False = no provider configured, so Send hands off to the mail app. */
  emailLive: boolean;
  /** One line under the header, e.g. what sending will also do. */
  note?: string;
  onSent?: () => void;
  onCancel?: () => void;
  /**
   * Fires as the agent starts (and stops) having unsent work in here — a typed
   * body, an edited subject, an attachment. The parent uses it to warn before
   * an action that would throw the draft away, e.g. opening a different reply.
   */
  onDirtyChange?: (dirty: boolean) => void;
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  borderRadius: 7,
  padding: "6px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  cursor: "pointer",
};

const toolBtn: React.CSSProperties = {
  ...btn,
  padding: "5px 7px",
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text-muted)",
};

/** Rebuild the editor's DOM from the document — the WYSIWYG guarantee. */
function renderDocInto(el: HTMLElement, doc: RichDoc): void {
  el.textContent = "";
  const spanNode = (span: Span): Node => {
    let node: Node = document.createTextNode(span.text);
    if (span.text.includes("\n")) {
      const frag = document.createDocumentFragment();
      span.text.split("\n").forEach((part, i) => {
        if (i > 0) frag.appendChild(document.createElement("br"));
        frag.appendChild(document.createTextNode(part));
      });
      node = frag;
    }
    const wrap = (tag: string, inner: Node): Node => {
      const e = document.createElement(tag);
      e.appendChild(inner);
      return e;
    };
    if (span.b) node = wrap("b", node);
    if (span.i) node = wrap("i", node);
    if (span.u) node = wrap("u", node);
    if (span.href) {
      const a = document.createElement("a");
      a.href = span.href;
      a.appendChild(node);
      node = a;
    }
    return node;
  };

  for (const block of doc) {
    if (!isSpanBlock(block)) {
      const list = document.createElement(block.type);
      for (const item of block.items) {
        const li = document.createElement("li");
        item.forEach((s) => li.appendChild(spanNode(s)));
        list.appendChild(li);
      }
      el.appendChild(list);
      continue;
    }
    const tag = block.type === "h3" ? "h3" : block.type === "quote" ? "blockquote" : "div";
    const node = document.createElement(tag);
    if (block.spans.length === 0) node.appendChild(document.createElement("br"));
    block.spans.forEach((s) => node.appendChild(spanNode(s)));
    el.appendChild(node);
  }
  if (!el.firstChild) el.appendChild(document.createElement("div"));
}

export function EmailComposer({
  toLabel,
  toEmail,
  contactId,
  householdId,
  enquiryId,
  defaultSubject = "",
  defaultBody = "",
  context,
  purpose = "operational",
  emailLive,
  note,
  onSent,
  onCancel,
  onDirtyChange,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);

  const [subject, setSubject] = useState(defaultSubject);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Unsent work lives in the DOM (the body) and in state (subject, files), so
  // a plain state value can't tell whether there's anything to lose. This flag
  // flips true on the first real edit and only clears on a successful send.
  const [dirty, setDirty] = useState(false);
  const markDirty = useCallback(() => setDirty(true), []);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const [improveOpen, setImproveOpen] = useState(false);
  const [improveMode, setImproveMode] = useState<ImproveMode>("polish");
  const [improving, setImproving] = useState(false);
  const [suggestion, setSuggestion] = useState<
    { text: string; issues: RewriteIssue[]; safe: boolean } | null
  >(null);

  // Seed the editor once, as nodes rather than markup — the draft may quote a
  // customer, and a customer can write anything.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    renderDocInto(el, textToRichDoc(defaultBody));
    // Tags, not inline CSS, so the document stays small and predictable.
    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* older browsers: the walker copes with either */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentDoc = useCallback((): RichDoc => {
    const el = editorRef.current;
    return el ? domToRichDoc(el) : [];
  }, []);

  const rememberSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    editorRef.current?.focus();
  };

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    rememberSelection();
  };

  /** After a paste, show exactly what we would send — nothing more. */
  const normalise = () => {
    const el = editorRef.current;
    if (!el) return;
    renderDocInto(el, domToRichDoc(el));
  };

  const insertText = (text: string) => {
    restoreSelection();
    document.execCommand("insertText", false, text);
    rememberSelection();
  };

  const addLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    setLinkUrl("");
    if (!/^(https?:\/\/|mailto:)/i.test(url)) {
      setError("A link needs to start with https:// or mailto:.");
      return;
    }
    setError(null);
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.toString().length > 0) {
      document.execCommand("createLink", false, url);
    } else {
      // Nothing selected: the URL becomes its own link text.
      document.execCommand("insertHTML", false, "");
      document.execCommand("insertText", false, url);
      const range = window.getSelection()?.getRangeAt(0);
      if (range) {
        range.setStart(range.startContainer, Math.max(0, range.startOffset - url.length));
        document.execCommand("createLink", false, url);
      }
    }
    normalise();
  };

  // ─── Attachments ───────────────────────────────────────────────────────
  const upload = async (files: FileList) => {
    setError(null);
    setUploading(true);
    let running = [...attachments];
    for (const file of Array.from(files).slice(0, MAX_FILES)) {
      const form = new FormData();
      form.append("file", file);
      form.append("existing", JSON.stringify(running.map((a) => ({ bytes: a.bytes }))));
      try {
        const res = await fetch("/api/email/attachments", { method: "POST", body: form });
        const data = (await res.json()) as { ok: boolean; attachment?: Attachment; error?: string };
        if (!data.ok || !data.attachment) {
          setError(data.error ?? "That file could not be attached.");
          break;
        }
        running = [...running, data.attachment];
        setAttachments(running);
        markDirty();
      } catch {
        setError("That file could not be attached. Check your connection and try again.");
        break;
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeAttachment = async (path: string) => {
    setAttachments((list) => list.filter((a) => a.path !== path));
    try {
      await fetch(`/api/email/attachments?path=${encodeURIComponent(path)}`, { method: "DELETE" });
    } catch {
      /* the reference is gone from the draft either way */
    }
  };

  // ─── Improve ───────────────────────────────────────────────────────────
  const runImprove = async (mode: ImproveMode) => {
    setImproveMode(mode);
    setImproving(true);
    setSuggestion(null);
    setError(null);
    try {
      const res = await fetch("/api/email/improve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: richDocToText(currentDoc()), mode }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        rewritten?: string;
        issues?: RewriteIssue[];
        safe?: boolean;
        error?: string;
      };
      if (!data.ok || !data.rewritten) {
        setError(data.error ?? "Luna couldn't rewrite that just now.");
      } else {
        setSuggestion({ text: data.rewritten, issues: data.issues ?? [], safe: Boolean(data.safe) });
      }
    } catch {
      setError("Luna couldn't be reached. Your draft is untouched.");
    } finally {
      setImproving(false);
    }
  };

  const applySuggestion = () => {
    const el = editorRef.current;
    if (!el || !suggestion) return;
    renderDocInto(el, textToRichDoc(suggestion.text));
    markDirty();
    setSuggestion(null);
    setImproveOpen(false);
  };

  // ─── Send ──────────────────────────────────────────────────────────────
  const send = async () => {
    const doc = currentDoc();
    if (isEmptyDoc(doc)) {
      setError("There's nothing to send yet.");
      return;
    }
    const plain = richDocToText(doc);

    if (!emailLive) {
      // No provider configured: hand off to the agent's own mail app rather
      // than pretend. Attachments cannot come along, so say so.
      const params = new URLSearchParams({ subject, body: plain });
      window.open(`mailto:${toEmail ?? ""}?${params.toString()}`, "_self");
      setDirty(false);
      onSent?.();
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          to_email: toEmail ?? undefined,
          contact_id: contactId ?? undefined,
          household_id: householdId ?? undefined,
          enquiry_id: enquiryId ?? undefined,
          subject: subject.trim() || "(no subject)",
          body: plain,
          doc,
          attachments,
          purpose,
          context,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "That didn't send.");
        return;
      }
      // It's on its way — there is nothing left to lose, so a parent switching
      // away should not warn about a draft that has already been sent.
      setDirty(false);
      onSent?.();
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  const totalBytes = attachments.reduce((sum, a) => sum + a.bytes, 0);
  const emojiResults = emojiQuery ? searchEmoji(emojiQuery) : [];

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "var(--surface)",
        overflow: "hidden",
      }}
    >
      {/* ─── Header ───────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          fontSize: 11.5,
          color: "var(--text-muted)",
        }}
      >
        To <strong style={{ color: "var(--text)" }}>{toLabel}</strong>
        {note ? ` — ${note}` : null}
        {!emailLive && (
          <div style={{ marginTop: 4, color: "var(--warning, #b45309)" }}>
            No email provider is connected, so Send will open your own mail app. Formatting and
            attachments can&apos;t come with it.
          </div>
        )}
      </div>

      <input
        value={subject}
        onChange={(e) => { setSubject(e.target.value); markDirty(); }}
        placeholder="Subject"
        style={{
          width: "100%",
          border: "none",
          borderBottom: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text)",
          padding: "9px 12px",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          outline: "none",
        }}
      />

      {/* ─── Toolbar ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
          padding: "6px 8px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-2, transparent)",
        }}
      >
        <ToolButton label="Bold" onClick={() => exec("bold")}><BoldIcon width={13} height={13} /></ToolButton>
        <ToolButton label="Italic" onClick={() => exec("italic")}><ItalicIcon width={13} height={13} /></ToolButton>
        <ToolButton label="Underline" onClick={() => exec("underline")}><UnderlineIcon width={13} height={13} /></ToolButton>
        <Divider />
        <ToolButton label="Bulleted list" onClick={() => exec("insertUnorderedList")}><ListIcon width={13} height={13} /></ToolButton>
        <ToolButton label="Numbered list" onClick={() => exec("insertOrderedList")}><OrderedListIcon width={13} height={13} /></ToolButton>
        <ToolButton label="Quote" onClick={() => exec("formatBlock", "blockquote")}><QuoteIcon width={13} height={13} /></ToolButton>
        <ToolButton
          label="Add a link"
          onClick={() => {
            rememberSelection();
            setLinkOpen((v) => !v);
            setShowEmoji(false);
          }}
        >
          <LinkIcon width={13} height={13} />
        </ToolButton>
        <ToolButton label="Remove formatting" onClick={() => { exec("removeFormat"); normalise(); }}>
          <EraserIcon width={13} height={13} />
        </ToolButton>
        <Divider />
        <ToolButton
          label="Emoji"
          onClick={() => {
            rememberSelection();
            setShowEmoji((v) => !v);
            setLinkOpen(false);
          }}
        >
          <SmileIcon width={13} height={13} />
        </ToolButton>
        <ToolButton label="Attach a file" onClick={() => fileRef.current?.click()}>
          <PaperclipIcon width={13} height={13} />
        </ToolButton>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setImproveOpen((v) => !v); setSuggestion(null); }}
          style={{
            ...btn,
            padding: "5px 9px",
            fontSize: 11.5,
            color: "var(--tg-accent-dark)",
            borderColor: "var(--border)",
          }}
        >
          <SparklesIcon width={12} height={12} />
          Improve writing
        </button>
      </div>

      {/* ─── Link row ─────────────────────────────────────────── */}
      {linkOpen && (
        <div style={{ display: "flex", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
            placeholder="https://…"
            style={{
              flex: 1, border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--surface)", color: "var(--text)",
              padding: "5px 8px", fontSize: 12, fontFamily: "inherit",
            }}
          />
          <button onClick={addLink} style={{ ...btn, padding: "5px 10px" }}>Add</button>
        </div>
      )}

      {/* ─── Emoji picker ─────────────────────────────────────── */}
      {showEmoji && (
        <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", maxHeight: 210, overflowY: "auto" }}>
          <input
            autoFocus
            value={emojiQuery}
            onChange={(e) => setEmojiQuery(e.target.value)}
            placeholder="Search — beach, thanks, price…"
            style={{
              width: "100%", border: "1px solid var(--border)", borderRadius: 6,
              background: "var(--surface)", color: "var(--text)",
              padding: "5px 8px", fontSize: 12, fontFamily: "inherit", marginBottom: 8,
            }}
          />
          {(emojiQuery ? [{ label: "Results", emoji: emojiResults }] : EMOJI_GROUPS).map((group) => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-subtle)", marginBottom: 4 }}>
                {group.label}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {group.emoji.map((e) => (
                  <button
                    key={e.char + e.name}
                    title={e.name}
                    onClick={() => insertText(e.char)}
                    style={{ ...toolBtn, fontSize: 17, padding: "3px 5px", lineHeight: 1.2 }}
                  >
                    {e.char}
                  </button>
                ))}
                {emojiQuery && group.emoji.length === 0 && (
                  <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>Nothing for that word.</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── The editor ───────────────────────────────────────── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        lang="en-GB"
        onBlur={rememberSelection}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onInput={markDirty}
        onPaste={() => {
          // Let the browser paste, then rebuild from what we would send.
          markDirty();
          setTimeout(normalise, 0);
        }}
        style={{
          minHeight: 150,
          maxHeight: 420,
          overflowY: "auto",
          padding: "12px",
          fontSize: 13,
          lineHeight: 1.6,
          color: "var(--text)",
          outline: "none",
        }}
      />

      {/* ─── Attachments ──────────────────────────────────────── */}
      <input
        ref={fileRef}
        type="file"
        multiple
        onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); }}
        style={{ display: "none" }}
      />
      {(attachments.length > 0 || uploading) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 10px", borderTop: "1px solid var(--border)" }}>
          {attachments.map((a) => (
            <span
              key={a.path}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "1px solid var(--border)", borderRadius: 20,
                padding: "3px 6px 3px 10px", fontSize: 11.5, color: "var(--text-muted)",
              }}
            >
              <PaperclipIcon width={11} height={11} />
              {a.filename}
              <span style={{ color: "var(--text-subtle)" }}>{mb(a.bytes)}</span>
              <button
                onClick={() => void removeAttachment(a.path)}
                aria-label={`Remove ${a.filename}`}
                style={{ ...toolBtn, padding: 2 }}
              >
                <XIcon width={11} height={11} />
              </button>
            </span>
          ))}
          {uploading && <span style={{ fontSize: 11.5, color: "var(--text-subtle)" }}>Uploading…</span>}
          {attachments.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-subtle)", alignSelf: "center" }}>
              {mb(totalBytes)} of 10.0MB
            </span>
          )}
        </div>
      )}

      {/* ─── Improve panel ────────────────────────────────────── */}
      {improveOpen && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", background: "var(--surface-2, transparent)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {MODES.map((m) => (
              <button
                key={m.id}
                title={m.hint}
                disabled={improving}
                onClick={() => void runImprove(m.id)}
                style={{
                  ...btn,
                  padding: "4px 9px",
                  fontSize: 11.5,
                  ...(improveMode === m.id && suggestion
                    ? { borderColor: "var(--tg-accent-dark)", color: "var(--tg-accent-dark)" }
                    : {}),
                }}
              >
                {m.label}
              </button>
            ))}
            {improving && <span style={{ fontSize: 11.5, color: "var(--text-subtle)", alignSelf: "center" }}>Luna is reading it…</span>}
          </div>

          <div style={{ fontSize: 11, color: "var(--text-subtle)", lineHeight: 1.5 }}>
            Luna edits your wording. It will not add a price, a date or a promise you didn&apos;t
            write, and anything it does add is listed before you can use it.
          </div>

          {suggestion && docHasFormatting(currentDoc()) && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                lineHeight: 1.5,
                color: "#b45309",
                background: "rgba(180, 83, 9, 0.06)",
                border: "1px solid rgba(180, 83, 9, 0.18)",
                borderRadius: 7,
                padding: "7px 10px",
              }}
            >
              Luna rewrites the words as plain text. If you use this, the bold, links and lists you
              added come back as plain paragraphs — keep yours if the formatting matters.
            </div>
          )}

          {suggestion && (
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                  background: "var(--surface)",
                }}
              >
                {suggestion.text}
              </div>

              {suggestion.issues.length > 0 && (
                <ul style={{ margin: "8px 0 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                  {suggestion.issues.map((issue, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 11.5,
                        lineHeight: 1.5,
                        color: issue.blocking ? "#b91c1c" : "var(--text-muted)",
                      }}
                    >
                      {issue.blocking ? "⚠ " : "• "}
                      {issue.detail}
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <button
                  onClick={applySuggestion}
                  disabled={!suggestion.safe}
                  title={suggestion.safe ? undefined : "Luna added something you didn't write — copy across what you want by hand."}
                  style={{
                    ...btn,
                    background: suggestion.safe ? "var(--tg-primary)" : "var(--surface)",
                    borderColor: suggestion.safe ? "var(--tg-primary)" : "var(--border)",
                    color: suggestion.safe ? "white" : "var(--text-subtle)",
                    fontWeight: 600,
                    cursor: suggestion.safe ? "pointer" : "not-allowed",
                  }}
                >
                  <CheckIcon width={12} height={12} />
                  Use this
                </button>
                <button onClick={() => setSuggestion(null)} style={{ ...btn, border: "none" }}>
                  Keep mine
                </button>
                {!suggestion.safe && (
                  <span style={{ fontSize: 11, color: "#b91c1c" }}>
                    Can&apos;t be applied in one click, because Luna added something you didn&apos;t write.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Footer ───────────────────────────────────────────── */}
      {error && (
        <div style={{ padding: "8px 12px", fontSize: 11.5, color: "#dc2626", borderTop: "1px solid var(--border)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 12px", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => void send()}
          disabled={sending || uploading}
          style={{
            ...btn,
            background: "var(--tg-primary)",
            border: "1px solid var(--tg-primary)",
            color: "white",
            fontWeight: 600,
            opacity: sending || uploading ? 0.6 : 1,
          }}
        >
          <SendIcon width={12} height={12} />
          {sending ? "Sending…" : emailLive ? "Send" : "Open in mail app"}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={sending} style={{ ...btn, border: "none" }}>
            Cancel
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--text-subtle)" }}>
          Spellcheck: British English, in your browser
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()} // keep the selection
      onClick={onClick}
      style={toolBtn}
    >
      {children}
    </button>
  );
}

const Divider = () => (
  <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />
);
