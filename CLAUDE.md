# Weather Trip Planner

A web app that builds day-by-day trip itineraries. It puts outdoor activities in good-weather time slots and indoor activities where the forecast is bad. Users can type messages such as "I hate the cold" or "more museums, no hiking" to change the plan.

## Goals

- The user picks a city and dates and gets a day-by-day itinerary.
- Outdoor attractions go in high-scoring weather slots. Indoor attractions fill slots with rain, storms, or temperatures outside the user's comfort range.
- Free-text messages change the plan's preferences.
- Each day's route is the fastest one found: stops are grouped by area and ordered to minimize total travel and waiting time.
- Every visit happens while the attraction is open.
- The itinerary shows how to get between stops: mode, travel time, and distance for each leg.
- Everything runs on free tiers.

## Stack

- Next.js (App Router) with TypeScript, deployed on Vercel's free tier.
- Firebase Firestore free tier (Spark plan) for NoSQL storage. The server accesses it with `firebase-admin`. Nearby-location queries use geohashes from `geofire-common`.
- OpenWeatherMap free "5 day / 3 hour forecast" API for weather.
- OpenRouteService free tier for travel times. Use the matrix endpoint (about 500 requests a day, up to 3,500 origin-destination pairs each) with the `foot-walking`, `cycling-regular`, and `driving-car` profiles. Cache matrices per city and candidate set.
- `opening_hours` npm package for parsing opening hours in OpenStreetMap format.
- OpenRouter for the language model, used only to turn user messages into a `Preferences` object. The model is set by `OPENROUTER_MODEL` in `.env.local`, so a free model can be used. Do not use the Anthropic Claude API directly.
- Cheerio for parsing scraped HTML.

## Architecture

Decision: scoring rules decide indoor vs outdoor. The language model never builds the itinerary. It only parses messages into `Preferences`. This keeps plans deterministic, testable, and explainable.

```
scripts/scrape/     one-time scraper: fetch, parse (Cheerio), classify, load
src/domain/         pure logic, no network or database calls: types, weatherScore, planItinerary
src/adapters/       openWeather, openRoute, firestore, messagePreferences
app/                Next.js pages and route handlers
```

Dependency direction:

- `app/` may import `src/adapters/` and `src/domain/`.
- `src/adapters/` may import `src/domain/` types.
- `src/domain/` imports nothing from `app/`, `src/adapters/`, or any network or database library.
- `scripts/scrape/` may import `src/domain/` types and `src/adapters/firestore`. Nothing in `app/` or `src/` imports from `scripts/`.

Once the project is set up, add a lint rule that fails the build when `src/domain/` imports an adapter or a network library.

### Core types

```ts
type Setting = "indoor" | "outdoor" | "mixed";

type Attraction = {
  id: string;
  city: string;
  name: string;
  setting: Setting;
  tags: string[];
  location: [lng: number, lat: number];
  durationMin: number;
  openingHours: string | null; // OpenStreetMap opening_hours format; null means unknown
  source: { url: string; license: "CC BY-SA 4.0" };
};

type TravelMode = "walk" | "cycle" | "drive";

type Leg = { from: string; to: string; mode: TravelMode; minutes: number; meters: number };

type Visit = { attractionId: string; arrive: Date; leave: Date; reason: string };

type DayPlan = { date: string; visits: Visit[]; legs: Leg[]; totalTravelMin: number };

type Itinerary = DayPlan[];

type Preferences = {
  comfortTempC: [min: number, max: number];
  avoidRainAbovePct: number;
  likeTags: string[];
  avoidTags: string[];
  maxWalkMin: number; // longest leg the user will walk before switching to cycle or drive
  modes: TravelMode[]; // modes the user allows
};

type SlotScore = { start: Date; outdoor: number; reason: string }; // outdoor is 0 to 1

function scoreSlots(forecast: ForecastSlot[], prefs: Preferences): SlotScore[];
function planItinerary(input: {
  attractions: Attraction[];
  slots: SlotScore[];
  prefs: Preferences;
  travel: TravelMatrix;
  days: DateRange;
}): Itinerary;
```

