import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Destination } from "../../src/adapters/firestore";
import { centroid } from "../../src/domain/geo";
import type { LngLat, Place } from "../../src/domain/types";
import { defaultDurationMin, settingFor, tagsFor } from "./classify";
import { CITY_PAGES, DATA_DIR } from "./config";
import { estimateDurations } from "./durations";
import { fetchOsmHours, isValidOpeningHours, matchOsmHours, type OsmFeature } from "./hours";
import { parseListings, splitOutliers, type RawListing } from "./parseListings";
import { fetchWikivoyagePage } from "./wikivoyage";

// Usage: npx tsx scripts/scrape/build.ts [--skip-durations]
// Every network response is cached in scripts/scrape/.cache, so reruns only fetch what failed.

const RESTAURANT_DURATION_MIN = 60;
const BBOX_MARGIN_DEG = 0.005;
const MAX_DISTANCE_FROM_CENTER_M = 30_000;

const log = (message: string) => console.log(message);
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: durations fall back to category defaults.
}
const skipDurations = process.argv.includes("--skip-durations");

type Collected = RawListing & { city: string; pageUrl: string; osm: OsmFeature[] };
const collected: Collected[] = [];

for (const { page, city } of CITY_PAGES) {
  const { url, html } = await fetchWikivoyagePage(page);
  const { kept: listings, dropped } = splitOutliers(parseListings(html), MAX_DISTANCE_FROM_CENTER_M);
  for (const l of dropped) log(`${page}: dropped "${l.name}", more than 30 km from the other listings`);
  if (listings.length === 0) {
    log(`${page}: no listings, skipped`);
    continue;
  }
  const lats = listings.map((l) => l.lat);
  const lngs = listings.map((l) => l.lng);
  let osm: OsmFeature[] = [];
  try {
    osm = await fetchOsmHours({
      south: Math.min(...lats) - BBOX_MARGIN_DEG,
      west: Math.min(...lngs) - BBOX_MARGIN_DEG,
      north: Math.max(...lats) + BBOX_MARGIN_DEG,
      east: Math.max(...lngs) + BBOX_MARGIN_DEG,
    });
  } catch (error) {
    log(`${page}: OpenStreetMap hours lookup failed (${(error as Error).message})`);
  }
  log(`${page}: ${listings.length} listings, ${osm.length} OpenStreetMap features with hours`);
  collected.push(...listings.map((l) => ({ ...l, city, pageUrl: url, osm })));
}

const usedIds = new Set<string>();
const uniqueId = (city: string, name: string) => {
  const base = `${slug(city)}--${slug(name)}`;
  let id = base;
  for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
  usedIds.add(id);
  return id;
};

const places: Place[] = collected.map((l) => {
  const location: LngLat = [l.lng, l.lat];
  const isRestaurant = l.section === "eat";
  const tags = isRestaurant ? ["food"] : tagsFor(l.name, l.description);
  const listingHours = l.hoursText && isValidOpeningHours(l.hoursText) ? l.hoursText : null;
  return {
    id: uniqueId(l.city, l.name),
    city: l.city,
    kind: isRestaurant ? "restaurant" : "attraction",
    name: l.name,
    setting: isRestaurant ? "indoor" : settingFor(l.name, l.description),
    tags,
    location,
    durationMin: isRestaurant ? RESTAURANT_DURATION_MIN : defaultDurationMin(tags),
    durationSource: "category-default",
    openingHours: listingHours ?? matchOsmHours({ name: l.name, wikidata: l.wikidata, location }, l.osm),
    source: { url: l.pageUrl, license: "CC BY-SA 4.0" },
  };
});

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.OPENROUTER_MODEL;
if (!skipDurations && apiKey && model) {
  const descriptions = new Map(collected.map((l, i) => [places[i].id, l.description]));
  const attractions = places.filter((p) => p.kind === "attraction");
  const estimates = await estimateDurations(
    attractions.map((p) => ({ id: p.id, name: p.name, city: p.city, description: descriptions.get(p.id) ?? "" })),
    { apiKey, model },
    log,
  );
  for (const p of attractions) {
    const minutes = estimates.get(p.id);
    if (minutes !== undefined) {
      p.durationMin = minutes;
      p.durationSource = "model";
    }
  }
} else {
  log("durations: skipped, using category defaults");
}

const destinations: Destination[] = [...new Set(places.map((p) => p.city))].map((city) => {
  const cityPlaces = places.filter((p) => p.city === city);
  const attractions = cityPlaces.filter((p) => p.kind === "attraction");
  return {
    id: slug(city),
    name: city,
    center: centroid((attractions.length > 0 ? attractions : cityPlaces).map((p) => p.location)),
    placeCount: cityPlaces.length,
  };
});

await mkdir(DATA_DIR, { recursive: true });
await writeFile(path.join(DATA_DIR, "places.json"), JSON.stringify(places, null, 1) + "\n");
await writeFile(path.join(DATA_DIR, "destinations.json"), JSON.stringify(destinations, null, 1) + "\n");

const attractions = places.filter((p) => p.kind === "attraction");
const pct = (n: number, of: number) => `${Math.round((100 * n) / Math.max(1, of))}%`;
const count = (pred: (p: Place) => boolean) => attractions.filter(pred).length;
log(`\n${destinations.length} cities, ${attractions.length} attractions, ${places.length - attractions.length} restaurants`);
log(`settings: indoor ${count((p) => p.setting === "indoor")}, outdoor ${count((p) => p.setting === "outdoor")}, mixed ${count((p) => p.setting === "mixed")}`);
log(`hours known: attractions ${pct(count((p) => p.openingHours !== null), attractions.length)}, restaurants ${pct(places.filter((p) => p.kind === "restaurant" && p.openingHours !== null).length, places.length - attractions.length)}`);
log(`durations from model: ${pct(count((p) => p.durationSource === "model"), attractions.length)}`);
