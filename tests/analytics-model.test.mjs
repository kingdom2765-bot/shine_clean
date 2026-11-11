import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, dayKey, safePage, safeSource, classify, attribution, buildLink, csv, parseCsv, validateCost, summarize, suspicion, range } from '../functions/lib/analytics-model.js';
import { normalizedEvent, nextVisit, makeReport } from '../functions/lib/service.js';

test('content landing pages remain distinct throughout attribution and navigation', () => {
  for (const path of ['area/gangnam.html', 'area/seocho.html', 'clinic/dermatology.html', 'clinic/plastic-surgery.html', 'guide/cost.html', 'guide/faq.html', 'service/hospital-regular-cleaning.html', 'service/area-detail-cleaning.html', 'service/hospital-deep-cleaning.html']) {
    assert.equal(safePage(`/shine/${path}?utm_source=google#section`), path);
    assert.equal(safePage(path), path);
  }
  assert.equal(safePage('/area/unknown.html'), 'index.html');
});

const now = Date.parse('2026-11-10T12:00:00+09:00');
const source = { channel: 'naver:cpc', campaign: 'gangnam', content: 'case-01', term: 'clinic' };
const visit = (overrides = {}) => ({ visitor: 'a', session: 'one', day: '2026-11-10', source, landing: 'index.html', device: 'mobile', views: 2, phoneClicks: 1, positions: { header: 1 }, startedAt: now, updatedAt: now, returning: false, ...overrides });
test('Korean day boundary and report range do not use host timezone', () => {
  assert.equal(dayKey(Date.parse('2026-11-09T14:59:59Z')), '2026-11-09');
  assert.equal(dayKey(Date.parse('2026-11-09T15:00:00Z')), '2026-11-10');
  assert.throws(() => range({ from: '2026-02-30', to: '2026-11-10' }, now));
  assert.throws(() => range({ from: '2026-11-11', to: '2026-11-11' }, now));
  assert.throws(() => range({ from: dayKey(now - 90 * DAY), to: dayKey(now) }, now));
  assert.equal(range({ from: dayKey(now - 89 * DAY), to: dayKey(now) }, now).to, '2026-11-10');
});
test('all planned channels separate organic, paid, content, maps and AI', () => {
  for (const channel of ['naver:organic', 'google:organic', 'daum:organic', 'bing:organic', 'naver:cpc', 'google:cpc', 'chatgpt:paid', 'naver:paid_content', 'naver:blog', 'naver:place', 'google:place', 'kakao:place', 'chatgpt:referral']) {
    const link = buildLink('https://site.test/', { ...source, channel });
    assert.equal(classify(link).channel, channel);
  }
  assert.equal(classify('https://site.test/?gclid=abc').channel, 'google:cpc');
  assert.equal(classify('https://site.test/?n_keyword_id=abc').channel, 'naver:cpc');
  assert.equal(classify('https://site.test/?utm_source=chatgpt.com').channel, 'chatgpt:referral');
  assert.equal(classify('https://site.test/', 'https://blog.naver.com/post').channel, 'naver:blog');
  assert.equal(classify('https://site.test/', 'https://naver.com.evil.test/').channel, 'external:referral');
  assert.equal(classify('https://site.test/a.html', 'https://site.test/b.html').channel, 'direct:none');
});
test('last non-direct attribution expires at 30 days and new paid touch replaces it', () => {
  const prior = { source, at: now - 29 * DAY }, direct = safeSource();
  assert.deepEqual(attribution(direct, prior, now), prior);
  assert.equal(attribution(direct, { ...prior, at: now - 31 * DAY }, now).source.channel, 'direct:none');
  assert.equal(attribution({ ...source, channel: 'google:cpc' }, prior, now).source.channel, 'google:cpc');
});
test('URL, source and event sanitization discard personal input and browser clock manipulation', () => {
  assert.equal(safePage('/p1-person-name.html?phone=01012345678'), 'index.html');
  assert.equal(safePage('/shine_clean/p3-our-work-page-10.html?phone=01012345678'), 'p3-our-work-page-10.html');
  assert.equal(safeSource({ ...source, campaign: 'patient@example.com', content: '<script>' }).campaign, '');
  const event = normalizedEvent({ id: '11111111-1111-4111-8111-111111111111', visitor: '22222222-2222-4222-8222-222222222222', session: '33333333-3333-4333-8333-333333333333', type: 'page', source, at: now - 100 * DAY, page: '/index.html?name=person', phone: '01012345678', referrer: 'https://personal.test/user' }, now, 'test-secret');
  assert.equal(event.at, now); assert.equal(event.day, '2026-11-10');
  assert.equal(event.page, 'index.html'); assert.equal(event.visitor.length, 32);
  assert.equal('phone' in event, false); assert.equal('referrer' in event, false);
  assert.throws(() => normalizedEvent({ type: 'phone', id: '../injected' }, now, 'test-secret'));
});
test('period visitors and phone visitors deduplicate across dates, sessions and channels', () => {
  const visits = [visit(), visit({ day: '2026-11-09', session: 'two', source: { ...source, channel: 'google:cpc' }, returning: true }), visit({ visitor: 'b', session: 'three', phoneClicks: 0, returning: true })];
  const r = summarize(visits);
  assert.equal(r.total.visitors, 2); assert.equal(r.total.sessions, 3); assert.equal(r.total.phoneVisitors, 1); assert.equal(r.total.phoneClicks, 2);
  assert.equal(r.total.newVisitors, 1); assert.equal(r.total.returningVisitors, 1);
  assert.equal(r.channels.reduce((n, c) => n + c.visitors, 0), 3);
  assert.equal(r.total.phoneRate, 2 / 3);
});
test('review exclusion removes visits and linked estimates and can be restored', () => {
  const conversions = [{ visitor: 'a', day: '2026-11-10', type: 'estimate', source, qualified: true, contracted: true }];
  const reviews = { a: { status: 'excluded' } };
  assert.equal(summarize([visit()], conversions, [], {}, reviews).total.estimates, 0);
  assert.equal(summarize([visit()], conversions, [], { includeExcluded: true }, reviews).total.contracts, 1);
  assert.equal(summarize([visit()], conversions, [], {}, { a: { status: 'normal' } }).total.visitors, 1);
});
test('missing, zero and partial costs remain distinct and device filters do not invent costs', () => {
  const cost = { day: '2026-11-10', channel: source.channel, campaign: source.campaign, spend: 0, impressions: null, clicks: null };
  assert.equal(summarize([visit()]).total.spend, null);
  assert.equal(summarize([visit()], [], [cost]).total.phoneCost, 0);
  const partial = summarize([visit(), visit({ day: '2026-11-09', session: 'two' })], [], [{ ...cost, spend: 10000 }]);
  assert.equal(partial.total.spend, 10000); assert.equal(partial.total.costIncomplete, true); assert.equal(partial.total.phoneCost, null);
  assert.equal(summarize([visit()], [], [cost], { device: 'mobile' }).total.spend, null);
  assert.equal(summarize([visit()], [], [cost], { kind: 'free' }).total.visitors, 0);
});
test('manual/provider calls are separate from clicks and disconnected calls do not count', () => {
  const calls = [{ type: 'call', day: '2026-11-10', source, connected: false }, { type: 'call', day: '2026-11-10', source, connected: true, qualified: true }];
  const r = summarize([visit()], calls);
  assert.equal(r.total.calls, 1); assert.equal(r.total.phoneClicks, 1); assert.equal(r.total.qualified, 1);
});
test('suspicion is based on distinct sessions and burst counters, never repeated event flags', () => {
  assert.deepEqual(suspicion([visit({ paidEntry: true }), visit({ paidEntry: true })]).reasons, []);
  const visits = Array.from({ length: 10 }, (_, i) => visit({ session: `s${i}`, paidEntry: true }));
  assert.match(suspicion(visits).reasons.join(' '), /10회.*5회/);
  assert.match(suspicion([visit({ burst: 30, reloads: 10, regular: 10 })]).reasons.join(' '), /5분.*반복.*일정/);
});
test('session summary tracks phone position and exact page without copying unknown fields', () => {
  const e = { visitor: 'v', session: 's', day: dayKey(now), source, first: source, attributed: source, device: 'mobile', landing: 'index.html', page: 'p5-estimate.html', type: 'phone', position: 'dialog', at: now, receivedAt: now, expiresAtMs: now + 90 * DAY };
  const v = nextVisit(undefined, e); assert.equal(v.phoneClicks, 1); assert.equal(v.phonePages['p5-estimate.html'], 1); assert.equal(v.positions.dialog, 1);
  const r = makeReport([v], [], [], {}, {}, now); assert.equal(r.pageClicks['p5-estimate.html'], 1);
});
test('CSV handles escaped quotes/newlines and prevents spreadsheet formula injection', () => {
  const text = csv([['label', 'count'], ['=WEBSERVICE("evil")', 1], ['a,"b"\nnext', 2]]);
  const rows = parseCsv(text); assert.match(rows[1][0], /^'/); assert.equal(rows[2][0], 'a,"b"\nnext');
  assert.throws(() => parseCsv('a,"unclosed'));
  assert.throws(() => validateCost({ day: '2026-11-10', channel: 'naver:cpc', campaign: 'gangnam', spend: -1 }));
  assert.throws(() => validateCost({ day: '2026-02-30', channel: 'naver:cpc', campaign: 'gangnam', spend: 1 }));
});
