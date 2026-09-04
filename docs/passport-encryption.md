# Passport numbers: how they are protected

A one-page answer to the question a client's auditor asks: *what happens to
the passport numbers you hold?*

## The short version

A passport number is encrypted with AES-256-GCM before it reaches the
database, using a key that exists only in the application's environment. The
database additionally refuses to store anything that is not encrypted. Reading
a number is a separate, deliberate action, and every read is recorded against
the person who made it.

## The controls, and what each one stops

| Control | The attack it answers |
| --- | --- |
| **AES-256-GCM encryption** (`lib/crypto/field.ts`) | The database contents leak while the platform behaves perfectly — a stolen service-role key, a copied backup, an over-broad support query. Everything else in the row is readable; the passport number is not. |
| **Key held outside the database** | Whoever obtains the data does not thereby obtain the key. Supabase never sees it. |
| **Bound to its row (AAD)** | Someone with database write access but no key copies one traveller's ciphertext onto another traveller, or another agency's record. Every value is sealed against its agency id, contact id and field name, so a moved ciphertext fails to decrypt instead of silently succeeding. |
| **Authenticated encryption** | Tampering. A modified value fails to decrypt rather than decrypting into something else. |
| **Database check constraint** | The application layer being bypassed — a future code path, a migration, a well-meant manual `UPDATE`. `contacts.passport_number` must match `^v[0-9]+:`, so a plaintext write **fails** rather than quietly landing a passport number in the clear. |
| **Fail closed on a missing key** | A misconfigured deploy. With no key, storing a passport number is refused outright; it is never downgraded to plaintext. |
| **Access log** (`passport_access`) | "Who in *your* company looked at this?" Every reveal, set and clear is recorded with the Control identity, the contact and the time. The audit row is written **before** the value is returned, so a read cannot happen unrecorded. |
| **Never returned by default** | Casual exposure. No list, customer page, export or AI prompt contains the number. The customer page strips even the ciphertext from what it sends to the browser. |
| **POST, not GET, to reveal** | The number appearing in browser history, server access logs and intermediate proxies, and being reachable by a link someone could be tricked into following. |
| **Auto-hide after a minute; rate limited** | A revealed number sitting on an unattended screen, and enumeration by someone who already has a session. |
| **Key rotation without downtime** | A key that must be retired. Each stored value names the key that sealed it (the first 8 hex of its SHA-256 — the id, never the key). The retiring key stays readable through `LUNA_FIELD_KEY_OLD` while new writes use the new key. |

## What is deliberately *not* encrypted

Passport **expiry** and **country**. The expiry drives the passport risk score,
the compliance roll-ups, the Suggest feed and the `passport_expiring` journey
trigger — all of which compare and sort across every contact. Encrypting a
date that is far less abusable than the number, and breaking four features to
do it, would be theatre with casualties. This is a decision, not an oversight.

## Operating it

- **Enable**: set `LUNA_FIELD_KEY` to 64 hex characters (`openssl rand -hex 32`).
  Until it is set, passport numbers cannot be stored; everything else works.
- **Rotate**: generate a new key, move the current value to
  `LUNA_FIELD_KEY_OLD`, set the new one as `LUNA_FIELD_KEY`. Old values stay
  readable; new writes use the new key. Remove `LUNA_FIELD_KEY_OLD` once every
  value has been re-saved.
- **Back up the key** somewhere separate from the database backups. A database
  backup without the key is unreadable — which is the point, and also the risk:
  lose the key and the numbers are gone. That is recoverable (an agent re-enters
  them from the document) but it is a real operational cost.

## Where to look in the code

- `lib/crypto/field.ts` — the encryption scheme and key handling.
- `lib/passports/store.ts` — the only path in or out of the field.
- `app/api/contacts/[id]/passport/route.ts` — the HTTP door.
- `supabase/migrations/20260904090000_passport_encryption.sql` — the constraint and audit table.

## Known limits, stated plainly

- An **application compromise** — code execution with the environment in
  hand — defeats field encryption, because the running application must be
  able to decrypt. This protects the data at rest and in the database, not
  against a fully compromised server.
- A **legitimate agent** can reveal any passport in their own agency. The
  control there is the audit trail, not prevention. Per-role restriction is a
  separate piece of work (RBAC).
- The audit trail follows the contact: erasing a traveller erases the log
  entries about them. That is consistent with every other table here and with
  a right-to-erasure request, but if a retention policy later requires the
  trail to outlive the record, that is a deliberate change to make.
