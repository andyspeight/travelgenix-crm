/**
 * The forgotten-filter check.
 *
 * Because the server talks to Supabase with the service-role key, row-level
 * security cannot catch a query that forgets to scope itself to an agency —
 * service role bypasses RLS by design. So the guarantee has to be held
 * somewhere, and "everyone remembers every time" is not a guarantee.
 *
 * This test reads the source and fails if a query against a tenant-owned
 * table has no agency filter in the same statement. It is deliberately dumb
 * and textual: it cannot be fooled by a clever abstraction because there
 * isn't one to be fooled by, and it runs on every build.
 *
 * Exceptions are listed explicitly, each with the reason it is safe. A new
 * exception should be an argument, not a quiet edit.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/**
 * Tables holding one agency's data. `preferences` is included even though it
 * has no agency_id of its own — it is reached through its household, and an
 * unnarrowed read of it leaks just as effectively.
 */
const TENANT_TABLES = [
  "households", "contacts", "suppliers", "trips", "interactions",
  "tasks", "notes", "preferences", "journeys", "segments", "enquiries",
  "events", "quotes", "consents", "cases", "email_sends",
  "email_suppressions", "email_inbound", "custom_fields", "users", "agencies",
  "agency_invitations", "ask_misses",
];

/**
 * Queries that are correct WITHOUT an agency filter, and why.
 * Keyed by "file::table".
 */
const ALLOWED: Record<string, string> = {
  // Answers "which agency is this request?" — cannot be scoped by the answer
  // it exists to produce. Runs on the system client.
  "lib/auth/session.ts::agencies":
    "resolves the Control client -> agency mapping; system client",
  // A provider calls the webhook with no session, so the agency is derived
  // FROM the matched send rather than used to find it.
  "app/api/email/webhook/route.ts::email_sends":
    "looks up the send by provider message id to learn its agency",
  "app/api/email/webhook/route.ts::email_suppressions":
    "writes with the agency taken from the matched send",
  "app/api/email/webhook/route.ts::events":
    "emitted with the agency taken from the matched send",
  // A customer's reply arrives with no session and no agency attached.
  // Working out WHICH agency it belongs to is the entire job of these two
  // lookups, so neither can be scoped by the answer it exists to find. Both
  // are narrow (an id, a message id, one email address), and every write that
  // follows uses the agency the match produced.
  "app/api/email/inbound/route.ts::email_sends":
    "finds the send a reply answers, by id or provider message id, to learn its agency",
  "app/api/email/inbound/route.ts::contacts":
    "finds who an inbound address belongs to; refuses to match when it spans agencies",
  // Children scoped through their parent trip/journey, which is itself scoped.
  "app/api/journeys/runs/[id]/route.ts::journey_runs":
    "scoped via its journey, which is agency-filtered",
  // The nightly schedule is the one caller that is SUPPOSED to work the whole
  // estate: it lists agencies in order to then run each one separately, and
  // passes the agency id explicitly into every query it makes.
  "app/api/cron/journeys/route.ts::agencies":
    "the estate-wide scheduler; lists agencies to run each one scoped",
  // A liveness probe: head-only existence check, returns no rows at all.
  "app/api/health/route.ts::agencies":
    "head-only reachability check; returns a count, never rows",
  // A website widget posts with no session; the lead_ingest_key IS how the
  // agency is identified. Like the email webhook, the agency is derived FROM
  // the matched row, so the lookup cannot be scoped by the answer it produces.
  // Narrow (one unique key), and every write that follows uses that agency id.
  "app/api/widget/lead/route.ts::agencies":
    "resolves the agency from its lead_ingest_key; system client, no session",
  // A traveller asking for a portal login link presents only an email and no
  // session, so which agency/household it belongs to is the whole job of this
  // lookup — it cannot be scoped by the answer it exists to find. Narrow (one
  // email), read-only, and the link that follows grants only the matched
  // household. Isolated in its own file so this covers nothing else.
  "lib/portal/lookup.ts::contacts":
    "resolves which agency/household a login email belongs to; no session yet",
};

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Blank out the argument to .select(), because a column LIST is not a
 * filter. `select("id, agency_id")` mentions agency_id while narrowing
 * nothing, and a check that accepted it would wave through exactly the
 * table scans it exists to catch.
 */
