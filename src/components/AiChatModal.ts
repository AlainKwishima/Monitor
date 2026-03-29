import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';
import { fetchFlightDelays } from '@/services/aviation';
import { fetchWeatherAlerts } from '@/services/weather';
import { fetchClimateAnomalies } from '@/services/climate';
import { fetchRwandaFlights } from '@/services/rwanda-flights';
import { fetchCrossSourceSignals } from '@/services/cross-source-signals';
import { NewsServiceClient } from '@/generated/client/worldmonitor/news/v1/service_client';
import { getRpcBaseUrl } from '@/services/rpc-client';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

function formatAssistantMessage(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const escaped = escapeHtml(normalized)
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
  return escaped || 'No content.';
}

let overlayEl: HTMLElement | null = null;
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = 'nvidia/nemotron-3-super-120b-a12b:free';
const OPENROUTER_API_KEY = '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';
const newsClient = new NewsServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });

interface LiveContextSnapshot {
  fetchedAt: string;
  weatherAlerts: Array<{ event: string; severity: string; area: string; expires: string }>;
  flightDelays: Array<{ airport: string; severity: string; type: string; avgDelayMin: number }>;
  climateAnomalies: Array<{ zone: string; severity: string; tempDelta: number; precipDelta: number }>;
  rwandaFlights: { total: number; inbound: number; outbound: number; topRoutes: string[] } | null;
  crossSignals: Array<{ summary: string; severity: string; score: number; theater: string }>;
  headlines: string[];
}

async function buildLiveContextSnapshot(): Promise<LiveContextSnapshot> {
  const [weatherR, delaysR, climateR, rwandaR, crossR, digestR] = await Promise.allSettled([
    fetchWeatherAlerts(),
    fetchFlightDelays(),
    fetchClimateAnomalies(),
    fetchRwandaFlights(),
    fetchCrossSourceSignals(),
    newsClient.listFeedDigest({ variant: 'full', lang: 'en' }, { signal: AbortSignal.timeout(9000) }),
  ]);

  const weatherAlerts = weatherR.status === 'fulfilled'
    ? weatherR.value.slice(0, 6).map((a) => ({
      event: a.event,
      severity: a.severity,
      area: a.areaDesc,
      expires: Number.isFinite(a.expires.getTime()) ? a.expires.toISOString() : '',
    }))
    : [];

  const flightDelays = delaysR.status === 'fulfilled'
    ? delaysR.value
      .sort((a, b) => (b.avgDelayMinutes || 0) - (a.avgDelayMinutes || 0))
      .slice(0, 8)
      .map((d) => ({
        airport: d.iata || d.name,
        severity: d.severity,
        type: d.delayType,
        avgDelayMin: Math.round(d.avgDelayMinutes || 0),
      }))
    : [];

  const climateAnomalies = (climateR.status === 'fulfilled' && climateR.value.ok)
    ? climateR.value.anomalies.slice(0, 6).map((a) => ({
      zone: a.zone,
      severity: a.severity,
      tempDelta: Number(a.tempDelta.toFixed(1)),
      precipDelta: Number(a.precipDelta.toFixed(1)),
    }))
    : [];

  const rwandaFlights = rwandaR.status === 'fulfilled'
    ? {
      total: rwandaR.value.totalFlights,
      inbound: rwandaR.value.inbound,
      outbound: rwandaR.value.outbound,
      topRoutes: rwandaR.value.flights.slice(0, 6).map((f) => {
        const dep = (f.departure?.iata || f.departure?.icao || '-') as string;
        const arr = (f.arrival?.iata || f.arrival?.icao || '-') as string;
        return `${dep}-${arr}`;
      }),
    }
    : null;

  const crossSignals = crossR.status === 'fulfilled'
    ? (crossR.value.signals ?? []).slice(0, 6).map((s) => ({
      summary: s.summary || String(s.type || 'signal'),
      severity: String(s.severity || 'unknown'),
      score: Number((s.severityScore ?? 0).toFixed(2)),
      theater: s.theater || 'global',
    }))
    : [];

  const headlines = digestR.status === 'fulfilled'
    ? Object.values(digestR.value.categories ?? {})
      .flatMap((bucket) => bucket.items ?? [])
      .slice(0, 12)
      .map((item) => item.title)
    : [];

  return {
    fetchedAt: new Date().toISOString(),
    weatherAlerts,
    flightDelays,
    climateAnomalies,
    rwandaFlights,
    crossSignals,
    headlines,
  };
}

export function closeAiChatModal(): void {
  if (!overlayEl) return;
  overlayEl.remove();
  overlayEl = null;
}