### Weather scoring rules

- Each 3-hour forecast slot gets an outdoor score from 0 to 1.
- Rain probability above `avoidRainAbovePct` lowers the score.
- Temperature outside `comfortTempC` lowers the score.
- Strong wind lowers the score.
- Thunderstorms set the score to 0.
- Each score carries a plain reason string, such as "70% rain at 3pm", and the UI shows it next to the choice.
- `mixed` attractions can go in any slot.
- Days more than 5 days out have no forecast. Mark them "no forecast yet" and plan them without weather.

### Route optimization

`planItinerary` treats each day as a route problem with time windows.

1. Pick candidates. Filter attractions by `likeTags` and `avoidTags`, then split them into one geographic cluster per day so each day stays in one area.
2. Choose travel mode per leg. Walk if the walking time is at most `maxWalkMin`, otherwise cycle or drive, limited to `prefs.modes`. When the slot's outdoor score is low (rain, cold), prefer driving over walking or cycling.
3. Order the stops. With 8 or fewer stops a day, search every order exactly (dynamic programming over subsets). Minimize total travel minutes plus waiting minutes, plus a penalty for putting outdoor stops in low-scoring weather slots.
4. Enforce opening hours as a hard rule. A visit must fit fully inside the attraction's open hours. Attractions with unknown hours are allowed only between 10:00 and 17:00, and the UI marks them "hours not confirmed".
5. Return legs with mode, minutes, and meters so the UI can show directions between stops.

### Messages

- The user's message goes to `messagePreferences`, which returns an updated `Preferences` object. Validate it with a schema before use.
- The planner then reruns with the new preferences.

## Scraping policy

- Source: Wikivoyage city pages, fetched through the official MediaWiki API (`action=parse`). The content is CC BY-SA 4.0, so store the source URL and license on every attraction and credit Wikivoyage in the UI.
- Parse the "See" and "Do" listings with Cheerio. Target 60 to 80 cities and 1,000+ attractions.
- Run the scraper once and store the results in Firestore. The app reads only from Firestore and never scrapes at runtime.
- Send a descriptive User-Agent with a contact address, and wait at least 1 second between requests.
- Do not add code that evades anti-scraping protections: no rotating user agents, proxy pools, CAPTCHA solving, or headless-browser tricks.
- Opening hours come from the listing's hours field when it parses as OpenStreetMap `opening_hours`. Otherwise, look up the attraction once in OpenStreetMap through the Overpass API (match by name within 200 m of its coordinates) and store its `opening_hours` tag. Follow Overpass usage limits: one query at a time, with a descriptive User-Agent. If neither source has hours, store `null`.
- The classifier labels each attraction `indoor`, `outdoor`, or `mixed` from its section and keywords. The results are stored, so it runs only once.

## Firestore collections

- `destinations`: one document per city.
- `attractions`: one document per listing. Each stores a `geohash` field computed with `geofire-common`, and nearby queries range over that field.
- `trips`: saved itineraries and the preferences used to build them.

The server authenticates with a Firebase service account. Its credentials live only in `.env.local`. The browser never talks to Firestore directly.

## Rules for this project

- Do not use `useEffect`. Fetch data in server components or route handlers.
- API keys stay on the server, in `.env.local`, which is gitignored. Never send them to the browser.
- Unit tests cover the logic in `src/domain/`. Adapters are tested separately with recorded API responses.

## Build order

1. Scaffold the Next.js app, set up Firestore, add the lint rule for dependency direction.
2. Write the domain types, `scoreSlots`, and `planItinerary` with unit tests.
3. Write the scraper and load 1,000+ attractions.
4. Write the OpenWeatherMap and OpenRouteService adapters.
5. Build the itinerary page.
6. Add the message box and `messagePreferences`.
