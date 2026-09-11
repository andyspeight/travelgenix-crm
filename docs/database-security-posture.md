# Database security posture — Luna Work CRM

Verified against the live database on 11 September 2026. This is the internal,
honest version. It is written so that every claim can be checked with the query
that produced it, because an audit answer you cannot evidence is worse than no
answer.

Project: `Travelgenix CRM` (`iexryjynfaktfbvzlwlx`), Postgres 17.6, region
**eu-west-1 (Ireland)**, Supabase plan **Pro**.

---

## 1. The headline, stated plainly

**Column-level encryption covers exactly one field: `contacts.passport_number`.**

Everything else a client would call sensitive — names, email addresses, phone
numbers, home addresses, dietary and allergy notes, date of birth, trip
histories, quote values, email correspondence bodies — is stored as ordinary
plaintext columns, protected by access control and by the platform's
encryption of the underlying storage, not by encryption of the values
themselves.

If a client asks "is our customer data encrypted at column level", the truthful
answer today is: *passport numbers are; the rest is not.*

## 2. What protects the data today

### 2.1 Encryption at rest (platform)
Supabase encrypts the underlying storage volumes and the automated backups
(AES-256, managed by the platform). This protects against physical media theft
and against raw disk access. It does **not** protect against anyone who can
legitimately connect to the database or restore a backup — to them the data is
plaintext.

### 2.2 Encryption in transit
All connections are TLS. The application reaches the database only from the
server side; nothing in the browser talks to Postgres.

### 2.3 Column-level encryption (application-side)
`contacts.passport_number` only. AES-256-GCM, key held solely in the
application environment and never in the database, each value cryptographically
bound to its agency, contact and field so a ciphertext cannot be moved between
rows. A database CHECK constraint rejects any write that is not ciphertext.
Every read, write and clear is recorded in `passport_access` before the value is
returned. Full detail: `docs/passport-encryption.md`.

**This is the control that also covers backups**, and it is worth understanding
why: because the value is encrypted *before* it reaches Postgres, what sits in
the table — and therefore in every backup, every replica, every export — is
ciphertext. Restoring a backup does not reveal it. That property is the reason
to extend column encryption, and it is exactly what the other sensitive columns
do not currently have.

### 2.4 Row-Level Security
RLS is **enabled on all 33 tables** in the CRM's `public` schema. 29 carry a
`tenant_isolation` policy:

```sql
-- policy on contacts, households, trips, quotes, interactions, and 24 more
USING (agency_id = current_agency_id())
-- current_agency_id() reads request.jwt.claims ->> 'agency_id'
```

The remaining four (`cron_runs`, `passport_access`, `portal_login_tokens`,
`widget_events`) have RLS enabled with **no** policy, which is deliberate: with
RLS on and no policy, every caller is denied and only the service-role
connection reaches them.

**The important caveat, and it is a real one.** The application connects with
the **service-role** key, and in Postgres that role carries `BYPASSRLS`.
Verified:

```sql
select rolname, rolbypassrls from pg_roles where rolname='service_role';
-- service_role | true
```

So the RLS policies above **do not constrain the application's own queries**.
What they do is deny the *published anon key* everything — which is genuinely
valuable, because that key is visible in the page source of any Supabase app —
but they are not the boundary between one agency's data and another's.

Additionally `relforcerowsecurity` is `false` on every table, so the table owner
also bypasses the policies.

### 2.5 What actually enforces tenant isolation
Every query in the application carries an explicit `.eq("agency_id", …)` filter,
and a **build-time test** (`lib/supabase/tenant-filters.test.ts`) fails the build
if any query against a tenant table is missing one. Exemptions are individually
named and justified in that file (there are four, each for a lookup that exists
to *answer* "which agency is this?" and so cannot be scoped by the answer).

This is a code-enforced boundary with a mechanical check, not a database-enforced
one. It is better than nothing by a wide margin and worse than RLS by design.

### 2.6 Audit trail
- `passport_access` — every passport number read, written or cleared, with the
  Control identity, contact, IP and timestamp. Written *before* the value is
  returned, so a read cannot occur unrecorded.
- `events` — the CRM's own event spine (quotes sent/viewed/accepted, bookings,
  stage changes, emails).
- `interactions` — the customer timeline, including a record whenever a customer
  changes their own details in the portal.
- `pgaudit` is **available but not installed**. There is no statement-level
  database audit log today.

