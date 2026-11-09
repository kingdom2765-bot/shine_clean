import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { sortPublicClients, toPublicClient } from '../public-client-model.js';

const project = 'trading-dashboard-480711';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token']);
const headers = { Authorization: `Bearer ${stdout.trim()}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`Firestore request failed: ${response.status}`);
  return response.json();
}
async function readAll(collection) {
  const documents = []; let pageToken;
  do {
    const url = new URL(`${base}/${collection}`); url.searchParams.set('pageSize', '300'); if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await request(url); documents.push(...(page.documents || [])); pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}
const decode = doc => Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key, value.stringValue ?? value.booleanValue ?? null]));
const originals = await readAll('client_records');
const existingPublic = await readAll('public_client_records');
const existingById = new Map(existingPublic.map(doc => [doc.name, doc]));
const entries = originals.map(doc => ({ original: doc, publicId: decode(doc).publicId || randomUUID(), data: toPublicClient(decode(doc)) }));
if (new Set(entries.map(entry => entry.publicId)).size !== entries.length) throw new Error('Duplicate public IDs.');
for (const entry of entries) if (!/^[a-f0-9-]{36}$/.test(entry.publicId)) throw new Error('Invalid public ID.');
console.log(JSON.stringify({ total: entries.length, hospital: entries.filter(entry => entry.data.clientGroup === '병원').length, office: entries.filter(entry => entry.data.clientGroup === '사무실').length, publicFields: ['publicName', 'category', 'address', 'clientGroup'] }));
if (!process.argv.includes('--apply')) process.exit(0);
const backupDir = new URL('../backups/firebase/', import.meta.url); await mkdir(backupDir, { recursive: true });
await writeFile(new URL(`clients-before-publish-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupDir), JSON.stringify({ originals, existingPublic }, null, 2), { flag: 'wx' });
const writes = [];
for (const entry of entries) {
  if (!decode(entry.original).publicId) writes.push({ update: { name: entry.original.name, fields: { publicId: { stringValue: entry.publicId } } }, updateMask: { fieldPaths: ['publicId'] }, currentDocument: { updateTime: entry.original.updateTime } });
  const name = `${base.replace('https://firestore.googleapis.com/v1/', '')}/public_client_records/${entry.publicId}`;
  const prior = existingById.get(name);
  writes.push({ update: { name, fields: Object.fromEntries(Object.entries(entry.data).map(([key, value]) => [key, { stringValue: value }])) }, currentDocument: prior ? { updateTime: prior.updateTime } : { exists: false } });
}
if (writes.length > 500) throw new Error('More than 500 writes: review before publishing.');
if (writes.length) await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
const saved = await readAll('public_client_records');
const byName = new Map(saved.map(doc => [doc.name.split('/').pop(), doc]));
for (const entry of entries) {
  const record = byName.get(entry.publicId);
  if (!record || JSON.stringify(Object.keys(record.fields).sort()) !== JSON.stringify(['publicName', 'category', 'address', 'clientGroup'].sort())) throw new Error('Unexpected public fields.');
  for (const [key, value] of Object.entries(entry.data)) if (decode(record)[key] !== value) throw new Error('Public data verification failed.');
}
const privateAfter = new Map((await readAll('client_records')).map(doc => [doc.name, doc]));
for (const original of originals) {
  const after = privateAfter.get(original.name);
  for (const [key, value] of Object.entries(original.fields)) if (JSON.stringify(after?.fields[key]) !== JSON.stringify(value)) throw new Error('Original field changed during publication.');
}
await writeFile(new URL('../data/public-clients.json', import.meta.url), JSON.stringify(sortPublicClients(saved.map(decode)), null, 2) + '\n');
console.log(`Published and verified ${entries.length} clients. Original data preserved; public snapshot exported.`);
