import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { filterClients, clientChanges, inferClientGroup, clientGroup, maskClientName, publicClientName, newClient } from '../client-model.js';

const sample = { businessNumber: '123-45-67890', clientName: '가상 거래처', cleanName: '가상 거래처', publicName: '가* 거래처', address: '서울 강남구', businessType: '의료', category: '의원', registeredDate: '2024-01-01', isClosed: false, clientGroup: '병원', createdAt: { toDate: () => new Date(1000) } };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 50; i++) { if (predicate()) return; await tick(); } throw new Error('UI timeout'); }

test('client search and input validation preserve closed-name consistency', () => {
  assert.equal(filterClients([sample], '1234567890', '병원').length, 1);
  assert.equal(filterClients([sample], '의료', '사무실').length, 0);
  assert.equal(filterClients([sample], '강남', 'all').length, 1);
  assert.equal(clientChanges({ ...sample, isClosed: true }).clientName, '[폐업] 가상 거래처');
  assert.throws(() => clientChanges({ ...sample, registeredDate: '2025-02-29' }));
  assert.throws(() => clientChanges({ ...sample, cleanName: ' ' }));
  assert.throws(() => clientChanges({ ...sample, cleanName: '[폐업]중복' }));
  assert.throws(() => clientChanges({ ...sample, address: '가'.repeat(501) }));
});

