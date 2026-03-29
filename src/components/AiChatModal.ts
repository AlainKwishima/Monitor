import { IntelligenceServiceClient } from '@/generated/client/worldmonitor/intelligence/v1/service_client';
import { getRpcBaseUrl } from '@/services/rpc-client';
import { escapeHtml } from '@/utils/sanitize';
import { t } from '@/services/i18n';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

let overlayEl: HTMLElement | null = null;

const client = new IntelligenceServiceClient(getRpcBaseUrl(), { fetch: (...args) => globalThis.fetch(...args) });

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
      <button class="modal-close" aria-label="Close">×</button>
    </div>
    <div class="widget-chat-layout">
      <section class="widget-chat-sidebar">
        <div class="widget-chat-readiness is-ready">${escapeHtml(t('widgets.preflightConnected'))}</div>
        <div class="widget-chat-messages"></div>
        <div class="widget-chat-examples">
          <div class="widget-chat-examples-label">Quick prompts</div>
          <div class="widget-chat-examples-list">
            <button class="widget-chat-example-chip" data-q="What are today’s top global risk signals?">Top risk signals</button>
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
    item.textContent = content;
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

  const buildPrompt = (question: string): string => {
    const recent = history.slice(-6).map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    return recent ? `${recent}\nUSER: ${question}` : question;
  };

  const submit = async (): Promise<void> => {
    const text = inputEl.value.trim();
    if (!text || inFlight) return;
    inputEl.value = '';
    history.push({ role: 'user', content: text });
    appendMsg('user', text);
    setPending(true);
    try {
      const response = await client.deductSituation({
        query: buildPrompt(text),
        geoContext: 'global',
        framework: '',
      }, { signal: AbortSignal.timeout(30000) });
      const answer = (response.analysis || '').trim() || 'No response from model.';
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

  appendMsg('assistant', 'Hi — ask me about risks, markets, conflicts, or country signals.');
  renderPreview('ready');
  inputEl.focus();
}
