/**
 * POST /api/email/attachments — upload a file to go with an email.
 *
 * Takes one file as multipart form data, checks it (lib/email/attachments),
 * and puts it in a PRIVATE bucket under the agency's own prefix:
 *
 *   email-attachments/<agency_id>/<uuid>/<safe filename>
 *
 * The response is a reference, not a URL. There is no public link to an
 * itinerary at any point: the send path reads the bytes back server-side, and
 * the preview in the composer is the file the browser already has in memory.
 *
 * Three things are deliberately not trusted:
 *   - the filename (rewritten: no paths, no control characters, capped),
 *   - the content type the browser claims (derived from the extension), and
 *   - the size the browser reports (measured from the bytes we received).
 *
 * DELETE removes an upload the agent changed their mind about, and refuses
 * any path outside their own agency's prefix.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSystemClient } from "@/lib/supabase/server";
import { apiAgencyId } from "@/lib/auth/session";
import { enforceRateLimit, clientKey } from "@/lib/ai/rate-limit";
import {
  ATTACHMENT_BUCKET,
  checkAttachment,
  contentTypeFor,
  MAX_FILE_BYTES,
  mb,
} from "@/lib/email/attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const limit = await enforceRateLimit(clientKey(request, "email-attach"), 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many uploads at once. Give it a moment." },
      { status: 429 }
    );
  }

  let file: File | null = null;
  let alreadyAttached: { bytes: number }[] = [];
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (candidate && typeof candidate !== "string") file = candidate as File;
    const existing = form.get("existing");
    if (typeof existing === "string") {
      const parsed = JSON.parse(existing) as unknown;
      if (Array.isArray(parsed)) {
        alreadyAttached = parsed
          .map((x) => ({ bytes: Number((x as { bytes?: unknown })?.bytes) || 0 }))
          .filter((x) => x.bytes > 0);
      }
    }
  } catch {
    return NextResponse.json({ ok: false, error: "That upload didn't arrive properly." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ ok: false, error: "No file was attached." }, { status: 400 });
  }

  // Read the bytes before believing anything about them. The size the browser
  // reports is a claim; the length of what arrived is a fact.
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `That file is ${mb(buffer.byteLength)}. The limit is ${mb(MAX_FILE_BYTES)} per file.` },
      { status: 413 }
    );
  }

  const check = checkAttachment(file.name, buffer.byteLength, alreadyAttached);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
  }

  const contentType = contentTypeFor(check.extension);
  const path = `${agencyId}/${randomUUID()}/${check.filename}`;

  // System client: storage has no per-agency policy by design, so the prefix
  // above IS the boundary and it is set here, never by the caller.
  const supabase = createSystemClient();
  const { error } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error("[email/attachments] upload failed:", error.message);
    return NextResponse.json(
      { ok: false, error: "Couldn't store that file. Try again, or send it as a link." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    attachment: {
      path,
      filename: check.filename,
      contentType,
      bytes: buffer.byteLength,
    },
  });
}

export async function DELETE(request: Request) {
  const agencyId = await apiAgencyId();
  if (!agencyId) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const path = new URL(request.url).searchParams.get("path") ?? "";
  // The prefix check is the whole of the authorisation here.
  if (!path.startsWith(`${agencyId}/`)) {
    return NextResponse.json({ ok: false, error: "Not yours to remove." }, { status: 403 });
  }

  const supabase = createSystemClient();
  await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
  return NextResponse.json({ ok: true });
}
