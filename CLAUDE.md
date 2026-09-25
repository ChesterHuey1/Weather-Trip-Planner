# Weather Trip Planner

A web app that builds day-by-day trip itineraries for one city. It puts outdoor activities in good-weather time slots and indoor activities where the forecast is bad, schedules lunch and dinner, and routes each day from the user's hotel and back. Users can type messages such as "I hate the cold" or "more museums, no hiking" to change the plan.

## Goals

- The user picks a city, enters a hotel address, picks a start date, and picks how many days they have. The app returns a day-by-day itinerary.
- Every day starts at the hotel and ends back at the hotel.
- Lunch starts between 12:00 and 13:00 and dinner starts between 18:00 and 19:00, at restaurants near that part of the day's route.
- Outdoor attractions go in high-scoring weather slots. Indoor attractions fill slots with rain, storms, or temperatures outside the user's comfort range.
- Each attraction's visit length is its typical visit time. The number of stops per day follows from those lengths, not from a fixed count.
- Each day's route is the fastest one found: stops are grouped by area and ordered to minimize total travel and waiting time.
- Every visit happens while the attraction is open.
- The itinerary shows how to get between stops: mode, travel time, and distance for each leg.
- A map shows every day's route in its own color.
- Free-text messages change the plan's preferences.
- Everything runs on free tiers.
- Out of scope for now: user accounts, multi-city trips, public transit.

## Product

### Trip form (home page)

- City: chosen from the cities in Firestore.
- Hotel address: geocoded with the OpenRouteService geocoding endpoint. The user confirms the matched location on a small map.
- Start date and number of days.
- Optional preferences: comfortable temperature range, interests, allowed travel modes, longest walk.

### Itinerary page

- One card per day, in that day's color.
  - Header: date and weather summary, such as "Rain after 14:00, 18°C". Days more than 5 days out show "no forecast yet".
  - Timeline: hotel departure, each stop with start time, name, indoor or outdoor label, opening hours, and the reason for its slot (such as "Outdoor: 10% rain at 10:00"), and the return to the hotel. Lunch and dinner appear as stops.
  - Between stops: the leg's mode, minutes, and distance, such as "Walk 12 min, 900 m".
  - Stops without confirmed hours show "hours not confirmed".
- Map (Leaflet with OpenStreetMap tiles):
  - The hotel as its own marker.
  - Numbered markers for each day's stops, in that day's color.
  - Each day's route drawn as a line in the same color, following real streets.
  - A legend of days. Clicking a day highlights its route and card and dims the others.
- Chat box beside the itinerary. After a message, the app shows what it understood, such as "Comfort range is now 18 to 28°C. Avoiding: hiking.", rebuilds the plan, and highlights what changed.
- Each stop has "remove" and "swap" buttons. The day's route is recalculated after either.

### Day colors

Use a fixed palette of 7 colors that stay readable on the map and in both light and dark mode. Day 1 always gets the first color.

## Stack

- Next.js (App Router) with TypeScript, deployed on Vercel's free tier.
- Firebase Firestore free tier (Spark plan) for NoSQL storage. The server accesses it with `firebase-admin`. Nearby-location queries use geohashes from `geofire-common`.
- OpenWeatherMap free "5 day / 3 hour forecast" API for weather.
- OpenRouteService free tier with one token for three things:
  - Matrix endpoint (about 500 requests a day, up to 3,500 origin-destination pairs each) with the `foot-walking`, `cycling-regular`, and `driving-car` profiles for travel times. Cache matrices per city and candidate set.
  - Directions endpoint for the street-following route lines on the map, one request per day of the itinerary.
  - Geocoding endpoint for the hotel address.
- `opening_hours` npm package for parsing opening hours in OpenStreetMap format.
- OpenRouter for the language model. It turns user messages into a `Preferences` object at runtime, and estimates visit lengths once during scraping. The model is set by `OPENROUTER_MODEL` in `.env.local`, so a free model can be used. Do not use the Anthropic Claude API directly.
- Leaflet and react-leaflet with OpenStreetMap tiles for the map. Load the map component on the client only.
- Cheerio for parsing scraped HTML.

## Architecture

Decision: scoring rules decide indoor vs outdoor. The language model never builds the itinerary. It only parses messages into `Preferences`. This keeps plans deterministic, testable, and explainable.