async function harness() {
  const dom = new JSDOM(await readFile(new URL('../pages/p7-clients.html', import.meta.url), 'utf8'));
  const document = dom.window.document;
  const dialog = document.querySelector('dialog'); dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  dom.window.confirm = () => true;
  const store = new Map([['123-45-67890', { ...sample, clientName: '<img src=x> 가상', cleanName: '<img src=x> 가상' }]]);
  const requests = [], updates = [];
  const publicStore = new Map();
  let deny = false;
  const sdk = {
    collection: (_, name) => { assert.equal(name, 'client_records'); return name; },
    documentId: () => '__name__', orderBy: key => key, limit: count => count, startAfter: cursor => cursor,
    query: (...args) => args, doc: (_, name, id) => { assert.ok(['client_records', 'public_client_records'].includes(name)); return name === 'public_client_records' ? `public/${id}` : id; },
    getDocs: async query => { requests.push(query); if (deny) throw { code: 'permission-denied' }; return { docs: [...store].map(([id, value]) => ({ id, data: () => value })), size: store.size }; },
    serverTimestamp: () => ({ toMillis: () => 2000, toDate: () => new Date(2000) }),
    runTransaction: async (_, callback) => { const writes = []; await callback({ get: async id => ({ exists: () => store.has(id), data: () => store.get(id) }), set: (id, data) => writes.push(() => id.startsWith('public/') ? publicStore.set(id.slice(7), data) : store.set(id, data)), update: (id, changes) => writes.push(() => { updates.push(changes); store.set(id, { ...store.get(id), ...changes }); }) }); writes.forEach(write => write()); },
  };
  const context = vm.createContext({ document, window: dom.window, Intl, console, crypto: webcrypto });
  const model = new vm.SourceTextModule(await readFile(new URL('../client-model.js', import.meta.url), 'utf8'), { context });
  const module = new vm.SourceTextModule(await readFile(new URL('../client-records.js', import.meta.url), 'utf8'), { context });
  const publicModel = new vm.SourceTextModule(await readFile(new URL('../public-client-model.js', import.meta.url), 'utf8'), { context });
  await module.link(specifier => specifier === './public-client-model.js' ? publicModel : model); await module.evaluate();
  const manager = module.namespace.createClientManager({ sdk, db: {} });
  return { dom, document, store, publicStore, requests, updates, manager, deny: () => { deny = true; },
    click: selector => document.querySelector(selector).click(), submit: () => document.querySelector('form#client-edit-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}

test('clients edit safely, reject stale edits, preserve identifiers and clear private data', async () => {
  const app = await harness(); const $ = selector => app.document.querySelector(selector);
  assert.equal(app.requests.length, 0);
  await app.manager.login({ uid: 'admin' });
  assert.equal($('#client-list').children.length, 1);
  assert.equal($('#client-list').querySelectorAll('img').length, 0);
  app.click('.client-row'); $('#client-name').value = '수정 거래처'; $('#client-public-name').value = '수* 거래처'; $('#client-group').value = '사무실'; $('#client-state').value = 'true'; app.submit();
  await until(() => !$('#client-save').disabled);
  const saved = app.store.get(sample.businessNumber);
  assert.equal(saved.publicName, '수* 거래처');
  assert.deepEqual(Object.keys(app.publicStore.get(saved.publicId)).sort(), ['address', 'category', 'clientGroup', 'publicName']);
  assert.equal(app.publicStore.get(saved.publicId).publicName, '수* 거래처');
  assert.match($('#client-list').textContent, /수\* 거래처/);
  assert.equal(saved.clientGroup, '사무실');
  assert.match($('#client-stats').textContent, /병원0사무실1/);
  assert.match($('#client-list').textContent, /등록일 2024-01-01/);
  assert.equal(saved.clientName, '[폐업] 수정 거래처'); assert.equal(saved.isClosed, true);
  assert.equal(saved.businessNumber, sample.businessNumber); assert.equal(saved.createdAt, sample.createdAt);
  assert.equal(saved.updatedBy, 'admin'); assert.equal(Object.hasOwn(app.updates[0], 'businessNumber'), false);
  app.click('.client-row'); app.store.set(sample.businessNumber, { ...saved, address: '다른 창 변경' });
  $('#client-address').value = '오래된 창'; app.submit(); await until(() => !$('#client-save').disabled);
  assert.match($('#client-feedback').textContent, /다른 창에서 변경/); assert.equal(app.store.get(sample.businessNumber).address, '다른 창 변경');
  app.manager.clear(); assert.equal($('#client-list').children.length, 0); assert.equal($('#client-detail').open, false); assert.equal($('#client-name').value, ''); assert.equal($('#client-business-number').textContent, '');
  app.dom.window.close();
});

test('pagination, loading failure and disappearing records remain recoverable', async () => {
  const app = await harness(); const $ = selector => app.document.querySelector(selector);
  for (let i = 1; i < 200; i++) app.store.set(`id-${i}`, { ...sample });
  await app.manager.login({ uid: 'admin' }); assert.equal($('#client-more').hidden, false);
  app.click('#client-more'); await until(() => !$('#client-more').disabled);
  assert.equal($('#client-list').children.length, 200, 'duplicate records are removed');
  app.click('.client-row'); app.store.delete(sample.businessNumber); $('#client-address').value = '변경'; app.submit();
  await until(() => !$('#client-save').disabled); assert.match($('#client-feedback').textContent, /존재하지/);
  app.click('#client-close'); app.deny(); app.click('#client-refresh'); await until(() => !$('#client-refresh').disabled);
  assert.match($('#admin-notice').textContent, /권한/); assert.equal($('#client-refresh').disabled, false);
  app.dom.window.close();
});


test('initial classification uses business type and category and preserves manual choices', () => {
  assert.equal(inferClientGroup({ businessType: '보건업', category: '일반의원' }), '병원');
  assert.equal(inferClientGroup({ businessType: '서비스', category: '치과의원' }), '병원');
  assert.equal(inferClientGroup({ businessType: '도매', category: '상품중개' }), '사무실');
  assert.equal(inferClientGroup({}), '사무실');
  assert.equal(inferClientGroup({ businessType: '서비스업', category: '의료컨설팅' }), '사무실');
  assert.equal(clientGroup({ ...sample, clientGroup: '사무실' }), '사무실');
  assert.throws(() => clientChanges({ ...sample, clientGroup: '기타' }));
});


test('external names mask brand letters, retain clinic suffixes and preserve reviewed names', () => {
  for (const [name, expected] of [['뮤즈의원', '뮤*의원'], ['봄의원', '*의원'], ['가나다라피부과의원', '가**라피부과의원'], ['(주)샤인크린', '(주)샤**린'], ['[폐업]뮤즈의원', '뮤*의원']]) {
    assert.equal(maskClientName({ clientName: name }), expected);
  }
  assert.equal(publicClientName({ cleanName: '뮤즈의원', publicName: '검토한 표기' }), '검토한 표기');
  assert.equal(publicClientName({ cleanName: '뮤즈의원' }), '뮤*의원');
  assert.equal(maskClientName({ cleanName: '르치과' }), '*치과');
  assert.equal(maskClientName({ cleanName: '신통정형외과' }), '신*정형외과');
  assert.equal(maskClientName({ cleanName: '메이스클리닉' }), '메*스클리닉');
  assert.throws(() => clientChanges({ ...sample, publicName: ' ' }));
  assert.throws(() => clientChanges({ ...sample, publicName: '가'.repeat(201) }));
  assert.equal(filterClients([sample], '가* 거래처', 'all').length, 1);
});

test('new client numbers normalize and invalid identifiers are rejected', () => {
  assert.equal(newClient({ ...sample, businessNumber: '1234567890' }).businessNumber, '123-45-67890');
  for (const businessNumber of ['', '123', '123/45/67890', 'abc-12-34567', '123--45-67890']) assert.throws(() => newClient({ ...sample, businessNumber }));
});

test('new registration suggests editable names and groups, prevents duplicates, and retains failed drafts', async () => {
  const app = await harness(); const $ = selector => app.document.querySelector(selector);
  app.click('#client-new'); assert.equal($('#client-detail').open, false, 'anonymous users cannot open registration');
  await app.manager.login({ uid: 'admin' });
  app.click('#client-new'); assert.equal($('#client-detail').open, true); assert.equal($('#client-new-number').required, true);
  const input = (selector, value, type = 'input') => { $(selector).value = value; $(selector).dispatchEvent(new app.dom.window.Event(type, { bubbles: true })); };
  input('#client-name', '뮤즈의원'); assert.equal($('#client-public-name').value, '뮤*의원');
  input('#client-type', '보건업'); assert.equal($('#client-group').value, '병원');
  input('#client-public-name', '검토한 이름'); input('#client-name', '다른의원'); assert.equal($('#client-public-name').value, '검토한 이름');
  input('#client-group', '사무실', 'change'); input('#client-category', '의원'); assert.equal($('#client-group').value, '사무실');
  input('#client-new-number', '1234567890'); app.submit(); await until(() => !$('#client-save').disabled);
  assert.match($('#client-feedback').textContent, /이미 등록/); assert.equal(app.store.size, 1); assert.equal($('#client-name').value, '다른의원');
  input('#client-new-number', '9876543210'); app.submit(); await until(() => !$('#client-save').disabled);
  const saved = app.store.get('987-65-43210'); assert.ok(saved); assert.equal(saved.publicName, '검토한 이름'); assert.equal(saved.clientGroup, '사무실');
  assert.equal(app.publicStore.get(saved.publicId).publicName, '검토한 이름');
  assert.equal(saved.businessNumber, '987-65-43210'); assert.equal(saved.createdBy, 'admin'); assert.ok(saved.createdAt); assert.equal(saved.updatedBy, 'admin');
  assert.equal($('#client-detail').open, false); assert.equal($('#client-list').children.length, 2);
  app.click('#client-new'); input('#client-name', '저장하지 않을 거래처'); app.click('#client-cancel'); assert.equal(app.store.size, 2);
  app.click('.client-row'); assert.equal($('#client-new-number-field').hidden, true); assert.equal($('#client-new-number').disabled, true);
  app.dom.window.close();
});
