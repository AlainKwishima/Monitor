import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';
import { jsonResponse } from './_json-response.js';

export const config = { runtime: 'edge' };

const AIRLABS_BASE_URL = 'https://airlabs.co/api/v9/flights';
const FALLBACK_API_KEY = '2468e373-3b06-4081-af18-5d692524b883';

function sanitizeBbox(value) {
  if (!value) return null;
  const parts = String(value).split(',').map((v) => Number(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [swLat, swLng, neLat, neLng] = parts;
  return `${swLat},${swLng},${neLat},${neLng}`;
}

export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (isDisallowedOrigin(req)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, corsHeaders);
  }

  const apiKey = process.env.AIRLABS_API_KEY || FALLBACK_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: 'Missing AIRLABS_API_KEY' }, 500, corsHeaders);
  }

  const url = new URL(req.url);
  const bbox = sanitizeBbox(url.searchParams.get('bbox'));
  const zoom = Number(url.searchParams.get('zoom') || '0');
  const upstreamParams = new URLSearchParams({ api_key: apiKey });
  if (bbox) upstreamParams.set('bbox', bbox);
  if (Number.isFinite(zoom) && zoom >= 0 && zoom <= 11) {
    upstreamParams.set('zoom', String(Math.round(zoom)));
  }

  try {
    const upstream = await fetch(`${AIRLABS_BASE_URL}?${upstreamParams.toString()}`, {
      headers: { 'User-Agent': 'AuroraMonitor/1.0' },
    });
    if (!upstream.ok) {
      return jsonResponse({ error: `upstream ${upstream.status}` }, 502, corsHeaders);
    }

    const payload = await upstream.json();
    if (payload?.error) {
      return jsonResponse({ error: payload.error?.message || 'Airlabs API error', details: payload.error }, 502, corsHeaders);
    }

    const flights = Array.isArray(payload?.response) ? payload.response : [];
    const normalized = flights
      .filter((f) => Number.isFinite(f?.lat) && Number.isFinite(f?.lng))
      .map((f) => ({
        id: f.hex || f.flight_icao || f.flight_iata || `${f.lat}:${f.lng}`,
        hex: f.hex || '',
        flight_iata: f.flight_iata || '',
        flight_icao: f.flight_icao || '',
        airline_iata: f.airline_iata || '',
        airline_icao: f.airline_icao || '',
        lat: Number(f.lat),
        lng: Number(f.lng),
        alt: Number(f.alt || 0),
        speed: Number(f.speed || 0),
        dir: Number(f.dir || 0),
      }));

    return jsonResponse(
      {
        source: 'airlabs',
        fetchedAt: new Date().toISOString(),
        count: normalized.length,
        flights: normalized,
      },
      200,
      {
        'Cache-Control': 's-maxage=20, stale-while-revalidate=20, stale-if-error=60',
        ...corsHeaders,
      },
    );
  } catch (error) {
    return jsonResponse(
      { error: 'Failed to fetch flights', message: String(error?.message || error || 'unknown') },
      502,
      corsHeaders,
    );
  }
}
