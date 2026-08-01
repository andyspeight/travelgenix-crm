import { describe, expect, it } from "vitest";
import {
  checkAttachment,
  safeFilename,
  contentTypeFor,
  extensionOf,
  MAX_FILE_BYTES,
  MAX_FILES,
} from "@/lib/email/attachments";

const MB = 1024 * 1024;

describe("filenames, which are chosen by whoever uploads", () => {
  it("strips a path out of the name", () => {
    expect(safeFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(safeFilename("C:\\Users\\andy\\Itinerary.pdf")).toBe("Itinerary.pdf");
  });

  it("keeps a normal name readable", () => {
    expect(safeFilename("Whitfield Crete Itinerary 2026.pdf")).toBe("Whitfield Crete Itinerary 2026.pdf");
  });

  it("never returns an empty name", () => {
    expect(safeFilename("...")).toBe("attachment");
    expect(safeFilename("/")).toBe("attachment");
  });

  it("keeps the extension when trimming a very long name", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(safeFilename(long).endsWith(".pdf")).toBe(true);
    expect(safeFilename(long).length).toBeLessThanOrEqual(120);
  });
});

describe("what may be attached", () => {
  it("accepts the things an agency actually sends", () => {
    for (const name of ["Itinerary.pdf", "hotel.jpg", "prices.xlsx", "flights.ics"]) {
      expect(checkAttachment(name, 200_000).ok).toBe(true);
    }
  });

  it("refuses a program, and says why in words an agent would use", () => {
    const result = checkAttachment("setup.exe", 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/scam/);
  });

  it("is not fooled by a double extension", () => {
    expect(checkAttachment("itinerary.pdf.exe", 1000).ok).toBe(false);
  });

  it("refuses a type it has no reason to allow", () => {
    expect(checkAttachment("thing.psd", 1000).ok).toBe(false);
  });

  it("refuses a file with no extension at all", () => {
    expect(checkAttachment("itinerary", 1000).ok).toBe(false);
  });

  it("refuses an empty file", () => {
    expect(checkAttachment("empty.pdf", 0).ok).toBe(false);
  });
});

describe("size, because providers reject what agents don't notice", () => {
  it("refuses a single file over the per-file limit", () => {
    const result = checkAttachment("big.pdf", MAX_FILE_BYTES + 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/share a link/);
  });

  it("counts what is already attached, not just this one", () => {
    const existing = [{ bytes: 4 * MB }, { bytes: 4 * MB }];
    const result = checkAttachment("third.pdf", 4 * MB, existing);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/per email/);
  });

  it("caps the number of files", () => {
    const existing = Array.from({ length: MAX_FILES }, () => ({ bytes: 1000 }));
    expect(checkAttachment("one-more.pdf", 1000, existing).ok).toBe(false);
  });
});

describe("content types come from us, not from the browser", () => {
  it("maps what it knows", () => {
    expect(contentTypeFor("pdf")).toBe("application/pdf");
    expect(contentTypeFor(extensionOf("photo.JPG"))).toBe("image/jpeg");
  });

  it("falls back to a type that nothing will execute", () => {
    expect(contentTypeFor("wat")).toBe("application/octet-stream");
  });
});
