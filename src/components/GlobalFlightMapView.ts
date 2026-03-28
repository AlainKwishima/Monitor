import maplibregl from 'maplibre-gl';
import { fetchLiveFlights, type LiveFlight } from '@/services/airlabs-flights';

const KIGALI_CENTER: [number, number] = [30.0619, -1.9441];
const KIGALI_ZOOM = 6;
const REFRESH_MS = 30_000;

const DARK_TILE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  },
  layers: [{ id: 'carto-dark-layer', type: 'raster', source: 'cartoDark' }],
};

function makePlaneEl(heading = 0): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'global-flight-plane';
  const inner = document.createElement('div');
  inner.className = 'global-flight-plane-inner';
  inner.style.transform = `rotate(${Math.round(heading)}deg)`;
  inner.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2 L17.5 10 L17 12 L27 17 L27 19 L17 16 L17 24 L20 26.5 L20 28 L16 27 L12 28 L12 26.5 L15 24 L15 16 L5 19 L5 17 L15 12 L14.5 10 Z" fill="#75d5ff" />
    </svg>
  `;
  el.appendChild(inner);
  return el;
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .global-flight-map-wrap { position: relative; width: 100%; height: 100%; min-height: 320px; border: 1px solid var(--border-color, #30363d); border-radius: 0; overflow: hidden; }
    .global-flight-map-canvas { width: 100%; height: 100%; min-height: 320px; }
    .global-flight-map-meta { position: absolute; top: 8px; left: 8px; z-index: 2; font-size: 11px; background: rgba(6, 8, 12, 0.82); color: #b6c7d8; border: 1px solid #273241; padding: 4px 8px; border-radius: 6px; }
    .global-flight-plane { width: 20px; height: 20px; transform-origin: 50% 50%; filter: drop-shadow(0 0 4px rgba(117, 213, 255, 0.55)); }
    .global-flight-plane-inner { width: 20px; height: 20px; transform-origin: 50% 50%; }
    .global-flight-map-wrap .maplibregl-popup-content { background: #0f141b; color: #d5e2ef; border: 1px solid #2d3e52; border-radius: 8px; padding: 8px 10px; }
    .global-flight-map-wrap .maplibregl-popup-tip { border-top-color: #0f141b; border-bottom-color: #0f141b; }
    .map-view-switch { display: flex; align-items: center; gap: 6px; margin-right: 8px; }
    .map-view-switch-btn { background: #111827; color: #93a4b8; border: 1px solid #2a3647; border-radius: 4px; font-size: 11px; padding: 3px 8px; cursor: pointer; }
    .map-view-switch-btn.active { background: #0f172a; color: #dbeafe; border-color: #3b82f6; }
  `;
  document.head.appendChild(style);
}

export class GlobalFlightMapView {
  private readonly host: HTMLElement;
  private mapEl: HTMLDivElement;
  private mapMetaEl: HTMLDivElement;
  private map: maplibregl.Map | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private markers = new Map<string, maplibregl.Marker>();
  private markerLastSeen = new Map<string, number>();
  private markerRetentionMs = 120_000;
  private destroyed = false;
  private active = false;

  constructor(host: HTMLElement) {
    this.host = host;
    injectStyles();

    this.host.innerHTML = '';
    this.host.classList.add('global-flight-map-wrap');

    this.mapEl = document.createElement('div');
    this.mapEl.className = 'global-flight-map-canvas';
    this.mapMetaEl = document.createElement('div');
    this.mapMetaEl.className = 'global-flight-map-meta';
    this.mapMetaEl.textContent = 'Loading live flights...';

    this.host.appendChild(this.mapEl);
    this.host.appendChild(this.mapMetaEl);

    this.initMap();
  }

