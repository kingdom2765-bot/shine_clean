import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { timingSafeEqual, createHmac } from 'node:crypto';
import { normalizedEvent, nextVisit, digest, pseudonym, range, makeReport, validateCost } from './lib/service.js';
import { DAY, dayKey, safeSource, safePage, summarize, validDay, slug } from './lib/analytics-model.js';

initializeApp();
const db = getFirestore();
const hashKey = defineSecret('ANALYTICS_HASH_KEY');
const webhookKey = defineSecret('ANALYTICS_CALL_WEBHOOK_KEY');
const originSetting = defineString('ANALYTICS_ORIGINS', { default: 'https://kingdom2765-bot.github.io' });
const region = 'asia-northeast3';
const owner = 'cOLPnjEzpgXYKdowCJcsKIf4xP73';
const expiry = ms => Timestamp.fromMillis(ms);
const collection = name => db.collection(`analytics_${name}`);
const readRows = async (name, from, to, max = 20000) => {
  const rows = []; let cursor;
  do {
    let q = collection(name).where('day', '>=', from).where('day', '<=', to).orderBy('day').limit(500);
    if (cursor) q = q.startAfter(cursor);
    const page = await q.get(); rows.push(...page.docs.map(d => ({ ...d.data(), id: d.id })));
    if (rows.length > max) throw new Error('조회량이 많습니다. 기간을 줄여 다시 조회해 주세요.');
    cursor = page.size === 500 ? page.docs.at(-1) : null;
  } while (cursor);
  return rows;
};
async function admin(request) {
  const token = String(request.headers.authorization || '').match(/^Bearer (.+)$/)?.[1];
  if (!token) throw Object.assign(new Error('관리자 로그인이 필요합니다.'), { status: 401 });
  let claims; try { claims = await getAuth().verifyIdToken(token, true); } catch { throw Object.assign(new Error('로그인을 다시 확인해 주세요.'), { status: 401 }); }
  if (claims.uid !== owner || claims.email !== 'kingdom2765@naver.com' || claims.email_verified !== true || claims.admin !== true) throw Object.assign(new Error('관리자 권한이 없습니다.'), { status: 403 });
  return claims;
}
async function limit(request, now) {
  // Hash is rotated every day; raw IP addresses are never persisted.
  const key = pseudonym(`${dayKey(now)}|${request.ip || 'unknown'}`, hashKey.value());
  const ref = collection('limits').doc(`${key}_${Math.floor(now / 60000)}`);
  await db.runTransaction(async tx => { const snap = await tx.get(ref); const count = snap.data()?.count || 0;
    if (count >= 120) throw Object.assign(new Error('요청이 많습니다. 잠시 후 다시 시도해 주세요.'), { status: 429 });
    tx.set(ref, { count: count + 1, expiresAt: expiry(now + DAY) });
  });
}
async function collect(event) {
  const er = collection('events').doc(event.id), vr = collection('visits').doc(`${event.day}_${event.session}`), dirty = collection('days').doc(event.day);
  await db.runTransaction(async tx => {
    const meta = collection('meta').doc('status');
    const [seen, old, status] = await Promise.all([tx.get(er), tx.get(vr), tx.get(meta)]); if (seen.exists) return;
    if (old.exists && old.data().visitor !== event.visitor) throw new Error('세션 정보가 일치하지 않습니다.');
    const next = nextVisit(old.data(), event);
    tx.set(er, { ...event, expiresAt: expiry(event.expiresAtMs) });
    tx.set(vr, { ...next, expiresAt: expiry(event.expiresAtMs) });
    tx.set(dirty, { day: event.day, revision: FieldValue.increment(1), expiresAt: expiry(event.receivedAt + 90 * DAY) }, { merge: true });
    tx.set(meta, { firstCollectedAt: status.data()?.firstCollectedAt || event.receivedAt, lastCollectedAt: event.receivedAt }, { merge: true });
  });
}
async function reviewsMap() {
  const snap = await collection('reviews').limit(10001).get(); if (snap.size > 10000) throw new Error('검토 기록 한도를 초과했습니다. 관리자 점검이 필요합니다.');
  return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}
