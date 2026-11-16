import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { actualClientName } from '../client-model.js';
import { sortPublicClients, toPublicClient } from '../public-client-model.js';

const project = 'trading-dashboard-480711';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token']);
const headers = { Authorization: `Bearer ${stdout.trim()}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Firestore request failed: ${response.status}`);
  return response.json();
}
async function readAll(collection) {
  const documents = []; let pageToken;
  do {
    const url = new URL(`${base}/${collection}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await request(url);
    documents.push(...(page.documents || [])); pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}
const decode = doc => Object.fromEntries(Object.entries(doc.fields || {}).map(([key, value]) => [key, value.stringValue ?? value.booleanValue ?? null]));
const originals = await readAll('client_records');
const publicBefore = await readAll('public_client_records');
const publicById = new Map(publicBefore.map(doc => [doc.name.split('/').pop(), doc]));
const writes = []; const expectedNames = new Map(); const seenIds = new Set();
for (const original of originals) {
  const record = decode(original);
  const name = actualClientName(record);
  const publicDoc = publicById.get(record.publicId);
  if (!name || name.includes('*') || !publicDoc || seenIds.has(record.publicId)) throw new Error('Missing real name or invalid public record mapping.');
  seenIds.add(record.publicId);
  assert.deepEqual(Object.keys(publicDoc.fields).sort(), ['address', 'category', 'clientGroup', 'publicName']);
  toPublicClient({ ...decode(publicDoc), publicName: name });
  expectedNames.set(original.name, name); expectedNames.set(publicDoc.name, name);
  for (const doc of [original, publicDoc]) if (decode(doc).publicName !== name) writes.push({
    update: { name: doc.name, fields: { publicName: { stringValue: name } } },
    updateMask: { fieldPaths: ['publicName'] }, currentDocument: { updateTime: doc.updateTime },
  });
}
if (!originals.length || seenIds.size !== publicBefore.length || writes.length > 500) throw new Error('Unexpected collection size; migration stopped.');
console.log(JSON.stringify({ clients: originals.length, nameUpdates: writes.length, apply: process.argv.includes('--apply') }));
if (!process.argv.includes('--apply')) process.exit(0);
if (writes.length) {
  const backupDir = new URL('../backups/firebase/', import.meta.url);
  await mkdir(backupDir, { recursive: true });
  await writeFile(new URL(`clients-before-real-names-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupDir), JSON.stringify({ originals, publicBefore }, null, 2), { flag: 'wx' });
  await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
}
const privateAfter = await readAll('client_records');
const publicAfter = await readAll('public_client_records');
const afterByName = new Map([...privateAfter, ...publicAfter].map(doc => [doc.name, doc]));
assert.equal(privateAfter.length, originals.length); assert.equal(publicAfter.length, publicBefore.length);
for (const before of [...originals, ...publicBefore]) {
  const after = afterByName.get(before.name);
  assert.ok(after);
  assert.deepEqual(after.fields, { ...before.fields, publicName: { stringValue: expectedNames.get(before.name) } });
}
await writeFile(new URL('../data/public-clients.json', import.meta.url), JSON.stringify(sortPublicClients(publicAfter.map(decode)), null, 2) + '\n');
console.log(`Verified ${originals.length} actual business names; all other fields preserved.`);
