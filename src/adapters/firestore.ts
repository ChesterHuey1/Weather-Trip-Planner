import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { geohashForLocation } from "geofire-common";
import type { LngLat, Place } from "../domain/types";

export type Destination = { id: string; name: string; center: LngLat; placeCount: number };

const BATCH_LIMIT = 500;

function db(): Firestore {
  if (getApps().length === 0) {
    const credentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!credentialPath) throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env.local");
    initializeApp({ credential: cert(JSON.parse(readFileSync(credentialPath, "utf8"))) });
  }
  return getFirestore();
}

// Firestore stores the geohash next to each place so nearby queries can range over it.
type PlaceDoc = Place & { geohash: string };

export async function writePlaces(places: Place[]): Promise<void> {
  const firestore = db();
  for (let i = 0; i < places.length; i += BATCH_LIMIT) {
    const batch = firestore.batch();
    for (const place of places.slice(i, i + BATCH_LIMIT)) {
      const [lng, lat] = place.location;
      const doc: PlaceDoc = { ...place, geohash: geohashForLocation([lat, lng]) };
      batch.set(firestore.collection("places").doc(place.id), doc);
    }
    await batch.commit();
  }
}

export async function writeDestinations(destinations: Destination[]): Promise<void> {
  const firestore = db();
  const batch = firestore.batch();
  for (const d of destinations) batch.set(firestore.collection("destinations").doc(d.id), d);
  await batch.commit();
}

export async function listDestinations(): Promise<Destination[]> {
  const snapshot = await db().collection("destinations").orderBy("name").get();
  return snapshot.docs.map((d) => d.data() as Destination);
}

export async function placesInCity(city: string): Promise<Place[]> {
  const snapshot = await db().collection("places").where("city", "==", city).get();
  return snapshot.docs.map((d) => {
    const { geohash, ...place } = d.data() as PlaceDoc;
    return place;
  });
}