async function dataFor(from, to) { return Promise.all([readRows('visits', from, to), readRows('conversions', from, to), readRows('costs', from, to), reviewsMap()]); }
function body(request) {
  if (request.rawBody?.length > 32768) throw Object.assign(new Error('요청 크기를 초과했습니다.'), { status: 413 });
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
}
export const analyticsApi = onRequest({ region, secrets: [hashKey], maxInstances: 3, timeoutSeconds: 120, memory: '256MiB', invoker: 'public' }, async (req, res) => {
  const origins = originSetting.value().split(',').map(v => v.trim()); const origin = req.headers.origin;
  if (!origin || !origins.includes(origin)) { res.status(403).json({ error: '허용되지 않은 출처입니다.' }); return; }
  res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin').set('Access-Control-Allow-Headers', 'Content-Type, Authorization').set('Access-Control-Allow-Methods', 'POST, OPTIONS').set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST 요청을 사용해 주세요.' }); return; }
  try {
    const input = body(req), now = Date.now(), path = req.path.replace(/\/$/, '');
    if (path === '/collect') {
      if (!Array.isArray(input.events) || !input.events.length || input.events.length > 10) throw new Error('이벤트 수를 확인해 주세요.');
      await limit(req, now);
      if (/bot|crawler|spider|headless/i.test(req.headers['user-agent'] || '')) { res.status(202).json({ ignored: true }); return; }
      const events = input.events.map(e => normalizedEvent(e, now, hashKey.value()));
      for (const event of events) await collect(event);
      res.json({ accepted: events.length }); return;
    }
    const user = await admin(req);
    if (path === '/report') {
      const { from, to } = range(input, now); const [visits, conversions, costs, reviews] = await dataFor(from, to);
      const status = (await collection('meta').doc('status').get()).data() || {};
      const count = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
      const previousTo = dayKey(Date.parse(`${from}T12:00:00+09:00`) - DAY), previousFrom = dayKey(Date.parse(`${from}T12:00:00+09:00`) - count * DAY);
      let previous = null;
      if (status.firstCollectedAt && dayKey(status.firstCollectedAt) <= previousFrom && Date.parse(previousFrom) >= Date.parse(dayKey(now - 89 * DAY))) { const prior = await dataFor(previousFrom, previousTo); previous = makeReport(...prior, { ...input, from: previousFrom, to: previousTo }, now).total; }
      res.json({ ...makeReport(visits, conversions, costs, reviews, { ...input, from, to }, now), previous, from, to, status }); return;
    }
    if (path === '/review') {
      if (!/^[a-f0-9]{32}$/.test(input.visitor) || !['normal', 'excluded', 'pending'].includes(input.status) || typeof input.note !== 'string' || input.note.length > 1000) throw new Error('검토 내용을 확인해 주세요.');
      await collection('reviews').doc(input.visitor).set({ status: input.status, note: input.note, updatedAt: now, updatedBy: user.uid, expiresAt: expiry(now + 90 * DAY) });
      res.json({ saved: true }); return;
    }
    if (path === '/costs') {
      if (!Array.isArray(input.rows) || !input.rows.length || input.rows.length > 300) throw new Error('한 번에 1~300행을 저장할 수 있습니다.');
      const rows = input.rows.map(validateCost); for (const row of rows) range({ from: row.day, to: row.day }, now);
      const batch = db.batch(); for (const row of rows) batch.set(collection('costs').doc(digest(`${row.day}|${row.channel}|${row.campaign}`)), { ...row, updatedAt: now, updatedBy: user.uid, expiresAt: expiry(now + 730 * DAY) });
      await batch.commit(); res.json({ saved: rows.length }); return;
    }
    if (path === '/call') {
      if (!validDay(input.day) || !['new', 'qualified', 'contracted', 'closed'].includes(input.status) || typeof input.note !== 'string' || input.note.length > 1000) throw new Error('상담 내용을 확인해 주세요.');
      range({ from: input.day, to: input.day }, now);
      const id = slug(input.id); if (!id) throw new Error('상담 ID를 확인해 주세요.');
      // A manually claimed source is clearly marked; it never silently links to a browser identity.
      await collection('conversions').doc(`call_${id}`).set({ type: 'call', day: input.day, source: safeSource(input.source), status: input.status, qualified: ['qualified', 'contracted'].includes(input.status), contracted: input.status === 'contracted', note: input.note, evidence: 'manual', updatedAt: now, updatedBy: user.uid, expiresAt: expiry(now + 90 * DAY) });
      res.json({ saved: true }); return;
    }
    if (path === '/history') {
      const { from, to } = range(input, now, 730); const rows = await readRows('daily', from, to, 730); res.json({ rows, from, to }); return;
    }
    if (path === '/integrations') {
      res.json({ collector: true, actualCalls: 'signed-webhook-or-manual', adCosts: 'manual-or-csv', platformApis: 'not-connected', conversionDelivery: 'csv-export', detailRetentionDays: 90, aggregateRetentionDays: 730 }); return;
    }
    res.status(404).json({ error: '지원하지 않는 요청입니다.' });
  } catch (error) { const status = error.status || (error.code ? 503 : 400); res.status(status).json({ error: status >= 500 ? '일시적으로 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' : error.message }); }
});

