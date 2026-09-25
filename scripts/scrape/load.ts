import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeDestinations, writePlaces, type Destination } from "../../src/adapters/firestore";
import type { Place } from "../../src/domain/types";
import { DATA_DIR } from "./config";

// Usage: npx tsx scripts/scrape/load.ts
// Copies data/places.json and data/destinations.json into Firestore. Safe to rerun: each document
// is written by its id, so a rerun overwrites instead of duplicating.

process.loadEnvFile(".env.local");

const places: Place[] = JSON.parse(await readFile(path.join(DATA_DIR, "places.json"), "utf8"));
const destinations: Destination[] = JSON.parse(await readFile(path.join(DATA_DIR, "destinations.json"), "utf8"));

await writePlaces(places);
await writeDestinations(destinations);
console.log(`Loaded ${places.length} places and ${destinations.length} destinations into Firestore.`);
