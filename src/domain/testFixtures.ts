import { distanceMeters } from "./geo";
import { HOTEL_ID, type LngLat, type Place, type TravelMatrix, type TravelMode } from "./types";

const METERS_PER_MIN: Record<TravelMode, number> = { walk: 80, cycle: 250, drive: 500 };

export function place(overrides: Partial<Place> & Pick<Place, "id" | "location">): Place {
  return {
    city: "Testville",
    kind: "attraction",
    name: overrides.id,
    setting: "indoor",
    tags: [],
    durationMin: 60,
    durationSource: "category-default",
    openingHours: "Mo-Su 08:00-22:00",
    source: { url: "https://en.wikivoyage.org/wiki/Testville", license: "CC BY-SA 4.0" },
    ...overrides,
  };
}

export function restaurant(id: string, location: LngLat): Place {
  return place({ id, location, kind: "restaurant", openingHours: "Mo-Su 11:00-23:00" });
}

// Straight-line travel times at a fixed speed per mode.
export function straightLineTravel(hotel: LngLat, places: Place[]): TravelMatrix {
  const points = [hotel, ...places.map((p) => p.location)];
  const ids = [HOTEL_ID, ...places.map((p) => p.id)];
  const matrixFor = (mode: TravelMode) => {
    const meters = points.map((a) => points.map((b) => distanceMeters(a, b)));
    return { meters, minutes: meters.map((row) => row.map((m) => m / METERS_PER_MIN[mode])) };
  };
  return { ids, modes: { walk: matrixFor("walk"), cycle: matrixFor("cycle"), drive: matrixFor("drive") } };
}
