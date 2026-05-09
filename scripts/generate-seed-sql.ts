/**
 * Generate supabase/seed.sql from lib/seed/data.ts.
 *
 * Run with: npx tsx scripts/generate-seed-sql.ts
 *
 * The output is a self-contained SQL file you can paste into the Supabase
 * SQL Editor as a fallback if /api/seed isn't working. Uses the same data
 * source as the API endpoint, so they stay in sync.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import {
  SEED_HOUSEHOLDS,
  SEED_SUPPLIERS,
  dateOffsetDays,
  dateOffsetHours,
} from "../lib/seed/data";

const AGENCY_ID = "00000000-0000-0000-0000-000000000001";
const NOW = new Date();

function sqlString(s: string | null | undefined): string {
  if (s === null || s === undefined) return "null";
  return `'${s.replace(/'/g, "''")}'`;
}

function sqlBool(b: boolean | undefined): string {
  return b ? "true" : "false";
}

function sqlArray(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return "'{}'::text[]";
  const escaped = arr.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",");
  return `'{${escaped}}'::text[]`;
}

const lines: string[] = [];

lines.push("-- ════════════════════════════════════════════════════════════════════════");
lines.push("--  Travelgenix CRM — Seed Data (fallback for /api/seed)");
lines.push(`--  Generated ${NOW.toISOString()}`);
lines.push("--  Run via Supabase SQL Editor if the API endpoint isn't working.");
lines.push("--  Idempotent — checks if households exist first.");
lines.push("-- ════════════════════════════════════════════════════════════════════════");
lines.push("");
lines.push("do $$");
lines.push("declare");
lines.push("  v_existing int;");
lines.push("begin");
lines.push(`  select count(*) into v_existing from households where agency_id = '${AGENCY_ID}';`);
lines.push("  if v_existing > 0 then");
lines.push("    raise notice 'Households already exist (% rows). Skipping seed.', v_existing;");
lines.push("    return;");
lines.push("  end if;");
lines.push("end $$;");
lines.push("");
lines.push("-- Suppliers");
for (const s of SEED_SUPPLIERS) {
  lines.push(
    `insert into suppliers (agency_id, name, category, rating, flags) values ` +
      `('${AGENCY_ID}', ${sqlString(s.name)}, ${sqlString(s.category)}, ${s.rating}, ${sqlArray(s.flags)});`
  );
}
lines.push("");

// Households + dependants
for (const seed of SEED_HOUSEHOLDS) {
  const upcoming = seed.trips
    .filter((t) => t.depart_offset_days != null && t.depart_offset_days >= 0)
    .map((t) => dateOffsetDays(t.depart_offset_days as number, NOW))
    .sort();

  const lastBookings = seed.trips
    .filter((t) => t.stage !== "enquiry" && t.depart_offset_days != null)
    .map((t) => dateOffsetDays(t.depart_offset_days as number, NOW))
    .sort()
    .reverse();

  lines.push(`-- Household: ${seed.display_name}`);
  lines.push(`with new_household as (`);
  lines.push(`  insert into households (`);
  lines.push(`    agency_id, display_name, household_type, city, postcode, country, tags,`);
  lines.push(`    notes, customer_since, lifetime_value, trips_count, next_departure, last_booking_at,`);
  lines.push(`    ai_brief, ai_brief_at`);
  lines.push(`  ) values (`);
  lines.push(`    '${AGENCY_ID}',`);
  lines.push(`    ${sqlString(seed.display_name)},`);
  lines.push(`    ${sqlString(seed.household_type)},`);
  lines.push(`    ${sqlString(seed.city)},`);
  lines.push(`    ${sqlString(seed.postcode)},`);
  lines.push(`    'GB',`);
  lines.push(`    ${sqlArray(seed.tags)},`);
  lines.push(`    ${sqlString(seed.notes ?? null)},`);
  lines.push(`    ${sqlString(seed.customer_since)},`);
  lines.push(`    ${seed.lifetime_value},`);
  lines.push(`    ${seed.trips.length},`);
  lines.push(`    ${upcoming[0] ? sqlString(upcoming[0]) : "null"},`);
  lines.push(`    ${lastBookings[0] ? sqlString(new Date(lastBookings[0]).toISOString()) : "null"},`);
  lines.push(`    ${sqlString(seed.ai_brief ?? null)},`);
  lines.push(`    ${seed.ai_brief ? sqlString(NOW.toISOString()) : "null"}`);
  lines.push(`  ) returning id`);
  lines.push(`)`);

  // Build a chain of inserts that all reference the new household id
  const chains: string[] = [];

  // Contacts
  for (const c of seed.contacts) {
    chains.push(
      `, ins_contact_${chains.length} as (` +
        `insert into contacts (agency_id, household_id, role, first_name, last_name, email, phone, ` +
        `date_of_birth, passport_expiry, dietary, flags, marketing_opt_in, marketing_opt_in_at, gdpr_consent, gdpr_consent_at) ` +
        `select '${AGENCY_ID}', id, ${sqlString(c.role)}, ${sqlString(c.first_name)}, ${sqlString(c.last_name ?? null)}, ` +
        `${sqlString(c.email ?? null)}, ${sqlString(c.phone ?? null)}, ${sqlString(c.date_of_birth ?? null)}, ` +
        `${sqlString(c.passport_expiry ?? null)}, ${sqlString(c.dietary ?? null)}, ${sqlArray(c.flags)}, ` +
        `${sqlBool(c.marketing_opt_in)}, ${c.marketing_opt_in ? sqlString(NOW.toISOString()) : "null"}, ` +
        `${sqlBool(c.gdpr_consent)}, ${c.gdpr_consent ? sqlString(NOW.toISOString()) : "null"} ` +
        `from new_household returning id)`
    );
  }

  // Trips
  for (const t of seed.trips) {
    chains.push(
      `, ins_trip_${chains.length} as (` +
        `insert into trips (agency_id, household_id, reference, stage, destination, destination_country, ` +
        `depart_date, return_date, duration_nights, total_value, currency, occasion, notes, source) ` +
        `select '${AGENCY_ID}', id, ${sqlString(t.reference)}, ${sqlString(t.stage)}::trip_stage, ` +
        `${sqlString(t.destination)}, ${sqlString(t.destination_country)}, ` +
        `${t.depart_offset_days != null ? sqlString(dateOffsetDays(t.depart_offset_days, NOW)) : "null"}, ` +
        `${t.return_offset_days != null ? sqlString(dateOffsetDays(t.return_offset_days, NOW)) : "null"}, ` +
        `${t.duration_nights ?? "null"}, ${t.total_value}, 'GBP', ` +
        `${sqlString(t.occasion ?? null)}, ${sqlString(t.notes ?? null)}, ${sqlString(t.source)} ` +
        `from new_household returning id)`
    );
  }

  // Interactions
  if (seed.interactions) {
    for (const i of seed.interactions) {
      chains.push(
        `, ins_ix_${chains.length} as (` +
          `insert into interactions (agency_id, household_id, kind, channel, direction, subject, body, ` +
          `body_summary, ai_priority, ai_reason, is_read, is_triaged, occurred_at) ` +
          `select '${AGENCY_ID}', id, ${sqlString(i.kind)}::interaction_kind, ${sqlString(i.channel)}, ` +
          `${sqlString(i.direction)}, ${sqlString(i.subject ?? null)}, ${sqlString(i.body)}, ` +
          `${sqlString(i.body_summary ?? null)}, ${sqlString(i.ai_priority ?? null)}, ` +
          `${sqlString(i.ai_reason ?? null)}, ${sqlBool(i.is_read)}, ${sqlBool(i.ai_priority != null)}, ` +
          `${sqlString(dateOffsetHours(i.occurred_offset_hours, NOW))} ` +
          `from new_household returning id)`
      );
    }
  }

  // Preferences
  if (seed.preferences) {
    for (const p of seed.preferences) {
      chains.push(
        `, ins_pref_${chains.length} as (` +
          `insert into preferences (household_id, category, value, source) ` +
          `select id, ${sqlString(p.category)}, ${sqlString(p.value)}, ${sqlString(p.source ?? "manual")} ` +
          `from new_household returning id)`
      );
    }
  }

  if (chains.length > 0) {
    lines.push(chains.join("\n"));
  }

  lines.push(`select 1 from new_household;`);
  lines.push("");
}

const out = lines.join("\n");
const outPath = join(process.cwd(), "supabase", "seed.sql");
writeFileSync(outPath, out, "utf8");
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB)`);
