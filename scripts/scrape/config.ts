import path from "node:path";

export const USER_AGENT =
  "WeatherTripPlanner/0.1 (https://github.com/ChesterHuey1/Weather-Trip-Planner; one-time data collection)";

export const REQUEST_DELAY_MS = 1100;

export const CACHE_DIR = path.join(import.meta.dirname, ".cache");
export const DATA_DIR = path.join(import.meta.dirname, "..", "..", "data");

// Wikivoyage page titles. Large cities are split into district pages on Wikivoyage, so those
// entries name the central district that holds the listings.
export const CITY_PAGES: { page: string; city: string }[] = [
  { page: "Chicago/Loop", city: "Chicago" },
  { page: "Chicago/Near North", city: "Chicago" },
  { page: "San Francisco/Union Square-Financial District", city: "San Francisco" },
  { page: "San Francisco/Fisherman's Wharf", city: "San Francisco" },
  { page: "Washington, D.C./National Mall", city: "Washington, D.C." },
  { page: "Boston/Downtown", city: "Boston" },
  { page: "Seattle/Downtown", city: "Seattle" },
  { page: "New Orleans/French Quarter", city: "New Orleans" },
  { page: "Savannah", city: "Savannah" },
  { page: "Charleston (South Carolina)", city: "Charleston" },
  { page: "Asheville", city: "Asheville" },
  { page: "San Diego/Downtown", city: "San Diego" },
  { page: "Philadelphia/Center City East", city: "Philadelphia" },
  { page: "Nashville", city: "Nashville" },
  { page: "Portland (Maine)", city: "Portland, Maine" },
  { page: "Denver", city: "Denver" },
  { page: "Salt Lake City", city: "Salt Lake City" },
  { page: "Pittsburgh/Downtown", city: "Pittsburgh" },
  { page: "Vancouver/Downtown", city: "Vancouver" },
  { page: "Montreal/Old Montreal", city: "Montreal" },
  { page: "Quebec City", city: "Quebec City" },
  { page: "Toronto/Downtown", city: "Toronto" },
  { page: "Oaxaca (city)", city: "Oaxaca" },
  { page: "London/Westminster", city: "London" },
  { page: "London/City of London", city: "London" },
  { page: "Paris/1st arrondissement", city: "Paris" },
  { page: "Paris/7th arrondissement", city: "Paris" },
  { page: "Barcelona/Ciutat Vella", city: "Barcelona" },
  { page: "Porto", city: "Porto" },
  { page: "Seville", city: "Seville" },
  { page: "Granada", city: "Granada" },
  { page: "Florence", city: "Florence" },
  { page: "Bologna", city: "Bologna" },
  { page: "Berlin/Mitte", city: "Berlin" },
  { page: "Vienna/Innere Stadt", city: "Vienna" },
  { page: "Prague/Old Town", city: "Prague" },
  { page: "Kraków", city: "Kraków" },
  { page: "Copenhagen/Indre By", city: "Copenhagen" },
  { page: "Stockholm/Gamla stan", city: "Stockholm" },
  { page: "Edinburgh/Old Town", city: "Edinburgh" },
  { page: "Bruges", city: "Bruges" },
  { page: "Istanbul/Sultanahmet-Old City", city: "Istanbul" },
  { page: "Athens", city: "Athens" },
  { page: "Dubrovnik", city: "Dubrovnik" },
  { page: "Tokyo/Asakusa", city: "Tokyo" },
  { page: "Tokyo/Shinjuku", city: "Tokyo" },
  { page: "Kyoto/Higashiyama", city: "Kyoto" },
  { page: "Osaka/Minami", city: "Osaka" },
  { page: "Seoul/Jongno", city: "Seoul" },
  { page: "Singapore/Marina Bay", city: "Singapore" },
  { page: "Hong Kong/Central and Western", city: "Hong Kong" },
  { page: "Bangkok/Rattanakosin", city: "Bangkok" },
  { page: "Hanoi", city: "Hanoi" },
  { page: "Sydney/City Centre", city: "Sydney" },
  { page: "Melbourne/City Centre", city: "Melbourne" },
  { page: "Marrakech", city: "Marrakech" },
  { page: "Buenos Aires/Microcentro", city: "Buenos Aires" },
  { page: "Rio de Janeiro/Centro", city: "Rio de Janeiro" },
  { page: "Cusco", city: "Cusco" },
];
