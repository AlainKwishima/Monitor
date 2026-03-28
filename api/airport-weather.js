import { getCorsHeaders, isDisallowedOrigin } from './_cors.js';

export const config = { runtime: 'edge' };

const TOMORROW_BASE_URL = 'https://api.tomorrow.io/v4/weather/forecast';
const FALLBACK_API_KEY = '43cspUyPKvqpahlICsM7wAeK2RZCtKNQ';

const FIELDS = [
  'temperature',
  'temperatureApparent',
  'humidity',
  'windSpeed',
  'windGust',
  'windDirection',
  'precipitationProbability',
  'precipitationIntensity',
  'cloudCover',
  'visibility',
  'pressureSeaLevel',
  'uvIndex',
  'weatherCode',
];

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (isDisallowedOrigin(req)) {
    return new Response('Forbidden', { status: 403, headers: getCorsHeaders(req) });
  }

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get('lat'));
  const lon = Number(url.searchParams.get('lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ error: 'lat/lon required' }), {
      status: 400,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
      },
    });
  }

  const apiKey = process.env.TOMORROW_API_KEY || FALLBACK_API_KEY;
  const params = new URLSearchParams({
    location: `${lat},${lon}`,
    apikey: apiKey,
    units: 'metric',
    timesteps: '1h,1d',
    fields: FIELDS.join(','),
  });

  const upstream = await fetch(`${TOMORROW_BASE_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': 'WorldMonitor/1.0',
    },
  });

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: `upstream ${upstream.status}` }), {
      status: 502,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'application/json',
      },
    });
  }

  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
