/**
 * Natural-language journey composition — the validation half.
 *
 * The flow (blueprint §9): the user describes a rule in plain English, Luna
 * translates it into a journey spec, THIS module decides whether that spec
 * is one the deterministic engine can actually run, and the user approves
 * before anything is activated. The model proposes; the whitelist disposes.
 *
 * Everything the model returns is treated as untrusted input: trigger and
 * action kinds are whitelisted, every number is clamped, every string is
 * trimmed and capped. A spec that survives validation is exactly a
 * JourneyDef the engine already knows how to evaluate — the AI never
 * extends the engine's vocabulary, it only speaks it.
 *
 * Pure functions, no I/O.
 */

import type { JourneyDef } from "./engine";

/** The trigger vocabulary the composer may use, with parameter bounds. */
export const COMPOSABLE_TRIGGERS = {
  days_to_departure: { params: { days: { min: 1, max: 365, fallback: 10 } } },
  days_after_return: { params: { days: { min: 1, max: 365, fallback: 3 } } },
  passport_expiring: { params: { days: { min: 30, max: 365, fallback: 180 } } },
  no_contact_period: { params: { months: { min: 1, max: 36, fallback: 12 } } },
  quote_unanswered: {
    params: {
      days: { min: 1, max: 60, fallback: 3 },
      min_value: { min: 0, max: 1_000_000, fallback: 0 },
    },
  },
} as const;

export type ComposableTrigger = keyof typeof COMPOSABLE_TRIGGERS;

export const COMPOSABLE_ACTIONS = ["create_task", "draft_email", "add_note"] as const;
export type ComposableAction = (typeof COMPOSABLE_ACTIONS)[number];

/** The raw shape the model is asked to produce. */
export type RawJourneySpec = {
  name?: unknown;
  description?: unknown;
  trigger?: unknown; // one of COMPOSABLE_TRIGGERS keys
  trigger_params?: unknown; // { days?, months?, min_value? }
  action?: unknown; // one of COMPOSABLE_ACTIONS
  task_title?: unknown; // when action = create_task
  explanation?: unknown; // plain-English restatement of what will happen
  caveats?: unknown; // anything asked for that could NOT be included
};

export type ComposeResult =
  | {
      ok: true;
      def: JourneyDef;
      explanation: string;
      caveats: string | null;
    }
  | { ok: false; error: string };

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const clamp = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

export function validateJourneySpec(raw: RawJourneySpec): ComposeResult {
  const triggerKey =
    typeof raw.trigger === "string" && raw.trigger in COMPOSABLE_TRIGGERS
      ? (raw.trigger as ComposableTrigger)
      : null;
  if (!triggerKey) {
    return {
      ok: false,
      error:
        "That rule needs a trigger Luna Work can't watch yet (it can watch departures, returns, passports, quiet customers and unanswered quotes).",
    };
  }

  const action =
    typeof raw.action === "string" &&
    (COMPOSABLE_ACTIONS as readonly string[]).includes(raw.action)
      ? (raw.action as ComposableAction)
      : null;
  if (!action) {
    return {
      ok: false,
      error:
        "That rule needs an action Luna can't take yet (she can create a task, draft an email for review, or add a note).",
    };
  }

  const name = str(raw.name, 80);
  if (!name) {
    return { ok: false, error: "The rule needs a short name." };
  }

  const explanation = str(raw.explanation, 500);
  if (!explanation) {
    return { ok: false, error: "Luna must explain the rule before it can be reviewed." };
  }

  // Clamp every parameter the trigger accepts; drop everything else.
  const bounds = COMPOSABLE_TRIGGERS[triggerKey].params as Record<
    string,
    { min: number; max: number; fallback: number }
  >;
  const rawParams = (raw.trigger_params ?? {}) as Record<string, unknown>;
  const params: Record<string, number> = {};
  for (const [key, b] of Object.entries(bounds)) {
    params[key] = clamp(rawParams[key], b.min, b.max, b.fallback);
  }

  // quote_unanswered runs as the engine's dispatchable custom rule, so no
  // database enum change is ever needed for new rule kinds.
  const isCustomRule = triggerKey === "quote_unanswered";
  const trigger_kind = isCustomRule ? ("custom" as const) : triggerKey;
  const trigger_config = isCustomRule ? { rule: "quote_unanswered", ...params } : params;

  const action_config: Record<string, unknown> = {};
  if (action === "create_task") {
    action_config.title = str(raw.task_title, 120) ?? name;
  }

  return {
    ok: true,
    def: {
      name,
      description: str(raw.description, 300) ?? explanation,
      trigger_kind,
      // The engine types trigger_config as numbers; the custom-rule marker
      // rides alongside them.
      trigger_config: trigger_config as JourneyDef["trigger_config"],
      action_kind: action,
      action_config,
    },
    explanation,
    caveats: str(raw.caveats, 400),
  };
}