```
scripts/scrape/     one-time scraper: fetch, parse (Cheerio), classify, estimate durations, load
src/domain/         pure logic, no network or database calls: types, weatherScore, openHours, planItinerary
src/adapters/       openWeather, openRoute, firestore, messagePreferences
app/                Next.js pages and route handlers
```

Dependency direction:

- `app/` may import `src/adapters/` and `src/domain/`.
- `src/adapters/` may import `src/domain/` types.
- `src/domain/` imports nothing from `app/`, `src/adapters/`, or any network or database library. ESLint enforces this.
- `scripts/scrape/` may import `src/domain/` types and `src/adapters/firestore`. Nothing in `app/` or `src/` imports from `scripts/`. ESLint enforces this.

### Time

All times in `src/domain/` are local wall-clock times in the trip city: a date string (`YYYY-MM-DD`) plus minutes after local midnight. Adapters convert API timestamps into this form using the city's UTC offset. Domain code never uses `Date` for scheduling, so the server's time zone cannot shift a plan.

### Core types

```ts
type Setting = "indoor" | "outdoor" | "mixed";
type PlaceKind = "attraction" | "restaurant";

type Place = {
  id: string;
  city: string;
  kind: PlaceKind;
  name: string;
  setting: Setting; // restaurants are "indoor"
  tags: string[];
  location: [lng: number, lat: number];
  durationMin: number; // typical visit length
  durationSource: "model" | "category-default";
  openingHours: string | null; // OpenStreetMap opening_hours format; null means unknown
  source: { url: string; license: "CC BY-SA 4.0" };
};

type TravelMode = "walk" | "cycle" | "drive";

type Leg = { from: string; to: string; mode: TravelMode; minutes: number; meters: number };

type Visit = {
  placeId: string;
  role: "attraction" | "lunch" | "dinner";
  startMin: number;
  endMin: number;
  hoursConfirmed: boolean;
  reason: string;
};

type DayPlan = {
  date: string;
  colorIndex: number;
  visits: Visit[];
  legs: Leg[]; // hotel to first visit, between visits, last visit to hotel
  totalTravelMin: number;
  unscheduled: { placeId: string; why: string }[];
  notes: string[]; // day-level problems, such as no open restaurant for a meal
};

type Itinerary = { hotel: [lng: number, lat: number]; days: DayPlan[] };

type Preferences = {
  comfortTempC: [min: number, max: number];
  avoidRainAbovePct: number;
  likeTags: string[];
  avoidTags: string[];
  maxWalkMin: number; // longest leg the user will walk before switching to cycle or drive
  modes: TravelMode[]; // modes the user allows
  dayStartMin: number; // leave the hotel, default 540 (9:00)
  dayEndMin: number; // back at the hotel, default 1320 (22:00)
};

type ForecastSlot = { date: string; startMin: number; tempC: number; rainPct: number; windMs: number; thunderstorm: boolean };
type SlotScore = { date: string; startMin: number; outdoor: number; reason: string }; // outdoor is 0 to 1

function scoreSlots(forecast: ForecastSlot[], prefs: Preferences): SlotScore[];
function planItinerary(input: {
  hotel: [lng: number, lat: number];
  places: Place[];
  slots: SlotScore[];
  prefs: Preferences;
  travel: TravelMatrix; // includes the hotel
  dates: string[];
}): Itinerary;
```

### Weather scoring rules

- Each 3-hour forecast slot gets an outdoor score from 0 to 1.
- Rain probability above `avoidRainAbovePct` lowers the score.
- Temperature outside `comfortTempC` lowers the score.
- Strong wind lowers the score.
- Thunderstorms set the score to 0.
- Each score carries a plain reason string, such as "70% rain at 15:00", and the UI shows it next to the choice.
- `mixed` attractions can go in any slot.
- Days more than 5 days out have no forecast. Mark them "no forecast yet" and plan them without weather.

### Route optimization

`planItinerary` treats each day as a route problem with time windows, starting and ending at the hotel.

