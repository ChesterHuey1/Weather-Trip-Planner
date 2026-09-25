import opening_hours from "opening_hours";
import type { PlaceKind } from "./types";

export type Window = [startMin: number, endMin: number];
export type OpenWindows = { windows: Window[]; confirmed: boolean };

export const LUNCH = { earliestStart: 12 * 60, latestStart: 13 * 60, durationMin: 60 };
export const DINNER = { earliestStart: 18 * 60, latestStart: 19 * 60, durationMin: 90 };

const UNKNOWN_HOURS: Record<PlaceKind, Window[]> = {
  attraction: [[10 * 60, 17 * 60]],
  restaurant: [
    [LUNCH.earliestStart, LUNCH.latestStart + LUNCH.durationMin],
    [DINNER.earliestStart, DINNER.latestStart + DINNER.durationMin],
  ],
};

// Dates are built from local components, so a wall-clock time in the trip city maps to the same
// wall-clock time here. The server runs in UTC, which has no daylight saving gaps.
export function openWindows(spec: string | null, date: string, kind: PlaceKind): OpenWindows {
  const unknown = { windows: UNKNOWN_HOURS[kind], confirmed: false };
  if (spec === null) return unknown;

  let hours: opening_hours;
  try {
    hours = new opening_hours(spec);
  } catch {
    return unknown;
  }

  const [y, m, d] = date.split("-").map(Number);
  const from = new Date(y, m - 1, d);
  const to = new Date(y, m - 1, d + 1);
  const windows: Window[] = hours.getOpenIntervals(from, to).map(([start, end]) => [
    start.getHours() * 60 + start.getMinutes(),
    end.getTime() >= to.getTime() ? 24 * 60 : end.getHours() * 60 + end.getMinutes(),
  ]);
  return { windows, confirmed: true };
}

// Earliest start at or after `arriveMin` (and inside [earliest, latest] when given) such that the
// whole visit fits in one open window. Null when no such start exists.
export function earliestStart(
  windows: Window[],
  arriveMin: number,
  durationMin: number,
  startRange?: { earliest: number; latest: number },
): number | null {
  for (const [open, close] of windows) {
    const start = Math.max(arriveMin, open, startRange?.earliest ?? -Infinity);
    if (startRange && start > startRange.latest) continue;
    if (start + durationMin > close) continue;
    return start;
  }
  return null;
}
