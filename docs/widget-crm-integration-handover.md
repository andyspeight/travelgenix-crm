# Handover: connecting the Travelgenix widgets to the Luna Work CRM

**For:** the widget-builder Claude session (the `tg-widgets` repo).
**From:** the Luna Work CRM session (`travelgenix-crm`, the app at `crm.travelify.io`).
**Status:** integration spec + division of labour. Nothing is built yet on either side; this is the contract to build to.

---

## 1. What we're doing, in one paragraph

The lead-capture widgets (enquiry forms, "request a quote", callback requests, etc.) currently send customer details somewhere other than the CRM (Airtable). We want every widget that collects customer details to drop that lead **straight into the Luna Work CRM**, where it becomes an **enquiry** — scored, put on a first-response clock, deduped against existing customers, and surfaced on the dashboard and `/enquiries` screen. This handover defines the API the widget calls and who builds what.

## 2. Who does what

| Side | Work |
|---|---|
| **CRM (me, on request)** | Build a public, keyed, CORS-enabled ingest endpoint `POST /api/widget/lead`; add a per-agency **publishable widget key**; write the lead as an enquiry (+ consent). **This does not exist yet.** |
| **Widget (your session)** | On submit, POST the form to that endpoint with the agency's widget key; capture marketing consent; handle success/error; stop writing leads to Airtable (or dual-write during transition). |

The two sides only need to agree on **section 4 (the contract)**. Build to that and they meet in the middle.

## 3. How a lead lands in the CRM (context)

A lead becomes a row in the **`enquiries`** table. On create, the CRM automatically:
- validates and clamps every field (never trusts the caller),
- computes four qualification scores (deterministically),
- starts the **first-response SLA clock** (this is what makes "you have N enquiries waiting / overdue" work on the dashboard and in Luna Ask),
- **dedupes**: if the lead's email matches an existing customer, the enquiry is auto-linked to that household ("repeat customer"),
- emits an `enquiry.created` event and, when linked, drops an entry on the customer's timeline.

So the widget's only job is to hand over clean fields. Everything above is the CRM's job — the widget must **not** try to score, dedupe, or create customers itself.

## 4. THE CONTRACT (build to this)

### Endpoint
```
POST https://crm.travelify.io/api/widget/lead
Content-Type: application/json
X-Widget-Key: <the agency's publishable widget key>
```

### Auth model — read this carefully
- The widget key is a **publishable, write-only, origin-restricted** key (same idea as the Ideal Postcodes browser key or a Stripe publishable key). It is safe to embed in the page because:
  - it can **only create an enquiry** — it can never read or list anything;
  - the CRM restricts it to the agency's **allowed website domains** (the request `Origin` must match);
  - it is **rate-limited** per key + IP.
- Each **agency has its own key**, so the CRM knows which workspace the lead belongs to from the key alone. The widget config stores one key per embed.

### CORS
- The endpoint answers a `OPTIONS` preflight and returns `Access-Control-Allow-Origin` for the agency's allowed domains, `Access-Control-Allow-Headers: content-type, x-widget-key`. The widget just does a normal `fetch` with `mode: "cors"`.

### Request body (JSON)
All fields optional **except `contact_name`**. Unknown fields are ignored. Lengths are capped server-side; send natural values.

```jsonc
{
  // Who (contact_name required; email strongly recommended — it powers dedup + follow-up)
  "contact_name":  "Sarah Thompson",
  "contact_email": "sarah@example.com",
  "contact_phone": "+44 7700 900123",

  // What they want (all optional)
  "destination":   "Maldives",
  "depart_date":   "2026-09-14",           // YYYY-MM-DD
  "date_flexibility": "flexible",          // "fixed" | "flexible" | "very_flexible"
  "duration_nights": 10,
  "departure_airport": "Manchester",
  "adults":   2,
  "children": 2,
  "child_ages": "9, 12",
  "budget": 8000,                           // number, in GBP
  "budget_basis": "total",                  // "total" | "per_person"
  "holiday_type": "beach",
  "board_basis": "all inclusive",
  "accommodation": "5* resort",
  "occasion": "anniversary",
  "must_haves":    ["direct flights", "kids club"],   // string[]
  "deal_breakers": ["long transfer"],                 // string[]

  // Free text
  "notes": "Whatever they typed in the message box.",

  // Provenance — always set these from the widget
  "source": "website",                      // keep as "website"
  "page_url": "https://client-site.co.uk/holidays/maldives",  // where the form was
  "widget_id": "enquiry-form-v2",           // which widget/instance

  // Marketing consent — send exactly what the customer agreed to (see 4.1)
  "consent": {
    "marketing_email": true,
    "marketing_sms": false,
    "wording": "Yes, email me holiday offers and inspiration.",
    "given_at": "2026-08-04T10:12:00.000Z"  // ISO, when they ticked it
  },

  // Anti-spam (see 4.2)
  "hp": ""                                   // honeypot: must be empty
}
```

### 4.1 Consent (important — GDPR)
The CRM keeps a proper consent ledger. If your form has a marketing opt-in checkbox, send the `consent` object above with:
- which channels they agreed to (`marketing_email`, `marketing_sms`, …),
- the **exact wording** shown next to the checkbox,
- the **timestamp** they ticked it.

