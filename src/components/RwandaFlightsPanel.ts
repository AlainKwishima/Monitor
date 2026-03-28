import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import type { RwandaFlightsPayload, RwandaFlightRecord } from '@/services/rwanda-flights';

let styleInjected = false;
function injectStyles(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .rwf-wrap { display: grid; gap: 8px; font-size: 12px; }
    .rwf-summary { display: flex; flex-wrap: wrap; gap: 8px; font-size: 11px; color: var(--text-secondary, #9ca3af); }
    .rwf-chip { border: 1px solid var(--border-color, #30363d); border-radius: 999px; padding: 2px 8px; }
    .rwf-table { border: 1px solid var(--border-color, #30363d); border-radius: 8px; overflow: hidden; }
    .rwf-head, .rwf-row { display: grid; grid-template-columns: 80px 120px 1fr 120px 110px; gap: 8px; padding: 8px 10px; align-items: center; }
    .rwf-head { background: rgba(255,255,255,0.03); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-secondary, #9ca3af); }
    .rwf-row { border-top: 1px solid var(--border-color, #30363d); }
    .rwf-row:first-of-type { border-top: 0; }
    .rwf-dir { font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .rwf-arrival { color: #38bdf8; }
    .rwf-departure { color: #f59e0b; }
    .rwf-flight { font-weight: 600; }
    .rwf-route { color: var(--text-secondary, #cbd5e1); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rwf-status { font-size: 11px; color: var(--text-secondary, #d1d5db); }
    .rwf-time { font-size: 11px; color: var(--text-secondary, #9ca3af); }
    .rwf-details { border: 1px solid var(--border-color, #30363d); border-radius: 8px; padding: 8px 10px; }
    .rwf-details > summary { cursor: pointer; font-size: 11px; color: var(--text-secondary, #cbd5e1); }
    .rwf-json { margin-top: 8px; max-height: 260px; overflow: auto; font-size: 10px; line-height: 1.4; color: var(--text-secondary, #d1d5db); white-space: pre-wrap; }
  `;
  document.head.appendChild(style);
}

function formatDateTime(value: unknown): string {
  if (!value || typeof value !== 'string') return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getIataFromLeg(leg: Record<string, unknown> | undefined): string {
  if (!leg) return '-';
  return String(leg.iata || leg.icao || leg.airport || '-');
}

function getRouteLabel(flight: RwandaFlightRecord): string {
  const from = getIataFromLeg(flight.departure as Record<string, unknown> | undefined);
  const to = getIataFromLeg(flight.arrival as Record<string, unknown> | undefined);
  return `${from} -> ${to}`;
}

function getFlightLabel(flight: RwandaFlightRecord): string {
  const f = flight.flight || {};
  const a = flight.airline || {};
  const code = f.iata || f.icao || f.number || 'Unknown';
  const carrier = a.name || a.iata || '';
  return carrier ? `${code} (${carrier})` : String(code);
}

export class RwandaFlightsPanel extends Panel {
  private payload: RwandaFlightsPayload | null = null;
  private errorMessage = '';

  constructor() {
    super({ id: 'rwanda-flights', title: 'Rwanda Flights Monitor', showCount: true });
    injectStyles();
    this.render();
  }

  updateFlights(payload: RwandaFlightsPayload): void {
    this.payload = payload;
    this.errorMessage = '';
    this.setCount(payload.totalFlights);
    this.setDataBadge(payload.totalFlights > 0 ? 'live' : 'unavailable');
    this.render();
  }

  showError(message = 'Rwanda flights data unavailable'): void {
    this.errorMessage = message;
    this.setDataBadge('unavailable');
    this.render();
  }

  private render(): void {
    if (this.errorMessage) {
      this.setContent(`<div class="rwf-wrap"><div class="rwf-status">${escapeHtml(this.errorMessage)}</div></div>`);
      return;
    }

    if (!this.payload) {
      this.setContent('<div class="rwf-wrap"><div class="rwf-status">Loading Rwanda flights...</div></div>');
      return;
    }

    const topFlights = this.payload.flights.slice(0, 120);
    const rows = topFlights.map((flight) => `
      <div class="rwf-row">
        <div class="rwf-dir ${flight.direction === 'arrival' ? 'rwf-arrival' : 'rwf-departure'}">${escapeHtml(flight.direction)}</div>
        <div class="rwf-flight">${escapeHtml(getFlightLabel(flight))}</div>
        <div class="rwf-route" title="${escapeHtml(getRouteLabel(flight))}">${escapeHtml(getRouteLabel(flight))}</div>
        <div class="rwf-status">${escapeHtml(flight.status || '-')}</div>
        <div class="rwf-time">${escapeHtml(formatDateTime((flight.departure as Record<string, unknown>)?.scheduled || (flight.arrival as Record<string, unknown>)?.scheduled))}</div>
      </div>
    `).join('');

    const detailItems = topFlights.slice(0, 30).map((flight) => `
      <details class="rwf-details">
        <summary>${escapeHtml(getFlightLabel(flight))} - ${escapeHtml(getRouteLabel(flight))}</summary>
        <pre class="rwf-json">${escapeHtml(JSON.stringify(flight.raw, null, 2))}</pre>
      </details>
    `).join('');

    this.setContent(`
      <div class="rwf-wrap">
        <div class="rwf-summary">
          <span class="rwf-chip">Airports: ${escapeHtml(this.payload.airports.join(', '))}</span>
          <span class="rwf-chip">Inbound: ${this.payload.inbound}</span>
          <span class="rwf-chip">Outbound: ${this.payload.outbound}</span>
          <span class="rwf-chip">Updated: ${escapeHtml(formatDateTime(this.payload.fetchedAt))}</span>
        </div>
        <div class="rwf-table">
          <div class="rwf-head">
            <span>Direction</span>
            <span>Flight</span>
            <span>Route</span>
            <span>Status</span>
            <span>Schedule</span>
          </div>
          ${rows || '<div class="rwf-row"><div class="rwf-status">No flights found.</div></div>'}
        </div>
        ${detailItems}
      </div>
    `);
  }
}
