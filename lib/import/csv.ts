/**
 * CSV parser — RFC 4180 with the real-world allowances every CRM export needs:
 * quoted fields containing commas/newlines/escaped quotes, \r\n or \n line
 * endings, a UTF-8 BOM, and ragged rows (padded/truncated to the header
 * width). Zero dependencies so the whole import pipeline stays auditable.
 */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

export function parseCsv(text: string, maxRows = 5000): ParsedCsv {
  // Strip a UTF-8 BOM (Excel loves adding one).
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    // Skip records that are entirely empty (a trailing newline, a blank line).
    if (record.length > 1 || record[0].trim() !== "") records.push(record);
    record = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRecord();
      if (records.length > maxRows) break;
    } else if (ch === "\r") {
      // handled by the following \n, or acts as a newline on old-Mac files
      if (src[i + 1] !== "\n") {
        pushRecord();
        if (records.length > maxRows) break;
      }
    } else {
      field += ch;
    }
  }
  // Final record (no trailing newline).
  if (field !== "" || record.length > 0) pushRecord();

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const width = headers.length;
  const rows = records.slice(1, maxRows + 1).map((r) => {
    if (r.length === width) return r;
    if (r.length > width) return r.slice(0, width);
    return [...r, ...Array(width - r.length).fill("")];
  });

  return { headers, rows };
}
