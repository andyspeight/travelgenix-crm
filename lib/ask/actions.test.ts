import { describe, expect, it } from "vitest";
import {
  planAction,
  cleanTag,
  nameList,
  describeOutcome,
  findAction,
  MAX_TARGETS,
  type ActionTarget,
} from "@/lib/ask/actions";

const id = (n: number) => `3f2b1a44-0000-4000-8000-00000000000${n.toString(16)}`;
const SEQ = "3f2b1a44-0000-4000-8000-ffffffffffff";

const rows: ActionTarget[] = [
  { id: id(1), name: "Rachel Whitfield" },
  { id: id(2), name: "The Thompsons" },
  { id: id(3), name: "Priya Patel" },
];

const ids = rows.map((r) => r.id);

describe("nothing happens to anyone Luna did not show you", () => {
  it("ignores an id that was not in the result", () => {
    const plan = planAction(
      { action: "add_tag", targetIds: [...ids, id(9)], value: "vip" },
      rows
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.plan.targets).toHaveLength(3);
  });

  it("refuses when nothing valid is left", () => {
    const plan = planAction({ action: "add_tag", targetIds: ["not-a-uuid"], value: "vip" }, rows);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/nobody in that list/);
  });

  it("refuses a verb it does not have", () => {
    const plan = planAction(
      { action: "delete_everything" as never, targetIds: ids, value: "x" },
      rows
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/doesn't know how/);
  });
});

describe("the ceiling on bulk", () => {
  it("refuses more than a person could check, and says the number", () => {
    const many: ActionTarget[] = Array.from({ length: MAX_TARGETS + 12 }, (_, i) => ({
      id: `3f2b1a44-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Customer ${i}`,
    }));
    const plan = planAction(
      { action: "add_tag", targetIds: many.map((m) => m.id), value: "vip" },
      many
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.error).toMatch(String(MAX_TARGETS + 12));
      expect(plan.error).toMatch(/narrow the question down/);
    }
  });

  it("allows exactly the ceiling", () => {
    const many: ActionTarget[] = Array.from({ length: MAX_TARGETS }, (_, i) => ({
      id: `3f2b1a44-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Customer ${i}`,
    }));
    expect(planAction({ action: "add_tag", targetIds: many.map((m) => m.id), value: "vip" }, many).ok).toBe(true);
  });
});

describe("the plan an agent agrees to", () => {
  it("says the verb, the count and the words", () => {
    const plan = planAction(
      { action: "create_task", targetIds: ids, value: "Call about next summer" },
      rows
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.plan.summary).toBe('Create 3 tasks: "Call about next summer"');
    }
  });

  it("names who it will happen to", () => {
    const plan = planAction({ action: "add_tag", targetIds: ids, value: "winter sun" }, rows);
    if (plan.ok) expect(plan.plan.who).toBe("Rachel Whitfield, The Thompsons, Priya Patel");
  });

  it("shortens a long list rather than printing a wall", () => {
    const many: ActionTarget[] = Array.from({ length: 9 }, (_, i) => ({
      id: `3f2b1a44-0000-4000-8000-${String(i).padStart(12, "0")}`,
      name: `Customer ${i}`,
    }));
    expect(nameList(many)).toMatch(/and 6 more$/);
  });

  it("gets the singular right for one customer", () => {
    const plan = planAction({ action: "add_tag", targetIds: [ids[0]], value: "vip" }, rows);
    if (plan.ok) expect(plan.plan.summary).toBe('Tag 1 customer as "vip"');
  });

  it("promises no message is sent", () => {
    const plan = planAction({ action: "create_task", targetIds: ids, value: "Ring them" }, rows);
    if (plan.ok) expect(plan.plan.notes.join(" ")).toMatch(/Nothing is sent/);
  });
});

describe("the one action that could reach a customer says so", () => {
  it("spells out what auto-send would mean", () => {
    const plan = planAction(
      { action: "enrol_sequence", targetIds: ids, value: SEQ },
      rows,
      { sequenceName: "Quote chase" }
    );
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      const notes = plan.plan.notes.join(" ");
      expect(notes).toMatch(/stops on its own the moment someone replies/);
      expect(notes).toMatch(/auto-send/);
    }
  });

  it("refuses a sequence that is not the agency's", () => {
    const plan = planAction(
      { action: "enrol_sequence", targetIds: ids, value: SEQ },
      rows,
      { sequenceName: null }
    );
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/isn't one of yours/);
  });

  it("refuses when no sequence was picked", () => {
    expect(planAction({ action: "enrol_sequence", targetIds: ids, value: "" }, rows).ok).toBe(false);
  });
});

describe("what an agent is allowed to type", () => {
  it("wants a real task title", () => {
    expect(planAction({ action: "create_task", targetIds: ids, value: "ok" }, rows).ok).toBe(false);
    expect(planAction({ action: "create_task", targetIds: ids, value: "x".repeat(200) }, rows).ok).toBe(false);
  });

  it("cleans a tag rather than writing whatever arrived", () => {
    expect(cleanTag("  Winter Sun!!! <script>  ")).toBe("winter sun script");
    expect(cleanTag("VIP")).toBe("vip");
  });

  it("refuses a tag with nothing left in it", () => {
    expect(planAction({ action: "add_tag", targetIds: ids, value: "!!!" }, rows).ok).toBe(false);
  });
});

describe("what it says afterwards", () => {
  it("counts what happened, not what was asked for", () => {
    expect(describeOutcome("add_tag", 2, 1, "vip")).toBe(
      'Tagged 2 customers as "vip". 1 were already there.'
    );
  });

  it("admits when there was nothing to do", () => {
    expect(describeOutcome("add_tag", 0, 3, "vip")).toMatch(/all 3 were already there/);
  });

  it("does not claim success when nothing was written", () => {
    expect(describeOutcome("create_task", 0, 0, "x")).toBe("Nothing was changed.");
  });
});

describe("the action list itself", () => {
  it("describes every action, so no button is a mystery", () => {
    for (const action of ["create_task", "add_tag", "enrol_sequence"] as const) {
      const def = findAction(action)!;
      expect(def.label.length).toBeGreaterThan(3);
      expect(def.description.length).toBeGreaterThan(20);
    }
  });

  it("has no action that sends anything to a customer", () => {
    expect(findAction("create_task")!.description).toMatch(/Nothing is sent/);
  });
});
