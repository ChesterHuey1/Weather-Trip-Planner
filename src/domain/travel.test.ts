import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES } from "./preferences";
import { place, straightLineTravel } from "./testFixtures";
import { makeLegChooser } from "./travel";
import { HOTEL_ID, type LngLat } from "./types";

const hotel: LngLat = [0, 40];
// About 1.1 km north (14 min walk) and 11 km north (139 min walk).
const near = place({ id: "near", location: [0, 40.01] });
const far = place({ id: "far", location: [0, 40.1] });
const travel = straightLineTravel(hotel, [near, far]);

describe("makeLegChooser", () => {
  it("walks a short leg in good weather", () => {
    const leg = makeLegChooser(travel, DEFAULT_PREFERENCES)(HOTEL_ID, "near", false);
    expect(leg?.mode).toBe("walk");
    expect(leg?.minutes).toBe(14);
  });

  it("takes the fastest mode when the walk is longer than the user's limit", () => {
    expect(makeLegChooser(travel, DEFAULT_PREFERENCES)(HOTEL_ID, "far", false)?.mode).toBe("drive");
  });

  it("drives a short leg in bad weather", () => {
    expect(makeLegChooser(travel, DEFAULT_PREFERENCES)(HOTEL_ID, "near", true)?.mode).toBe("drive");
  });

  it("only uses the modes the user allows", () => {
    const prefs = { ...DEFAULT_PREFERENCES, modes: ["walk" as const, "cycle" as const] };
    expect(makeLegChooser(travel, prefs)(HOTEL_ID, "far", false)?.mode).toBe("cycle");
  });

  it("walks a long leg when walking is the only allowed mode", () => {
    const prefs = { ...DEFAULT_PREFERENCES, modes: ["walk" as const] };
    expect(makeLegChooser(travel, prefs)(HOTEL_ID, "far", false)?.mode).toBe("walk");
  });

  it("returns null for a place missing from the matrix", () => {
    expect(makeLegChooser(travel, DEFAULT_PREFERENCES)(HOTEL_ID, "unknown", false)).toBeNull();
  });
});
