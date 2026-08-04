# Widget → Luna Work CRM lead integration (as built)

**Between:** the widget platform (`tg-widgets`, `widgets.travelify.io`) and the Luna Work CRM (`travelgenix-crm`, `crm.travelify.io`).
**Status:** SHIPPED, both sides, 04 Aug 2026. Gated off in the widget editor until the per-form config UI lands (see §8). This documents what exists.

---

## 1. What it does, in one paragraph

Every lead-capture widget (enquiry forms, "request a quote", callbacks) can drop its lead **straight into the Luna Work CRM** as an **enquiry** — scored, put on a first-response clock, deduped against existing customers, and surfaced on the dashboard and `/enquiries`. It rides the widget suite's existing routing fan-out (the same mechanism that emails the agent, appends to Google Sheets, or fires a webhook): "Luna Work" is one more routing destination. When a form has it switched on, each submission is mapped to the CRM's enquiry contract, signed per agency, and POSTed to the CRM.

## 2. Architecture — server-to-server, not a browser key

This is the key decision, and it differs from a Stripe-style publishable key. **The browser never talks to the CRM.** The widget's own Vercel backend (`api/enquiry/submit.js`) receives the submission, then its `luna-work` routing module makes a **server-to-server** POST to the CRM. So:

- The credential is a **secret**, held in the widget's config (Airtable), never shipped to the page. No CORS, no origin-restriction, no publishable key.
- Authentication is a **per-agency key + HMAC signature** (§4), the same scheme the widget suite already uses for outbound webhooks (`routing/webhook.js`).
- The CRM endpoint is server-only: it is **not** CORS-enabled and expects no browser callers.

```
visitor → widget (browser) → tg-widgets backend → [luna-work routing module] → CRM POST /api/widget/lead → enquiries table
```

## 3. How a lead lands in the CRM

A lead becomes a row in the **`enquiries`** table via the shared create core (`lib/enquiries/create.ts`) — the *same* code path as an enquiry an agent types by hand. On create the CRM automatically:
- validates and clamps every field (never trusts the caller),
- computes the qualification scores (deterministically),
- starts the **first-response SLA clock** (this powers "N enquiries waiting / overdue"),
- **dedupes**: if the lead's email matches an existing contact, the enquiry auto-links to that household,
- emits `enquiry.created` and, when linked, drops a timeline entry,
- records any marketing **consent** as a note on the enquiry (v1 — a structured consent ledger is a later milestone).

The widget's only job is to hand over clean fields. It must **not** score, dedupe, or create customers itself.

## 4. THE CONTRACT

### Endpoint
```
POST https://crm.travelify.io/api/widget/lead
Content-Type: application/json
X-Travelgenix-Key:       <the agency's lead_ingest_key, e.g. wlk_1a2b3c…>
X-Travelgenix-Signature: t=<unix-seconds>,v1=<hex hmac>
```

### Auth — per-agency key + HMAC
- **`X-Travelgenix-Key`** is the agency's public `lead_ingest_key` (prefix `wlk_`). It only *names* which agency the lead belongs to; it is not a bearer token and grants nothing on its own.
- **`X-Travelgenix-Signature`** proves the body. It is `t={unix},v1={hex}` where `v1 = HMAC-SHA256(agency.lead_ingest_secret, ` `${t}.${rawBody}` `)`. The CRM recomputes it over the exact received bytes, compares in constant time, and rejects anything whose timestamp is **older than 5 minutes** (replay protection).
- Both credentials come from the CRM: **Luna Work → Settings** issues an agency its `lead_ingest_key` (public) and `lead_ingest_secret` (secret). The secret is stored in the widget's server-side config and used only to sign.
- An agency with no key, or a key whose secret doesn't verify the signature, is refused with `401`. Responses are deliberately opaque — a public endpoint reveals nothing about which keys exist.

The signing scheme is identical to the CRM's verifier (`lib/widget/signature.ts`) and the widget's existing webhook signer, so the two ends agree byte-for-byte.

### Request body (JSON)
All fields optional **except `contact_name`**. Unknown fields are ignored; lengths are capped server-side; `source` is always forced to `"website"` regardless of what is sent.

```jsonc
{
  "contact_name":  "Sarah Thompson",       // required
  "contact_email": "sarah@example.com",     // powers dedup + follow-up
  "contact_phone": "+44 7700 900123",

  "destination":   "Maldives, Sri Lanka",   // one string (widget joins its list)
  "depart_date":   "2026-09-14",            // YYYY-MM-DD
  "date_flexibility": "flexible",           // "fixed" | "flexible" | "very_flexible"
  "duration_nights": 10,
  "departure_airport": "London Heathrow (LHR), Gatwick (LGW)",
  "adults":   2,
  "children": 2,
  "child_ages": "6, 9",
  "budget": 4000,                           // number, GBP
  "budget_basis": "per_person",             // widget collects budget per person
  "board_basis": "All inclusive",
  "must_haves":    ["direct flights", "kids club"],

  "original_wording": "Honeymoon-ish, would love an overwater villa.",
  "notes": "Return date: 2026-09-24\nInfants: 1\nPreferred rating: 5 star",

  "consent": {                              // only when the visitor opted in (§4.1)
    "marketing_email": true,
    "wording": "Agreed to receive marketing via the website enquiry form.",
    "given_at": "2026-08-04T10:12:00.000Z"
  },

  "hp": ""                                   // honeypot: must be empty (§4.2)
}
```

### 4.1 Consent (GDPR)
The widget's **contact consent** (permission to reply) is required to submit and is not a marketing permission. Only the separate **marketing** opt-in becomes a `consent` block. If the visitor ticked marketing, send `consent` with the channel(s), the wording, and the timestamp. If they didn't, **omit `consent` entirely** — an unticked box is not consent. The CRM records the positive consent as a note on the enquiry (v1).