  private initMap(): void {
    this.map = new maplibregl.Map({
      container: this.mapEl,
      style: DARK_TILE_STYLE,
      center: KIGALI_CENTER,
      zoom: KIGALI_ZOOM,
      attributionControl: false,
    });

    this.map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.on('load', () => {
      if (!this.active) return;
      void this.refreshFlights();
      this.refreshTimer = setInterval(() => {
        if (!this.active) return;
        void this.refreshFlights();
      }, REFRESH_MS);
    });
    this.map.on('moveend', () => {
      if (!this.active) return;
      void this.refreshFlights();
    });
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!this.map) return;
    if (active) {
      this.resize();
      void this.refreshFlights();
    }
  }

  resize(): void {
    this.map?.resize();
  }

  private getBboxParam(): string | null {
    if (!this.map) return null;
    const bounds = this.map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return `${sw.lat.toFixed(4)},${sw.lng.toFixed(4)},${ne.lat.toFixed(4)},${ne.lng.toFixed(4)}`;
  }

  private markerPopupHtml(flight: LiveFlight): string {
    const flightCode = flight.flight_iata || flight.flight_icao || flight.hex || 'Unknown';
    return `
      <div>
        <div style="font-weight:700;margin-bottom:4px;">${flightCode}</div>
        <div>Altitude: ${Number.isFinite(flight.alt) ? Math.round(flight.alt) : 0} ft</div>
        <div>Speed: ${Number.isFinite(flight.speed) ? Math.round(flight.speed) : 0} km/h</div>
      </div>
    `;
  }

  private getFlightKey(flight: LiveFlight): string {
    if (flight.hex) return `hex:${flight.hex}`;
    if (flight.flight_icao) return `icao:${flight.flight_icao}`;
    if (flight.flight_iata) return `iata:${flight.flight_iata}`;
    return `geo:${flight.lat.toFixed(3)}:${flight.lng.toFixed(3)}:${Math.round(flight.alt || 0)}:${Math.round(flight.speed || 0)}`;
  }

  private upsertMarker(flight: LiveFlight): void {
    const key = this.getFlightKey(flight);
    const existing = this.markers.get(key);
    if (existing) {
      existing.setLngLat([flight.lng, flight.lat]);
      const el = existing.getElement() as HTMLDivElement | null;
      const inner = el?.querySelector('.global-flight-plane-inner') as HTMLDivElement | null;
      if (inner) inner.style.transform = `rotate(${Math.round(flight.dir || 0)}deg)`;
      const popup = existing.getPopup();
      if (popup) popup.setHTML(this.markerPopupHtml(flight));
      this.markerLastSeen.set(key, Date.now());
      return;
    }

    const popup = new maplibregl.Popup({ offset: 12 }).setHTML(this.markerPopupHtml(flight));
    const marker = new maplibregl.Marker({ element: makePlaneEl(flight.dir || 0), anchor: 'center' })
      .setLngLat([flight.lng, flight.lat])
      .setPopup(popup);
    if (this.map) marker.addTo(this.map);
    const markerEl = marker.getElement();
    markerEl.addEventListener('mouseenter', () => {
      if (!this.map) return;
      popup.addTo(this.map);
    });
    markerEl.addEventListener('mouseleave', () => {
      popup.remove();
    });
    this.markers.set(key, marker);
    this.markerLastSeen.set(key, Date.now());
  }

  private syncMarkers(flights: LiveFlight[]): void {
    const seen = new Set<string>();
    for (const flight of flights) {
      const key = this.getFlightKey(flight);
      seen.add(key);
      this.upsertMarker(flight);
    }

    const now = Date.now();
    for (const [key, marker] of this.markers.entries()) {
      if (seen.has(key)) continue;
      const lastSeen = this.markerLastSeen.get(key) ?? 0;
      if (now - lastSeen < this.markerRetentionMs) continue;
      marker.remove();
      this.markers.delete(key);
      this.markerLastSeen.delete(key);
    }
  }

  private async refreshFlights(): Promise<void> {
    if (!this.map || this.destroyed || !this.active) return;
    try {
      const payload = await fetchLiveFlights({
        bbox: this.getBboxParam() ?? undefined,
        zoom: Math.round(this.map.getZoom()),
      });
      if (payload.count > 0) {
        this.syncMarkers(payload.flights);
      }
      const stamp = new Date(payload.fetchedAt).toLocaleTimeString([], { hour12: false });
      this.mapMetaEl.textContent = `Live flights: ${Math.max(payload.count, this.markers.size)} • Updated ${stamp}`;
    } catch (error) {
      this.mapMetaEl.textContent = `Live flights unavailable (${String(error)})`;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear();
    this.map?.remove();
    this.map = null;
    this.host.innerHTML = '';
  }
}
