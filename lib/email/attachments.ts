/**
 * Attachments — what an agency may actually attach, and what it may not.
 *
 * A travel agent attaches things constantly: the itinerary PDF, a hotel
 * photo, a booking confirmation, an insurance certificate. So this has to
 * work properly. It also has to say no, for three separate reasons:
 *
 *   DELIVERABILITY — providers reject an oversized message outright, and a
 *   20MB email is how an agency's domain earns a reputation for spam. The
 *   limit here is well under SendGrid's, because base64 inflates a file by a
 *   third and the ceiling should be one an agent never quietly hits.
 *
 *   SAFETY — .exe, .scr, .js and friends are refused. Not because our system
 *   would run them, but because an agency's customer might, and "the email
 *   came from my travel agent" is exactly the trust a malicious attachment
 *   needs. Mail providers strip most of them anyway; refusing at the door is
 *   more honest than letting it be silently removed in transit.
 *
 *   THE FILENAME — it is chosen by whoever uploads and ends up in a storage
 *   path and a mail header, so it is rewritten rather than trusted.
 *
 * Pure functions, no I/O.
 */

/** The private Supabase Storage bucket. Nothing here is ever public. */
export const ATTACHMENT_BUCKET = "email-attachments";

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10MB per email
export const MAX_FILES = 5;

/** Extensions a mail provider will usually strip, and that we refuse first. */
const BLOCKED_EXT = new Set([
  "exe", "scr", "com", "bat", "cmd", "pif", "msi", "msp", "cpl", "jar",
  "js", "jse", "vbs", "vbe", "wsf", "wsh", "ps1", "psm1", "sh", "app",
  "dll", "sys", "reg", "lnk", "hta", "iso", "img", "dmg",
]);

/** What a travel agency actually sends. Anything else needs a reason. */
const ALLOWED_EXT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf",
  "png", "jpg", "jpeg", "gif", "webp", "heic",
  "ics", "zip",
]);

export type AttachmentCheck =
  | { ok: true; filename: string; extension: string }
  | { ok: false; error: string };

/**
 * A filename we are willing to put in a storage path and a mail header:
 * no directories, no control characters, no leading dots, length capped.
 * The extension is preserved, because it is what tells the recipient's
 * computer what the file is.
 */
export function safeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "attachment";
  if (cleaned.length <= 120) return cleaned;

  // Keep the extension when trimming a very long name.
  const dot = cleaned.lastIndexOf(".");
  if (dot > 0 && cleaned.length - dot <= 8) {
    return cleaned.slice(0, 120 - (cleaned.length - dot)) + cleaned.slice(dot);
  }
  return cleaned.slice(0, 120);
}

export const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
};

/** One file, checked. */
export function checkAttachment(
  rawName: string,
  bytes: number,
  existing: { bytes: number }[] = []
): AttachmentCheck {
  const filename = safeFilename(rawName);
  const extension = extensionOf(filename);

  if (bytes <= 0) return { ok: false, error: `${filename} is empty.` };
  if (existing.length >= MAX_FILES) {
    return { ok: false, error: `That's more than ${MAX_FILES} attachments. Send the rest in a second email, or share a link.` };
  }
  if (bytes > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `${filename} is ${mb(bytes)}. The limit is ${mb(MAX_FILE_BYTES)} per file — email is a poor way to move anything larger, so share a link instead.`,
    };
  }
  const total = existing.reduce((sum, f) => sum + f.bytes, 0) + bytes;
  if (total > MAX_TOTAL_BYTES) {
    return {
      ok: false,
      error: `That would make ${mb(total)} of attachments. The limit is ${mb(MAX_TOTAL_BYTES)} per email, because providers reject anything much bigger.`,
    };
  }
  if (!extension) {
    return { ok: false, error: `${filename} has no file extension, so the customer's computer won't know what it is.` };
  }
  if (BLOCKED_EXT.has(extension)) {
    return {
      ok: false,
      error: `.${extension} files can't be attached. Mail providers strip them, and a program arriving from a travel agent is exactly what a scam looks like.`,
    };
  }
  if (!ALLOWED_EXT.has(extension)) {
    return {
      ok: false,
      error: `.${extension} isn't a file type we attach. Documents, spreadsheets, images, calendar invites and zips are fine.`,
    };
  }

  return { ok: true, filename, extension };
}

/** Content type from the extension — never from what the browser claimed. */
export function contentTypeFor(extension: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    txt: "text/plain",
    rtf: "application/rtf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    ics: "text/calendar",
    zip: "application/zip",
  };
  return map[extension] ?? "application/octet-stream";
}

export function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