### 2.7 Secrets
- Application secrets live in Vercel environment variables, not in the database.
- `supabase_vault` is installed but not used by the CRM.
- `pgsodium` (Supabase's column-encryption extension) is **available but not
  installed** — our column encryption is done in the application instead, which
  keeps the key out of the database entirely. That is the stronger arrangement
  of the two and is worth saying so in an audit response.

## 3. Facts an auditor will ask about, that we should not be caught out by

### 3.1 This is a shared database instance
The CRM's `public` schema is not alone on this Postgres instance:

| Schema | Tables | Size | What it is |
| --- | ---: | ---: | --- |
| `public` | 33 | 295 MB | **Luna Work CRM** |
| `contracts` | 64 | 13 MB | Contract/inventory product |
| `luna_travel` | 19 | 2.1 MB | Luna Travel |
| `backoffice` | 10 | 1.0 MB | Back-office ledger |

A client asking "is our data on its own database" must be told: no — it is
logically separated by `agency_id` within a schema that shares a Postgres
instance with other Travelgenix products. That may be perfectly acceptable to
them, but it must not come as a surprise.

### 3.2 Backups
Supabase Pro includes daily backups with 7-day retention, encrypted at rest by
the platform. **Point-in-Time Recovery is a paid add-on and I could not verify
from here whether it is enabled** — check Database → Backups in the Supabase
dashboard. For a system holding this data, PITR should be on.

There is no tested restore procedure on record. An auditor will ask when we last
tested a restore, and today we have no answer.

### 3.3 Data residency
eu-west-1 (Ireland) — inside the EU, appropriate for UK and EU clients under
UK GDPR / EU GDPR. Worth stating proactively; it is a good fact.

### 3.4 Open advisories
- 8 functions with a mutable `search_path` (WARN) — low risk, easily fixed.
- `pg_trgm` installed in the `public` schema (WARN) — cosmetic.
- 91 `rls_enabled_no_policy` notices, almost all in the other products' schemas.

## 4. The honest gap list

| Gap | Risk | Effort |
| --- | --- | --- |
| Only one column encrypted | A backup restore, a leaked service-role key, or an over-broad support query exposes all customer PII in the clear | Medium–High (see §5) |
| RLS bypassed by the application's own role | Tenant isolation depends on application code, not the database. A single missed filter in a future query is a cross-tenant leak; the build-time test is the only thing standing in the way | Medium |
| No statement-level database audit | We cannot show an auditor who ran what query against the database | Low (enable `pgaudit`) |
| PITR unverified; no tested restore | Recovery time and data-loss window are both unknown | Low |
| No documented key-rotation drill | The passport key can be rotated, but it has never been exercised | Low |
| No formal retention/erasure policy | UK GDPR Art 5(1)(e) and Art 17 both expect one | Low–Medium |

## 5. What "encrypt everything at column level" actually costs

This is worth understanding before committing to it, because the cost is not
in the encrypting — it is in everything that stops working.

An encrypted column cannot be searched, sorted, matched or indexed by the
database. Concretely, in this product:

- **Email addresses.** Used to match an inbound reply to a customer, to look up
  who requested a portal link, to suppress a bounced address, and to dedupe.
  Encrypted, every one of those becomes a full table decrypt in application
  memory.
- **Names.** The customer search box, alphabetical lists, and duplicate
  detection all rely on comparing them in the database.
- **Dates of birth and passport expiry.** The compliance roll-ups, the
  passport-expiry alerts and the journey triggers all sort and range-scan these.

The usual answer is a **blind index**: store a keyed HMAC of the value alongside
the ciphertext so exact-match lookups still work. That restores lookup but not
sorting or partial match, and it leaks equality (two customers with the same
email are visibly the same). It is the right tool for email; it does not save
names or dates.

**A proportionate recommendation**, in order:

1. **Encrypt what is high-harm and low-utility first.** Date of birth is the
   obvious next candidate after passport number: it is identity data, and
   nothing in the product sorts or searches on it — only the age-band display
   reads it. Same for any future payment or document-reference fields.
2. **Close the RLS gap instead of encrypting more.** Making the database itself
   enforce `agency_id` is a bigger security win per unit of effort than
   encrypting another column, because it removes the class of bug the build-time
   test is currently the only defence against. This needs either a shared JWT
   signing secret (the project has moved to asymmetric keys, so this is not
   currently available) or a dedicated application role without `BYPASSRLS`
   plus a per-request `SET LOCAL`.
3. **Turn on `pgaudit` and confirm PITR.** Both are configuration, not
   engineering, and both are things auditors ask for by name.
4. **Then** consider blind-indexed encryption for email addresses, accepting
   the equality leak.

## 6. What we can honestly tell a client today

> Customer data is held in an EU (Ireland) Postgres database, encrypted at rest
> and in transit. Passport numbers receive additional application-level
> AES-256-GCM encryption with the key held outside the database, cryptographically
> bound to the record they belong to, so they remain encrypted in every backup and
> export; every access to one is individually logged. Tenant separation is enforced
> on every query and verified by an automated check that blocks any release in
> which a query omits it. Row-Level Security is enabled on all tables, denying the
> public API key access to customer data. Backups are taken daily and retained for
> seven days.

Every sentence of that is true and evidenced. Note what it does not claim: that
all sensitive fields are individually encrypted, or that tenant separation is
enforced by the database. We should not claim either until they are true.
