import { describe, expect, it } from "vitest";
import { detectTrends, type TrendInputs } from "@/lib/trends/detect";

const NOW = new Date("2026-07-24T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const base = (): TrendInputs => ({ trips: [], enquiries: [], now: NOW, windowDays: 60 });

const enquiry = (over: Partial<TrendInputs["enquiries"][number]> = {}) => ({
  destination: null,
  received_at: daysAgo(10),
  first_response_at: null,
  status: "responded",
  ...over,
});

const trip = (over: Partial<TrendInputs["trips"][number]> = {}) => ({
  stage: "booked",
  destination: null,
  total_value: 3000,
  created_at: daysAgo(10),
  updated_at: null,
  ...over,
});

describe("detectTrends — honesty rules", () => {
  it("says nothing at all on empty data", () => {
    expect(detectTrends(base())).toHaveLength(0);
  });

  it("refuses to call a trend below the minimum sample", () => {
    // 3 vs 1 enquiries is a 200% 'rise' — and statistically nothing.
    const inputs = base();
    inputs.enquiries = [
      enquiry({ received_at: daysAgo(5) }),
      enquiry({ received_at: daysAgo(6) }),
      enquiry({ received_at: daysAgo(7) }),
      enquiry({ received_at: daysAgo(70) }),
    ];
    expect(detectTrends(inputs).find((t) => t.kind === "enquiry_volume")).toBeUndefined();
  });
});

describe("detectTrends — the signals", () => {
  it("spots an enquiry surge with both numbers in the receipt", () => {
    const inputs = base();
    inputs.enquiries = [
      ...Array.from({ length: 10 }, (_, i) => enquiry({ received_at: daysAgo(3 + i) })),
      ...Array.from({ length: 5 }, (_, i) => enquiry({ received_at: daysAgo(65 + i) })),
    ];
    const t = detectTrends(inputs).find((x) => x.kind === "enquiry_volume");
    expect(t).toBeDefined();
    expect(t!.direction).toBe("up");
    expect(t!.headline).toMatch(/up 100%/);
    expect(t!.detail).toMatch(/10 vs 5/);
  });

  it("names a rising destination", () => {
    const inputs = base();
    inputs.enquiries = [
      ...Array.from({ length: 5 }, (_, i) =>
        enquiry({ destination: "Cyprus", received_at: daysAgo(4 + i) })
      ),
      enquiry({ destination: "Cyprus", received_at: daysAgo(70) }),
    ];
    const t = detectTrends(inputs).find(
      (x) => x.kind === "destination_demand" && x.direction === "up"
    );
    expect(t).toBeDefined();
    expect(t!.headline).toMatch(/Cyprus interest is rising/);
    expect(t!.detail).toMatch(/5 enquiries\/trips vs 1/);
  });

  it("flags slower first responses as bad news", () => {
    const inputs = base();
    const answered = (recvDaysAgo: number, minutes: number) =>
      enquiry({
        received_at: daysAgo(recvDaysAgo),
        first_response_at: new Date(
          NOW.getTime() - recvDaysAgo * 86_400_000 + minutes * 60_000
        ).toISOString(),
      });
    inputs.enquiries = [
      // current window: ~4h averages
      answered(5, 240), answered(8, 250), answered(12, 230), answered(20, 240),
      // previous window: ~1h averages
      answered(65, 60), answered(70, 55), answered(80, 65), answered(90, 60),
    ];
    const t = detectTrends(inputs).find((x) => x.kind === "response_time");
    expect(t).toBeDefined();
    expect(t!.tone).toBe("bad");
    expect(t!.headline).toMatch(/slower/);
  });

  it("reads conversion from resolved enquiries only", () => {
    const inputs = base();
    const resolved = (recvDaysAgo: number, status: string) =>
      enquiry({ received_at: daysAgo(recvDaysAgo), status });
    inputs.enquiries = [
      // current: 1/5 converted (20%) — open 'new' ones excluded from the base
      resolved(5, "converted"), resolved(6, "closed"), resolved(7, "closed"),
      resolved(8, "closed"), resolved(9, "responded"), resolved(10, "new"),
      // previous: 3/5 converted (60%)
      resolved(65, "converted"), resolved(66, "converted"), resolved(67, "converted"),
      resolved(68, "closed"), resolved(69, "responded"),
    ];
    const t = detectTrends(inputs).find((x) => x.kind === "conversion");
    expect(t).toBeDefined();
    expect(t!.direction).toBe("down");
    expect(t!.detail).toMatch(/1\/5 converted vs 3\/5/);
  });

  it("raises cancellations and average-value shifts, bad news sorted first", () => {
    const inputs = base();
    inputs.trips = [
      // cancellations: 3 now vs 1 before
      trip({ stage: "cancelled", updated_at: daysAgo(5) }),
      trip({ stage: "cancelled", updated_at: daysAgo(6) }),
      trip({ stage: "cancelled", updated_at: daysAgo(7) }),
      trip({ stage: "cancelled", updated_at: daysAgo(70) }),
      // bookings: avg £2k now vs £4k before
      ...Array.from({ length: 4 }, (_, i) => trip({ created_at: daysAgo(3 + i), total_value: 2000 })),
      ...Array.from({ length: 4 }, (_, i) => trip({ created_at: daysAgo(65 + i), total_value: 4000 })),
    ];
    const trends = detectTrends(inputs);
    expect(trends.find((x) => x.kind === "cancellations")).toBeDefined();
    const value = trends.find((x) => x.kind === "booking_value");
    expect(value).toBeDefined();
    expect(value!.direction).toBe("down");
    // bad tones lead the list
    expect(trends[0].tone).toBe("bad");
  });
});
