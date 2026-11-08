import { loadFirestore } from './firebase-client.js';
import { statuses, filterEstimates, managementChanges } from './admin-model.js';

const ownerEmail = 'kingdom2765@naver.com';
const ownerUid = 'cOLPnjEzpgXYKdowCJcsKIf4xP73';
const $ = selector => document.querySelector(selector);
let authSdk, auth, sdk, db, user, records = [], cursor, selected, hasMore = false, loading = false, busy = false, generation = 0;
const detail = $('#admin-detail');
const deletion = $('#admin-delete-dialog');
const notice = (message, error = false) => { $('#admin-notice').textContent = message; $('#admin-notice').classList.toggle('error', error); };
const date = value => value?.toDate ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(value.toDate()) : '—';
const version = record => record?.updatedAt?.toMillis?.() ?? null;
const errorMessage = error => ({ 'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.', 'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해 주세요.', 'auth/network-request-failed': '인터넷 연결을 확인해 주세요.', 'auth/invalid-email': '이메일 형식을 확인해 주세요.', 'auth/user-disabled': '사용이 중지된 계정입니다.', 'permission-denied': '관리자 권한을 확인할 수 없습니다. 다시 로그인해 주세요.', 'unavailable': '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.' }[error.code] || '처리하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.');
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function render() {
  const filtered = filterEstimates(records, $('#admin-search').value, $('#admin-filter').value);
  $('#admin-count').textContent = `불러온 ${records.length}건 중 ${filtered.length}건 표시 · 최신 접수순${hasMore ? ' · 이전 견적을 더 불러올 수 있습니다' : ''}`;
  $('#admin-stats').replaceChildren(...Object.entries(statuses).map(([key, label]) => { const card = node('div', undefined, 'admin-stat'); card.append(node('span', label), node('strong', String(records.filter(item => item.status === key).length))); return card; }));
  $('#admin-list').replaceChildren(...filtered.map(record => {
    const button = node('button', undefined, 'admin-row'); button.type = 'button';
    const title = node('div'); title.append(node('h3', record.clinicName || '병원명 없음'), node('p', record.clinicType));
    const time = node('time', date(record.createdAt));
    const badge = node('span', statuses[record.status] || '상태 확인', 'admin-badge admin-row-badge'); badge.dataset.status = record.status;
    button.append(time, title, node('span', record.phone || '—', 'admin-row-phone'), node('span', record.contactName || '—', 'admin-row-contact'), badge, node('span', '↗', 'admin-row-arrow'));
    button.addEventListener('click', () => openDetail(record)); return button;
  }));
  $('#admin-empty').hidden = filtered.length > 0;
  $('#admin-empty').textContent = records.length ? '검색 조건에 맞는 견적이 없습니다. 이전 견적이 있다면 더 불러와 주세요.' : '아직 접수된 견적이 없습니다.';
  $('#admin-more').hidden = !hasMore;
}
async function load(reset = true) {
  if (!user || loading) return;
  const currentGeneration = generation; loading = true; $('#admin-refresh').disabled = true; $('#admin-more').disabled = true;
  try {
    const constraints = [sdk.orderBy('createdAt', 'desc'), ...(reset || !cursor ? [] : [sdk.startAfter(cursor)]), sdk.limit(50)];
    const snapshot = await sdk.getDocs(sdk.query(sdk.collection(db, 'estimate_requests'), ...constraints));
    if (currentGeneration !== generation || !user) return;
    const incoming = snapshot.docs.map(document => ({ ...document.data(), id: document.id }));
    records = reset ? incoming : [...records, ...incoming.filter(item => !records.some(old => old.id === item.id))];
    cursor = snapshot.docs.at(-1) || cursor; hasMore = snapshot.size === 50; render();
    notice('견적 정보를 불러왔습니다. 상단 건수와 검색은 현재 불러온 견적을 기준으로 표시합니다.');
  } catch (error) { if (currentGeneration === generation) notice(errorMessage(error), true); }
  finally { loading = false; $('#admin-refresh').disabled = false; $('#admin-more').disabled = false; }
}
function openDetail(record) {
  selected = record;
  $('#admin-detail-title').textContent = record.clinicName || '견적 상세';
  $('#admin-detail-id').textContent = `접수번호 ${record.id}`;
  const fields = [['접수일', date(record.createdAt)], ['담당자', record.contactName], ['연락처', record.phone], ['소재지', record.address], ['진료 유형', record.clinicType], ['전용면적', record.area || '미기재'], ['관리 주기', record.frequency], ['업체 교체 상담', record.changeConsultation ? '희망' : '신청하지 않음'], ['요청사항', record.message || '미기재'], ['개인정보 동의', record.privacyConsent ? '동의함' : '확인 필요'], ['마지막 수정', date(record.updatedAt)]];
  $('#admin-detail-fields').replaceChildren(...fields.flatMap(([label, value]) => [node('dt', label), node('dd', value || '—')]));
  $('#admin-status').value = Object.hasOwn(statuses, record.status) ? record.status : 'new'; $('#admin-notes').value = record.adminNotes || ''; $('#admin-detail-feedback').textContent = ''; detail.showModal();
}
function setBusy(value) {
  busy = value;
  for (const id of ['admin-save', 'admin-delete', 'admin-detail-close', 'admin-delete-confirm', 'admin-delete-cancel', 'admin-status', 'admin-notes', 'admin-logout']) $('#' + id).disabled = value;
}
async function mutate(remove = false) {
  if (busy || !selected || !user) return;
  const feedback = $(remove ? '#admin-delete-feedback' : '#admin-detail-feedback');
  const original = selected; const currentGeneration = generation;
  let changes;
  try { if (!remove) changes = managementChanges($('#admin-status').value, $('#admin-notes').value); } catch (error) { feedback.textContent = error.message; return; }
  setBusy(true); feedback.textContent = remove ? '삭제 중입니다…' : '저장 중입니다…';
  try {
    await sdk.runTransaction(db, async transaction => {
      const reference = sdk.doc(db, 'estimate_requests', original.id);
      const latest = await transaction.get(reference);
      if (!latest.exists()) throw new Error('이 견적은 이미 삭제되었습니다. 새로고침해 주세요.');
      if (version(latest.data()) !== version(original)) throw new Error('다른 창에서 변경한 견적입니다. 창을 닫고 새로고침한 후 다시 확인해 주세요.');
      if (remove) transaction.delete(reference);
      else transaction.update(reference, { ...changes, updatedAt: sdk.serverTimestamp(), updatedBy: user.uid });
    });
    if (currentGeneration !== generation) return;
    if (remove) { deletion.close(); detail.close(); selected = undefined; }
    else { detail.close(); selected = undefined; }
    await load(true);
    notice(remove ? '견적을 삭제했습니다.' : '처리 상태와 상담 메모를 저장했습니다.');
  } catch (error) { feedback.textContent = error.code ? errorMessage(error) : error.message; }
  finally { setBusy(false); }
}
async function handleUser(nextUser) {
  generation++; user = undefined; records = []; cursor = undefined; hasMore = false; $('#admin-list').replaceChildren(); $('#admin-stats').replaceChildren(); detail.close(); deletion.close();
  $('#admin-login').hidden = true; $('#admin-verification').hidden = true; $('#admin-dashboard').hidden = true; $('#admin-logout').hidden = !nextUser;
  if (!nextUser) { $('#admin-login').hidden = false; notice('관리자 계정으로 로그인해 주세요.'); return; }
  const currentGeneration = generation;
  try {
    const token = await nextUser.getIdTokenResult(true);
    if (currentGeneration !== generation) return;
    if (nextUser.uid !== ownerUid || nextUser.email?.toLowerCase() !== ownerEmail || token.claims.admin !== true) { await authSdk.signOut(auth); notice('관리 권한이 없는 계정입니다.', true); return; }
    if (!nextUser.emailVerified) { $('#admin-verification').hidden = false; notice('이메일 인증을 완료해 주세요.'); return; }
    user = nextUser; $('#admin-dashboard').hidden = false; notice('견적 정보를 불러오고 있습니다.'); await load(true);
  } catch (error) { notice(errorMessage(error), true); }
}
$('#admin-login-form').addEventListener('submit', async event => {
  event.preventDefault(); $('#admin-signin').disabled = true;
  try { await authSdk.signInWithEmailAndPassword(auth, $('#admin-email').value.trim(), $('#admin-password').value); $('#admin-password').value = ''; }
  catch (error) { notice(errorMessage(error), true); }
  finally { $('#admin-signin').disabled = false; }
});
$('#admin-reset').addEventListener('click', async () => {
  if ($('#admin-email').value.trim().toLowerCase() !== ownerEmail) { notice('지정된 관리자 이메일을 입력해 주세요.', true); return; }
  $('#admin-reset').disabled = true;
  try { auth.languageCode = 'ko'; await authSdk.sendPasswordResetEmail(auth, ownerEmail); notice('비밀번호 설정 메일을 요청했습니다. 받은편지함과 스팸함을 확인해 주세요.'); }
  catch (error) { notice(errorMessage(error), true); }
  finally { $('#admin-reset').disabled = false; }
});
$('#admin-send-verification').addEventListener('click', async () => {
  $('#admin-send-verification').disabled = true;
  try { auth.languageCode = 'ko'; await authSdk.sendEmailVerification(auth.currentUser); notice('인증 메일을 요청했습니다. 이메일의 링크를 누른 뒤 인증 완료 확인 버튼을 눌러 주세요.'); }
  catch (error) { notice(errorMessage(error), true); }
  finally { $('#admin-send-verification').disabled = false; }
});
$('#admin-check-verification').addEventListener('click', async () => { try { await authSdk.reload(auth.currentUser); await handleUser(auth.currentUser); } catch (error) { notice(errorMessage(error), true); } });
$('#admin-logout').addEventListener('click', async () => { try { await authSdk.signOut(auth); } catch (error) { notice(errorMessage(error), true); } });
$('#admin-search').addEventListener('input', render); $('#admin-filter').addEventListener('change', render);
$('#admin-refresh').addEventListener('click', () => load(true)); $('#admin-more').addEventListener('click', () => load(false));
$('#admin-edit-form').addEventListener('submit', event => { event.preventDefault(); mutate(); });
$('#admin-detail-close').addEventListener('click', () => { if (!busy) detail.close(); });
$('#admin-delete').addEventListener('click', () => { $('#admin-delete-name').textContent = selected.clinicName; $('#admin-delete-feedback').textContent = ''; deletion.showModal(); });
$('#admin-delete-cancel').addEventListener('click', () => { if (!busy) deletion.close(); });
$('#admin-delete-confirm').addEventListener('click', () => mutate(true));
for (const dialog of [detail, deletion]) dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
try {
  const connection = await loadFirestore(); sdk = connection.sdk; db = connection.db;
  authSdk = await import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'); auth = authSdk.getAuth(connection.app);
  await authSdk.setPersistence(auth, authSdk.browserSessionPersistence);
  authSdk.onAuthStateChanged(auth, handleUser);
} catch (error) { notice('로그인 서비스를 불러오지 못했습니다. 인터넷 연결을 확인한 후 새로고침해 주세요.', true); }
