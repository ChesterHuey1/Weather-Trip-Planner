import type { Preferences } from "./types";

export const DEFAULT_PREFERENCES: Preferences = {
  comfortTempC: [15, 28],
  avoidRainAbovePct: 30,
  likeTags: [],
  avoidTags: [],
  maxWalkMin: 20,
  modes: ["walk", "cycle", "drive"],
  dayStartMin: 9 * 60,
  dayEndMin: 22 * 60,
};
