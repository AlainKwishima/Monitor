import { toApiUrl } from '@/services/runtime';

export type RwandaFlightDirection = 'arrival' | 'departure';

export interface RwandaFlightRecord {
  id: string;
  direction: RwandaFlightDirection;
  matchedAirport: string;
  flightDate: string;
  status: string;
  airline: {
    name?: string;
    iata?: string;
    icao?: string;
  };
  flight: {
    number?: string;
    iata?: string;
    icao?: string;
    codeshared?: unknown;
  };
  departure: Record<string, unknown>;
  arrival: Record<string, unknown>;
  aircraft: unknown;
  live: unknown;
  raw: Record<string, unknown>;
}

export interface RwandaFlightsPayload {
  source: string;
  country: string;
  airports: string[];
  fetchedAt: string;
  totalFlights: number;
  inbound: number;
  outbound: number;
  flights: RwandaFlightRecord[];
}

const CACHE_TTL_MS = 2 * 60 * 1000;
let cache: { ts: number; payload: RwandaFlightsPayload } | null = null;

export async function fetchRwandaFlights(airport?: string): Promise<RwandaFlightsPayload> {
  if (!airport && cache && Date.now() - cache.ts < CACHE_TTL_MS) {
    return cache.payload;
  }

  const qs = airport ? `?airport=${encodeURIComponent(airport)}` : '';
  const resp = await fetch(toApiUrl(`/api/rwanda-flights${qs}`));
  if (!resp.ok) throw new Error(`Rwanda flights API failed: ${resp.status}`);

  const payload = await resp.json() as RwandaFlightsPayload;
  if (!airport) {
    cache = { ts: Date.now(), payload };
  }
  return payload;
}
