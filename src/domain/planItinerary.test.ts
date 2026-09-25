import { describe, expect, it } from "vitest";
import { planItinerary, type PlanInput } from "./planItinerary";
import { DEFAULT_PREFERENCES } from "./preferences";
import { place, restaurant, straightLineTravel } from "./testFixtures";
import { HOTEL_ID, type ForecastSlot, type LngLat, type Place } from "./types";
import { scoreSlots } from "./weatherScore";

const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";
const hotel: LngLat = [0, 40];

function plan(places: Place[], overrides: Partial<PlanInput> = {}) {
  return planItinerary({
    hotel,
    places,
    slots: [],
    prefs: DEFAULT_PREFERENCES,
    travel: straightLineTravel(hotel, places),
    dates: [MONDAY],
    ...overrides,
  });
}

function forecast(date: string, rainByStart: Record<number, number>): ForecastSlot[] {
  return Object.entries(rainByStart).map(([start, rainPct]) => ({
    date,
    startMin: Number(start),
    tempC: 20,
    rainPct,
    windMs: 3,
    thunderstorm: false,
  }));
}

const lunchSpot = restaurant("lunch-spot", [0.002, 40.002]);
const dinnerSpot = restaurant("dinner-spot", [-0.002, 40.002]);

describe("planItinerary", () => {
  it("starts and ends each day at the hotel", () => {
    const [day] = plan([place({ id: "museum", location: [0, 40.005] }), lunchSpot, dinnerSpot]).days;
    expect(day.legs[0].from).toBe(HOTEL_ID);
    expect(day.legs.at(-1)?.to).toBe(HOTEL_ID);
    expect(day.legs).toHaveLength(day.visits.length + 1);
  });

  it("starts lunch between 12:00 and 13:00 and dinner between 18:00 and 19:00", () => {
    const places = [
      place({ id: "a", location: [0, 40.005], durationMin: 150 }),
      place({ id: "b", location: [0.005, 40], durationMin: 150 }),
      lunchSpot,
      dinnerSpot,
    ];
    const [day] = plan(places).days;
    const lunch = day.visits.find((v) => v.role === "lunch")!;
    const dinner = day.visits.find((v) => v.role === "dinner")!;
    expect(lunch.startMin).toBeGreaterThanOrEqual(720);
    expect(lunch.startMin).toBeLessThanOrEqual(780);
    expect(lunch.endMin - lunch.startMin).toBe(60);
    expect(dinner.startMin).toBeGreaterThanOrEqual(1080);
    expect(dinner.startMin).toBeLessThanOrEqual(1140);
    expect(dinner.endMin - dinner.startMin).toBe(90);
  });

  it("does not use the same restaurant twice", () => {
    const places = [place({ id: "a", location: [0, 40.005] }), place({ id: "b", location: [0, 40.006] })];
    const restaurants = [0, 1, 2, 3].map((i) => restaurant(`r${i}`, [0.001 * i, 40.001]));
    const { days } = plan([...places, ...restaurants], { dates: [MONDAY, TUESDAY] });
    const meals = days.flatMap((d) => d.visits.filter((v) => v.role !== "attraction").map((v) => v.placeId));
    expect(meals).toHaveLength(4);
    expect(new Set(meals).size).toBe(4);
  });

  it("puts an outdoor attraction in the morning when the afternoon is rainy", () => {
    const places = [
      place({ id: "park", location: [0, 40.005], setting: "outdoor", durationMin: 90 }),
      place({ id: "museum", location: [0.005, 40], setting: "indoor", durationMin: 180 }),
      lunchSpot,
      dinnerSpot,
    ];
    const slots = scoreSlots(forecast(MONDAY, { 540: 0, 720: 90, 900: 90, 1080: 90 }), DEFAULT_PREFERENCES);
    const [day] = plan(places, { slots }).days;
    const park = day.visits.find((v) => v.placeId === "park")!;
    const museum = day.visits.find((v) => v.placeId === "museum")!;
    expect(park.startMin).toBeLessThan(720);
    expect(park.reason).toBe("Outdoor: 20°C, 0% rain at 09:00");
    expect(museum.startMin).toBeGreaterThanOrEqual(780);
  });

  it("puts the outdoor-heavy area on the day with better weather", () => {
    const outdoorArea = [0, 1].map((i) =>
      place({ id: `hike${i}`, location: [0.001 * i, 40.05], setting: "outdoor" }),
    );
    const indoorArea = [0, 1].map((i) => place({ id: `gallery${i}`, location: [0.001 * i, 39.95] }));
    const slots = scoreSlots(
      [...forecast(MONDAY, { 540: 90, 720: 90, 900: 90, 1080: 90 }), ...forecast(TUESDAY, { 540: 0, 720: 0, 900: 0, 1080: 0 })],
      DEFAULT_PREFERENCES,
    );
    const { days } = plan([...outdoorArea, ...indoorArea], { slots, dates: [MONDAY, TUESDAY] });
    const ids = (i: number) => days[i].visits.map((v) => v.placeId).sort();
    expect(ids(0)).toEqual(["gallery0", "gallery1"]);
    expect(ids(1)).toEqual(["hike0", "hike1"]);
  });

  it("keeps each day in one area", () => {
    const north = [0, 1, 2].map((i) => place({ id: `n${i}`, location: [0.001 * i, 40.05] }));
    const south = [0, 1, 2].map((i) => place({ id: `s${i}`, location: [0.001 * i, 39.95] }));
    const { days } = plan([...north, ...south], { dates: [MONDAY, TUESDAY] });
    for (const day of days) {
      const prefixes = new Set(day.visits.map((v) => v.placeId[0]));
      expect(prefixes.size).toBe(1);
    }
  });

  it("orders stops to keep travel short", () => {
    // Four stops on a line north of the hotel, listed out of order.
    const stops = [3, 1, 4, 2].map((k) => place({ id: `p${k}`, location: [0, 40 + 0.004 * k], durationMin: 45 }));
    const [day] = plan(stops).days;
    const order = day.visits.map((v) => v.placeId);
    expect([order, [...order].reverse()]).toContainEqual(["p1", "p2", "p3", "p4"]);
  });

  it("never schedules a visit outside opening hours", () => {
    const places = [
      place({ id: "late-opener", location: [0, 40.005], openingHours: "Mo-Su 14:00-17:00", durationMin: 60 }),
      place({ id: "closed-monday", location: [0, 40.006], openingHours: "Tu-Su 10:00-18:00" }),
    ];
    const [day] = plan(places).days;
    const late = day.visits.find((v) => v.placeId === "late-opener")!;
    expect(late.startMin).toBeGreaterThanOrEqual(840);
    expect(late.endMin).toBeLessThanOrEqual(1020);
    expect(day.unscheduled).toEqual([{ placeId: "closed-monday", why: "Closed on this day." }]);
  });

  it("limits places with unknown hours to 10:00 to 17:00 and marks them", () => {
    const [day] = plan([place({ id: "mystery", location: [0, 40.005], openingHours: null })]).days;
    const [visit] = day.visits;
    expect(visit.hoursConfirmed).toBe(false);
    expect(visit.startMin).toBeGreaterThanOrEqual(600);
    expect(visit.endMin).toBeLessThanOrEqual(1020);
  });

  it("leaves out attractions with avoided tags", () => {
    const places = [
      place({ id: "trail", location: [0, 40.005], tags: ["hiking"] }),
      place({ id: "museum", location: [0, 40.006], tags: ["museum"] }),
    ];
    const [day] = plan(places, { prefs: { ...DEFAULT_PREFERENCES, avoidTags: ["hiking"] } }).days;
    expect(day.visits.map((v) => v.placeId)).toEqual(["museum"]);
  });

  it("fills the day by visit length instead of a fixed count", () => {
    const short = [0, 1, 2, 3, 4, 5].map((i) =>
      place({ id: `short${i}`, location: [0.001 * i, 40.003], durationMin: 30 }),
    );
    const long = [0, 1, 2, 3, 4, 5].map((i) =>
      place({ id: `long${i}`, location: [0.001 * i, 40.003], durationMin: 240 }),
    );
    const shortDay = plan([...short, lunchSpot, dinnerSpot]).days[0];
    const longDay = plan([...long, lunchSpot, dinnerSpot]).days[0];
    const count = (d: typeof shortDay) => d.visits.filter((v) => v.role === "attraction").length;
    expect(count(shortDay)).toBe(6);
    expect(count(longDay)).toBeLessThan(count(shortDay));
    expect(longDay.unscheduled.every((u) => u.why === "Did not fit in the day.")).toBe(true);
  });

  it("says when a day has no forecast", () => {
    const [day] = plan([place({ id: "park", location: [0, 40.005], setting: "outdoor" })]).days;
    expect(day.visits[0].reason).toBe("Outdoor: no forecast yet");
  });

  it("gives each day its own color in date order", () => {
    const { days } = plan([place({ id: "a", location: [0, 40.005] })], { dates: [MONDAY, TUESDAY] });
    expect(days.map((d) => d.colorIndex)).toEqual([0, 1]);
  });
});
