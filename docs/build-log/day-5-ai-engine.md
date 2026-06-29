# Day 5 — AI engine

**Status:** Complete (build log backfilled during the completion pass)
**Goal:** Wire Luna to real Claude where it adds genuine value, with the security and anti-hallucination discipline baked in from the start.

---

## What we built

### Deterministic scoring (`lib/scoring/customer.ts`)

Opportunity and risk are computed in code from the household's real trips and contacts, not guessed by a model. The model explains these numbers, it never invents or overrides them.

### Customer brief + trip match (`/api/customers/[id]/brief`)

- **Brief** (Sonnet): a short, warm internal brief grounded in a structured fact sheet. The model is told to use only those facts.
- **Trip match** (Haiku): one or two grounded destination ideas, returned as validated JSON. A match failure degrades to null and never fails the brief.
- Persists `ai_brief`, `ai_brief_at`, `ai_match` and writes an audit interaction to the customer timeline.

### Ask Luna (`lib/ask/*` + `/api/ask` + `components/luna-ask.tsx`)

A tool-use router: Claude picks from six typed query tools (trips departing, by destination, by stage, recently returned, revenue for a period, customers by value or tag), the tool runs the actual Supabase query, then Claude synthesises a short insight over the structured result. Plain-English reporting without handing raw rows to the model.

---

## The security pattern (used by every AI route)

- `ANTHROPIC_API_KEY` is read server-side only, never shipped to the client.
- Customer data goes in the **user** turn, never the system prompt, and the system prompt carries a prompt-injection decline clause, so a hostile note in the data cannot rewrite Luna's instructions.
- Output tokens are capped (a cost ceiling per call).
- Every route **fails closed**: any error returns a safe message and writes nothing false. Client errors are generic (no stack traces, no key leakage).
- House style is enforced in the prompt, not left to chance: UK English, warm and direct, no em dashes, no Oxford commas, no marketing filler. A belt-and-braces pass strips any em dash that slips through.

---

## Decisions

1. **Scores in code, prose from the model.** The model is good at explaining and bad at arithmetic, so it does the former and never the latter.
2. **Tools, not raw SQL from the model.** Claude chooses a tool and arguments; our code runs the query. The model never touches the database directly.
3. **Advisory features degrade, core features fail closed.** A missing trip match is invisible; a failed brief returns an honest "try again".
