import { analyticsConfig as config } from './analytics-config.js';
import { classify, SESSION_MS, safePage, safeSource, paidChannels } from './analytics-model.js';

const KEY = 'shine.analytics.visit.v2';
let state, lastPhone = 0, lastEstimateLink = 0, pending = [], sending = false, retryTimer;
// No persistent visitor identifier or consent dialog. Keep only this tab's active visit.
try { localStorage.removeItem('shine.analytics.v1'); localStorage.removeItem('shine.analytics.consent'); } catch { /* unavailable */ }
const storage = { get() { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } }, set(value) { try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* page-memory fallback */ } } };
const internal = () => { try { return JSON.parse(localStorage.getItem('shine.analytics.internal')) === true; } catch { return false; } };
const allowed = () => config.enabled && config.endpoint && !navigator.globalPrivacyControl && navigator.doNotTrack !== '1' && !internal();
const disabledPage = /p[678]-|auth-action/.test(location.pathname) || ['localhost', '127.0.0.1'].includes(location.hostname) || navigator.webdriver;
function context() {
  const now = Date.now(); let previous = state || storage.get();
  if (previous && (!/^[a-f0-9-]{36}$/.test(previous.session || '') || !Number.isFinite(previous.last) || now - previous.last >= SESSION_MS || now < previous.last)) previous = null;
  const current = classify(location.href, document.referrer);
  const session = previous?.session || crypto.randomUUID();
  state = { session, first: previous ? safeSource(previous.first) : current,
    source: previous ? safeSource(previous.source) : current,
    attributed: current.channel !== 'direct:none' ? current : previous ? safeSource(previous.attributed) : current,
    last: now, landing: previous ? safePage(previous.landing) : safePage(location.pathname) };
  storage.set(state); return state;
}
export function estimateContext() {
  if (!allowed() || disabledPage) return null;
  const s = context();
  return { visitor: s.session, session: s.session, first: s.first, source: s.source, attributed: s.attributed, landing: s.landing, device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop' };
}
async function flush() {
  if (sending || !pending.length || !allowed()) return;
  sending = true; const batch = pending.slice(0, 10);
  try {
    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}/collect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: batch }), keepalive: true, credentials: 'omit' });
    if (response.ok) pending.splice(0, batch.length);
    else if (response.status >= 400 && response.status < 500 && response.status !== 429) pending.splice(0, batch.length);
  } catch { /* retry the same IDs when online or on the next event */ }
  finally { sending = false; clearTimeout(retryTimer); if (pending.length && allowed()) retryTimer = setTimeout(flush, 10000); }
}
function track(type, position = '') {
  if (!allowed() || disabledPage) return;
  const s = context(); const now = Date.now();
  const entry = type === 'page' && safePage(location.pathname) === s.landing && paidChannels.includes(s.source.channel);
  pending.push({ id: crypto.randomUUID(), type, visitor: s.session, session: s.session, source: s.source, first: s.first, attributed: s.attributed, measurement: 'session',
    page: safePage(location.pathname), landing: s.landing, device: matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop', position,
    at: now, paidEntry: entry, returning: false });
  pending = pending.slice(-50); void flush();
}
if (!disabledPage && config.enabled && config.endpoint) {
  track('page');
  document.addEventListener('click', event => {
    if (event.target.closest('a[data-info-estimate]') && Date.now()-lastEstimateLink>=1500) {
      lastEstimateLink=Date.now(); track('estimate_link','body');
    }
    const link = event.target.closest('a[href^="tel:"]'); if (!link || Date.now() - lastPhone < 1500) return;
    lastPhone = Date.now(); const position = link.closest('header') ? 'header' : link.closest('footer') ? 'footer' : link.closest('dialog') ? 'dialog' : 'body'; track('phone', position);
  });
  window.addEventListener('online', flush); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(); });
}
