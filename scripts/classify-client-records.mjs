import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { inferClientGroup } from '../client-model.js';

const project = 'trading-dashboard-480711';
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token']);
const headers = { Authorization: `Bearer ${stdout.trim()}`, 'x-goog-user-project': project, 'Content-Type': 'application/json' };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`Firestore request failed: ${response.status} ${await response.text()}`);
  return response.json();
}
const documents = [];
let pageToken;
do {
  const url = new URL(`${base}/client_records`); url.searchParams.set('pageSize', '300'); if (pageToken) url.searchParams.set('pageToken', pageToken);
  const page = await request(url); documents.push(...(page.documents || [])); pageToken = page.nextPageToken;
} while (pageToken);
const decode = doc => Object.fromEntries(Object.entries(doc.fields).map(([key, value]) => [key, value.stringValue ?? value.booleanValue ?? null]));
const groups = new Map();
for (const doc of documents) {
  const record = decode(doc); const label = `${record.businessType || '(없음)'} / ${record.category || '(없음)'}`;
  const key = `${inferClientGroup(record)}: ${label}`; groups.set(key, (groups.get(key) || 0) + 1);
}
console.log(JSON.stringify({ total: documents.length, types: Object.fromEntries(groups) }, null, 2));
const pending = documents.filter(doc => !['병원', '사무실'].includes(decode(doc).clientGroup));
if (process.argv.includes('--apply') && pending.length) {
  const backupDir = new URL('../backups/firebase/', import.meta.url); await mkdir(backupDir, { recursive: true });
  const backup = new URL(`client-groups-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, backupDir);
  await writeFile(backup, JSON.stringify(documents, null, 2), { flag: 'wx' });
  // One atomic commit; only the new classification field changes. Abort on concurrent edits.
  if (pending.length > 500) throw new Error('More than 500 updates: review migration before applying.');
  await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes: pending.map(doc => ({
    update: { name: doc.name, fields: { clientGroup: { stringValue: inferClientGroup(decode(doc)) } } },
    updateMask: { fieldPaths: ['clientGroup'] }, currentDocument: { updateTime: doc.updateTime },
  })) }) });
  console.log(`Classified ${pending.length} records. Backup: ${backup.pathname}`);
}
console.log(JSON.stringify({ missing: pending.length, hospital: documents.filter(doc => (decode(doc).clientGroup || inferClientGroup(decode(doc))) === '병원').length, office: documents.filter(doc => (decode(doc).clientGroup || inferClientGroup(decode(doc))) === '사무실').length }));
