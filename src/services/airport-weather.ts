import type { MonitoredAirport } from '@/types';
import { toApiUrl } from '@/services/runtime';

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache:
  | { ts: number; airportIata: string; data: AirportWeatherForecast }
  | null = null;

const RWANDA_AIRPORTS: MonitoredAirport[] = [
  { iata: 'KGL', icao: 'HRYR', name: 'Kigali International', city: 'Kigali', country: 'Rwanda', lat: -1.9686, lon: 30.1395, region: 'africa' },
  { iata: 'KME', icao: 'HRZA', name: 'Kamembe Airport', city: 'Kamembe', country: 'Rwanda', lat: -2.4622, lon: 28.9079, region: 'africa' },
  { iata: 'GYI', icao: 'HRYG', name: 'Gisenyi Airport', city: 'Gisenyi', country: 'Rwanda', lat: -1.6772, lon: 29.2589, region: 'africa' },
];

export interface AirportWeatherPoint {
  time: string;
  values: {
    temperature?: number;
    temperatureApparent?: number;
    humidity?: number;
    windSpeed?: number;
    windGust?: number;
    windDirection?: number;
    precipitationProbability?: number;
    precipitationIntensity?: number;
    cloudCover?: number;
    visibility?: number;
    pressureSeaLevel?: number;
    uvIndex?: number;
    weatherCode?: number;
  };
}

export interface AirportWeatherForecast {
  airport: MonitoredAirport;
  updatedAt: string;
  hourly: AirportWeatherPoint[];
  daily: AirportWeatherPoint[];
}

function resolveAirport(): MonitoredAirport {
  // Forecast panel now intentionally focuses on Rwanda airports only.
  // Default to Kigali for stable, always-present coverage.
  return RWANDA_AIRPORTS[0]!;
}

async function fetchTomorrowForecast(airport: MonitoredAirport): Promise<AirportWeatherForecast> {
  const endpoint = toApiUrl(`/api/airport-weather?lat=${airport.lat}&lon=${airport.lon}`);
  const resp = await fetch(endpoint);
  if (!resp.ok) {
    throw new Error(`Tomorrow.io forecast failed: ${resp.status}`);
  }
  const json = await resp.json() as {
    timelines?: Array<{ timestep: string; intervals: AirportWeatherPoint[] }>
      | { hourly?: AirportWeatherPoint[]; daily?: AirportWeatherPoint[] };
  };

  let hourly: AirportWeatherPoint[] = [];
  let daily: AirportWeatherPoint[] = [];
  if (Array.isArray(json.timelines)) {
    const timelines = json.timelines;
    hourly = timelines.find(t => t.timestep === '1h')?.intervals ?? [];
    daily = timelines.find(t => t.timestep === '1d')?.intervals ?? [];
  } else if (json.timelines && typeof json.timelines === 'object') {
    hourly = Array.isArray(json.timelines.hourly) ? json.timelines.hourly : [];
    daily = Array.isArray(json.timelines.daily) ? json.timelines.daily : [];
  }

  return {
    airport,
    updatedAt: new Date().toISOString(),
    hourly,
    daily,
  };
}

export async function fetchAirportWeatherForecast(): Promise<AirportWeatherForecast | null> {
  const airport = resolveAirport();
  if (_cache && _cache.airportIata === airport.iata && Date.now() - _cache.ts < CACHE_TTL_MS) {
    return _cache.data;
  }
  try {
    const data = await fetchTomorrowForecast(airport);
    _cache = { ts: Date.now(), airportIata: airport.iata, data };
    return data;
  } catch {
    return _cache?.data ?? null;
  }
}
