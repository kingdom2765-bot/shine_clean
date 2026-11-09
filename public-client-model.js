// The public projection must never fall back to the original client name or IDs.
export const clientPageSize = 12;
export const clientPagePath = page => page === 1 ? 'p3-our-work.html' : `p3-our-work-page-${page}.html`;
export function toPublicClient(record) {
  const fields = [['publicName', 200], ['category', 200], ['address', 500]];
  if (!record || !['병원', '사무실'].includes(record.clientGroup)) throw new Error('거래처 분류를 확인해 주세요.');
  for (const [key, max] of fields) if (typeof record[key] !== 'string' || record[key].length > max) throw new Error('공개할 거래처 정보를 확인해 주세요.');
  if (!record.publicName.trim()) throw new Error('외부 노출명을 입력해 주세요.');
  return { publicName: record.publicName, category: record.category, address: record.address, clientGroup: record.clientGroup };
}

export function sortPublicClients(records) {
  return records.map(toPublicClient).sort((a, b) => (a.clientGroup === '병원' ? 0 : 1) - (b.clientGroup === '병원' ? 0 : 1) || a.publicName.localeCompare(b.publicName, 'ko'));
}
