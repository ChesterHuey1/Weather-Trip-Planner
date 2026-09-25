import { describe, expect, it } from "vitest";
import chicago from "./fixtures/openweather-chicago.json";
import { parseForecast } from "./openWeather";

describe("parseForecast", () => {
  const { slots, utcOffsetSec } = parseForecast(chicago);

  it("keeps every 3-hour slot and the city's UTC offset", () => {
    expect(slots).toHaveLength(40);
    expect(utcOffsetSec).toBe(-18000);
  });

  it("converts UTC times to Chicago wall-clock time", () => {
    // 2026-09-25 06:00 UTC is 01:00 in Chicago (UTC-5).
    expect(slots[0]).toMatchObject({ date: "2026-09-25", startMin: 60 });
  });

  it("reads temperature, rain chance as a percent, and wind", () => {
    expect(slots[0]).toMatchObject({ tempC: 17.29, rainPct: 0, windMs: 0.55, thunderstorm: false });
  });

  it("flags thunderstorms from the condition code", () => {
    const stormy = { ...chicago, list: [{ ...chicago.list[0], weather: [{ ...chicago.list[0].weather[0], id: 211 }] }] };
    expect(parseForecast(stormy).slots[0].thunderstorm).toBe(true);
  });
});
