import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { maskClientName } from '../client-model.js';

const project = 'trading-dashboard-480711';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token']);
const headers = { Authorization: `Bearer ${stdout.trim()}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`Firestore request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
async function readAll() {
  const documents = []; let pageToken;
  do {
    const url = new URL(`${base}/client_records`); url.searchParams.set('pageSize', '300'); if (pageToken) url.searchParams.set('pageToken', pageToken);
    const page = await request(url); documents.push(...(page.documents || [])); pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}
const decode = doc => Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key, value.stringValue ?? value.booleanValue ?? null]));
const documents = await readAll();
const pending = documents.filter(doc => !decode(doc).publicName?.trim());
for (const doc of pending) {
  const record = decode(doc); const masked = maskClientName(record);
  if (!masked.includes('*') || masked === (record.cleanName || record.clientName)) throw new Error('Unmasked name detected; aborting.');
  console.log(`${record.cleanName || record.clientName} → ${masked}`);
}
if (process.argv.includes('--apply') && pending.length) {
  if (pending.length > 500) throw new Error('More than 500 updates: review migration before applying.');
  const backupDir = new URL('../backups/firebase/', import.meta.url); await mkdir(backupDir, { recursive: true });
  const backup = new URL(`client-names-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupDir);
  await writeFile(backup, JSON.stringify(documents, null, 2), { flag: 'wx' });
  await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes: pending.map(doc => ({
    update: { name: doc.name, fields: { publicName: { stringValue: maskClientName(decode(doc)) } } },
    updateMask: { fieldPaths: ['publicName'] }, currentDocument: { updateTime: doc.updateTime },
  })) }) });
  const saved = await readAll(); const byName = new Map(saved.map(doc => [doc.name, doc]));
  for (const original of documents) {
    const current = byName.get(original.name);
    if (!current) throw new Error('A record disappeared during verification.');
    for (const [key, value] of Object.entries(original.fields)) {
      if (key !== 'publicName' && JSON.stringify(value) !== JSON.stringify(current.fields[key])) throw new Error(`Concurrent change detected during verification: ${key}`);
    }
    const expected = decode(original).publicName?.trim() ? decode(original).publicName : maskClientName(decode(original));
    if (decode(current).publicName !== expected) throw new Error('Saved public name does not match expected value.');
  }
  console.log(`Saved and verified ${pending.length} public names; original fields preserved. Backup: ${backup.pathname}`);
} else console.log(JSON.stringify({ total: documents.length, missingPublicNames: pending.length }));
