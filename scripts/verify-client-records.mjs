import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GCLOUD_PATH = 'C:\\Users\\kingd\\AppData\\Local\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd';
const PROJECT_ID = 'trading-dashboard-480711';
const COLLECTION_NAME = 'client_records';

async function main() {
  const { stdout } = await execFileAsync(`"${GCLOUD_PATH}"`, ['auth', 'print-access-token'], { shell: true });
  const token = stdout.trim();

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION_NAME}?pageSize=10`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': PROJECT_ID,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch documents: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log(`Fetched first ${data.documents?.length} documents from '${COLLECTION_NAME}':`);
  data.documents?.forEach((doc, idx) => {
    const fields = doc.fields;
    console.log(`[${idx + 1}] ID: ${doc.name.split('/').pop()} | ${fields.clientName?.stringValue} | ${fields.businessNumber?.stringValue} | ${fields.address?.stringValue} | ${fields.businessType?.stringValue} | ${fields.category?.stringValue} | ${fields.registeredDate?.stringValue}`);
  });
}

main().catch(console.error);
