import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { jsonResponse } from './_json-response.js';

export const config = { runtime: 'edge' };

const RWANDA_AIRPORTS = ['KGL', 'KME', 'GYI', 'RHG'];
const FALLBACK_API_KEY = '9b9700ce055bab9c17126283ac1c07dc';
const API_BASES = ['https://api.aviationstack.com/v1/flights', 'http://api.aviationstack.com/v1/flights'];
const PAGE_LIMIT = 100;
const MAX_PAGES_PER_QUERY = 2;

function sanitizeIata(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

async function fetchAviationStack(params) {
  let lastError = null;
  for (const base of API_BASES) {
    const url = `${base}?${params.toString()}`;
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'WorldMonitor/1.0' },
      });
      const text = await resp.text();
      const json = text ? JSON.parse(text) : {};
      if (resp.ok) return json;

      const msg = String(json?.error?.message || '');
      const code = String(json?.error?.code || '');
      const httpsRestricted = code.toLowerCase().includes('https') || msg.toLowerCase().includes('https');
      if (!httpsRestricted) {
        return { data: [], pagination: { count: 0, total: 0, offset: 0, limit: PAGE_LIMIT }, _error: `upstream:${resp.status}` };
      }
      lastError = new Error(msg || `HTTP ${resp.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Failed to fetch aviation data');
}

function normalizeFlight(raw, direction, matchedAirport) {
  const dep = raw?.departure || {};
  const arr = raw?.arrival || {};
  const airline = raw?.airline || {};
  const flight = raw?.flight || {};
  const aircraft = raw?.aircraft || null;
  const live = raw?.live || null;

  const idParts = [
    direction,
    raw?.flight_date || '',
    flight?.iata || flight?.icao || flight?.number || '',
    dep?.iata || dep?.icao || '',
    arr?.iata || arr?.icao || '',
    dep?.scheduled || '',
    arr?.scheduled || '',
  ];

  return {
    id: idParts.join('|'),
    direction,
    matchedAirport,
    flightDate: raw?.flight_date || '',
    status: raw?.flight_status || 'unknown',
    airline: {
      name: airline?.name || '',
      iata: airline?.iata || '',
      icao: airline?.icao || '',
    },
    flight: {
      number: flight?.number || '',
      iata: flight?.iata || '',
      icao: flight?.icao || '',
      codeshared: flight?.codeshared || null,
    },
    departure: dep,
    arrival: arr,
    aircraft,
    live,
    raw,
  };
}

async function fetchForAirportDirection(apiKey, airport, direction) {
  const key = direction === 'arrival' ? 'arr_iata' : 'dep_iata';
  const rows = [];

  for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
    const offset = page * PAGE_LIMIT;
    const params = new URLSearchParams({
      access_key: apiKey,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
      [key]: airport,
    });

    const json = await fetchAviationStack(params);
    const data = Array.isArray(json?.data) ? json.data : [];
    rows.push(...data.map((raw) => normalizeFlight(raw, direction, airport)));

    const total = Number(json?.pagination?.total || 0);
    if (data.length < PAGE_LIMIT) break;
    if (total > 0 && offset + PAGE_LIMIT >= total) break;
  }

  return rows;
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (isDisallowedOrigin(req)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, corsHeaders);
  }

  const url = new URL(req.url);
  const apiKey = process.env.AVIATIONSTACK_API_KEY || FALLBACK_API_KEY;
  const airportParam = sanitizeIata(url.searchParams.get('airport'));
  const airports = airportParam ? [airportParam] : RWANDA_AIRPORTS;

  if (!apiKey) {
    return jsonResponse({ error: 'Missing AVIATIONSTACK_API_KEY' }, 500, corsHeaders);
  }

  try {
    const combined = [];
    for (const airport of airports) {
      const [arrivals, departures] = await Promise.all([
        fetchForAirportDirection(apiKey, airport, 'arrival'),
        fetchForAirportDirection(apiKey, airport, 'departure'),
      ]);
      combined.push(...arrivals, ...departures);
    }

    const deduped = Array.from(new Map(combined.map((f) => [f.id, f])).values())
      .sort((a, b) => {
        const aTs = Date.parse(a.departure?.scheduled || a.arrival?.scheduled || '') || 0;
        const bTs = Date.parse(b.departure?.scheduled || b.arrival?.scheduled || '') || 0;
        return bTs - aTs;
      });

    const inbound = deduped.filter((f) => f.direction === 'arrival').length;
    const outbound = deduped.filter((f) => f.direction === 'departure').length;

    return jsonResponse({
      source: 'aviationstack',
      country: 'Rwanda',
      airports,
      fetchedAt: new Date().toISOString(),
      totalFlights: deduped.length,
      inbound,
      outbound,
      flights: deduped,
    }, 200, {
      'Cache-Control': 's-maxage=120, stale-while-revalidate=120, stale-if-error=300',
      ...corsHeaders,
    });
  } catch (error) {
    return jsonResponse({
      error: 'Failed to fetch Rwanda flights',
      message: String(error?.message || error || 'unknown'),
    }, 502, corsHeaders);
  }
}