### 4.2 Anti-spam
The endpoint honours a **honeypot**: a hidden `hp` field. If it's non-empty the CRM returns `200` but writes nothing. The widget also runs its own honeypot, rate limiting and optional Turnstile *before* routing, so most bots never reach here. The CRM additionally **rate-limits by IP** (30/min) and caps the body at 100 KB.

### Response
- **Success:** `200 { "ok": true, "id": "<enquiry id>" }`.
- **Validation error:** `400 { "ok": false, "error": "A contact name is required" }`.
- **Bad key / signature:** `401 { "ok": false, "error": "..." }` — a config problem, not a user error.
- **Too many requests:** `429` with `Retry-After`.
- **CRM couldn't record it:** `502` (opaque) — the widget logs it via its routing log and the submission is still saved in Airtable.

There is no idempotency key. Re-submits are handled by the CRM's email dedup (a repeat email links to the same household) rather than a client-supplied token; the widget's routing runs once per submission.

## 5. Widget side — how it's wired (`tg-widgets`)

- **Module:** `api/enquiry/_lib/routing/luna-work.js` — maps the submission to the contract, signs it, POSTs it (10s timeout, HTTPS-only endpoint guard against SSRF). Pure mapping + signature are unit-tested.
- **Orchestrator:** `api/enquiry/submit.js` imports it statically and lists it in the routing `enabled` array, firing when the form's **Luna Work** flag is on.
- **Per-form config** (Enquiry Forms table, `appAYzWZxvK6qlwXK` / `tblpw4TCmQfJHZIlF`):
  - **Luna Work Ingest Key** `fldG6LfpJb5sA1HkV` — the agency's `wlk_` key.
  - **Luna Work Ingest Secret** `fldNmeld83IwtYlxT` — the agency's signing secret.
  - **Luna Work Endpoint** `fldxdR9nVUqCfzCbg` — optional; blank uses `https://crm.travelify.io/api/widget/lead`. Override only for a white-label CRM.
- **Test:** `test/enquiry-luna-work-smoke.mjs` (41 checks) — full + minimal mapping, endpoint guard, and a signature recomputed independently to prove the CRM verifies exactly what is sent. `npm run test:enquiry-luna-work`.

## 6. Field mapping (widget submission → CRM enquiry)

| Widget field | CRM field | Notes |
|---|---|---|
| `first_name` + `last_name` | `contact_name` | joined, trimmed (**required**) |
| `email` | `contact_email` | dedup + reply |
| `phone` | `contact_phone` | |
| `destinations[].name` | `destination` | joined to one string |
| `travel_dates.depart` | `depart_date` | `YYYY-MM-DD` |
| `travel_dates.flexible` | `date_flexibility` | `flexible` if true, else `fixed` |
| `duration.nights` | `duration_nights` | |
| `departure_airport[]` | `departure_airport` | joined to one string |
| `travellers.adults/children/childAges` | `adults`, `children`, `child_ages` | |
| `budget_pp` | `budget` + `budget_basis: per_person` | widget budget is per person |
| `board` (RO/BB/HB/FB/AI) | `board_basis` | expanded to a label |
| `interests[]` | `must_haves` | |
| `notes` (visitor's words) | `original_wording` | |
| return date, infants, stars, flights, custom duration | `notes` | folded in — no contract home, but never dropped |
| `marketing_consent` | `consent{...}` | only when ticked |
| (automatic) | `source: "website"` | forced by the CRM |

## 7. CRM side — what's built (`travelgenix-crm`)

- `app/api/widget/lead/route.ts` — the endpoint: IP rate-limit → key lookup (system client) → raw-body HMAC verify → honeypot drop → `normaliseEnquiryFields` → `createEnquiry`. Opaque responses.
- `lib/widget/signature.ts` — HMAC sign/verify with the 5-minute replay window (tested).
- `lib/enquiries/create.ts` — the shared create core, used by both this endpoint and the hand-typed `/api/enquiries` form (tested).
- Migration `…_agency_lead_ingest.sql` — `agencies.lead_ingest_key` (unique) + `lead_ingest_secret`.
- `middleware.ts` — `/api/widget/lead` on the always-open allowlist (a widget can't hold a login cookie).

## 8. Not yet done — the config UI (next milestone)

The backend is live but **switched off in the editor**: `public/editor-enquiry.html` still marks Luna Work as `comingSoon: true` (guarded by `test/enquiry-luna-comingsoon-smoke.mjs`), so no client can enable it yet. To turn it on for clients:
1. Remove `comingSoon: true` from the `lunaWork` destination and give it a config inspector that captures the three form fields (Ingest Key, Ingest Secret, optional Endpoint).
2. Update the coming-soon smoke test (Luna Work is no longer coming soon; Luna Chat / Luna Marketing still are).
3. In the CRM, add a **Settings** surface that issues an agency its `lead_ingest_key` + `lead_ingest_secret` and shows the copy-paste values.
4. Optionally, promote consent from an enquiry note to a structured, per-channel consent ledger entry on conversion.

## 9. Testing / go-live

1. CRM Settings issues a test agency its key + secret.
2. Paste both into a test form's Luna Work config; enable Luna Work.
3. Submit a test lead → it appears on `/enquiries` within seconds, on the response clock, linked to a seeded customer if the email matches.
4. Confirm the widget's routing log shows `luna-work: ok`, and the CRM logs a create.
5. Tamper test: a wrong secret must yield `401` and no enquiry.
6. Roll out per form; Luna Work runs alongside the existing destinations, so leads keep reaching Airtable/email during bedding-in.
