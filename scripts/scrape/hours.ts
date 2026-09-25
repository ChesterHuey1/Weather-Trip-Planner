import opening_hours from "opening_hours";
import { distanceMeters } from "../../src/domain/geo";
import type { LngLat } from "../../src/domain/types";
import { politeFetchText } from "./http";

export type OsmFeature = { name: string | null; wikidata: string | null; openingHours: string; location: LngLat };

const MATCH_RADIUS_M = 200;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_RETRIES = 3;
const OVERPASS_RETRY_WAIT_MS = 30_000;

export function isValidOpeningHours(spec: string): boolean {
  try {
    new opening_hours(spec);
    return true;
  } catch {
    return false;
  }
}

// All named or Wikidata-linked OpenStreetMap features with opening hours inside the box.
export async function fetchOsmHours(bbox: { south: number; west: number; north: number; east: number }) {
  const { south, west, north, east } = bbox;
  const query = `[out:json][timeout:120];
(nwr["opening_hours"]["name"](${south},${west},${north},${east});
 nwr["opening_hours"]["wikidata"](${south},${west},${north},${east}););
out tags center;`;

  for (let attempt = 1; ; attempt++) {
    try {
      const body = JSON.parse(
        await politeFetchText(
          OVERPASS_URL,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ data: query }).toString(),
          },
          // Overpass reports timeouts inside a 200 response.
          (text) => text.trimStart().startsWith("{") && !text.includes('"remark": "runtime error'),
        ),
      );
      return parseOverpass(body);
    } catch (error) {
      if (attempt >= OVERPASS_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, OVERPASS_RETRY_WAIT_MS));
    }
  }
}

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export function parseOverpass(body: { elements: OverpassElement[] }): OsmFeature[] {
  return body.elements.flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const openingHours = el.tags?.opening_hours;
    if (lat === undefined || lon === undefined || !openingHours) return [];
    return [
      {
        name: el.tags?.name ?? null,
        wikidata: el.tags?.wikidata ?? null,
        openingHours,
        location: [lon, lat] as LngLat,
      },
    ];
  });
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// A Wikidata ID match wins. Otherwise the names must match after normalizing, or one must contain
// the other, and the feature must be within MATCH_RADIUS_M.
export function matchOsmHours(
  listing: { name: string; wikidata: string | null; location: LngLat },
  features: OsmFeature[],
): string | null {
  const valid = (f: OsmFeature) => isValidOpeningHours(f.openingHours);
  if (listing.wikidata) {
    const byWikidata = features.find((f) => f.wikidata === listing.wikidata && valid(f));
    if (byWikidata) return byWikidata.openingHours;
  }

  const name = normalize(listing.name);
  if (name.length < 4) return null;
  const nearby = features
    .filter((f) => f.name && distanceMeters(f.location, listing.location) <= MATCH_RADIUS_M)
    .filter((f) => {
      const other = normalize(f.name!);
      return other === name || (other.length >= 4 && (other.includes(name) || name.includes(other)));
    })
    .filter(valid)
    .sort((a, b) => distanceMeters(a.location, listing.location) - distanceMeters(b.location, listing.location));
  return nearby[0]?.openingHours ?? null;
}
