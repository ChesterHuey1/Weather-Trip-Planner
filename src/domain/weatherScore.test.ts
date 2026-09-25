import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "./preferences";
import type { ForecastSlot } from "./types";
import { scoreSlots, slotAt } from "./weatherScore";

const prefs = { ...DEFAULT_PREFERENCES, comfortTempC: [15, 28] as [number, number], avoidRainAbovePct: 30 };

function slot(overrides: Partial<ForecastSlot>): ForecastSlot {
  return { date: "2026-10-01", startMin: 600, tempC: 20, rainPct: 0, windMs: 3, thunderstorm: false, ...overrides };
}

describe("scoreSlots", () => {
  it("gives a mild, dry, calm slot a full score", () => {
    const [s] = scoreSlots([slot({})], prefs);
    expect(s.outdoor).toBe(1);
    expect(s.reason).toBe("20°C, 0% rain at 10:00");
  });

  it("zeroes the score in a thunderstorm", () => {
    const [s] = scoreSlots([slot({ thunderstorm: true, startMin: 900 })], prefs);
    expect(s.outdoor).toBe(0);
    expect(s.reason).toBe("thunderstorm at 15:00");
  });

  it("does not penalize rain at or below the user's threshold", () => {
    const [s] = scoreSlots([slot({ rainPct: 30 })], prefs);
    expect(s.outdoor).toBe(1);
  });

  it("drops below the bad-weather line once rain passes the threshold", () => {
    const [s] = scoreSlots([slot({ rainPct: 70, startMin: 900 })], prefs);
    expect(s.outdoor).toBeLessThan(0.5);
    expect(s.reason).toBe("70% rain at 15:00");
  });

  it("scores certain rain as zero", () => {
    const [s] = scoreSlots([slot({ rainPct: 100 })], prefs);
    expect(s.outdoor).toBe(0);
  });

  it("lowers the score in proportion to degrees outside the comfort range", () => {
    const [cold, colder] = scoreSlots([slot({ tempC: 10 }), slot({ tempC: 4 })], prefs);
    expect(cold.outdoor).toBeCloseTo(0.5);
    expect(colder.outdoor).toBe(0);
    expect(cold.reason).toBe("10°C, below your 15 to 28°C range at 10:00");
  });

  it("uses the user's own comfort range", () => {
    const [s] = scoreSlots([slot({ tempC: 10 })], { ...prefs, comfortTempC: [5, 25] });
    expect(s.outdoor).toBe(1);
  });

  it("lowers the score in strong wind", () => {
    const [s] = scoreSlots([slot({ windMs: 15 })], prefs);
    expect(s.outdoor).toBeCloseTo(0.5);
    expect(s.reason).toBe("wind 15 m/s at 10:00");
  });
});

describe("slotAt", () => {
  it("finds the 3-hour slot that covers a minute on a date", () => {
    const slots = scoreSlots([slot({ startMin: 540 }), slot({ startMin: 720 })], prefs);
    expect(slotAt(slots, "2026-10-01", 719)?.startMin).toBe(540);
    expect(slotAt(slots, "2026-10-01", 720)?.startMin).toBe(720);
    expect(slotAt(slots, "2026-10-02", 720)).toBeNull();
  });
});
