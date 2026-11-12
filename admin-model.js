export const statuses = Object.freeze({ new: '신규', consulting: '상담 중', quoted: '견적 전달', contracted: '계약 완료', closed: '종료' });
export function filterEstimates(records, search, status) {
  const needle = search.trim().toLocaleLowerCase();
  const digits = needle.replace(/[^0-9]/g, '');
  return records.filter(record => (status === 'all' || record.status === status) && (!needle ||
    [record.clinicName, record.contactName, record.phone, record.address, record.requestId].some(value => String(value || '').toLocaleLowerCase().includes(needle)) ||
    (digits && /^[0-9\s()+-]+$/.test(needle) && String(record.phone || '').includes(digits))));
}
export function managementChanges(status, notes) {
  if (!Object.hasOwn(statuses, status)) throw new Error('처리 상태를 확인해 주세요.');
  if (notes.length > 5000) throw new Error('상담 메모는 5,000자 이내로 입력해 주세요.');
  return { status, adminNotes: notes };
}
