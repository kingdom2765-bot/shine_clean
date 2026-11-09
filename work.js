import { loadFirestore } from './firebase-client.js';
import { sortPublicClients, clientPageSize, clientPagePath, clientRegion, filterPublicClients } from './public-client-model.js';

const list = document.querySelector('#client-list');
const resultCount = document.querySelector('#client-result-count');
const pagination = document.querySelector('#client-pagination');
const { URL, URLSearchParams } = document.defaultView;
let currentPage = Number(list.dataset.clientPage) || 1;
const filters = document.querySelector('#client-filters');
const groupFilter = document.querySelector('#client-group');
const regionFilter = document.querySelector('#client-region');
const categoryFilter = document.querySelector('#client-category');
const params = new URL(document.URL).searchParams;
let selection = { group: params.get('group') || '', region: params.get('region') || '', category: params.get('category') || '' };
let allClients = [];
let liveUnavailable = false;
function setOptions(select, values, current, label) {
  select.replaceChildren(node('option', label));
  select.firstChild.value = '';
  [...new Set([...values.filter(Boolean), ...(current ? [current] : [])])].sort((a, b) => a.localeCompare(b, 'ko')).forEach(value => {
    const option = node('option', value); option.value = value; select.append(option);
  });
  select.value = current;
}
function selectionQuery() {
  const search = new URLSearchParams();
  Object.entries(selection).forEach(([key, value]) => { if (value) search.set(key, value); });
  return search.size ? '?' + search.toString() : '';
}
function pageHref(page) { return './' + clientPagePath(page) + selectionQuery() + '#client-directory'; }
function syncLocation() {
  const view = document.defaultView;
  if (['http:', 'https:'].includes(view.location.protocol)) view.history.replaceState(null, '', pageHref(currentPage));
}
function applyFilters() {
  selection = { group: groupFilter.value, region: regionFilter.value, category: categoryFilter.value };
  currentPage = 1;
  renderClients(allClients);
  syncLocation();
}
filters.addEventListener('change', applyFilters);
filters.addEventListener('submit', event => event.preventDefault());
filters.addEventListener('reset', event => {
  event.preventDefault(); selection = { group: '', region: '', category: '' }; currentPage = 1;
  renderClients(allClients); syncLocation();
});
function node(tag, text, className) { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; }
function renderClients(records) {
  allClients = sortPublicClients(records);
  const grouped = filterPublicClients(allClients, { group: selection.group });
  groupFilter.value = selection.group;
  setOptions(regionFilter, grouped.map(clientRegion), selection.region, '전체 지역');
  setOptions(categoryFilter, grouped.map(client => client.category), selection.category, '전체 종목·진료과');
  filters.hidden = false;
  const clients = filterPublicClients(allClients, selection);
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
  document.querySelector('#work-client-total').textContent = String(allClients.length);
  document.querySelector('#work-hospital-total').textContent = String(allClients.filter(client => client.clientGroup === '병원').length);
  document.querySelector('#work-office-total').textContent = String(allClients.filter(client => client.clientGroup === '사무실').length);
  resultCount.textContent = `전체 ${allClients.length}개 등록 거래처 · 조회 ${clients.length}개 · 병원 우선 표시 · ${currentPage} / ${pages} 페이지${liveUnavailable ? ' · 최근 반영된 목록' : ''}`;
  pagination.replaceChildren(...Array.from({ length: pages }, (_, index) => {
    const page = index + 1; const link = node('a', String(page));
    link.href = pageHref(page); link.setAttribute('aria-label', `${page}페이지`);
    if (page === currentPage) link.setAttribute('aria-current', 'page');
    return link;
  }));
  pagination.hidden = pages <= 1 && currentPage === 1;
  document.querySelector('#client-empty').hidden = pageClients.length > 0;
  document.querySelector('#client-empty').textContent = clients.length ? '이 페이지의 거래처가 변경되었습니다. 아래 페이지 링크에서 목록을 확인해 주세요.' : '조회 조건에 맞는 거래처가 없습니다. 전체 보기를 눌러 확인해 주세요.';
}
// Embedded build snapshot enables filtering even when Firestore cannot be reached.
try {
  const snapshot = JSON.parse(document.querySelector('#public-client-data')?.textContent || 'null');
  if (Array.isArray(snapshot)) renderClients(snapshot);
} catch { /* Keep crawlable, server-rendered cards when the snapshot is unavailable. */ }
function connectionFailed() {
  liveUnavailable = true;
  if (allClients.length) renderClients(allClients);
  else resultCount.textContent = '실시간 연결을 확인하지 못해 최근 반영된 목록을 표시합니다.';
}
// Only the allowlisted public collection is readable by visitors.
try {
  const { sdk, db } = await loadFirestore();
  sdk.onSnapshot(sdk.collection(db, 'public_client_records'), snapshot => {
    try { liveUnavailable = false; renderClients(snapshot.docs.map(doc => doc.data())); }
    catch { connectionFailed(); }
  }, connectionFailed);
} catch { connectionFailed(); }

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
