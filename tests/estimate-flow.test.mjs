import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';

async function harness() {
  const dom = new JSDOM(await readFile(new URL('../pages/p5-estimate.html', import.meta.url), 'utf8'));
  const document = dom.window.document; const saved = [];
  for (const dialog of document.querySelectorAll('dialog')) { dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open'); }
  const context = vm.createContext({ document, crypto: webcrypto, console });
  const connection = new vm.SyntheticModule(['saveEstimate'], function () { this.setExport('saveEstimate', async (record, id) => { saved.push(JSON.parse(JSON.stringify(record))); return id; }); }, { context });
  await connection.link(() => {}); await connection.evaluate();
  const page = new vm.SourceTextModule(await readFile(new URL('../estimate.js', import.meta.url), 'utf8'), { context, importModuleDynamically: async () => connection });
  await page.link(() => {}); await page.evaluate();
  const $ = selector => document.querySelector(selector);
  $('#clinic-name').value = '가상 테스트의원'; $('#contact-name').value = '가상 담당자'; $('#contact-phone').value = '010-1234-5678'; $('#clinic-address').value = '서울시 강남구 신사동'; $('#estimate-consent').checked = true;
  return { dom, $, saved, submit: () => $('#estimate-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })) };
}

test('estimate saves independent toilet and opening selections and shows them for review', async () => {
  const app = await harness(); const { $ } = app;
  assert.equal($('#clinic-name').hasAttribute('placeholder'), false);
  assert.equal($('#contact-name').hasAttribute('placeholder'), false);
  assert.equal($('#contact-phone').hasAttribute('placeholder'), false);
  assert.equal($('#clinic-address').placeholder, '예: 서울시 강남구 신사동');
  $('#toilet-included').checked = true; $('#new-opening-consultation').checked = true; app.submit();
  assert.equal($('#estimate-review').open, true);
  const rows = Object.fromEntries([...$('#estimate-review-data').children].map(row => [row.querySelector('dt').textContent, row.querySelector('dd').textContent]));
  assert.equal(rows['화장실 청소'], '포함'); assert.equal(rows['신규 OPEN 병원 상담'], '희망'); assert.equal(rows['업체 교체 상담'], '미선택');
  $('#estimate-confirm').click();
  for (let i = 0; i < 20 && !app.saved.length; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.saved.length, 1); assert.equal(app.saved[0].toiletIncluded, true); assert.equal(app.saved[0].newOpeningConsultation, true); assert.equal(app.saved[0].changeConsultation, false);
  app.dom.window.close();
});

test('unchecked estimate options remain false and selecting opening never selects replacement', async () => {
  const app = await harness(); app.submit();
  const text = app.$('#estimate-review-data').textContent;
  assert.match(text, /화장실 청소미포함/); assert.match(text, /신규 OPEN 병원 상담미선택/);
  app.$('#estimate-confirm').click();
  for (let i = 0; i < 20 && !app.saved.length; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.saved[0].toiletIncluded, false); assert.equal(app.saved[0].newOpeningConsultation, false); assert.equal(app.saved[0].changeConsultation, false);
  app.dom.window.close();
});
