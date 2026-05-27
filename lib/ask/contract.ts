/**
 * Luna Ask — the query engine contract.
 *
 * This is the SPINE of the natural-language layer. Everything hangs off it:
 *   - the structured query tools (v1)
 *   - the AI router that picks a tool from a plain-English question
 *   - the future AI-SQL escape hatch (implements the same QueryResult shape)
 *   - the future "act" layer (send email/SMS) operates on a QueryResult's rows
 *
 * The core idea, per Andy: every answer has three layers.
 *   1. DATA    — the raw rows that answer the question (structured, typed).
 *   2. OUTPUT  — how those rows render (list / number / table).
 *   3. INSIGHT — the Luna layer: the "so what" a sharp analyst would add.
 *
 * Crucially, the INSIGHT is grounded in deterministic SIGNALS computed in code
 * (tight connection, passport risk, VIP in set, missing pre-departure task),
 * NOT invented by the model. The AI narrates the signals; it never fabricates
 * them. Same hybrid discipline as the customer brief engine.
 */

// ─── The shape of an answer ─────────────────────────────────────────────────

export type ResultShape = "list" | "number" | "table" | "empty";

/** A row in a list/table result. Generic so any tool can populate it. */
export type ResultRow = {
  /** Stable id for linking (usually a household or trip id). */
  id: string;
  /** Link target within the app, e.g. `/customers/{id}`. Optional. */
  href?: string;
  /** Primary label, e.g. "Sarah & James Thompson". */
  title: string;
  /** Secondary line, e.g. "Crete · 5–12 May · £8.4k". */
  subtitle?: string;
  /** Small tags shown on the row, e.g. ["VIP", "Tight connection"]. */
  badges?: string[];
  /** Arbitrary extra fields for table columns / downstream actions. */
  meta?: Record<string, string | number | null>;
};

/**
 * A deterministic signal worth flagging — computed in code, never by the LLM.
 * The Luna insight layer is built from these, so the "wow" is always TRUE.
 */
export type Signal = {
  /** Machine key, e.g. "passport_risk", "tight_connection", "vip_in_set". */
  kind: string;
  /** Human one-liner, e.g. "2 travellers have under 6 months passport margin". */
  detail: string;
  /** Optional ids this signal relates to, for highlighting. */
  rowIds?: string[];
  /** Severity drives ordering + colour in the UI. */
  severity?: "info" | "opportunity" | "warning";
};

/**
 * The structured result a tool returns. The AI insight prose is added AFTER
 * this, by the router, grounded in `summary` + `signals`.
 */
export type QueryResult = {
  shape: ResultShape;
  /** A plain, factual one-line summary of the result (no spin). */
  summary: string;
  /** For shape:"number" — the headline figure, pre-formatted. */
  value?: string;
  /** For shape:"list"/"table" — the rows. */
  rows?: ResultRow[];
  /** For shape:"table" — column headers in order (keys into row.meta). */
  columns?: { key: string; label: string }[];
  /** Deterministic signals for the Luna insight layer. */
  signals: Signal[];
  /**
   * Whether this result CAN be acted on (email/SMS the rows) in a later phase.
   * Pure-number results, for example, are not actionable.
   */
  actionable: boolean;
};

// ─── The tool interface ─────────────────────────────────────────────────────

/**
 * A query tool. v1 tools are hand-written and safe. The AI-SQL fallback will
 * implement this same interface, so the router, renderer and action layer
 * never need to know which kind produced the result.
 *
 * `paramsSchema` is a plain JSON-schema-ish description the AI router uses to
 * understand what the tool needs and to extract parameters from the question.
 */
export type QueryTool = {
  /** Unique tool name, e.g. "trips_departing". */
  name: string;
  /** What it answers, in plain language — used by the router to choose it. */
  description: string;
  /** Example questions that should route here (helps the model choose well). */
  examples: string[];
  /** The parameters this tool accepts. */
  params: ToolParam[];
  /** Runs the query. Receives validated params + an agency-scoped context. */
  run: (args: Record<string, unknown>, ctx: QueryContext) => Promise<QueryResult>;
};

export type ToolParam = {
  name: string;
  type: "string" | "number" | "date" | "daterange" | "enum";
  required: boolean;
  description: string;
  /** For type:"enum" — the allowed values. */
  options?: string[];
};

/**
 * Everything a tool needs to run safely. The Supabase client here is ALWAYS
 * agency-scoped at the call site — tools never see another agency's data.
 */
export type QueryContext = {
  agencyId: string;
  // Supabase client injected by the route; typed loosely to avoid coupling the
  // contract to the client's generated types.
  db: {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  /** "Now" is injected so date logic is testable and consistent. */
  now: Date;
};

// ─── Helpers shared by tools ────────────────────────────────────────────────

export function emptyResult(summary: string): QueryResult {
  return { shape: "empty", summary, signals: [], actionable: false };
}

export function numberResult(value: string, summary: string, signals: Signal[] = []): QueryResult {
  return { shape: "number", value, summary, signals, actionable: false };
}

export function listResult(
  rows: ResultRow[],
  summary: string,
  signals: Signal[] = [],
  actionable = true
): QueryResult {
  if (rows.length === 0) return emptyResult(summary);
  return { shape: "list", rows, summary, signals, actionable };
}
