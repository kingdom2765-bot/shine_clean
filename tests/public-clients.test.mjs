import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { toPublicClient, sortPublicClients, clientRegion } from '../public-client-model.js';

const sample = { publicName: '뮤*의원', category: '피부과', address: '서울시 강남구', clientGroup: '병원' };
test('public projection permits only four fields and never uses original names as fallback', () => {
  const projected = toPublicClient({ ...sample, cleanName: '원본 상호', businessNumber: '123-45-67890', createdBy: 'private' });
  assert.deepEqual(projected, sample);
  assert.throws(() => toPublicClient({ ...sample, publicName: '', cleanName: '원본 상호' }));
  assert.throws(() => toPublicClient({ ...sample, clientGroup: '기타' }));
  const sorted = sortPublicClients([{ ...sample, clientGroup: '사무실', publicName: '가*회사' }, sample]);
  assert.equal(sorted[0].clientGroup, '병원');
  assert.equal(clientRegion({ address: '서울시 (구 미표시)' }), '서울 (구 미표시)');
});

async function publicApp(page = 1, query = '') {
  const dom = new JSDOM(await readFile(new URL('../pages/p3-our-work.html', import.meta.url), 'utf8'), { url: `https://example.com/shine/${page === 1 ? 'p3-our-work.html' : `p3-our-work-page-${page}.html`}${query}` });
  const document = dom.window.document; let listener, failure;
  document.querySelector('#client-list').dataset.clientPage = String(page);
  const sdk = { collection: (_, name) => { assert.equal(name, 'public_client_records'); return name; }, onSnapshot: (_, next, error) => { listener = next; failure = error; } };
  const context = vm.createContext({ document, console });
  const connection = new vm.SyntheticModule(['loadFirestore'], function () { this.setExport('loadFirestore', async () => ({ sdk, db: {} })); }, { context });
  const model = new vm.SourceTextModule(await readFile(new URL('../public-client-model.js', import.meta.url), 'utf8'), { context });
  const application = new vm.SourceTextModule(await readFile(new URL('../work.js', import.meta.url), 'utf8'), { context });
  await application.link(specifier => specifier === './firebase-client.js' ? connection : model); await application.evaluate();
  return { dom, document, update: records => listener({ docs: records.map(data => ({ data: () => data })) }), fail: () => failure() };
}

test('public cards use real page URLs and retain text safely during live changes', async () => {
  const app = await publicApp(); const { document } = app;
  const records = [{ ...sample, clientGroup: '사무실', publicName: '<img src=x> 가*회사' }, ...Array.from({ length: 36 }, (_, index) => ({ ...sample, publicName: `병*${index}의원` }))];
  app.update(records);
  const cards = [...document.querySelectorAll('.work-client')];
  assert.equal(cards.length, 12); assert.ok(cards.every(card => !card.hidden));
  assert.equal(cards[0].querySelector('.work-client-group').textContent, '병원');
  assert.equal(document.querySelector('#work-client-total').textContent, '37');
  assert.equal(document.querySelector('[aria-label="4페이지"]').getAttribute('href'), './p3-our-work-page-4.html#client-directory');
  const last = await publicApp(4); last.update(records);
  const lastCards = [...last.document.querySelectorAll('.work-client')];
  assert.equal(lastCards.length, 1); assert.equal(lastCards[0].querySelector('.work-client-group').textContent, '사무실');
  assert.equal(last.document.querySelector('#client-list').querySelectorAll('img,script').length, 0);
  assert.match(last.document.querySelector('#client-result-count').textContent, /4 \/ 4 페이지/);
  last.update([sample]); assert.equal(last.document.querySelector('#client-empty').hidden, false, 'removed pages offer links back to the directory');
  app.update([sample]); assert.equal(document.querySelector('#client-pagination').hidden, true);
  app.fail(); assert.equal(document.querySelectorAll('.work-client').length, 1);
  app.update([]); assert.equal(document.querySelectorAll('.work-client').length, 0); assert.equal(document.querySelector('#client-empty').hidden, false);
  app.dom.window.close(); last.dom.window.close();
});

test('directory combines group, region and category, resets pagination and preserves filters in links', async () => {
  const app = await publicApp(); const { document, dom } = app;
  app.update([...Array.from({ length: 15 }, (_, index) => ({ ...sample, publicName: `뮤*${index}의원` })),
    { ...sample, publicName: '서*의원', address: '서울특별시 서초구', category: '치과의원' },
    { ...sample, publicName: '가*회사', clientGroup: '사무실' }]);
  const change = (id, value) => { const select = document.querySelector(id); select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
  change('#client-group', '병원');
  assert.equal(document.querySelector('#work-hospital-total').textContent, '16');
  assert.equal(document.querySelector('#work-office-total').textContent, '1');
  assert.equal(document.querySelectorAll('.work-client').length, 12);
  assert.match(document.querySelector('[aria-label="2페이지"]').href, /group=/);
  assert.equal(new URL(document.querySelector('[aria-label="2페이지"]').href).searchParams.get('group'), '병원');
  change('#client-region', '서울 서초구'); change('#client-category', '치과의원');
  assert.equal(document.querySelectorAll('.work-client').length, 1);
  assert.equal(document.querySelector('.work-client h3').textContent, '서*의원');
  assert.equal(new URL(document.URL).searchParams.get('region'), '서울 서초구');
  document.querySelector('#client-filters').reset();
  assert.equal(document.querySelector('#client-group').value, '');
  assert.equal(document.querySelectorAll('.work-client').length, 12);
  assert.equal(new URL(document.URL).search, '');
  const second = await publicApp(2, '?group=병원&category=피부과');
  second.update(Array.from({ length: 15 }, (_, index) => ({ ...sample, publicName: `뮤*${index}의원` })));
  assert.equal(second.document.querySelectorAll('.work-client').length, 3);
  second.fail(); assert.equal(second.document.querySelectorAll('.work-client').length, 3);
  app.dom.window.close(); second.dom.window.close();
});
