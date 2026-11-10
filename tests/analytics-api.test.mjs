import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import * as model from '../functions/lib/analytics-model.js';
import * as service from '../functions/lib/service.js';

const owner = 'cOLPnjEzpgXYKdowCJcsKIf4xP73';
const origin = 'https://kingdom2765-bot.github.io';
function fakeDb() {
  const docs = new Map();
  const snapshot = ref => ({ id: ref.id, ref, exists: docs.has(ref.path), data: () => docs.get(ref.path) });
  const save = (ref, value, options) => {
    const old = docs.get(ref.path) || {}, next = options?.merge ? { ...old } : {};
    for (const [key, item] of Object.entries(value)) next[key] = item?.increment ? (old[key] || 0) + item.increment : item;
    docs.set(ref.path, next);
  };
  const doc = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(doc(path)), set: async (value, options) => save(doc(path), value, options), delete: async () => docs.delete(path) });
  const query = (name, checks = [], order = null, maximum = Infinity, after = null) => ({
    doc: id => doc(`${name}/${id}`),
    where: (field, op, value) => query(name, [...checks, [field, op, value]], order, maximum, after),
    orderBy: field => query(name, checks, field, maximum, after),
    limit: n => query(name, checks, order, n, after),
    startAfter: cursor => query(name, checks, order, maximum, cursor),
    get: async () => {
      const comparable = value => value?.toMillis ? value.toMillis() : value;
      let entries = [...docs].filter(([path]) => path.startsWith(`${name}/`) && path.split('/').length === 2).map(([path]) => snapshot(doc(path)));
      entries = entries.filter(s => checks.every(([f, op, value]) => { const a = comparable(s.data()[f]), b = comparable(value); return op === '>=' ? a >= b : op === '<=' ? a <= b : a === b; }));
      entries.sort((a, b) => String(order ? a.data()[order] : a.id).localeCompare(String(order ? b.data()[order] : b.id)) || a.id.localeCompare(b.id));
      if (after) entries = entries.slice(entries.findIndex(d => d.id === after.id) + 1);
      entries = entries.slice(0, maximum); return { docs: entries, size: entries.length, empty: entries.length === 0 };
    },
  });
  return { docs, doc, collection: name => query(name), runTransaction: async cb => { const writes = []; await cb({ get: async ref => snapshot(ref), set: (ref, value, options) => writes.push(() => save(ref, value, options)), delete: ref => writes.push(() => docs.delete(ref.path)) }); writes.forEach(w => w()); }, batch: () => { const writes = []; return { set(ref, value) { writes.push(() => save(ref, value)); }, delete(ref) { writes.push(() => docs.delete(ref.path)); }, async commit() { writes.forEach(w => w()); } }; } };
}
async function harness() {
  const db = fakeDb(); const context = vm.createContext({ console, Date, Buffer });
  const mock = async values => { const m = new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context }); await m.link(() => {}); await m.evaluate(); return m; };
  const modules = new Map();
  modules.set('firebase-admin/app', await mock({ initializeApp() {} }));
  modules.set('firebase-admin/auth', await mock({ getAuth: () => ({ verifyIdToken: async token => { if (token !== 'owner' && token !== 'other') throw new Error('bad token'); return { uid: token === 'owner' ? owner : 'other', email: 'kingdom2765@naver.com', email_verified: true, admin: true }; } }) }));
  modules.set('firebase-admin/firestore', await mock({ getFirestore: () => db, Timestamp: { fromMillis: ms => ({ toMillis: () => ms }) }, FieldValue: { increment: increment => ({ increment }) } }));
  modules.set('firebase-functions/v2/https', await mock({ onRequest: (_, handler) => handler }));
  modules.set('firebase-functions/v2/firestore', await mock({ onDocumentWritten: (_, handler) => handler }));
  modules.set('firebase-functions/v2/scheduler', await mock({ onSchedule: (_, handler) => handler }));
  modules.set('firebase-functions/params', await mock({ defineSecret: name => ({ value: () => name === 'ANALYTICS_HASH_KEY' ? 'test-hash' : 'test-webhook' }), defineString: (_, options) => ({ value: () => options.default }) }));
  modules.set('node:crypto', await mock(crypto)); modules.set('./lib/service.js', await mock(service)); modules.set('./lib/analytics-model.js', await mock(model));
  const code = new vm.SourceTextModule(await readFile(new URL('../functions/index.js', import.meta.url), 'utf8'), { context });
  await code.link(name => modules.get(name)); await code.evaluate();
  async function request(path, input = {}, token = 'owner', options = {}) {
    const headers = { origin, ...(token ? { authorization: `Bearer ${token}` } : {}), ...options.headers };
    const req = { method: 'POST', path, body: input, rawBody: Buffer.from(JSON.stringify(input)), ip: '127.0.0.1', headers, ...options };
    const result = { status: 200, headers: {} }; const res = { set(k, v) { result.headers[k] = v; return res; }, status(n) { result.status = n; return res; }, json(value) { result.body = value; return res; }, send(value) { result.body = value; return res; } };
    await code.namespace.analyticsApi(req, res); return result;
  }
  return { db, request, exports: code.namespace };
}
const event = (overrides = {}) => ({ id: '11111111-1111-4111-8111-111111111111', visitor: '22222222-2222-4222-8222-222222222222', session: '33333333-3333-4333-8333-333333333333', type: 'page', source: { channel: 'naver:cpc', campaign: 'gangnam', content: '', term: '' }, first: { channel: 'naver:cpc' }, attributed: { channel: 'naver:cpc' }, page: 'index.html', landing: 'index.html', at: Date.now(), device: 'mobile', ...overrides });

