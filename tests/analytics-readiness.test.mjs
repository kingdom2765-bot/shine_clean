import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyticsConfig } from '../analytics-config.js';
import { verifyAnalytics } from '../scripts/verify-analytics.mjs';

const origin = 'https://www.wonnaecare.co.kr';
function server(overrides = {}) {
  const requests = [];
  return { requests, async fetch(url, options) {
    requests.push({ url, ...options });
    assert.equal(options.headers.Origin, origin);
    if (url.endsWith('/health')) return new Response(JSON.stringify({ service: 'shine-analytics', ready: true }), { status: overrides.healthStatus || 200, headers: { 'access-control-allow-origin': overrides.origin || origin } });
    if (options.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': overrides.headers || 'Content-Type, Authorization' } });
    assert.ok(url.endsWith('/report'));
    return new Response('{}', { status: overrides.reportStatus || 401 });
  } };
}

test('production configuration matches the site domain and passes only read-only readiness checks', async () => {
  const site = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
  const api = server();
  const result = await verifyAnalytics(analyticsConfig, site.siteUrl, api.fetch);
  assert.equal(result.origin, origin);
  assert.equal(result.serverReady, true);
  assert.deepEqual(api.requests.map(r => r.method), ['GET', 'OPTIONS', 'POST']);
  assert.ok(!api.requests.some(r => r.url.endsWith('/collect') && r.method === 'POST'));
});

test('deployment readiness rejects unavailable servers, wrong origins, missing headers and unprotected reports', async () => {
  for (const [overrides, expected] of [
    [{ healthStatus: 404 }, /HTTP 404/],
    [{ origin: 'https://kingdom2765-bot.github.io' }, /도메인/],
    [{ headers: 'Content-Type' }, /CORS/],
    [{ reportStatus: 200 }, /비로그인/],
  ]) await assert.rejects(verifyAnalytics(analyticsConfig, `${origin}/`, server(overrides).fetch), expected);
  await assert.rejects(verifyAnalytics(analyticsConfig, `${origin}/`, async () => { throw new Error('offline'); }), /연결하지 못했습니다/);
});

test('misconfigured tracking is rejected before any server request', async () => {
  const api = server();
  for (const [config, expected] of [
    [{ ...analyticsConfig, enabled: false }, /비활성화/],
    [{ ...analyticsConfig, endpoint: '' }, /서버 주소/],
    [{ ...analyticsConfig, siteUrl: 'https://kingdom2765-bot.github.io/shine_clean/' }, /배포 주소/],
    [{ ...analyticsConfig, endpoint: 'http://api.test' }, /HTTPS/],
  ]) await assert.rejects(verifyAnalytics(config, `${origin}/`, api.fetch), expected);
  assert.equal(api.requests.length, 0);
});
