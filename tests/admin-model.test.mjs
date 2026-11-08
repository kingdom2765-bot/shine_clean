import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEstimates, managementChanges } from '../admin-model.js';
const records = [
  { clinicName: '샘플 피부과', contactName: '테스트담당', phone: '01012345678', address: '서울 강남구', status: 'new' },
  { clinicName: '<script>문자열병원', contactName: '다른 담당', phone: '021234567', address: '경기 성남시', status: 'quoted' },
];
test('search normalizes formatted phone and combines status filter', () => {
  assert.equal(filterEstimates(records, '010-1234-5678', 'all').length, 1);
  assert.equal(filterEstimates(records, '강남', 'quoted').length, 0);
  assert.equal(filterEstimates(records, '강남', 'new').length, 1);
  assert.equal(filterEstimates(records, '테스트담당', 'all').length, 1);
  assert.equal(filterEstimates(records, '', 'all').length, 2);
});
test('management changes accept known statuses and enforce notes limit', () => {
  assert.deepEqual(managementChanges('quoted', '견적 전달 완료'), { status: 'quoted', adminNotes: '견적 전달 완료' });
  assert.throws(() => managementChanges('__proto__', ''));
  assert.throws(() => managementChanges('new', '가'.repeat(5001)));
  assert.equal(managementChanges('new', '가'.repeat(5000)).adminNotes.length, 5000);
});
