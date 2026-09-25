import { centroid, distanceMeters } from "./geo";
import type { LngLat, Place } from "./types";

const MAX_ITERATIONS = 10;

// Splits places into `dayCount` geographic groups of at most `capacity` each, using k-means with
// farthest-point starting centers. Deterministic for the same input order.
export function clusterByDay(places: Place[], dayCount: number, capacity: number): Place[][] {
  if (dayCount === 0) return [];
  const centers = farthestPointCenters(places, dayCount);
  let assignment: number[] = [];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const next = assignWithCapacity(places, centers, capacity);
    const changed = next.some((c, i) => c !== assignment[i]);
    assignment = next;
    if (!changed) break;
    centers.forEach((_, c) => {
      const members = places.filter((_, i) => assignment[i] === c).map((p) => p.location);
      if (members.length > 0) centers[c] = centroid(members);
    });
  }

  return Array.from({ length: dayCount }, (_, c) => places.filter((_, i) => assignment[i] === c));
}

function farthestPointCenters(places: Place[], count: number): LngLat[] {
  if (places.length === 0) return [];
  const centers: LngLat[] = [places[0].location];
  while (centers.length < Math.min(count, places.length)) {
    let bestIndex = 0;
    let bestDistance = -1;
    places.forEach((p, i) => {
      const nearest = Math.min(...centers.map((c) => distanceMeters(p.location, c)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestIndex = i;
      }
    });
    centers.push(places[bestIndex].location);
  }
  return centers;
}

function assignWithCapacity(places: Place[], centers: LngLat[], capacity: number): number[] {
  const pairs = places.flatMap((p, i) => centers.map((c, k) => ({ i, k, d: distanceMeters(p.location, c) })));
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.k - b.k);

  const assignment: number[] = new Array(places.length).fill(-1);
  const sizes = new Array(centers.length).fill(0);
  for (const { i, k } of pairs) {
    if (assignment[i] !== -1 || sizes[k] >= capacity) continue;
    assignment[i] = k;
    sizes[k]++;
  }
  return assignment;
}
