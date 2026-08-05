import { describe, expect, it } from "vitest";
import { describeWeather } from "@/lib/weather/open-meteo";

describe("describeWeather", () => {
  it("maps clear and cloudy codes", () => {
    expect(describeWeather(0).label).toBe("Clear");
    expect(describeWeather(3).label).toBe("Overcast");
  });

  it("maps rain, snow and storms", () => {
    expect(describeWeather(61).label).toBe("Light rain");
    expect(describeWeather(75).label).toBe("Heavy snow");
    expect(describeWeather(95).label).toBe("Thunderstorm");
  });

  it("always returns an emoji", () => {
    for (const code of [0, 45, 51, 66, 71, 82, 96]) {
      expect(describeWeather(code).emoji.length).toBeGreaterThan(0);
    }
  });

  it("falls back gracefully for an unknown code", () => {
    expect(describeWeather(999)).toEqual({ label: "—", emoji: "🌡️" });
  });
});
