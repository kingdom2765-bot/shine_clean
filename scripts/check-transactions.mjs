import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tsvPath = join(__dirname, '../data/raw-transactions.tsv');

async function main() {
  const content = await readFile(tsvPath, 'utf8');
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  const records = [];
  const numMap = new Map();
  let duplicates = 0;

  for (const line of lines) {
    if (line.startsWith('거래처등록번호')) continue;
    const parts = line.split('\t').map(p => p.trim());
    if (parts.length >= 6) {
      const [businessNumber, clientName, address, businessType, category, registeredDate] = parts;
      if (numMap.has(businessNumber)) {
        duplicates++;
        console.log(`Duplicate registration number found: ${businessNumber} (Existing: ${numMap.get(businessNumber)}, Duplicate: ${clientName})`);
        continue;
      }
      numMap.set(businessNumber, clientName);

      const isClosed = clientName.startsWith('[폐업]');
      const cleanName = isClosed ? clientName.replace(/^\[폐업\]\s*/, '').trim() : clientName;

      records.push({
        businessNumber,
        clientName,
        cleanName,
        isClosed,
        address,
        businessType: businessType === '—' ? '' : businessType,
        category: category === '—' ? '' : category,
        registeredDate,
      });
    }
  }

  console.log(`Total records: ${records.length}`);
  console.log(`Duplicate registration numbers skipped: ${duplicates}`);
}

main().catch(console.error);
