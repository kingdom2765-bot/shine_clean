import { filterClients, clientChanges, clientGroup, publicClientName, newClient, actualClientName, inferClientGroup } from './client-model.js';
import { toPublicClient } from './public-client-model.js';

export function createClientManager({ sdk, db }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#client-detail');
  const form = $('#client-edit-form');
  let user, records = [], selected, cursor, hasMore = false, generation = 0, busy = false, loading = false;
  let creating = false, baseline = '', manualPublicName = false, manualGroup = false;
  const notice = (text, error = false) => { $('#admin-notice').textContent = text; $('#admin-notice').classList.toggle('error', error); };
  const fields = ['cleanName', 'publicName', 'address', 'businessType', 'category', 'registeredDate'];
  const stamp = value => value?.toMillis?.() ?? value?.toDate?.().getTime() ?? null;
  const version = record => JSON.stringify([record.updatedAt, record.createdAt].map(stamp).concat(['businessNumber', 'clientName', 'cleanName', 'isClosed', 'address', 'businessType', 'category', 'registeredDate', 'clientGroup', 'publicName'].map(key => record[key] ?? null)));
  const message = error => error.code === 'permission-denied' ? '거래처 조회·수정 권한을 확인할 수 없습니다. 관리자 로그인과 DB 규칙 적용 상태를 확인해 주세요.' : error.code ? '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.' : error.message;
  function node(tag, text, className) { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
  function render() {
    const filtered = filterClients(records, $('#client-search').value, $('#client-filter').value);
    $('#client-count').textContent = `불러온 ${records.length}건 중 ${filtered.length}건 표시 · 검색과 건수는 불러온 거래처 기준`;
    $('#client-stats').replaceChildren(...[['불러온 거래처', records.length], ['병원', records.filter(item => clientGroup(item) === '병원').length], ['사무실', records.filter(item => clientGroup(item) === '사무실').length]].map(([label, count]) => { const card = document.createElement('div'); card.className = 'admin-stat'; card.append(node('span', label), node('strong', String(count))); return card; }));
    $('#client-list').replaceChildren(...filtered.map(record => {
      const button = node('button', '', 'admin-row client-row'); button.type = 'button';
      const title = node('div', ''); title.append(node('h3', record.cleanName || record.clientName || '거래처명 없음'), node('p', [record.businessType, record.category].filter(Boolean).join(' · ') || '업태·종목 미등록'));
      const badge = node('span', clientGroup(record), 'admin-badge client-group'); badge.dataset.group = clientGroup(record);
      button.append(title, node('span', publicClientName(record), 'client-public-name'), node('span', record.businessNumber || '—', 'client-number'), node('span', record.address || '주소 미등록', 'client-address'), badge, node('span', `등록일 ${record.registeredDate || '미등록'}`, 'client-date'));
      button.addEventListener('click', () => open(record)); return button;
    }));
    $('#client-empty').hidden = filtered.length > 0;
    $('#client-empty').textContent = records.length ? '검색 조건에 맞는 거래처가 없습니다. 남은 거래처가 있다면 더 불러와 주세요.' : '등록된 거래처가 없습니다.';
    $('#client-more').hidden = !hasMore;
  }
  async function load(reset = true) {
    if (!user || loading || busy) return;
    const current = generation; loading = true; $('#client-refresh').disabled = true; $('#client-more').disabled = true;
    try {
      const snapshot = await sdk.getDocs(sdk.query(sdk.collection(db, 'client_records'), sdk.orderBy(sdk.documentId()), ...(reset || !cursor ? [] : [sdk.startAfter(cursor)]), sdk.limit(200)));
      if (current !== generation || !user) return;
      const incoming = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      records = reset ? incoming : [...records, ...incoming.filter(item => !records.some(old => old.id === item.id))];
      cursor = snapshot.docs.at(-1); hasMore = snapshot.size === 200; render(); notice('거래처를 선택하면 상세 정보를 수정할 수 있습니다.');
    } catch (error) { if (current === generation) notice(message(error), true); }
    finally { if (current === generation) { loading = false; $('#client-refresh').disabled = false; $('#client-more').disabled = false; } }
  }
  function open(record) {
    creating = false;
    selected = record;
    $('#client-new-number-field').hidden = true; $('#client-new-number').disabled = true; $('#client-new-number').required = false;
    $('#client-save').textContent = '변경사항 저장';
    $('#client-detail-title').textContent = record.cleanName || record.clientName;
    $('#client-business-number').textContent = record.businessNumber || '—';
    $('#client-document-id').textContent = `문서 ID: ${record.id}`;
    for (const key of fields) form.elements.namedItem(key).value = (key === 'publicName' ? publicClientName(record) : record[key]) || (key === 'cleanName' ? String(record.clientName || '').replace(/^\[폐업\]\s*/, '') : '');
    form.elements.namedItem('clientGroup').value = clientGroup(record);
    form.elements.namedItem('isClosed').value = String(Boolean(record.isClosed));
    const updated = record.updatedAt?.toDate?.();
    $('#client-updated').textContent = updated ? `마지막 수정: ${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(updated)}` : '아직 수정 이력이 없습니다.';
    $('#client-feedback').textContent = ''; baseline = draft(); dialog.showModal();
  }
  function draft() { return JSON.stringify([...fields, 'clientGroup', 'isClosed', 'businessNumber'].map(key => form.elements.namedItem(key).value)); }
  function dirty() { return (creating || selected) && draft() !== baseline; }
  function close() { if (!busy && (!dirty() || window.confirm('저장하지 않은 변경사항을 버리고 닫을까요?'))) { dialog.close(); selected = undefined; creating = false; form.reset(); } }
  function openNew() {
    if (!user || busy) return;
    form.reset(); selected = undefined; creating = true; manualPublicName = false; manualGroup = false;
    $('#client-detail-title').textContent = '신규 거래처 등록'; $('#client-document-id').textContent = '등록번호로 중복 여부를 확인한 뒤 등록합니다.';
    $('#client-business-number').textContent = '신규 등록'; $('#client-updated').textContent = ''; $('#client-feedback').textContent = '';
    $('#client-new-number-field').hidden = false; $('#client-new-number').disabled = false; $('#client-new-number').required = true;
    $('#client-save').textContent = '거래처 등록';
    form.elements.namedItem('clientGroup').value = '사무실'; form.elements.namedItem('isClosed').value = 'false';
    form.elements.namedItem('registeredDate').value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    baseline = draft(); dialog.showModal(); $('#client-new-number').focus();
  }
  function setBusy(value) { busy = value; for (const control of [...form.elements, $('#client-close'), $('#client-cancel'), $('#admin-logout')]) control.disabled = value; $('#client-new-number').disabled = value || !creating; }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!user || busy || (!creating && !selected)) return;
    const feedback = $('#client-feedback'); let changes;
    const isNew = creating;
    try { changes = (isNew ? newClient : clientChanges)(Object.fromEntries([...fields.map(key => [key, form.elements.namedItem(key).value]), ['businessNumber', form.elements.namedItem('businessNumber').value], ['isClosed', form.elements.namedItem('isClosed').value === 'true'], ['clientGroup', form.elements.namedItem('clientGroup').value]])); }
    catch (error) { feedback.textContent = error.message; return; }
    const original = selected, current = generation, actor = user.uid;
    const publicId = original?.publicId || crypto.randomUUID();
    setBusy(true); feedback.textContent = '저장 중입니다…';
    try {
      await sdk.runTransaction(db, async transaction => {
        const ref = sdk.doc(db, 'client_records', isNew ? changes.businessNumber : original.id); const latest = await transaction.get(ref);
        if (isNew) {
          if (latest.exists()) throw new Error('이미 등록된 거래처 등록번호입니다. 기존 거래처를 검색해 수정해 주세요.');
          transaction.set(ref, { ...changes, publicId, createdAt: sdk.serverTimestamp(), createdBy: actor, updatedAt: sdk.serverTimestamp(), updatedBy: actor });
          transaction.set(sdk.doc(db, 'public_client_records', publicId), toPublicClient(changes));
          return;
        }
        if (!latest.exists()) throw new Error('이 거래처가 더 이상 존재하지 않습니다. 새로고침해 주세요.');
        if (version(latest.data()) !== version(original)) throw new Error('다른 창에서 변경한 거래처입니다. 입력 내용을 확인한 뒤 창을 닫고 새로고침해 주세요.');
        if (latest.data().publicId !== original.publicId) throw new Error('공개 정보가 변경되었습니다. 새로고침한 후 다시 확인해 주세요.');
        transaction.update(ref, { ...changes, publicId, updatedAt: sdk.serverTimestamp(), updatedBy: actor });
        transaction.set(sdk.doc(db, 'public_client_records', publicId), toPublicClient(changes));
      });
      if (current !== generation) return;
      // Reload the list so the next edit uses the server timestamp.
      records = []; render(); dialog.close(); selected = undefined; creating = false; form.reset();
      if (isNew) { $('#client-search').value = ''; $('#client-filter').value = 'all'; }
      setBusy(false); await load(true); if (!$('#admin-notice').classList.contains('error')) notice(isNew ? '신규 거래처를 등록했습니다.' : '거래처 정보를 저장했습니다.');
    } catch (error) { if (current === generation) feedback.textContent = message(error); }
    finally { setBusy(false); }
  });
  $('#client-close').addEventListener('click', close); $('#client-cancel').addEventListener('click', close);
  $('#client-new').addEventListener('click', openNew);
  $('#client-public-name').addEventListener('input', () => { if (creating) manualPublicName = true; });
  $('#client-group').addEventListener('change', () => { if (creating) manualGroup = true; });
  $('#client-name').addEventListener('input', () => { if (creating && !manualPublicName) form.elements.namedItem('publicName').value = actualClientName({ cleanName: form.elements.namedItem('cleanName').value }); });
  for (const key of ['businessType', 'category']) form.elements.namedItem(key).addEventListener('input', () => {
    if (creating && !manualGroup) form.elements.namedItem('clientGroup').value = inferClientGroup({ businessType: form.elements.namedItem('businessType').value, category: form.elements.namedItem('category').value });
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  window.addEventListener('beforeunload', event => { if (busy || dirty()) { event.preventDefault(); event.returnValue = ''; } });
  $('#client-search').addEventListener('input', render); $('#client-filter').addEventListener('change', render);
  $('#client-refresh').addEventListener('click', () => load(true)); $('#client-more').addEventListener('click', () => load(false));
  return {
    clear() { generation++; user = undefined; records = []; selected = undefined; creating = false; cursor = undefined; hasMore = false; loading = false; dialog.close(); form.reset(); $('#client-search').value = ''; $('#client-filter').value = 'all'; render(); $('#client-feedback').textContent = ''; $('#client-detail-title').textContent = ''; $('#client-business-number').textContent = ''; $('#client-document-id').textContent = ''; $('#client-updated').textContent = ''; },
    async login(nextUser) { user = nextUser; await load(true); },
  };
}
