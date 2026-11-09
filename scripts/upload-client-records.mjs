import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const GCLOUD_PATH = 'C:\\Users\\kingd\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';
const PROJECT_ID = 'trading-dashboard-480711';
const COLLECTION_NAME = 'client_records';

async function getAccessToken() {
  console.log('Retrieving Google Cloud access token via gcloud...');
  const { stdout } = await execFileAsync(`"${GCLOUD_PATH}"`, ['auth', 'print-access-token'], { shell: true });
  const token = stdout.trim();
  if (!token) throw new Error('Failed to retrieve access token.');
  return token;
}

async function main() {
  const token = await getAccessToken();
  console.log('Access token acquired.');

  const tsvPath = join(__dirname, '../data/raw-transactions.tsv');
  const content = await readFile(tsvPath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const writes = [];
  const nowIso = new Date().toISOString();
  let count = 0;

  for (const line of lines) {
    if (line.startsWith('거래처등록번호')) continue;
    const parts = line.split('\t').map(p => p.trim());
    if (parts.length < 6) continue;

    const [businessNumber, clientName, address, rawType, rawCat, registeredDate] = parts;
    const isClosed = clientName.startsWith('[폐업]');
    const cleanName = isClosed ? clientName.replace(/^\[폐업\]\s*/, '').trim() : clientName;
    const businessType = rawType === '—' ? '' : rawType;
    const category = rawCat === '—' ? '' : rawCat;

    // Generate safe document ID from business number
    const docId = businessNumber.replace(/[^0-9a-zA-Z가-힣._-]/g, '_');
    const docName = `projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION_NAME}/${docId}`;

    writes.push({
      update: {
        name: docName,
        fields: {
          businessNumber: { stringValue: businessNumber },
          clientName: { stringValue: clientName },
          cleanName: { stringValue: cleanName },
          isClosed: { booleanValue: isClosed },
          address: { stringValue: address },
          businessType: { stringValue: businessType },
          category: { stringValue: category },
          registeredDate: { stringValue: registeredDate },
          createdAt: { timestampValue: nowIso },
        },
      },
    });
    count++;
  }

  console.log(`Parsed ${count} records. Uploading in batches to collection '${COLLECTION_NAME}'...`);

  // Max 500 writes per commit
  const batchSize = 300;
  for (let i = 0; i < writes.length; i += batchSize) {
    const chunk = writes.slice(i, i + batchSize);
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;

    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-goog-user-project': PROJECT_ID,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes: chunk }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore commit failed (${res.status} ${res.statusText}): ${errText}`);
    }

    const data = await res.json();
    console.log(`Batch ${Math.floor(i / batchSize) + 1} committed successfully. Commit time: ${data.commitTime}, writes: ${data.writeResults?.length}`);
  }

  console.log(`\nAll ${count} documents uploaded successfully to collection '${COLLECTION_NAME}'.`);
}

main().catch((err) => {
  console.error('Error uploading records:', err);
  process.exit(1);
});
