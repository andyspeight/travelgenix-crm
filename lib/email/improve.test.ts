import { describe, expect, it } from "vitest";
import {
  checkRewrite,
  factsIn,
  repairHouseStyle,
  hasBlocking,
  buildImproveSystem,
  improveInstruction,
} from "@/lib/email/improve";

describe("the line it must not cross", () => {
  const draft = "Hi Rachel, the Crete week in August comes to £2,480 for the four of you. Can you confirm?";

  it("catches a price nobody quoted", () => {
    const issues = checkRewrite(draft, draft.replace("£2,480", "£2,480, with a £200 deposit"));
    expect(issues.some((i) => i.kind === "added_fact" && i.what === "200")).toBe(true);
    expect(hasBlocking(issues)).toBe(true);
  });

  it("catches an invented date", () => {
    const issues = checkRewrite(draft, "Hi Rachel, the Crete week in August comes to £2,480 for the four of you. I'll hold it until 14 August. Can you confirm?");
    expect(hasBlocking(issues)).toBe(true);
  });

  it("catches a link that was not in the draft", () => {
    const issues = checkRewrite(draft, `${draft} Book here: https://example.com/pay`);
    expect(issues.find((i) => i.kind === "added_fact")?.what).toContain("example.com");
  });

  it("passes a genuine rewrite that adds nothing", () => {
    const issues = checkRewrite(
      draft,
      "Hi Rachel, your week in Crete this August works out at £2,480 for all four of you. Could you confirm?"
    );
    expect(hasBlocking(issues)).toBe(false);
  });

  it("does not cry wolf when a number word becomes a digit", () => {
    const issues = checkRewrite("We can hold it for two days.", "We can hold it for 2 days.");
    expect(hasBlocking(issues)).toBe(false);
  });

  it("treats 1,240 and 1240 as the same price", () => {
    expect(factsIn("£1,240").has("1240")).toBe(true);
    expect(hasBlocking(checkRewrite("It is £1,240.", "It comes to £1240."))).toBe(false);
  });

  it("mentions a fact the rewrite quietly dropped, without blocking it", () => {
    const issues = checkRewrite(draft, "Hi Rachel, could you confirm the Crete week for the four of you?");
    const dropped = issues.find((i) => i.kind === "dropped_fact" && i.what === "2480");
    expect(dropped).toBeDefined();
    expect(dropped!.blocking).toBe(false);
  });
});

describe("house style", () => {
  it("repairs an em dash rather than nagging about it", () => {
    expect(repairHouseStyle("It's ready — almost.")).toBe("It's ready, almost.");
  });

  it("does not leave a comma stranded before a full stop", () => {
    expect(repairHouseStyle("Ready —.")).toBe("Ready.");
  });

  it("flags marketing words the agent did not write", () => {
    const issues = checkRewrite("We'll sort the transfers.", "We'll seamlessly handle your transfers.");
    expect(issues.some((i) => i.kind === "banned_word" && i.what === "seamlessly")).toBe(true);
  });

  it("does not flag a word the agent used themselves", () => {
    const issues = checkRewrite("It's a robust option.", "It is a robust option.");
    expect(issues.some((i) => i.kind === "banned_word")).toBe(false);
  });

  it("notices a rewrite that has padded the draft out", () => {
    const short = "Can you confirm the dates please, and let me know about the bags?";
    const long = short + " " + "I hope this email finds you well and that you are having a lovely week so far.".repeat(2);
    expect(checkRewrite(short, long).some((i) => i.kind === "much_longer")).toBe(true);
  });
});

describe("the instructions", () => {
  it("tells the model the rule that matters, first", () => {
    expect(buildImproveSystem("polish")).toMatch(/NEVER add a fact/);
  });

  it("treats the draft as text, not as instructions", () => {
    expect(buildImproveSystem("polish")).toMatch(/TEXT TO EDIT/);
  });

  it("keeps spelling mode to spelling", () => {
    expect(improveInstruction("spelling")).toMatch(/Do not reword/);
  });

  it("carries the request into the prompt", () => {
    expect(buildImproveSystem("shorter")).toContain("fewer words");
  });
});
