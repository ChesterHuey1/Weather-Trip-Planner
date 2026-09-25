import * as cheerio from "cheerio";
import { distanceMeters } from "../../src/domain/geo";

export type Section = "see" | "do" | "eat";

export type RawListing = {
  section: Section;
  subsection: string | null;
  name: string;
  lat: number;
  lng: number;
  hoursText: string | null;
  description: string;
  wikidata: string | null;
};

const SECTIONS: Record<string, Section> = { See: "see", Do: "do", Eat: "eat" };

// Reads the See, Do, and Eat listings from a Wikivoyage page's parsed HTML. Listings without
// coordinates are skipped, because the planner cannot route to them.
export function parseListings(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  let section: Section | null = null;
  let subsection: string | null = null;

  $("h2, h3, .vcard").each((_, el) => {
    const node = $(el);
    if (el.tagName === "h2") {
      section = SECTIONS[node.attr("id") ?? ""] ?? null;
      subsection = null;
      return;
    }
    if (el.tagName === "h3") {
      subsection = node.text().trim() || null;
      return;
    }
    if (!section || node.parents(".vcard").length > 0) return;

    const name = node.find(".listing-name").first().text().trim();
    const latText = node.find(".geo .latitude").first().text().trim();
    const lngText = node.find(".geo .longitude").first().text().trim();
    const lat = Number(latText);
    const lng = Number(lngText);
    if (!name || !latText || !lngText || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const hoursText = node.find(".listing-hours").first().text().trim() || null;
    const wikidata = node.find('span.noprint[id^="Q"]').first().attr("id") ?? null;
    listings.push({
      section,
      subsection,
      name,
      lat,
      lng,
      hoursText,
      description: node.find(".listing-content").first().text().trim(),
      wikidata: wikidata && /^Q\d+$/.test(wikidata) ? wikidata : null,
    });
  });

  return listings;
}

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Splits off listings far from the page's median point. Wikivoyage has some listings with flipped
// or mistyped coordinates, and a few day trips far outside the city.
export function splitOutliers(listings: RawListing[], maxMeters: number) {
  if (listings.length === 0) return { kept: listings, dropped: listings };
  const center: [number, number] = [median(listings.map((l) => l.lng)), median(listings.map((l) => l.lat))];
  const isNear = (l: RawListing) => distanceMeters([l.lng, l.lat], center) <= maxMeters;
  return { kept: listings.filter(isNear), dropped: listings.filter((l) => !isNear(l)) };
}
