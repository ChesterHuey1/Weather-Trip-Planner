import { DINNER, LUNCH, earliestStart, openWindows, type OpenWindows } from "./openHours";
import type { LegChooser } from "./travel";
import { HOTEL_ID, type Leg, type Place, type Preferences, type SlotScore, type Visit, type VisitRole } from "./types";
import { BAD_WEATHER_BELOW, slotAt } from "./weatherScore";

// Minutes of cost added for an outdoor visit in a slot with an outdoor score of 0.
export const WEATHER_PENALTY_MIN = 120;

export type DayInput = {
  date: string;
  attractions: Place[];
  lunchOptions: Place[];
  dinnerOptions: Place[];
  slots: SlotScore[];
  prefs: Preferences;
  chooseLeg: LegChooser;
};

export type DayResult = {
  visits: Visit[];
  legs: Leg[];
  unscheduled: { placeId: string; why: string }[];
  notes: string[];
};

type Step = { visit: Visit; leg: Leg };

type State = {
  at: string;
  time: number;
  mask: number;
  lunch: boolean;
  lunchId: string | null;
  dinner: boolean;
  cost: number;
  steps: Step[];
};

type Best = { count: number; cost: number; steps: Step[]; back: Leg };

const SETTING_LABEL = { indoor: "Indoor", outdoor: "Outdoor", mixed: "Indoor and outdoor" } as const;

// Searches every order of the day's attractions, with lunch and dinner inserted in their start
// windows. Picks the plan that visits the most attractions, then the lowest cost, where cost is
// travel minutes plus waiting minutes plus the weather penalty.
export function planDay(input: DayInput): DayResult {
  const { date, attractions, lunchOptions, dinnerOptions, slots, prefs, chooseLeg } = input;
  const hours = new Map<string, OpenWindows>(
    [...attractions, ...lunchOptions, ...dinnerOptions].map((p) => [p.id, openWindows(p.openingHours, date, p.kind)]),
  );
  const needLunch = lunchOptions.length > 0;
  const needDinner = dinnerOptions.length > 0;
  const badWeatherAt = (minute: number) => (slotAt(slots, date, minute)?.outdoor ?? 1) < BAD_WEATHER_BELOW;

  const labels = new Map<string, { time: number; cost: number }[]>();
  let best: Best | null = null;

  const isDominated = (s: State) => {
    const key = `${s.mask}|${s.lunchId}|${s.dinner}|${s.at}`;
    const seen = labels.get(key) ?? [];
    // An earlier label can wait until s.time and then copy any continuation of s.
    if (seen.some((l) => l.time <= s.time && l.cost + (s.time - l.time) <= s.cost)) return true;
    labels.set(key, [...seen, { time: s.time, cost: s.cost }]);
    return false;
  };

  const tryStep = (s: State, place: Place, role: VisitRole, bit: number): State | null => {
    if (role === "dinner" && place.id === s.lunchId) return null;
    const leg = chooseLeg(s.at, place.id, badWeatherAt(s.time));
    if (!leg) return null;
    const arrive = s.time + leg.minutes;
    const meal = role === "lunch" ? LUNCH : role === "dinner" ? DINNER : null;
    const duration = meal ? meal.durationMin : place.durationMin;
    const range = meal ? { earliest: meal.earliestStart, latest: meal.latestStart } : undefined;
    const open = hours.get(place.id)!;
    const start = earliestStart(open.windows, arrive, duration, range);
    if (start === null) return null;
    const end = start + duration;
    if (end > prefs.dayEndMin) return null;

    const lunch = s.lunch || role === "lunch";
    const dinner = s.dinner || role === "dinner";
    if (needLunch && !lunch && end > LUNCH.latestStart) return null;
    if (needDinner && !dinner && end > DINNER.latestStart) return null;

    const slot = slotAt(slots, date, start);
    const penalty = place.setting === "outdoor" && slot ? (1 - slot.outdoor) * WEATHER_PENALTY_MIN : 0;
    const reason = meal
      ? role === "lunch"
        ? "Lunch"
        : "Dinner"
      : `${SETTING_LABEL[place.setting]}: ${slot ? slot.reason : "no forecast yet"}`;

    return {
      at: place.id,
      time: end,
      mask: s.mask | bit,
      lunch,
      lunchId: role === "lunch" ? place.id : s.lunchId,
      dinner,
      cost: s.cost + leg.minutes + (start - arrive) + penalty,
      steps: [
        ...s.steps,
        {
          leg,
          visit: { placeId: place.id, role, startMin: start, endMin: end, hoursConfirmed: open.confirmed, reason },
        },
      ],
    };
  };

  const explore = (s: State) => {
    const count = popcount(s.mask);
    const remaining = attractions.length - count;
    if (best && (count + remaining < best.count || (count + remaining === best.count && s.cost >= best.cost))) return;

    if ((s.lunch || !needLunch) && (s.dinner || !needDinner)) {
      const back = chooseLeg(s.at, HOTEL_ID, badWeatherAt(s.time));
      if (back && s.time + back.minutes <= prefs.dayEndMin) {
        const cost = s.cost + back.minutes;
        if (!best || count > best.count || (count === best.count && cost < best.cost)) {
          best = { count, cost, steps: s.steps, back };
        }
      }
    }

    const next: State[] = [];
    attractions.forEach((place, i) => {
      const bit = 1 << i;
      if (s.mask & bit) return;
      const n = tryStep(s, place, "attraction", bit);
      if (n) next.push(n);
    });
    if (needLunch && !s.lunch) {
      for (const place of lunchOptions) {
        const n = tryStep(s, place, "lunch", 0);
        if (n) next.push(n);
      }
    }
    if (needDinner && !s.dinner && (s.lunch || !needLunch)) {
      for (const place of dinnerOptions) {
        const n = tryStep(s, place, "dinner", 0);
        if (n) next.push(n);
      }
    }
    for (const n of next) {
      if (!isDominated(n)) explore(n);
    }
  };

  explore({
    at: HOTEL_ID,
    time: prefs.dayStartMin,
    mask: 0,
    lunch: false,
    lunchId: null,
    dinner: false,
    cost: 0,
    steps: [],
  });

  const notes: string[] = [];
  if (!needLunch) notes.push("No open restaurant found near this day's route for lunch.");
  if (!needDinner) notes.push("No open restaurant found near this day's route for dinner.");

  // TypeScript cannot see the assignments inside explore, so widen the type back.
  const result = best as Best | null;
  if (!result) {
    return {
      visits: [],
      legs: [],
      unscheduled: attractions.map((p) => ({ placeId: p.id, why: "No workable day could be built around the hotel and meal times." })),
      notes: [...notes, "Could not build a day that returns to the hotel in time."],
    };
  }

  const visited = new Set(result.steps.map((s) => s.visit.placeId));
  const unscheduled = attractions
    .filter((p) => !visited.has(p.id))
    .map((p) => ({
      placeId: p.id,
      why:
        hours.get(p.id)!.windows.length === 0
          ? "Closed on this day."
          : "Did not fit in the day.",
    }));

  return {
    visits: result.steps.map((s) => s.visit),
    legs: [...result.steps.map((s) => s.leg), result.back],
    unscheduled,
    notes,
  };
}

function popcount(n: number): number {
  let count = 0;
  for (let x = n; x; x &= x - 1) count++;
  return count;
}
