import type { ForecastSlot, LngLat } from "../domain/types";

export type Forecast = { slots: ForecastSlot[]; utcOffsetSec: number };

type OpenWeatherResponse = {
  cod: string;
  message?: string | number;
  city: { timezone: number };
  list: {
    dt: number;
    main: { temp: number };
    weather: { id: number }[];
    wind: { speed: number };
    pop: number;
  }[];
};

const FORECAST_CACHE_SEC = 30 * 60;

export async function fetchForecast([lng, lat]: LngLat): Promise<Forecast> {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error("OPENWEATHER_API_KEY is not set in .env.local");
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), units: "metric", appid: key });
  const response = await fetch(`https://api.openweathermap.org/data/2.5/forecast?${params}`, {
    next: { revalidate: FORECAST_CACHE_SEC },
  });
  const body = (await response.json()) as OpenWeatherResponse;
  if (!response.ok) throw new Error(`OpenWeatherMap: ${response.status} ${body.message ?? ""}`);
  return parseForecast(body);
}

// Converts UTC timestamps to the city's wall-clock date and minutes, using the offset
// OpenWeatherMap reports for the city.
export function parseForecast(body: OpenWeatherResponse): Forecast {
  const utcOffsetSec = body.city.timezone;
  const slots = body.list.map((item): ForecastSlot => {
    const local = new Date((item.dt + utcOffsetSec) * 1000);
    return {
      date: local.toISOString().slice(0, 10),
      startMin: local.getUTCHours() * 60 + local.getUTCMinutes(),
      tempC: item.main.temp,
      rainPct: Math.round(item.pop * 100),
      windMs: item.wind.speed,
      // OpenWeatherMap condition codes 200 to 299 are thunderstorms.
      thunderstorm: item.weather.some((w) => w.id >= 200 && w.id < 300),
    };
  });
  return { slots, utcOffsetSec };
}
