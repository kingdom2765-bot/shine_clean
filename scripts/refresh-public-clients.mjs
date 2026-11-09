import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sortPublicClients } from '../public-client-model.js';

const collectionUrl = 'https://firestore.googleapis.com/v1/projects/trading-dashboard-480711/databases/(default)/documents/public_client_records';
export function decodePublicDocuments(documents) {
  return documents.map(doc => {
    const fields = doc.fields || {};
    if (Object.keys(fields).sort().join(',') !== 'address,category,clientGroup,publicName') throw new Error('공개 거래처에 허용되지 않은 필드가 있습니다.');
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.stringValue]));
  });
}
export async function refreshPublicClients() {
  let pageToken; const documents = [];
  do {
    const url = new URL(collectionUrl); url.searchParams.set('pageSize', '300'); if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`공개 거래처 조회 실패: ${response.status}`);
    const result = await response.json(); documents.push(...(result.documents || [])); pageToken = result.nextPageToken;
  } while (pageToken);
  const records = sortPublicClients(decodePublicDocuments(documents));
  const output = JSON.stringify(records, null, 2) + '\n';
  const target = new URL('../data/public-clients.json', import.meta.url);
  const previous = await readFile(target, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  if (previous !== output) {
    const temporary = new URL('../data/public-clients.json.tmp', import.meta.url);
    await writeFile(temporary, output); await rename(temporary, target);
  }
  return records.length;
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(`Refreshed ${await refreshPublicClients()} public clients (four fields only).`);
