import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import type { AirportDelayAlert } from '@/services/aviation';
import type { WeatherAlert } from '@/services/weather';
import type { ClimateAnomaly } from '@/services/climate';

function fmtTime(value: Date | null | undefined): string {
  if (!value || !Number.isFinite(value.getTime())) return '-';
  return value.toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function delaySeverityRank(alert: AirportDelayAlert): number {
  if (alert.delayType === 'closure') return 5;
  switch (alert.severity) {
    case 'severe': return 4;
    case 'major': return 3;
    case 'moderate': return 2;
    case 'minor': return 1;
    default: return 0;
  }
}

function weatherSeverityRank(alert: WeatherAlert): number {
  switch (alert.severity) {
    case 'Extreme': return 4;
    case 'Severe': return 3;
    case 'Moderate': return 2;
    case 'Minor': return 1;
    default: return 0;
  }
}

function climateSeverityRank(anomaly: ClimateAnomaly): number {
  switch (anomaly.severity) {
    case 'extreme': return 2;
    case 'moderate': return 1;
    default: return 0;
  }
}

function climateLabel(anomaly: ClimateAnomaly): string {
  const signed = anomaly.tempDelta > 0 ? `+${anomaly.tempDelta.toFixed(1)}` : anomaly.tempDelta.toFixed(1);
  return `${anomaly.zone} (${signed}C, ${anomaly.type})`;
}

export class OpsAlertsPanel extends Panel {
  private flightDelays: AirportDelayAlert[] = [];
  private weatherAlerts: WeatherAlert[] = [];
  private climateAnomalies: ClimateAnomaly[] = [];
  private weatherError = '';
  private flightError = '';
  private climateError = '';

  constructor() {
    super({ id: 'ops-alerts', title: 'Ops Alerts', showCount: true });
    this.showLoading('Loading delay and weather alerts...');
  }

  public updateFlightDelays(delays: AirportDelayAlert[]): void {
    this.flightDelays = delays;
    this.flightError = '';
    this.renderContent();
  }

  public updateWeatherAlerts(alerts: WeatherAlert[]): void {
    this.weatherAlerts = alerts;
    this.weatherError = '';
    this.renderContent();
  }

  public updateClimateAnomalies(anomalies: ClimateAnomaly[]): void {
    this.climateAnomalies = anomalies;
    this.climateError = '';
    this.renderContent();
  }

  public showFlightDelayError(message = 'Flight delay data unavailable'): void {
    this.flightError = message;
    this.renderContent();
  }

  public showWeatherError(message = 'Weather alert data unavailable'): void {
    this.weatherError = message;
    this.renderContent();
  }

  public showClimateError(message = 'Climate anomaly data unavailable'): void {
    this.climateError = message;
    this.renderContent();
  }

  private renderContent(): void {
    const hotDelays = [...this.flightDelays]
      .filter((a) => a.delayType === 'closure' || a.severity === 'major' || a.severity === 'severe' || a.avgDelayMinutes >= 30)
      .sort((a, b) => delaySeverityRank(b) - delaySeverityRank(a) || b.avgDelayMinutes - a.avgDelayMinutes)
      .slice(0, 12);
    const severeWeather = [...this.weatherAlerts]
      .filter((a) => weatherSeverityRank(a) > 0)
      .sort((a, b) => weatherSeverityRank(b) - weatherSeverityRank(a) || b.onset.getTime() - a.onset.getTime())
      .slice(0, 12);
    const anomalies = [...this.climateAnomalies]
      .filter((a) => a.severity !== 'normal')
      .sort((a, b) => climateSeverityRank(b) - climateSeverityRank(a))
      .slice(0, 10);

    const total = hotDelays.length + severeWeather.length + anomalies.length;
    this.setCount(total);
    this.setDataBadge(total > 0 ? 'live' : 'unavailable');

    const delayRows = hotDelays.length
      ? hotDelays.map((d) => `
        <div class="ops-alert-row">
          <span class="ops-alert-tag ops-alert-tag-delay">${escapeHtml(d.delayType.replace('_', ' '))}</span>
          <span class="ops-alert-main">${escapeHtml(d.iata)} · ${escapeHtml(d.name)}</span>
          <span class="ops-alert-meta">${Math.round(d.avgDelayMinutes)}m · ${escapeHtml(d.severity)}</span>
        </div>
      `).join('')
      : '<div class="ops-alert-empty">No major delays right now.</div>';

    const weatherRows = severeWeather.length
      ? severeWeather.map((w) => `
        <div class="ops-alert-row">
          <span class="ops-alert-tag ops-alert-tag-weather">${escapeHtml(w.severity)}</span>
          <span class="ops-alert-main">${escapeHtml(w.event)}</span>
          <span class="ops-alert-meta">${escapeHtml(w.areaDesc || 'Unknown area')} · ${escapeHtml(fmtTime(w.expires))}</span>
        </div>
      `).join('')
      : '<div class="ops-alert-empty">No severe weather alerts right now.</div>';

    const anomalyRows = anomalies.length
      ? anomalies.map((a) => `
        <div class="ops-alert-row">
          <span class="ops-alert-tag ops-alert-tag-anomaly">${escapeHtml(a.severity)}</span>
          <span class="ops-alert-main">${escapeHtml(climateLabel(a))}</span>
          <span class="ops-alert-meta">${escapeHtml(a.period || '-')}</span>
        </div>
      `).join('')
      : '<div class="ops-alert-empty">No notable climate anomalies right now.</div>';

    const errorLine = [this.flightError, this.weatherError, this.climateError]
      .filter(Boolean)
      .map((s) => `<div class="ops-alert-error">${escapeHtml(s)}</div>`)
      .join('');

    this.setContent(`
      <div class="ops-alerts-wrap">
        ${errorLine}
        <div class="ops-alerts-grid">
          <section class="ops-alert-card">
            <div class="ops-alert-title">Flight Delays</div>
            ${delayRows}
          </section>
          <section class="ops-alert-card">
            <div class="ops-alert-title">Weather Alerts</div>
            ${weatherRows}
          </section>
          <section class="ops-alert-card">
            <div class="ops-alert-title">Climate Anomalies</div>
            ${anomalyRows}
          </section>
        </div>
      </div>
    `);
  }
}
