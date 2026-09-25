export type LngLat = [lng: number, lat: number];

export type Setting = "indoor" | "outdoor" | "mixed";
export type PlaceKind = "attraction" | "restaurant";

export type Place = {
  id: string;
  city: string;
  kind: PlaceKind;
  name: string;
  setting: Setting;
  tags: string[];
  location: LngLat;
  durationMin: number;
  durationSource: "model" | "category-default";
  // OpenStreetMap opening_hours format; null means unknown.
  openingHours: string | null;
  source: { url: string; license: "CC BY-SA 4.0" };
};

export type TravelMode = "walk" | "cycle" | "drive";

export type Leg = { from: string; to: string; mode: TravelMode; minutes: number; meters: number };

export type VisitRole = "attraction" | "lunch" | "dinner";

export type Visit = {
  placeId: string;
  role: VisitRole;
  startMin: number;
  endMin: number;
  hoursConfirmed: boolean;
  reason: string;
};

export type DayPlan = {
  date: string;
  colorIndex: number;
  visits: Visit[];
  // Hotel to first visit, between visits, last visit to hotel.
  legs: Leg[];
  totalTravelMin: number;
  unscheduled: { placeId: string; why: string }[];
  notes: string[];
};

export type Itinerary = { hotel: LngLat; days: DayPlan[] };

export type Preferences = {
  comfortTempC: [min: number, max: number];
  avoidRainAbovePct: number;
  likeTags: string[];
  avoidTags: string[];
  maxWalkMin: number;
  modes: TravelMode[];
  dayStartMin: number;
  dayEndMin: number;
};

export type ForecastSlot = {
  date: string;
  startMin: number;
  tempC: number;
  rainPct: number;
  windMs: number;
  thunderstorm: boolean;
};

export type SlotScore = { date: string; startMin: number; outdoor: number; reason: string };

// Rows and columns follow `ids`. A null cell means the mode has no route between the two points.
export type ModeMatrix = { minutes: (number | null)[][]; meters: (number | null)[][] };
export type TravelMatrix = { ids: string[]; modes: Partial<Record<TravelMode, ModeMatrix>> };

export const HOTEL_ID = "hotel";
