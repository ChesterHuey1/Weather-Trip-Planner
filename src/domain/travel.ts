import type { Leg, Preferences, TravelMatrix } from "./types";

export type LegChooser = (from: string, to: string, badWeather: boolean) => Leg | null;

export function makeLegChooser(travel: TravelMatrix, prefs: Preferences): LegChooser {
  const index = new Map(travel.ids.map((id, i) => [id, i]));

  return (from, to, badWeather) => {
    const i = index.get(from);
    const j = index.get(to);
    if (i === undefined || j === undefined) return null;

    const options: Leg[] = prefs.modes.flatMap((mode) => {
      const minutes = travel.modes[mode]?.minutes[i][j];
      const meters = travel.modes[mode]?.meters[i][j];
      if (minutes == null || meters == null) return [];
      return [{ from, to, mode, minutes: Math.ceil(minutes), meters: Math.round(meters) }];
    });
    if (options.length === 0) return null;

    const walk = options.find((o) => o.mode === "walk");
    if (walk && walk.minutes <= prefs.maxWalkMin && !badWeather) return walk;

    let eligible = options.filter((o) => o.mode !== "walk" || o.minutes <= prefs.maxWalkMin);
    if (badWeather) {
      const sheltered = eligible.filter((o) => o.mode === "drive");
      if (sheltered.length > 0) eligible = sheltered;
    }
    if (eligible.length === 0) eligible = options;
    return eligible.reduce((best, o) => (o.minutes < best.minutes ? o : best));
  };
}
