import { clusterByDay } from "./clusterByDay";
import { centroid, distanceMeters } from "./geo";
import { DINNER, LUNCH, earliestStart, openWindows } from "./openHours";
import { planDay } from "./planDay";
import { makeLegChooser } from "./travel";
import type { DayPlan, Itinerary, LngLat, Place, Preferences, SlotScore, TravelMatrix } from "./types";

// Exhaustive ordering stays fast up to this many attractions per day.
export const MAX_ATTRACTIONS_PER_DAY = 8;
export const RESTAURANT_OPTIONS_PER_MEAL = 3;

const NO_FORECAST_QUALITY = 0.5;

export type PlanInput = {
  hotel: LngLat;
  places: Place[];
  slots: SlotScore[];
  prefs: Preferences;
  travel: TravelMatrix;
  dates: string[];
};

export function planItinerary({ hotel, places, slots, prefs, travel, dates }: PlanInput): Itinerary {
  const avoid = new Set(prefs.avoidTags);
  const like = new Set(prefs.likeTags);
  const allowed = places.filter((p) => !p.tags.some((t) => avoid.has(t)));
  const likeCount = (p: Place) => p.tags.filter((t) => like.has(t)).length;

  const ranked = allowed
    .filter((p) => p.kind === "attraction")
    .sort((a, b) => likeCount(b) - likeCount(a) || a.id.localeCompare(b.id));
  const rank = new Map(ranked.map((p, i) => [p.id, i]));
  const pool = ranked.slice(0, dates.length * MAX_ATTRACTIONS_PER_DAY);
  const clusters = clusterByDay(pool, dates.length, MAX_ATTRACTIONS_PER_DAY).map((c) =>
    c.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!),
  );

  const clusterForDate = pairClustersWithDays(clusters, dates, slots, prefs);
  const restaurants = allowed.filter((p) => p.kind === "restaurant");
  const usedRestaurants = new Set<string>();
  const chooseLeg = makeLegChooser(travel, prefs);

  const days: DayPlan[] = dates.map((date, colorIndex) => {
    const attractions = clusterForDate.get(date) ?? [];
    const center = attractions.length > 0 ? centroid(attractions.map((p) => p.location)) : hotel;
    const lunchOptions = nearestOpenRestaurants(restaurants, center, date, LUNCH, usedRestaurants);
    const dinnerOptions = nearestOpenRestaurants(restaurants, center, date, DINNER, usedRestaurants);

    const day = planDay({ date, attractions, lunchOptions, dinnerOptions, slots, prefs, chooseLeg });
    day.visits.filter((v) => v.role !== "attraction").forEach((v) => usedRestaurants.add(v.placeId));

    return {
      date,
      colorIndex,
      ...day,
      totalTravelMin: day.legs.reduce((sum, leg) => sum + leg.minutes, 0),
    };
  });

  return { hotel, days };
}

// Days with the best weather get the groups with the most outdoor attractions.
function pairClustersWithDays(
  clusters: Place[][],
  dates: string[],
  slots: SlotScore[],
  prefs: Preferences,
): Map<string, Place[]> {
  const quality = (date: string) => {
    const daySlots = slots.filter(
      (s) => s.date === date && s.startMin >= prefs.dayStartMin && s.startMin < prefs.dayEndMin,
    );
    if (daySlots.length === 0) return NO_FORECAST_QUALITY;
    return daySlots.reduce((sum, s) => sum + s.outdoor, 0) / daySlots.length;
  };
  const outdoorCount = (c: Place[]) => c.filter((p) => p.setting === "outdoor").length;

  const daysByWeather = dates
    .map((date, i) => ({ date, i, q: quality(date) }))
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const clustersByOutdoor = clusters
    .map((c, i) => ({ c, i, n: outdoorCount(c) }))
    .sort((a, b) => b.n - a.n || a.i - b.i);

  return new Map(daysByWeather.map((d, k) => [d.date, clustersByOutdoor[k]?.c ?? []]));
}

function nearestOpenRestaurants(
  restaurants: Place[],
  center: LngLat,
  date: string,
  meal: typeof LUNCH,
  used: Set<string>,
): Place[] {
  const range = { earliest: meal.earliestStart, latest: meal.latestStart };
  return restaurants
    .filter((p) => !used.has(p.id))
    .filter((p) => earliestStart(openWindows(p.openingHours, date, p.kind).windows, range.earliest, meal.durationMin, range) !== null)
    .map((p) => ({ p, d: distanceMeters(p.location, center) }))
    .sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id))
    .slice(0, RESTAURANT_OPTIONS_PER_MEAL)
    .map(({ p }) => p);
}
