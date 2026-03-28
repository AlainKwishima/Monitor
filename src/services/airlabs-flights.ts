import { toApiUrl } from '@/services/runtime';

export interface LiveFlight {
  id: string;
  hex: string;
  flight_iata: string;
  flight_icao: string;
  airline_iata: string;
  airline_icao: string;
  lat: number;
  lng: number;
  alt: number;
  speed: number;
  dir: number;
}

export interface LiveFlightsPayload {
  source: string;
  fetchedAt: string;
  count: number;
  flights: LiveFlight[];
}

export async function fetchLiveFlights(params?: { bbox?: string; zoom?: number }): Promise<LiveFlightsPayload> {
  const qs = new URLSearchParams();
  if (params?.bbox) qs.set('bbox', params.bbox);
  if (typeof params?.zoom === 'number' && Number.isFinite(params.zoom)) qs.set('zoom', String(params.zoom));
  const url = `/api/airlabs-flights${qs.toString() ? `?${qs.toString()}` : ''}`;

  const resp = await fetch(toApiUrl(url));
  if (!resp.ok) throw new Error(`Live flights request failed: ${resp.status}`);

  return await resp.json() as LiveFlightsPayload;
}
