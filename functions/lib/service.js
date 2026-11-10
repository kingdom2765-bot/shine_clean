import { createHmac, createHash } from 'node:crypto';
import { DAY, dayKey, dayStart, safeSource, safePage, paidChannels, summarize, suspicion, validateCost, range } from './analytics-model.js';

export const digest = value => createHash('sha256').update(value).digest('hex');
export const pseudonym = (value, secret) => createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
export function normalizedEvent(input, now, secret) {
  if (!input || !uuid(input.id) || !uuid(input.visitor) || !uuid(input.session) || !['page', 'phone'].includes(input.type)) throw new Error('잘못된 이벤트입니다.');
  // All accounting uses server time, never browser clocks. Browser time is used only for burst detection.
  const at = Number.isFinite(input.at) && Math.abs(input.at - now) < 5 * 60000 ? input.at : now;
  return { id: input.id, visitor: pseudonym(input.visitor, secret), session: pseudonym(input.session, secret), type: input.type,
    day: dayKey(now), source: safeSource(input.source), first: safeSource(input.first), attributed: safeSource(input.attributed),
    page: safePage(input.page), landing: safePage(input.landing), device: input.device === 'mobile' ? 'mobile' : 'desktop',
    position: ['header', 'footer', 'dialog', 'body'].includes(input.position) ? input.position : 'body',
    at, receivedAt: now, measurement: input.measurement === 'session' ? 'session' : 'legacy-browser', paidEntry: input.paidEntry === true && paidChannels.includes(input.source?.channel), returning: input.returning === true,
    expiresAtMs: now + 90 * DAY };
}
export function nextVisit(old, event) {
  const v = old || { visitor: event.visitor, session: event.session, day: event.day, source: event.source, first: event.first, attributed: event.attributed,
    device: event.device, measurement: event.measurement || 'legacy-browser', landing: event.landing, startedAt: event.receivedAt, views: 0, phoneClicks: 0, positions: {}, phonePages: {}, pages: {}, times: [], burst: 0, reloads: 0, regular: 0, paidEntry: false, returning: event.returning };
  const next = { ...v, positions: { ...v.positions }, phonePages: { ...v.phonePages }, pages: { ...v.pages }, updatedAt: event.receivedAt, expiresAtMs: event.expiresAtMs };
  if (event.type === 'page') {
    next.views++; next.pages[event.page] = (next.pages[event.page] || 0) + 1;
    next.reloads = Math.max(next.reloads, next.pages[event.page] - 1);
    const times = [...v.times.filter(t => t >= event.receivedAt - 5 * 60000), event.receivedAt].slice(-100);
    next.times = times; next.burst = Math.max(next.burst, times.length);
    if (times.length >= 3) {
      const gap = times.at(-1) - times.at(-2), previousGap = times.at(-2) - times.at(-3);
      next.regular = gap >= 1000 && Math.abs(gap - previousGap) < 150 ? (v.regular || 0) + 1 : 0;
    }
    next.paidEntry ||= event.paidEntry;
  } else { next.phoneClicks++; next.positions[event.position] = (next.positions[event.position] || 0) + 1; next.phonePages[event.page] = (next.phonePages[event.page] || 0) + 1; }
  return next;
}
export function makeReport(visits, conversions, costs, reviews, input, now) {
  const filters = { channel: Object.hasOwn(input, 'channel') && input.channel || '', campaign: input.campaign || '', device: input.device || '', kind: input.kind || '', includeExcluded: input.includeExcluded === true };
  const result = summarize(visits, conversions, costs, filters, reviews);
  if (input.from && input.to) {
    const byDay = new Map(result.days.map(d => [d.label, d]));
    const empty = summarize([]).total; result.days = [];
    for (let t = dayStart(input.from); t <= dayStart(input.to); t += DAY) { const day = dayKey(t); result.days.push(byDay.get(day) || { ...empty, key: `day|${day}`, label: day }); }
  }
  const groups = new Map(); for (const v of visits) { const key = `${v.day}|${v.visitor}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(v); }
  const suspicious = [...groups.values()].filter(items => items.some(v => (!filters.channel || v.source.channel === filters.channel) && (!filters.campaign || v.source.campaign === filters.campaign) && (!filters.device || v.device === filters.device) && (!filters.kind || (filters.kind === 'paid') === paidChannels.includes(v.source.channel)))).map(items => {
    const v = items[0], flags = suspicion(items); const review = reviews[v.visitor] || {};
    return { visitor: v.visitor, day: v.day, ...flags, status: review.status || 'pending', note: review.note || '', firstAt: Math.min(...items.map(i => i.startedAt)), lastAt: Math.max(...items.map(i => i.updatedAt)), phoneClicks: items.reduce((n, i) => n + i.phoneClicks, 0), channels: [...new Set(items.map(i => i.source.channel))] };
  }).filter(r => r.reasons.length || r.status !== 'pending');
  const positions = {}, pageClicks = {}; for (const v of visits.filter(v => (filters.includeExcluded || reviews[v.visitor]?.status !== 'excluded') && (!filters.channel || filters.channel === v.source.channel) && (!filters.campaign || filters.campaign === v.source.campaign) && (!filters.device || filters.device === v.device) && (!filters.kind || (filters.kind === 'paid') === paidChannels.includes(v.source.channel)))) {
    for (const [key, count] of Object.entries(v.positions || {})) positions[key] = (positions[key] || 0) + count;
    for (const [key, count] of Object.entries(v.phonePages || {})) pageClicks[key] = (pageClicks[key] || 0) + count;
  }
  const days = new Set(visits.map(v => v.day));
  return { ...result, suspicious, positions, pageClicks, costRows: costs, conversions: conversions.filter(c => c.type === 'call'), generatedAt: now, observedDays: days.size, metricVersion: 1 };
}
export { validateCost, range };
