import { formatClock } from "./time";
import type { ForecastSlot, Preferences, SlotScore } from "./types";

export const SLOT_LENGTH_MIN = 180;
export const BAD_WEATHER_BELOW = 0.5;

const STRONG_WIND_MS = 10;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function scoreSlots(forecast: ForecastSlot[], prefs: Preferences): SlotScore[] {
  return forecast.map((slot) => scoreSlot(slot, prefs));
}

function scoreSlot(slot: ForecastSlot, prefs: Preferences): SlotScore {
  const at = `at ${formatClock(slot.startMin)}`;
  const temp = `${Math.round(slot.tempC)}°C`;
  const rain = `${Math.round(slot.rainPct)}% rain`;

  if (slot.thunderstorm) {
    return { date: slot.date, startMin: slot.startMin, outdoor: 0, reason: `thunderstorm ${at}` };
  }

  const problems: string[] = [];

  const threshold = prefs.avoidRainAbovePct;
  let rainFactor = 1;
  if (slot.rainPct > threshold) {
    // Just over the threshold halves the score; certain rain zeroes it.
    rainFactor = threshold >= 100 ? 1 : 0.5 * clamp01(1 - (slot.rainPct - threshold) / (100 - threshold));
    problems.push(rain);
  }

  const [minC, maxC] = prefs.comfortTempC;
  const degreesOutside = slot.tempC < minC ? minC - slot.tempC : slot.tempC > maxC ? slot.tempC - maxC : 0;
  const tempFactor = clamp01(1 - degreesOutside / 10);
  if (degreesOutside > 0) {
    problems.push(`${temp}, ${slot.tempC < minC ? "below" : "above"} your ${minC} to ${maxC}°C range`);
  }

  const windFactor = clamp01(1 - Math.max(0, slot.windMs - STRONG_WIND_MS) / STRONG_WIND_MS);
  if (slot.windMs > STRONG_WIND_MS) problems.push(`wind ${Math.round(slot.windMs)} m/s`);

  const outdoor = rainFactor * tempFactor * windFactor;
  const reason = problems.length > 0 ? `${problems.join(", ")} ${at}` : `${temp}, ${rain} ${at}`;
  return { date: slot.date, startMin: slot.startMin, outdoor, reason };
}

export function slotAt(slots: SlotScore[], date: string, minute: number): SlotScore | null {
  return (
    slots.find((s) => s.date === date && s.startMin <= minute && minute < s.startMin + SLOT_LENGTH_MIN) ?? null
  );
}
