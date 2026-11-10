import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import * as model from '../functions/lib/analytics-model.js';
import { makeReport } from '../functions/lib/service.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
async function synthetic(context, values) { const module = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); await module.link(() => {}); await module.evaluate(); return module; }
async function collector(options = {}) {
  const dom = new JSDOM('<body><a id="phone" href="tel:1661-2816">전화</a><footer></footer></body>', { url: 'https://shine.test/index.html?utm_source=naver&utm_medium=cpc&utm_campaign=gangnam', referrer: 'https://search.naver.com/' });
  const requests = [], timers = [];
  const config = { enabled: true, endpoint: 'https://api.test', privacyVersion: 'test', siteUrl: 'https://shine.test/' };
  if (options.consent) dom.window.localStorage.setItem('shine.analytics.consent', JSON.stringify({ accepted: true, version: 'test' }));
  if (options.legacy) { dom.window.localStorage.setItem('shine.analytics.v1', JSON.stringify({ visitor: 'legacy-id' })); dom.window.localStorage.setItem('shine.analytics.consent', JSON.stringify({ accepted: false })); }
  if (options.visit) dom.window.sessionStorage.setItem('shine.analytics.visit.v2', JSON.stringify(options.visit));
  if (options.internal) dom.window.localStorage.setItem('shine.analytics.internal', 'true');
  if (options.dnt) Object.defineProperty(dom.window.navigator, 'doNotTrack', { value: '1' });
  const context = vm.createContext({ document: dom.window.document, window: dom.window, location: dom.window.location, localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage, navigator: dom.window.navigator, crypto: webcrypto, URL, Date, console, matchMedia: () => ({ matches: true }), setTimeout: cb => { timers.push(cb); return timers.length; }, clearTimeout() {}, fetch: async (_, request) => { requests.push(JSON.parse(request.body)); return { ok: true }; } });
  const modules = { './analytics-config.js': await synthetic(context, { analyticsConfig: config }), './analytics-model.js': await synthetic(context, model) };
  const module = new vm.SourceTextModule(await readFile(new URL('../analytics.js', import.meta.url), 'utf8'), { context }); await module.link(name => modules[name]); await module.evaluate();
  await tick(); return { dom, requests, module, timers };
}
test('basic analytics starts without a prompt or persistent visitor identity; phone remains usable', async () => {
  const app = await collector({ legacy: true }); const doc = app.dom.window.document;
  assert.equal(app.requests.length, 1); assert.equal(app.dom.window.localStorage.getItem('shine.analytics.v1'), null);
  assert.equal(app.dom.window.localStorage.getItem('shine.analytics.consent'), null);
  assert.equal(doc.querySelector('#analytics-consent'), null); assert.equal(doc.querySelector('.analytics-settings'), null);
  assert.equal(app.dom.window.localStorage.length, 0);
  assert.equal(app.requests[0].events[0].measurement, 'session');
  let blocked; doc.querySelector('#phone').addEventListener('click', e => { blocked = e.defaultPrevented; e.preventDefault(); }); doc.querySelector('#phone').click();
  assert.equal(blocked, false); app.dom.window.close();
});
test('automatic collection is sanitized and rapid phone clicks deduplicate without blocking calls', async () => {
  const app = await collector(); const doc = app.dom.window.document;
  assert.equal(app.requests[0].events[0].type, 'page'); assert.equal(app.requests[0].events[0].page, 'index.html');
  assert.equal(app.requests[0].events[0].source.channel, 'naver:cpc');
  doc.querySelector('#phone').addEventListener('click', e => e.preventDefault()); doc.querySelector('#phone').click(); doc.querySelector('#phone').click(); await tick();
  assert.equal(app.requests.flatMap(r => r.events).filter(e => e.type === 'phone').length, 1);
  const ctx = app.module.namespace.estimateContext(); assert.equal(ctx.attributed.channel, 'naver:cpc'); assert.equal('phone' in ctx, false);
  assert.equal(ctx.visitor, ctx.session, 'identity is limited to the active visit');
  assert.equal(app.dom.window.localStorage.getItem('shine.analytics.v1'), null); app.dom.window.close();
});
test('active tab visit survives page navigation but expires after 30 minutes and never links another tab', async () => {
  const first = await collector(); const saved = JSON.parse(first.dom.window.sessionStorage.getItem('shine.analytics.visit.v2'));
  const next = await collector({ visit: saved }); assert.equal(next.requests[0].events[0].session, saved.session);
  const expired = await collector({ visit: { ...saved, last: Date.now() - 31 * 60000 } }); assert.notEqual(expired.requests[0].events[0].session, saved.session);
  const other = await collector(); assert.notEqual(other.requests[0].events[0].session, saved.session);
  for (const app of [first, next, expired, other]) app.dom.window.close();
});
test('internal visitor exclusion and DNT suppress automatic collection', async () => {
  for (const options of [{ consent: true, internal: true }, { consent: true, dnt: true }]) { const app = await collector(options); assert.equal(app.requests.length, 0); assert.equal(app.module.namespace.estimateContext(), null); app.dom.window.close(); }
});
async function dashboard(options = {}) {
  const dom = new JSDOM(await readFile(new URL('../pages/p8-analytics.html', import.meta.url), 'utf8'), { url: 'https://shine.test/p8-analytics.html' });
  const requests = []; let fail = false, release;
  const day = model.dayKey(Date.now()), source = { channel: 'naver:cpc', campaign: 'gangnam', content: '', term: '' };
  const report = { ...makeReport([{ visitor: 'a', session: 's', day, source, device: 'mobile', landing: '<img src=x onerror=alert(1)>', views: 2, phoneClicks: 1, positions: { header: 1 }, pages: {}, returning: false, startedAt: Date.now(), updatedAt: Date.now() }], [], [], {}, {}, Date.now()), from: day, to: day, status: {} };
  const context = vm.createContext({ document: dom.window.document, window: dom.window, localStorage: dom.window.localStorage, navigator: { clipboard: { writeText: async () => {} } }, crypto: webcrypto, URL, Blob, Date, Intl, console, setTimeout, fetch: async (url, request) => { const path = new URL(url).pathname; requests.push({ path, input: JSON.parse(request.body), authorization: request.headers.Authorization }); if (fail) throw new Error('가상 네트워크 오류'); if (options.deferred && path === '/report') await new Promise(resolve => { release = resolve; }); return { ok: true, json: async () => path === '/report' ? report : { platformApis: 'not-connected', saved: 1 } }; } });
  const modules = { './analytics-config.js': await synthetic(context, { analyticsConfig: { enabled: true, endpoint: options.disconnected ? '' : 'https://api.test', siteUrl: 'https://shine.test/' } }), './analytics-model.js': await synthetic(context, model) };
  const module = new vm.SourceTextModule(await readFile(new URL('../analytics-admin.js', import.meta.url), 'utf8'), { context }); await module.link(name => modules[name]); await module.evaluate();
  const manager = module.namespace.createAnalyticsManager();
  return { dom, requests, manager, login: () => manager.login({ getIdToken: async () => 'admin-token' }), fail: () => { fail = true; }, release: () => release?.(), submit: id => dom.window.document.querySelector(id).dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}
test('dashboard renders authenticated reports as text, creates tagged links and clears on logout', async () => {
  const app = await dashboard(); await app.login(); const doc = app.dom.window.document;
  assert.ok(doc.querySelector('#analytics-stats').children.length > 5); assert.equal(app.requests[0].authorization, 'Bearer admin-token');
  assert.equal(doc.querySelector('#analytics-pages img'), null); assert.match(doc.querySelector('#analytics-pages').textContent, /<img/);
  doc.querySelector('#link-campaign').value = 'gangnam'; app.submit('#analytics-link-form'); assert.match(doc.querySelector('#link-result').textContent, /utm_source=naver/);
  app.manager.clear(); assert.equal(doc.querySelector('#analytics-stats').children.length, 0); assert.equal(doc.querySelector('#analytics-export').disabled, true); app.dom.window.close();
});
test('failed refresh clears old report and does not allow exporting stale results', async () => {
  const app = await dashboard(); await app.login(); app.fail(); app.submit('#analytics-filter-form'); for (let i = 0; i < 5; i++) await tick();
  const doc = app.dom.window.document; assert.match(doc.querySelector('#analytics-connection').textContent, /네트워크/); assert.equal(doc.querySelector('#analytics-stats').children.length, 0); assert.equal(doc.querySelector('#analytics-export').disabled, true); app.dom.window.close();
});
test('in-flight report cannot repopulate private data after logout', async () => {
  const app = await dashboard({ deferred: true }); const promise = app.login(); await tick(); app.manager.clear(); app.release(); await promise;
  assert.equal(app.dom.window.document.querySelector('#analytics-stats').children.length, 0); app.dom.window.close();
});
test('unconfigured server shows a clear disconnected state and makes no API calls', async () => {
  const app = await dashboard({ disconnected: true }); await app.login(); assert.equal(app.requests.length, 0); assert.match(app.dom.window.document.querySelector('#analytics-connection').textContent, /미연결/); app.dom.window.close();
});