export function openAiChatModal(): void {
  closeAiChatModal();

  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay active';

  const modal = document.createElement('div');
  modal.className = 'modal widget-chat-modal ai-chat-modal-v2';
  modal.innerHTML = `
    <div class="modal-header">
      <span class="modal-title">AI Chat</span>
      <button class="modal-close" aria-label="Close">x</button>
    </div>
    <div class="widget-chat-layout">
      <section class="widget-chat-sidebar">
        <div class="widget-chat-readiness is-ready">${escapeHtml(t('widgets.preflightConnected'))}</div>
        <div class="widget-chat-messages"></div>
        <div class="widget-chat-examples">
          <div class="widget-chat-examples-label">Quick prompts</div>
          <div class="widget-chat-examples-list">
            <button class="widget-chat-example-chip" data-q="What are today's top global risk signals?">Top risk signals</button>
            <button class="widget-chat-example-chip" data-q="Give me a short Rwanda aviation and weather briefing.">Rwanda briefing</button>
            <button class="widget-chat-example-chip" data-q="What market-moving events should I monitor in 24h?">24h market watch</button>
          </div>
        </div>
        <div class="widget-chat-input-row">
          <textarea class="widget-chat-input" rows="3" placeholder="Ask anything about global developments..."></textarea>
          <button class="widget-chat-send">Send</button>
        </div>
      </section>
      <section class="widget-chat-main">
        <div class="widget-chat-preview"></div>
      </section>
    </div>
    <div class="widget-chat-footer">
      <div class="widget-chat-footer-status">Ready</div>
      <button class="widget-chat-action-btn" disabled>Live chat</button>
    </div>
  `;

  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);

  const messagesEl = modal.querySelector('.widget-chat-messages') as HTMLElement;
  const previewEl = modal.querySelector('.widget-chat-preview') as HTMLElement;
  const footerStatusEl = modal.querySelector('.widget-chat-footer-status') as HTMLElement;
  const inputEl = modal.querySelector('.widget-chat-input') as HTMLTextAreaElement;
  const sendBtn = modal.querySelector('.widget-chat-send') as HTMLButtonElement;
  const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement;
  const exampleBtns = Array.from(modal.querySelectorAll('.widget-chat-example-chip')) as HTMLButtonElement[];

  const history: ChatMsg[] = [];
  let inFlight = false;

  const appendMsg = (role: ChatMsg['role'], content: string): void => {
    const item = document.createElement('div');
    item.className = `widget-chat-msg ${role}`;
    if (role === 'assistant') {
      item.innerHTML = `<div class="widget-chat-msg-content">${formatAssistantMessage(content)}</div>`;
    } else {
      item.textContent = content;
    }
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const renderPreview = (phase: 'ready' | 'working' | 'done', detail = ''): void => {
    const phaseLabel = phase === 'working' ? 'Analyzing...' : phase === 'done' ? 'Latest response' : 'Ready';
    const copy = detail || (phase === 'working'
      ? 'Running geopolitical reasoning model...'
      : 'Ask a question and I will reason over the latest intelligence context.');
    previewEl.innerHTML = `
      <div class="widget-chat-preview-state is-${phase === 'working' ? 'fetching' : phase === 'done' ? 'complete' : 'ready_to_prompt'}">
        <div class="widget-chat-preview-head">
          <div>
            <div class="widget-chat-preview-kicker">AI Assistant</div>
            <div class="widget-chat-preview-heading">${escapeHtml(phaseLabel)}</div>
          </div>
          <span class="widget-chat-phase-badge">${escapeHtml(phaseLabel)}</span>
        </div>
        <p class="widget-chat-preview-copy">${escapeHtml(copy)}</p>
      </div>
    `;
  };

  const setPending = (pending: boolean): void => {
    inFlight = pending;
    sendBtn.disabled = pending;
    sendBtn.textContent = pending ? 'Thinking...' : 'Send';
    footerStatusEl.textContent = pending ? 'Model is generating response...' : 'Ready';
    renderPreview(pending ? 'working' : 'ready');
  };

  const submit = async (): Promise<void> => {
    const text = inputEl.value.trim();
    if (!text || inFlight) return;
    inputEl.value = '';
    history.push({ role: 'user', content: text });
    appendMsg('user', text);
    setPending(true);
    try {
      const liveContext = await buildLiveContextSnapshot();
      const messages = [
        {
          role: 'system',
          content: [
            'You are Aurora Monitor AI assistant.',
            'Use the live context JSON as primary factual source and do not invent specifics.',
            'If data is missing, say it is unavailable.',
            'Answer in concise operational language with clear bullet points when useful.',
            `LIVE_CONTEXT_JSON: ${JSON.stringify(liveContext)}`,
          ].join(' '),
        },
        ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
      ];

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Aurora Monitor',
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(40000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter error ${response.status}: ${errorText.slice(0, 180)}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const answer = (data.choices?.[0]?.message?.content || '').trim() || 'No response from model.';
      history.push({ role: 'assistant', content: answer });
      appendMsg('assistant', answer);
      renderPreview('done', answer.split('\n').slice(0, 4).join(' '));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to get AI response.';
      appendMsg('assistant', `Error: ${msg}`);
      renderPreview('done', `Error: ${msg}`);
    } finally {
      setPending(false);
    }
  };

  sendBtn.addEventListener('click', () => { void submit(); });
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  });
  exampleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-q') ?? '';
      inputEl.value = q;
      inputEl.focus();
    });
  });

  closeBtn.addEventListener('click', closeAiChatModal);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeAiChatModal();
  });

  const esc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', esc);
      closeAiChatModal();
    }
  };
  document.addEventListener('keydown', esc);

  appendMsg('assistant', 'Hi - ask me about risks, markets, conflicts, or country signals.');
  renderPreview('ready');
  inputEl.focus();
}