1. Pick candidates. Filter attractions by `likeTags` and `avoidTags`. Split them into one geographic cluster per day so each day stays in one area. Give the days with the best weather the clusters with the most outdoor stops.
2. Fill each day by time. Keep adding the highest-ranked attractions from the day's cluster while their visit lengths, meals, and travel fit between `dayStartMin` and `dayEndMin`. Search at most 8 attractions per day.
3. Schedule meals as fixed stops. Lunch starts between 12:00 and 13:00 and lasts 60 minutes. Dinner starts between 18:00 and 19:00 and lasts 90 minutes. For each meal, consider the few restaurants closest to the day's cluster that are open at that time.
4. Choose travel mode per leg. Walk if the walking time is at most `maxWalkMin`, otherwise cycle or drive, limited to `prefs.modes`. When the slot's outdoor score is low (rain, cold), prefer driving over walking or cycling.
5. Order the stops. Search every order exactly, including the meal restaurant choices. Visit as many attractions as fit, then minimize total travel minutes plus waiting minutes, plus a penalty for putting outdoor stops in low-scoring weather slots.
6. Enforce opening hours as a hard rule. A visit must fit fully inside the place's open hours. Places with unknown hours are allowed only between 10:00 and 17:00 (restaurants: at meal times), and the UI marks them "hours not confirmed".
7. Return legs with mode, minutes, and meters, and list the attractions that did not fit in `unscheduled` with the reason.

### Messages

- The user's message goes to `messagePreferences`, which returns an updated `Preferences` object. Validate it with a zod schema before use.
- The planner then reruns with the new preferences.

## Scraping policy

- Source: Wikivoyage city pages, fetched through the official MediaWiki API (`action=parse`). The content is CC BY-SA 4.0, so store the source URL and license on every place and credit Wikivoyage in the UI.
- Parse the "See" and "Do" listings as attractions and the "Eat" listings as restaurants with Cheerio. Target 60 to 80 cities and 1,000+ attractions.
- Run the scraper once and store the results in Firestore. The app reads only from Firestore and never scrapes at runtime.
- Send a descriptive User-Agent with a contact address, and wait at least 1 second between requests.
- Do not add code that evades anti-scraping protections: no rotating user agents, proxy pools, CAPTCHA solving, or headless-browser tricks.
- Opening hours come from the listing's hours field when it parses as OpenStreetMap `opening_hours`. Otherwise, look up the place once in OpenStreetMap through the Overpass API (match by name within 200 m of its coordinates) and store its `opening_hours` tag. Follow Overpass usage limits: one query at a time, with a descriptive User-Agent. If neither source has hours, store `null`.
- The classifier labels each attraction `indoor`, `outdoor`, or `mixed` from its section and keywords.
- Visit lengths: ask the OpenRouter model once per attraction for the typical visit length that visitors report, given its name, city, and description. Clamp the answer to 20 to 240 minutes. If the model fails or gives no number, use a category default (museum 120, park 90, viewpoint 30, other 60). Store which source was used.
- All scraped fields are stored, so none of these steps run again at runtime.

## Firestore collections

- `destinations`: one document per city, with its center point and UTC offset.
- `places`: one document per attraction or restaurant. Each stores a `geohash` field computed with `geofire-common`, and nearby queries range over that field.
- `trips`: saved itineraries and the preferences used to build them.

The server authenticates with a Firebase service account. Its credentials live only in `.env.local`. The browser never talks to Firestore directly.

## Rules for this project

- Do not use `useEffect`. Fetch data in server components or route handlers. ESLint enforces this.
- API keys stay on the server, in `.env.local`, which is gitignored. Never send them to the browser.
- Unit tests cover the logic in `src/domain/`. Adapters are tested separately with recorded API responses.

## Milestones

| # | Milestone | Done when | Needs |
|---|---|---|---|
| 1 | Scaffold | Next.js app, dependencies, lint rules. Done. | Nothing |
| 2 | Planning logic | Weather scoring, opening hours, meals, travel modes, and route ordering work and are tested with sample data. Done. | Nothing |
| 3 | Data | 1,000+ attractions plus restaurants from 60 to 80 cities in Firestore, with hours, indoor/outdoor labels, and visit lengths. | Firebase, OpenRouter |
| 4 | Live APIs | Real forecasts, travel times, route lines, and hotel geocoding feed the planner. | Working OpenWeatherMap key, OpenRouteService token |
| 5 | Itinerary page | Trip form, day cards, color-coded map. | Milestones 3 and 4 |
| 6 | Chat | Messages change preferences and the plan updates. | OpenRouter |
| 7 | Share and deploy | Trips saved with shareable links, live on Vercel. | Vercel account |
