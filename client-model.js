export function inferClientGroup(record) {
  if (/컨설팅/.test(record.category || '')) return '사무실';
  return /의료|보건|병원|의원|치과|한의|한방|요양|진료|성형|피부과|내과|외과|안과|이비인후|정형|재활/.test(`${record.businessType || ''} ${record.category || ''}`) ? '병원' : '사무실';
}

export function clientGroup(record) {
  return ['병원', '사무실'].includes(record.clientGroup) ? record.clientGroup : inferClientGroup(record);
}

export function maskClientName(record) {
  const name = String(record.cleanName || record.clientName || '').replace(/^\[폐업\]\s*/, '').trim();
  const prefix = name.match(/^(?:(?:주식회사|유한회사|법무법인|회계법인|의료법인|\(주\)|\(유\)|㈜)\s*)/)?.[0] || '';
  const body = name.slice(prefix.length);
  const suffixIndex = body.search(/(?:마취통증의학내과|마취통증의학과|성형외과|피부과|정형외과|이비인후과|산부인과|여성|안과|내과|외과|치과|한의)(?:의원|병원)?|의원|병원|클리닉|주식회사$|\(주\)$|\(유\)$/);
  const end = suffixIndex > 0 ? suffixIndex : body.length;
  const brand = Array.from(body.slice(0, end));
  const positions = brand.flatMap((char, index) => /[\p{L}\p{N}]/u.test(char) && !(/[주유]/.test(char) && brand[index - 1] === '(' && brand[index + 1] === ')') ? [index] : []);
  if (!positions.length) return '*';
  const count = positions.length >= 4 ? 2 : 1;
  const start = positions.length === 2 ? 1 : Math.floor((positions.length - count) / 2);
  for (const index of positions.slice(start, start + count)) brand[index] = '*';
  return prefix + brand.join('') + body.slice(end);
}

export function publicClientName(record) {
  return typeof record.publicName === 'string' && record.publicName.trim() ? record.publicName : maskClientName(record);
}

export function filterClients(records, search, group) {
  const needle = search.trim().toLocaleLowerCase();
  const digits = needle.replace(/\D/g, '');
  return records.filter(record => (group === 'all' || clientGroup(record) === group) &&
    (!needle || ['clientName', 'publicName', 'businessNumber', 'address', 'businessType', 'category', 'registeredDate'].some(key => String(record[key] || '').toLocaleLowerCase().includes(needle)) ||
      (digits && /^[\d\s-]+$/.test(needle) && String(record.businessNumber || '').replace(/\D/g, '').includes(digits))));
}

export function clientChanges(values) {
  const changes = {};
  for (const [key, label, max] of [['cleanName', '거래처명', 200], ['publicName', '외부 노출명', 200], ['address', '주소', 500], ['businessType', '업태', 200], ['category', '종목', 200], ['registeredDate', '등록일', 10]]) {
    if (typeof values[key] !== 'string' || values[key].trim().length > max) throw new Error(`${label}은 ${max}자 이내로 입력해 주세요.`);
    changes[key] = values[key].trim();
  }
  if (!changes.cleanName || changes.cleanName.startsWith('[폐업]')) throw new Error('거래처명을 입력하고 폐업 여부는 거래처 상태에서 선택해 주세요.');
  if (!changes.publicName) throw new Error('외부 노출명을 입력해 주세요.');
  if (typeof values.isClosed !== 'boolean') throw new Error('거래처 상태를 확인해 주세요.');
  if (!['병원', '사무실'].includes(values.clientGroup)) throw new Error('분류는 병원 또는 사무실로 선택해 주세요.');
  changes.clientGroup = values.clientGroup;
  const day = changes.registeredDate;
  if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) throw new Error('올바른 등록일을 입력해 주세요.');
  changes.isClosed = values.isClosed;
  changes.clientName = `${values.isClosed ? '[폐업] ' : ''}${changes.cleanName}`;
  return changes;
}

export function newClient(values) {
  const number = String(values.businessNumber || '').trim();
  if (!/^(?:[0-9]{10}|[0-9]{3}-[0-9]{2}-[0-9]{5})$/.test(number)) throw new Error('거래처 등록번호는 숫자 10자리 또는 000-00-00000 형식으로 입력해 주세요.');
  const digits = number.replace(/-/g, '');
  const businessNumber = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return { ...clientChanges(values), businessNumber };
}
