import type { Setting } from "../../src/domain/types";

const TAG_RULES: [tag: string, pattern: RegExp][] = [
  ["museum", /\bmuse(um|ums|o|e)\b|\bmusée\b/i],
  ["art", /\bgaller(y|ies)\b|\bart\b|\barts\b/i],
  ["park", /\bparks?\b|\bgardens?\b|\bbotanic/i],
  ["beach", /\bbeach(es)?\b/i],
  ["hiking", /\bhik(e|es|ing)\b|\btrails?\b/i],
  ["religious", /\bchurch|cathedral|basilica|chapel|temple|shrine|mosque|synagogue|abbey|monastery/i],
  ["historic", /\bhistoric|castle|palace|fort(ress)?\b|ruins?\b|monument|memorial/i],
  ["architecture", /\barchitect|skyscraper|\btower\b|\bbridge\b/i],
  ["viewpoint", /\bview(point)?s?\b|lookout|observation|panoram|skydeck|observatory/i],
  ["market", /\bmarkets?\b|\bbazaar\b|\bsouk\b/i],
  ["zoo", /\bzoo\b|\baquarium\b/i],
  ["tour", /\btours?\b|\bcruises?\b/i],
  ["performance", /\btheat(er|re)s?\b|\bopera\b|\bconcerts?\b|\bsymphony\b/i],
];

const INDOOR_NAME =
  /\bmuse(um|u|o|e)|musée|galler(y|ies)|aquarium|theat(er|re)|opera|cinema|library|livraria|bookstore|cathedral|church|basilica|chapel|mosque|synagogue|convent|\bmall\b|planetarium|exhibition|\bhall\b|institute|\bhouse\b|residence|studios?\b|conservatory|arena\b|\bcent(er|re)\b|\bclub\b|symphony|station\b|^(st\.?|saint|sankt|santa|san)\s/i;
const MIXED_NAME = /\bcastle|palace|temple|shrine|\bmarkets?\b|bazaar|souk|campus|\btower\b|\bzoo\b|university/i;
const OUTDOOR_NAME =
  /\bparks?\b|gardens?|beach|trail|square|plaza|piazza|alameda|bridge|\bpier\b|\blake\b|river|harbou?r|waterfront|promenade|cemetery|statue|fountain|monument|memorial|viewpoint|lookout|\bhill\b|\bmount\b|boardwalk|\bwalk\b|cruise|kayak|\bbikes?\b|\bstreet\b|avenue|\bfort(ress)?\b|\bgolf\b|\bfarm\b|historic site|\bgate\b|\bporte\b|\bbuilding\b|\btours?\b|trolley|segway|\bferia\b|stadium/i;

const INDOOR_TEXT = /\bindoors?\b|\bexhibits?\b|\bexhibitions?\b|\bcollections?\b|\bgaller(y|ies)\b|\bmuseum\b/gi;
const OUTDOOR_TEXT = /\boutdoors?\b|\bopen-air\b|\bstroll\b|\bwalk(ing)?\b|\bviews?\b|\bgrounds\b|\bpark\b|\bgardens?\b/gi;

export function tagsFor(name: string, description: string): string[] {
  const text = `${name} ${description}`;
  return TAG_RULES.filter(([, pattern]) => pattern.test(text)).map(([tag]) => tag);
}

// Name keywords decide first because they are the most reliable, checked indoor, then mixed, then
// outdoor, so "Temple Church" is indoor and "Palace Museum" is indoor. Otherwise the description's
// indoor and outdoor words are counted, and a tie means "mixed".
export function settingFor(name: string, description: string): Setting {
  if (INDOOR_NAME.test(name)) return "indoor";
  if (MIXED_NAME.test(name)) return "mixed";
  if (OUTDOOR_NAME.test(name)) return "outdoor";
  const indoor = description.match(INDOOR_TEXT)?.length ?? 0;
  const outdoor = description.match(OUTDOOR_TEXT)?.length ?? 0;
  if (indoor > outdoor) return "indoor";
  if (outdoor > indoor) return "outdoor";
  return "mixed";
}

const DEFAULT_MINUTES: [tag: string, minutes: number][] = [
  ["zoo", 180],
  ["hiking", 180],
  ["beach", 150],
  ["performance", 150],
  ["museum", 120],
  ["tour", 120],
  ["art", 90],
  ["park", 90],
  ["historic", 75],
  ["market", 60],
  ["religious", 45],
  ["viewpoint", 30],
];

export function defaultDurationMin(tags: string[]): number {
  return DEFAULT_MINUTES.find(([tag]) => tags.includes(tag))?.[1] ?? 60;
}
