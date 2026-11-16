import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './worker.mjs';

const botRequest = () => new Request('https://www.wonnaecare.co.kr/robots.txt?private=omit', {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; OAI-SearchBot/1.3)', 'cf-connecting-ip': '192.0.2.1' },
});

test('records crawler request and actual origin status without changing response', async () => {
  const records = [], request = botRequest();
  const origin = new Response('User-agent: *\nAllow: /', { status: 200, headers: { 'content-type': 'text/plain' } });
  const result = await handleRequest(request, async r => { assert.equal(r, request); return origin; }, line => records.push(JSON.parse(line)));
  assert.equal(result, origin);
  assert.equal(records.length, 1);
  assert.equal(records[0].ip, '192.0.2.1');
  assert.equal(records[0].path, '/robots.txt');
  assert.equal(records[0].status, 200);
  assert.equal(records[0].identityVerified, false);
  assert.ok(!JSON.stringify(records).includes('private'));
});

test('ordinary visitors produce no custom access record', async () => {
  await handleRequest(new Request('https://www.wonnaecare.co.kr/'), async () => new Response('ok'), () => assert.fail('unexpected visitor record'));
});

test('origin errors are recorded and preserved', async () => {
  const records = [], error = new Error('origin unavailable');
  await assert.rejects(handleRequest(botRequest(), async () => { throw error; }, line => records.push(JSON.parse(line))), e => e === error);
  assert.equal(records[0].originError, true);
  assert.equal(records[0].status, null);
});

test('logging failure does not interrupt delivery', async () => {
  const response = new Response('ok');
  assert.equal(await handleRequest(botRequest(), async () => response, () => { throw new Error('logging unavailable'); }), response);
});
