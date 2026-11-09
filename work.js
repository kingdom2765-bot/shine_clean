import { loadFirestore } from './firebase-client.js';
import { sortPublicClients, clientPageSize, clientPagePath } from './public-client-model.js';

const list = document.querySelector('#client-list');
const resultCount = document.querySelector('#client-result-count');
const pagination = document.querySelector('#client-pagination');
const currentPage = Number(list.dataset.clientPage) || 1;
function node(tag, text, className) { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
function renderClients(records) {
  const clients = sortPublicClients(records);
  const pages = Math.max(1, Math.ceil(clients.length / clientPageSize));
  const pageClients = clients.slice((currentPage - 1) * clientPageSize, currentPage * clientPageSize);
  list.replaceChildren(...pageClients.map(client => {
    const card = document.createElement('article'); card.className = 'work-client';
    const heading = document.createElement('div'); heading.className = 'work-client-heading';
    const group = node('span', client.clientGroup, 'work-client-group'); group.dataset.group = client.clientGroup;
    heading.append(node('h3', client.publicName), group);
    const address = document.createElement('p'); address.className = 'work-client-address'; address.append(node('span', '소재지'), document.createTextNode(client.address || '주소 미등록'));
    card.append(heading, node('p', client.category || '종목 미등록', 'work-client-category'), address);
    return card;
  }));
  document.querySelector('#work-client-total').textContent = String(clients.length);
  resultCount.textContent = `전체 ${clients.length}개 등록 거래처 · 병원 우선 표시 · ${currentPage} / ${pages} 페이지`;
  pagination.replaceChildren(...Array.from({ length: pages }, (_, index) => {
    const page = index + 1; const link = node('a', String(page));
    link.href = `./${clientPagePath(page)}#client-directory`; link.setAttribute('aria-label', `${page}페이지`);
    if (page === currentPage) link.setAttribute('aria-current', 'page');
    return link;
  }));
  pagination.hidden = pages <= 1 && currentPage === 1;
  document.querySelector('#client-empty').hidden = pageClients.length > 0;
  document.querySelector('#client-empty').textContent = clients.length ? '이 페이지의 거래처가 변경되었습니다. 아래 페이지 링크에서 목록을 확인해 주세요.' : '등록된 거래처가 없습니다.';
}
// Only the allowlisted public collection is readable by visitors.
try {
  const { sdk, db } = await loadFirestore();
  sdk.onSnapshot(sdk.collection(db, 'public_client_records'), snapshot => {
    try { renderClients(snapshot.docs.map(doc => doc.data())); }
    catch { resultCount.textContent = '공개 거래처 정보를 확인하지 못해 최근 반영된 목록을 표시합니다.'; }
  }, () => { resultCount.textContent = '실시간 연결을 확인하지 못해 최근 반영된 목록을 표시합니다.'; });
} catch { resultCount.textContent = '실시간 연결을 확인하지 못해 최근 반영된 목록을 표시합니다.'; }

const caseDialog = document.querySelector('#case-dialog');
const caseBody = document.querySelector('#case-body');
document.querySelectorAll('[data-case]').forEach((button) => button.addEventListener('click', () => {
  const template = document.querySelector(`#case-template-${button.dataset.case}`);
  caseBody.replaceChildren(template.content.cloneNode(true));
  caseDialog.showModal();
}));
document.querySelector('.case-close').addEventListener('click', () => caseDialog.close());
caseDialog.addEventListener('click', (event) => {
  const bounds = caseDialog.getBoundingClientRect();
  if (event.target === caseDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) caseDialog.close();
});