If there is no opt-in on the form, **omit `consent` entirely** — do not send `true`. An unticked box is not consent. The CRM records the positive consents against the customer when the lead is worked.

### 4.2 Anti-spam
Public form endpoints get bots. Implement at least a **honeypot**: a hidden field (`hp`) that real users never fill; if it's non-empty, still return 200 but the CRM drops it. Recommended additionally: Cloudflare **Turnstile** (invisible) — if we add it, the widget passes a `turnstile_token` and the CRM verifies it. Flag if you want this in v1.

### Response
- **Success:** `200 { "ok": true }` (deliberately minimal — no data leaks back to a public caller).
- **Validation error:** `400 { "ok": false, "error": "A contact name is required" }` — show the message near the form.
- **Bad/blocked key or origin:** `403 { "ok": false, "error": "..." }` — treat as a config problem, not a user error.
- **Too many requests:** `429` with `Retry-After` — back off.

### Idempotency
Double-submits happen (impatient clicks, retries). Send a stable `Idempotency-Key` header (a UUID generated once per form-fill); the CRM will not create two enquiries for the same key.

## 5. Widget-side checklist (your session)

1. **Config per embed:** add two settings to the widget — `crmEndpoint` (default `https://crm.travelify.io/api/widget/lead`) and `crmWidgetKey` (the agency's publishable key). These come from the widget's Airtable/config the same way other settings do.
2. **On submit:** build the JSON payload above from the form fields (see the mapping in §6), `fetch` the endpoint with the `X-Widget-Key` header and an `Idempotency-Key`.
3. **Consent:** if the form has a marketing checkbox, populate `consent` with the wording + timestamp; if not, omit it.
4. **UX:** on `200`, show the success state; on `400`, show `error`; on network/`5xx`/`429`, show a friendly "couldn't send, please try again" and keep the entered data.
5. **Honeypot:** add the hidden `hp` field.
6. **Transition:** decide with Andy whether to (a) switch leads from Airtable to the CRM outright, or (b) dual-write to both for a bedding-in period. Dual-write is safer for go-live.
7. **No secrets beyond the publishable key:** never put any server/admin key in the widget. The widget key is the only credential and it's write-only + origin-locked.

## 6. Field mapping (widget form → CRM enquiry)

| Widget form field | CRM field | Notes |
|---|---|---|
| Name | `contact_name` | **required** |
| Email | `contact_email` | powers dedup + reply |
| Phone | `contact_phone` | |
| Destination / "where" | `destination` | |
| Travel date | `depart_date` | format `YYYY-MM-DD` |
| Flexible dates? | `date_flexibility` | map to the 3 enums |
| Nights / duration | `duration_nights` | integer |
| Departure airport | `departure_airport` | |
| Adults / children / ages | `adults`, `children`, `child_ages` | |
| Budget (+ per person?) | `budget`, `budget_basis` | number + enum |
| Holiday type | `holiday_type` | |
| Board / accommodation | `board_basis`, `accommodation` | |
| Occasion | `occasion` | |
| "Must have" / "must avoid" | `must_haves`, `deal_breakers` | arrays |
| Message / comments | `notes` | |
| (automatic) | `source: "website"`, `page_url`, `widget_id` | set by the widget |
| Marketing checkbox | `consent{...}` | only if ticked |

Anything the widget doesn't collect: just omit it.

## 7. What the CRM side will build (so you know it's coming)
For reference, the CRM tasks (not yours) are: the `/api/widget/lead` route + middleware allowlist + CORS/OPTIONS; a per-agency publishable widget key (with allowed-domains); reuse of the existing enquiry-create logic; persisting the `consent` block; the honeypot/Turnstile check; and rate limiting. **Ask Andy to have the CRM session build this before you can integration-test.** Until it exists, build against the contract in §4 and mock the endpoint.

## 8. Testing / go-live
1. CRM session provisions a **test agency + test widget key** and gives you the key + allowed domain.
2. Point a staging widget at the endpoint with that key.
3. Submit a test lead → confirm it appears on the CRM's `/enquiries` screen within seconds, on the response clock, and (if the email matches a seeded customer) linked to that customer.
4. Submit a duplicate with the same `Idempotency-Key` → confirm only one enquiry.
5. Submit with a marketing opt-in → confirm consent is recorded when the enquiry is worked.
6. Roll out per widget; dual-write to Airtable first if Andy prefers, then cut over.

## 9. Open decisions for Andy
- **One key per agency** (recommended) vs one key per widget instance.
- **Turnstile** in v1, or honeypot-only to start.
- **Dual-write to Airtable** during transition, or straight cut-over.
- **Consent channels** the forms should offer (email only, or email + SMS).
- Do any widgets need to **create a customer immediately** rather than an enquiry? (Default and recommendation: everything lands as an enquiry and is converted in the CRM — one front door, human-reviewed.)

---

*This is the contract. The widget session can build §4–§6 now; the CRM endpoint in §7 is a separate task for the CRM session. They meet at `POST /api/widget/lead`.*
