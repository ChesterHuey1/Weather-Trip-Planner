import { describe, expect, it } from "vitest";
import { earliestStart, openWindows } from "./openHours";

// 2026-10-05 is a Monday.
const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";

describe("openWindows", () => {
  it("reads weekday hours in OpenStreetMap format", () => {
    const spec = "Tu-Su 10:00-18:00";
    expect(openWindows(spec, TUESDAY, "attraction")).toEqual({ windows: [[600, 1080]], confirmed: true });
    expect(openWindows(spec, MONDAY, "attraction")).toEqual({ windows: [], confirmed: true });
  });

  it("returns split windows for a midday break", () => {
    const { windows } = openWindows("Mo-Fr 09:00-12:00,14:00-17:00", MONDAY, "attraction");
    expect(windows).toEqual([
      [540, 720],
      [840, 1020],
    ]);
  });

  it("treats 24/7 as open all day", () => {
    expect(openWindows("24/7", MONDAY, "attraction").windows).toEqual([[0, 1440]]);
  });

  it("falls back to 10:00 to 17:00 for attractions with unknown hours", () => {
    expect(openWindows(null, MONDAY, "attraction")).toEqual({ windows: [[600, 1020]], confirmed: false });
  });

  it("falls back to meal times for restaurants with unknown hours", () => {
    expect(openWindows(null, MONDAY, "restaurant").windows).toEqual([
      [720, 840],
      [1080, 1230],
    ]);
  });

  it("treats unparseable hours as unknown", () => {
    expect(openWindows("ask at the desk", MONDAY, "attraction").confirmed).toBe(false);
  });
});

describe("earliestStart", () => {
  const windows: [number, number][] = [
    [540, 720],
    [840, 1020],
  ];

  it("starts on arrival when the place is open", () => {
    expect(earliestStart(windows, 600, 60)).toBe(600);
  });

  it("waits for opening when arriving early", () => {
    expect(earliestStart(windows, 500, 60)).toBe(540);
  });

  it("moves to the next window when the visit would not finish before closing", () => {
    expect(earliestStart(windows, 700, 60)).toBe(840);
  });

  it("returns null when no window fits the visit", () => {
    expect(earliestStart(windows, 1000, 60)).toBeNull();
  });

  it("respects a required start range", () => {
    const lunch = { earliest: 720, latest: 780 };
    expect(earliestStart([[600, 1320]], 650, 60, lunch)).toBe(720);
    expect(earliestStart([[600, 1320]], 790, 60, lunch)).toBeNull();
  });
});
