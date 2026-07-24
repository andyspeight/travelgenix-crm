import { describe, expect, it } from "vitest";
import { validateJourneySpec } from "@/lib/journeys/compose";
import { evaluateJourney, describeFlow, type EvalContext, type Journey } from "@/lib/journeys/engine";

const good = () => ({
  name: "Chase big quiet quotes",
  description: "Follow up high-value quotes that have gone quiet.",
  trigger: "quote_unanswered",
  trigger_params: { days: 3, min_value: 5000 },
  action: "create_task",
  task_title: "Call about the unanswered quote",
  explanation:
    "When a quote over £5,000 has had no reply for 3 days, Luna creates a call task for the consultant.",
  caveats: "Alerting the sales manager isn't supported yet, so this creates the task only.",
});

describe("validateJourneySpec", () => {
  it("accepts the blueprint's own example and maps it onto the engine", () => {
    const r = validateJourneySpec(good());
    if (!r.ok) throw new Error(r.error);
    expect(r.def.trigger_kind).toBe("custom");
    expect(r.def.trigger_config).toEqual({ rule: "quote_unanswered", days: 3, min_value: 5000 });
    expect(r.def.action_kind).toBe("create_task");
    expect(r.def.action_config.title).toBe("Call about the unanswered quote");
    expect(r.caveats).toMatch(/sales manager/);
  });

  it("rejects triggers and actions outside the whitelist", () => {
    const badTrigger = validateJourneySpec({ ...good(), trigger: "customer_sneezes" });
    expect(badTrigger.ok).toBe(false);
    const badAction = validateJourneySpec({ ...good(), action: "send_sms" });
    expect(badAction.ok).toBe(false);
    if (!badAction.ok) expect(badAction.error).toMatch(/can't take yet/);
  });

  it("clamps every number and survives junk parameters", () => {
    const r = validateJourneySpec({
      ...good(),
      trigger_params: { days: 9999, min_value: -50, nonsense: "drop me" },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.def.trigger_config).toEqual({ rule: "quote_unanswered", days: 60, min_value: 0 });
  });

  it("falls back to defaults when parameters are missing", () => {
    const r = validateJourneySpec({
      name: "Pre-departure call",
      trigger: "days_to_departure",
      trigger_params: {},
      action: "create_task",
      explanation: "Creates a call task before departure.",
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.def.trigger_kind).toBe("days_to_departure");
    expect(r.def.trigger_config).toEqual({ days: 10 });
    // Task title falls back to the rule name.
    expect(r.def.action_config.title).toBe("Pre-departure call");
  });

  it("requires a name and an explanation — no rule activates unexplained", () => {
    expect(validateJourneySpec({ ...good(), name: "  " }).ok).toBe(false);
    expect(validateJourneySpec({ ...good(), explanation: undefined }).ok).toBe(false);
  });
});

describe("describeFlow — the When → If → Then strip", () => {
  it("draws the quote rule with its threshold and the task it creates", () => {
    const r = validateJourneySpec(good());
    if (!r.ok) throw new Error(r.error);
    const flow = describeFlow({ ...r.def });
    expect(flow.when).toBe("A quote is awaiting a reply");
    expect(flow.condition).toBe("Over £5,000 · unanswered 3+ days");
    expect(flow.then).toBe("Create task: Call about the unanswered quote");
  });

  it("covers every built-in trigger with a distinct watch phrase", () => {
    const flows = [
      describeFlow({ trigger_kind: "days_to_departure", trigger_config: { days: 10 }, action_kind: "create_task", action_config: {} }),
      describeFlow({ trigger_kind: "days_after_return", trigger_config: { days: 3 }, action_kind: "draft_email", action_config: {} }),
      describeFlow({ trigger_kind: "passport_expiring", trigger_config: { days: 180 }, action_kind: "create_task", action_config: {} }),
      describeFlow({ trigger_kind: "no_contact_period", trigger_config: { months: 12 }, action_kind: "add_note", action_config: {} }),
    ];
    expect(new Set(flows.map((f) => f.when)).size).toBe(4);
    expect(flows[1].then).toBe("Draft an email for review");
    expect(flows[3].condition).toBe("No contact for 12 months");
  });
});

describe("the validated spec runs in the real engine", () => {
  it("quote_unanswered matches exactly the quotes it should", () => {
    const r = validateJourneySpec(good());
    if (!r.ok) throw new Error(r.error);

    const journey: Journey = {
      id: "j1",
      agency_id: "a",
      is_active: true,
      last_run_at: null,
      created_at: "",
      updated_at: "",
      ...r.def,
    };

    const now = new Date("2026-07-24T12:00:00.000Z");
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
    const quote = (over: Record<string, unknown>) => ({
      id: "q",
      trip_id: "t",
      household_id: "h",
      status: "viewed",
      sent_at: daysAgo(5),
      total_price: 8600,
      customer_response: null,
      view_count: 4,
      ...over,
    });

    const ctx: EvalContext = {
      now,
      households: [],
      trips: [],
      contacts: [],
      lastContactByHousehold: new Map(),
      quotes: [
        quote({ id: "match" }) as never,
        quote({ id: "too-cheap", total_price: 900 }) as never,
        quote({ id: "too-fresh", sent_at: daysAgo(1) }) as never,
        quote({ id: "answered", customer_response: "thinking it over" }) as never,
        quote({ id: "resolved", status: "accepted" }) as never,
      ],
    };

    const candidates = evaluateJourney(journey, ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].reason).toMatch(/£8,600 quote sent 5 days ago with no reply \(viewed 4 times\)/);
  });

  it("matches nothing when quotes aren't loaded — absent data never misfires", () => {
    const r = validateJourneySpec(good());
    if (!r.ok) throw new Error(r.error);
    const journey = {
      id: "j1", agency_id: "a", is_active: true, last_run_at: null,
      created_at: "", updated_at: "", ...r.def,
    } as Journey;
    const ctx: EvalContext = {
      now: new Date(),
      households: [],
      trips: [],
      contacts: [],
      lastContactByHousehold: new Map(),
    };
    expect(evaluateJourney(journey, ctx)).toHaveLength(0);
  });
});
