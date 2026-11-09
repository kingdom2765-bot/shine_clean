import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GCLOUD_PATH = 'C:\\Users\\kingd\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';
const PROJECT_ID = 'trading-dashboard-480711';
const COLLECTION_NAME = 'client_records';

async function main() {
  const { stdout } = await execFileAsync(`"${GCLOUD_PATH}"`, ['auth', 'print-access-token'], { shell: true });
  const token = stdout.trim();

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': PROJECT_ID,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: {
          from: [{ collectionId: COLLECTION_NAME }],
        },
        aggregations: [
          { count: {}, alias: 'total_count' },
        ],
      },
    }),
  });

  const data = await res.json();
  console.log('Aggregation result:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