// An estimate is counted only after Firestore confirms the write. No client-side success event is trusted.
export const analyticsEstimate = onDocumentWritten({ document: 'estimate_requests/{requestId}', region, secrets: [hashKey], retry: true }, async event => {
  const ref = collection('conversions').doc(`estimate_${event.params.requestId}`);
  // Re-read current state so out-of-order/retried triggers cannot overwrite a newer status or resurrect a deleted request.
  await db.runTransaction(async tx => {
    const requestRef = db.doc(`estimate_requests/${event.params.requestId}`);
    const [current, previous] = await Promise.all([tx.get(requestRef), tx.get(ref)]);
    if (!current.exists) { tx.delete(ref); return; }
    const record = current.data(), ctx = record.analyticsContext;
    if (ctx?.visitor || ctx?.session) {
      // The estimate's existing manual retention policy must not retain raw browser IDs indefinitely.
      const { visitor, session, ...attributionOnly } = ctx;
      tx.set(requestRef, { ...record, analyticsContext: attributionOnly });
    }
    const at = record.createdAt?.toMillis?.(); if (!at) return;
    if (at < Date.now() - 90 * DAY) { tx.delete(ref); return; }
    const conversion = { type: 'estimate', day: dayKey(at), source: safeSource(ctx?.attributed), first: safeSource(ctx?.first), status: record.status,
      qualified: ['consulting', 'quoted', 'contracted'].includes(record.status), contracted: record.status === 'contracted',
      device: ctx?.device || 'unknown', evidence: ctx ? 'visit-context' : 'unattributed', updatedAt: Date.now(), expiresAt: expiry(at + 90 * DAY) };
    if (ctx?.visitor) conversion.visitor = pseudonym(ctx.visitor, hashKey.value());
    else if (previous.data()?.visitor) conversion.visitor = previous.data().visitor;
    if (ctx?.session) conversion.session = pseudonym(ctx.session, hashKey.value());
    else if (previous.data()?.session) conversion.session = previous.data().session;
    if (ctx?.landing) conversion.landing = safePage(ctx.landing);
    tx.set(ref, conversion);
  });
});

// Provider-neutral actual-call adapter. Only verified, signed provider events are accepted.
export const analyticsCallWebhook = onRequest({ region, secrets: [webhookKey], maxInstances: 2 }, async (req, res) => {
  if (req.method !== 'POST' || !req.rawBody || req.rawBody.length > 8192) { res.status(400).send('Invalid request'); return; }
  const timestamp = String(req.headers['x-shine-timestamp'] || ''), signature = String(req.headers['x-shine-signature'] || '');
  const expected = createHmac('sha256', webhookKey.value()).update(timestamp + '.').update(req.rawBody).digest('hex');
  if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 300000 || !/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) { res.status(401).send('Invalid signature'); return; }
  try {
    const input = req.body;
    if (!slug(input.id) || !validDay(input.day) || !Number.isSafeInteger(input.durationSeconds) || input.durationSeconds < 0 || typeof input.connected !== 'boolean') throw new Error('Invalid call');
    range({ from: input.day, to: input.day }, Date.now());
    const ref = collection('conversions').doc(`provider_${digest(input.id)}`);
    await db.runTransaction(async tx => { const old = await tx.get(ref); if (old.exists) return; tx.set(ref, { type: 'call', day: input.day, source: safeSource(input.source), evidence: 'signed-provider', connected: input.connected, durationSeconds: input.durationSeconds, qualified: input.connected && input.durationSeconds >= 30, contracted: false, expiresAt: expiry(Date.now() + 90 * DAY) }); });
    res.json({ accepted: true });
  } catch { res.status(400).send('Invalid call'); }
});

export const analyticsMaintenance = onSchedule({ schedule: 'every day 01:15', timeZone: 'Asia/Seoul', region, timeoutSeconds: 540, maxInstances: 1 }, async () => {
  const now = Date.now(), today = dayKey(now);
  try {
    const days = await collection('days').get(); const reviews = await reviewsMap();
    const earliest = dayKey(now - 89 * DAY);
    const [recentConversions, recentCosts] = await Promise.all([readRows('conversions', earliest, today), readRows('costs', earliest, today)]);
    const snapshotDays = new Set([...days.docs.map(doc => doc.id), ...recentConversions.map(c => c.day), ...recentCosts.map(c => c.day)]);
    for (const day of snapshotDays) {
      if (day >= today || day < earliest) continue;
      const [visits, conversions, costs] = await Promise.all([readRows('visits', day, day), readRows('conversions', day, day), readRows('costs', day, day)]);
      const report = summarize(visits, conversions, costs, {}, reviews);
      // Persist only anonymous counts. Unique identities and notes never enter long-term aggregates.
      await collection('daily').doc(day).set({ day, total: report.total, channels: report.channels, campaigns: report.campaigns, generatedAt: now, expiresAt: expiry(Date.parse(day) + 730 * DAY) });
    }
  } finally {
    // Always attempt retention cleanup even if report aggregation fails.
    // Explicit bounded deletion works without enabling TTL on the existing estimate collection.
    for (const name of ['events', 'visits', 'reviews', 'limits', 'days', 'conversions', 'costs', 'daily']) {
      for (let i = 0; i < 20; i++) { const expired = await collection(name).where('expiresAt', '<=', expiry(now)).limit(400).get(); if (expired.empty) break; const batch = db.batch(); expired.docs.forEach(d => batch.delete(d.ref)); await batch.commit(); }
    }
  }
});