function withoutSelectArgs(statement: string): string {
  let out = "";
  let i = 0;
  while (i < statement.length) {
    const at = statement.indexOf(".select(", i);
    if (at === -1) {
      out += statement.slice(i);
      break;
    }
    out += statement.slice(i, at) + ".select(";
    let depth = 1;
    let j = at + ".select(".length;
    while (j < statement.length && depth > 0) {
      if (statement[j] === "(") depth++;
      else if (statement[j] === ")") depth--;
      j++;
    }
    out += ")";
    i = j;
  }
  return out;
}

/** Every `.from("table")` call, with the statement that follows it. */
function queriesIn(src: string): { table: string; statement: string }[] {
  const found: { table: string; statement: string }[] = [];
  const re = /\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // The statement runs to the next semicolon at this nesting depth; a
    // generous slice is fine because we only look for a filter inside it.
    const rest = src.slice(m.index, m.index + 1200);
    const end = rest.indexOf(";");
    found.push({
      table: m[1],
      statement: withoutSelectArgs(end === -1 ? rest : rest.slice(0, end)),
    });
  }
  return found;
}

describe("every tenant query carries its agency", () => {
  const root = process.cwd();
  const files = [
    ...sourceFiles(join(root, "app")),
    ...sourceFiles(join(root, "lib")),
  ];

  it("finds source to check (guards against the check silently doing nothing)", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("actually detects an unnarrowed query — the check is not blind", () => {
    const bad = queriesIn(`const { data } = await supabase.from("households").select("*");`);
    expect(bad).toHaveLength(1);
    expect(bad[0].table).toBe("households");
    expect(bad[0].statement).not.toMatch(/agency_id/);

    const good = queriesIn(
      `await supabase.from("households").select("*").eq("agency_id", agencyId);`
    );
    expect(good[0].statement).toMatch(/agency_id/);
  });

  it("is not fooled by agency_id appearing only in the column list", () => {
    const [q] = queriesIn(
      `await supabase.from("households").select("id, agency_id, display_name").limit(10);`
    );
    expect(q.statement).not.toMatch(/agency_id/);
  });

  it("no query on a tenant table is missing its agency filter", () => {
    const offences: string[] = [];

    for (const file of files) {
      const rel = file.slice(root.length + 1);
      const src = readFileSync(file, "utf8");

      for (const { table, statement } of queriesIn(src)) {
        if (!TENANT_TABLES.includes(table)) continue;
        if (ALLOWED[`${rel}::${table}`]) continue;

        // Writes carry the tenant in the ROW, not the query, and every
        // tenant table declares agency_id NOT NULL — so an insert that
        // forgot it is rejected by the database rather than silently
        // orphaned, and an insert cannot read another agency's data anyway.
        if (/\.(insert|upsert)\(/.test(statement)) continue;

        // A tenant query must be NARROWED by something. Either directly by
        // agency, or to specific rows whose ids came from an already-scoped
        // query (the common two-step: fetch trips for the agency, then fetch
        // the households those trips belong to). What must never appear is a
        // query with no narrowing at all — that is the table scan that
        // returns every agency's rows.
        const scoped =
          statement.includes("agency_id") ||
          /\.(eq|in)\(\s*["'`](id|household_id|trip_id|contact_id|journey_id|quote_id|enquiry_id)["'`]/.test(
            statement
          );

        if (!scoped) {
          offences.push(`${rel} — .from("${table}") is not narrowed to a tenant`);
        }
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  });
});
