import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { clientPagePath, clientPageSize } from '../public-client-model.js';
const clients = JSON.parse(await readFile(new URL('../data/public-clients.json', import.meta.url), 'utf8'));
let cardCount = 0;
for (let page = 1; page <= Math.max(1, Math.ceil(clients.length / clientPageSize)); page++) {
  const html = await readFile(new URL(`../${clientPagePath(page)}`, import.meta.url), 'utf8');
  const document = new JSDOM(html).window.document;
  const cards = [...document.querySelectorAll('.work-client')];
  assert.equal(cards.length, clients.slice((page - 1) * clientPageSize, page * clientPageSize).length);
  assert.ok(cards.every(card => !card.hidden));
  assert.ok(!html.includes('{{clientCount}}'));
  cardCount += cards.length;
}
assert.equal(cardCount, clients.length);
let officeSeen = false;
for (const client of clients) {
  assert.deepEqual(Object.keys(client).sort(), ['address', 'category', 'clientGroup', 'publicName']);
  if (client.clientGroup === '사무실') officeSeen = true;
  else assert.equal(officeSeen, false, 'hospitals precede offices');
}
console.log(`Built ${cardCount} cards across real pages (12 per page), hospitals first; public snapshot has only four fields.`);
if (process.argv.includes('--live')) {
  const base = 'https://firestore.googleapis.com/v1/projects/trading-dashboard-480711/databases/(default)/documents';
  const publicResponse = await fetch(`${base}/public_client_records?pageSize=300`);
  assert.equal(publicResponse.status, 200);
  const { documents = [] } = await publicResponse.json();
  for (const doc of documents) {
    assert.deepEqual(Object.keys(doc.fields).sort(), ['address', 'category', 'clientGroup', 'publicName']);
    assert.match(doc.name.split('/').pop(), /^[a-f0-9-]{36}$/);
  }
  const privateResponse = await fetch(`${base}/client_records?pageSize=1`);
  assert.equal(privateResponse.status, 403);
  console.log(`Anonymous public read: 200 (${documents.length} clients, four fields, random IDs); private read: 403.`);
}
