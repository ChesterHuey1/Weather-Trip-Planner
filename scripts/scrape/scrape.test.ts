import { describe, expect, it } from "vitest";
import { defaultDurationMin, settingFor, tagsFor } from "./classify";
import { parseDurationReply } from "./durations";
import { matchOsmHours, type OsmFeature } from "./hours";
import { parseListings, splitOutliers } from "./parseListings";

const listing = (name: string, lat: string | null, extra = "") => `
<li><bdi class="vcard">
  ${lat === null ? "" : `<span class="noprint listing-coordinates"><span class="geo"><abbr class="latitude">${lat}</abbr><abbr class="longitude">-87.62</abbr></span></span>`}
  <span class="fn org listing-name"><a href="#">${name}</a></span><span id="Q239303" class="noprint"></span>
  ${extra}
  <bdi class="note listing-content">About ${name}.</bdi>
</bdi></li>`;

const PAGE = `
<div class="mw-heading mw-heading2"><h2 id="Understand">Understand</h2></div>
<ul>${listing("Ignored Place", "41.9")}</ul>
<div class="mw-heading mw-heading2"><h2 id="See">See</h2></div>
<ul>${listing("Art Institute of Chicago", "41.879444", '<span class="note listing-hours">10:30AM-5PM</span>')}</ul>
<ul>${listing("No Coordinates Hall", null)}</ul>
<div class="mw-heading mw-heading2"><h2 id="Eat">Eat</h2></div>
<div class="mw-heading mw-heading3"><h3 id="Budget">Budget</h3></div>
<ul>${listing("Lou Mitchell's", "41.8793")}</ul>
<div class="mw-heading mw-heading2"><h2 id="Sleep">Sleep</h2></div>
<ul>${listing("Some Hotel", "41.88")}</ul>`;

describe("parseListings", () => {
  const listings = parseListings(PAGE);

  it("keeps only See, Do, and Eat listings that have coordinates", () => {
    expect(listings.map((l) => [l.section, l.name])).toEqual([
      ["see", "Art Institute of Chicago"],
      ["eat", "Lou Mitchell's"],
    ]);
  });

  it("reads coordinates, hours, description, Wikidata ID, and subsection", () => {
    expect(listings[0]).toMatchObject({
      lat: 41.879444,
      lng: -87.62,
      hoursText: "10:30AM-5PM",
      description: "About Art Institute of Chicago.",
      wikidata: "Q239303",
      subsection: null,
    });
    expect(listings[1].subsection).toBe("Budget");
  });
});

describe("splitOutliers", () => {
  const at = (name: string, lat: number, lng: number) => ({ ...parseListings(PAGE)[0], name, lat, lng });

  it("drops listings far from the page's median point, such as flipped coordinates", () => {
    const listings = [at("a", -13.52, -71.97), at("b", -13.51, -71.98), at("c", -13.53, -71.96), at("flipped", 13.53, 71.96)];
    const { kept, dropped } = splitOutliers(listings, 30_000);
    expect(kept.map((l) => l.name)).toEqual(["a", "b", "c"]);
    expect(dropped.map((l) => l.name)).toEqual(["flipped"]);
  });
});

describe("classify", () => {
  it("reads the setting from the name first", () => {
    expect(settingFor("Art Institute of Chicago", "Stroll the grounds")).toBe("indoor");
    expect(settingFor("Millennium Park", "Home to many exhibits")).toBe("outdoor");
    expect(settingFor("Edinburgh Castle", "")).toBe("mixed");
  });

  it("checks indoor names before mixed and outdoor ones", () => {
    expect(settingFor("Temple Church", "")).toBe("indoor");
    expect(settingFor("St Magnus the Martyr", "")).toBe("indoor");
    expect(settingFor("Museu do Vinho do Porto", "")).toBe("indoor");
    expect(settingFor("Rogers Centre Tours", "")).toBe("indoor");
    expect(settingFor("Old Town Trolley Tours", "")).toBe("outdoor");
    expect(settingFor("Fort Sumter", "")).toBe("outdoor");
  });

  it("falls back to counting description words, with ties as mixed", () => {
    expect(settingFor("Cloud Gate", "A sculpture you can walk around, with views of the skyline")).toBe("outdoor");
    expect(settingFor("The Rookery", "Exhibits and a permanent collection")).toBe("indoor");
    expect(settingFor("Something", "Nothing telling here")).toBe("mixed");
  });

  it("tags attractions and picks a default visit length from the tags", () => {
    const tags = tagsFor("Field Museum", "Natural history collections");
    expect(tags).toContain("museum");
    expect(defaultDurationMin(tags)).toBe(120);
    expect(defaultDurationMin(tagsFor("Skydeck", "Observation deck"))).toBe(30);
    expect(defaultDurationMin([])).toBe(60);
  });
});

describe("matchOsmHours", () => {
  const feature = (overrides: Partial<OsmFeature>): OsmFeature => ({
    name: "Art Institute of Chicago",
    wikidata: null,
    openingHours: "Mo-Su 11:00-17:00",
    location: [-87.6239, 41.8795],
    ...overrides,
  });
  const art = { name: "Art Institute of Chicago", wikidata: "Q239303", location: [-87.6239, 41.8794] as [number, number] };

  it("matches by Wikidata ID first, even with a different name", () => {
    const hours = matchOsmHours(art, [feature({ name: "AIC", wikidata: "Q239303", openingHours: "Th 11:00-20:00" })]);
    expect(hours).toBe("Th 11:00-20:00");
  });

  it("matches a nearby feature with the same name", () => {
    expect(matchOsmHours({ ...art, wikidata: null }, [feature({ name: "The Art Institute of Chicago" })])).toBe(
      "Mo-Su 11:00-17:00",
    );
  });

  it("ignores same-name features more than 200 m away", () => {
    expect(matchOsmHours({ ...art, wikidata: null }, [feature({ location: [-87.6, 41.9] })])).toBeNull();
  });

  it("ignores features whose hours do not parse", () => {
    expect(matchOsmHours({ ...art, wikidata: null }, [feature({ openingHours: "call ahead" })])).toBeNull();
  });
});

describe("parseDurationReply", () => {
  const ids = new Set(["a", "b", "c"]);

  it("reads a JSON object even with text around it, and clamps to 20 to 240 minutes", () => {
    const reply = 'Sure! {"a": 150, "b": "5", "c": 999, "unknown": 60}';
    expect(Object.fromEntries(parseDurationReply(reply, ids))).toEqual({ a: 150, b: 20, c: 240 });
  });

  it("returns nothing for a reply without JSON", () => {
    expect(parseDurationReply("I cannot help with that.", ids).size).toBe(0);
  });
});