test('analytics API rejects absent/foreign admin credentials and unapproved origins', async () => {
  const app = await harness();
  assert.equal((await app.request('/report', {}, null)).status, 401);
  assert.equal((await app.request('/report', {}, 'other')).status, 403);
  assert.equal((await app.request('/report', {}, 'owner', { headers: { origin: 'https://evil.test' } })).status, 403);
  assert.equal((await app.request('/report', {}, 'owner', { method: 'GET' })).status, 405);
  assert.equal((await app.request('/report', {}, 'owner', { method: 'OPTIONS' })).status, 204);
  assert.equal(app.db.docs.size, 0);
});
test('collector deduplicates retry IDs, sanitizes records and updates report without raw event access', async () => {
  const app = await harness(); const e = event({ phone: '01012345678' });
  assert.equal((await app.request('/collect', { events: [e] }, null)).status, 200);
  await app.request('/collect', { events: [e] }, null);
  await app.request('/collect', { events: [event({ id: '44444444-4444-4444-8444-444444444444', type: 'phone', position: 'header' })] }, null);
  assert.equal([...app.db.docs.keys()].filter(k => k.startsWith('analytics_events/')).length, 2);
  const visit = [...app.db.docs].find(([key]) => key.startsWith('analytics_visits/'))[1]; assert.equal(visit.views, 1); assert.equal(visit.phoneClicks, 1);
  assert.equal(JSON.stringify(visit).includes('01012345678'), false);
  const report = await app.request('/report'); assert.equal(report.status, 200); assert.equal(report.body.total.phoneVisitors, 1); assert.equal(report.body.total.views, 1);
  await app.request('/review', { visitor: visit.visitor, status: 'excluded', note: '내부 방문' });
  assert.equal((await app.request('/report')).body.total.visitors, 0);
  assert.equal((await app.request('/report', { includeExcluded: true })).body.total.visitors, 1);
});
test('cost CSV-sized writes are atomic, upsert identical keys and preserve missing vs zero', async () => {
  const app = await harness(); const row = { day: model.dayKey(Date.now()), channel: 'google:cpc', campaign: 'seoul', spend: 0, impressions: null, clicks: null };
  assert.equal((await app.request('/costs', { rows: [row, { ...row, spend: -1 }] })).status, 400);
  assert.equal([...app.db.docs.keys()].filter(k => k.startsWith('analytics_costs/')).length, 0);
  await app.request('/costs', { rows: [row] }); await app.request('/costs', { rows: [{ ...row, spend: 20000 }] });
  assert.equal([...app.db.docs.keys()].filter(k => k.startsWith('analytics_costs/')).length, 1);
  const report = await app.request('/report'); assert.equal(report.body.total.spend, 20000); assert.equal(report.body.total.impressions, null);
});
test('estimate trigger reads latest stored state and never resurrects deleted estimates', async () => {
  const app = await harness(), id = 'request-1', createdAt = { toMillis: () => Date.now() };
  app.db.docs.set(`estimate_requests/${id}`, { status: 'contracted', createdAt, analyticsContext: event() });
  await app.exports.analyticsEstimate({ params: { requestId: id } });
  assert.equal(app.db.docs.get(`analytics_conversions/estimate_${id}`).contracted, true);
  const visitor = app.db.docs.get(`analytics_conversions/estimate_${id}`).visitor;
  assert.equal('visitor' in app.db.docs.get(`estimate_requests/${id}`).analyticsContext, false);
  assert.equal('session' in app.db.docs.get(`estimate_requests/${id}`).analyticsContext, false);
  await app.exports.analyticsEstimate({ params: { requestId: id } });
  assert.equal(app.db.docs.get(`analytics_conversions/estimate_${id}`).visitor, visitor, 'status updates retain the pseudonymous analytics link after raw IDs have been scrubbed');
  app.db.docs.delete(`estimate_requests/${id}`); await app.exports.analyticsEstimate({ params: { requestId: id } });
  assert.equal(app.db.docs.has(`analytics_conversions/estimate_${id}`), false);
});
test('public collector validates payload bounds and known bot traffic is ignored', async () => {
  const app = await harness();
  assert.equal((await app.request('/collect', { events: [] }, null)).status, 400);
  assert.equal((await app.request('/collect', { events: [event({ id: 'invalid' })] }, null)).status, 400);
  assert.equal((await app.request('/collect', { events: [event()] }, null, { headers: { origin, 'user-agent': 'Googlebot' } })).body.ignored, true);
  assert.equal([...app.db.docs.keys()].filter(k => k.startsWith('analytics_events/')).length, 0);
  assert.equal((await app.request('/collect', {}, null, { rawBody: Buffer.alloc(33000) })).status, 413);
});
test('actual-call webhook rejects unsigned traffic and accepts signed duplicate safely', async () => {
  const app = await harness(), input = { id: 'call-001', day: model.dayKey(Date.now()), connected: true, durationSeconds: 45, source: { channel: 'naver:cpc', campaign: 'gangnam' } }, rawBody = Buffer.from(JSON.stringify(input)), timestamp = String(Date.now());
  const signature = crypto.createHmac('sha256', 'test-webhook').update(timestamp + '.').update(rawBody).digest('hex');
  let status, response;
  const res = { status(n) { status = n; return res; }, send() {}, json(value) { response = value; } };
  await app.exports.analyticsCallWebhook({ method: 'POST', body: input, rawBody, headers: {} }, res); assert.equal(status, 401);
  const req = { method: 'POST', body: input, rawBody, headers: { 'x-shine-timestamp': timestamp, 'x-shine-signature': signature } };
  await app.exports.analyticsCallWebhook(req, res); await app.exports.analyticsCallWebhook(req, res); assert.equal(response.accepted, true);
  const calls = [...app.db.docs].filter(([key]) => key.startsWith('analytics_conversions/provider_')); assert.equal(calls.length, 1); assert.equal(calls[0][1].qualified, true);
});
test('maintenance retains anonymous daily counts and expires only analytics records', async () => {
  const app = await harness(), now = Date.now(), yesterday = model.dayKey(now - model.DAY);
  const source = { channel: 'naver:cpc', campaign: 'gangnam', content: '', term: '' };
  app.db.docs.set(`analytics_days/${yesterday}`, { day: yesterday });
  app.db.docs.set('analytics_visits/sample', { day: yesterday, visitor: 'private-browser-id', session: 'private-session-id', source, returning: false, landing: 'index.html', views: 3, phoneClicks: 1 });
  app.db.docs.set('analytics_events/expired', { expiresAt: { toMillis: () => now - 1 } });
  app.db.docs.set('estimate_requests/preserve', { expiresAt: { toMillis: () => now - 1 }, clinicName: '원본 견적' });
  await app.exports.analyticsMaintenance();
  const aggregate = app.db.docs.get(`analytics_daily/${yesterday}`); assert.equal(aggregate.total.visitors, 1);
  assert.equal(JSON.stringify(aggregate).includes('private-browser-id'), false); assert.equal(JSON.stringify(aggregate).includes('private-session-id'), false);
  assert.equal(app.db.docs.has('analytics_events/expired'), false); assert.equal(app.db.docs.has('estimate_requests/preserve'), true);
});
test('retention cleanup still runs when daily aggregation encounters a failure', async () => {
  const app = await harness(), now = Date.now(), yesterday = model.dayKey(now - model.DAY);
  app.db.docs.set(`analytics_days/${yesterday}`, { day: yesterday });
  app.db.docs.set('analytics_visits/invalid', { day: yesterday, visitor: 'v', session: 's' });
  app.db.docs.set('analytics_events/expired', { expiresAt: { toMillis: () => now - 1 } });
  await assert.rejects(app.exports.analyticsMaintenance());
  assert.equal(app.db.docs.has('analytics_events/expired'), false);
});
