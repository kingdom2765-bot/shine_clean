import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { build } from '../scripts/build.mjs';
import { siteBase, searchMetadata, crawlerPolicy, publicPages, clientPagePath } from '../scripts/seo.mjs';
import { decodePublicDocuments } from '../scripts/refresh-public-clients.mjs';

test('canonical URLs, structured data and sitemap honor the configured domain and subpath', () => {
  const config = { siteUrl: 'https://example.com/shine/', businessName: '샤인크린', telephone: '1661-2816', serviceAreas: ['서울', '경기'] };
  const source = '<html><head><title>작업사례</title><meta name="description" content="외부 노출명 안내"></head></html>';
  const doc = new JSDOM(searchMetadata(source, clientPagePath(2), config)).window.document;
  assert.equal(doc.querySelector('[rel=canonical]').href, 'https://example.com/shine/p3-our-work-page-2.html');
  const schema = JSON.parse(doc.querySelector('[type="application/ld+json"]').textContent);
  assert.equal(schema['@graph'][0]['@type'], 'Organization');
  assert.equal(Object.hasOwn(schema['@graph'][0], 'address'), false, 'unconfirmed company address is omitted');
  const policy = crawlerPolicy(config, [...publicPages, clientPagePath(2)]);
  assert.match(policy.robots, /User-agent: OAI-SearchBot\nAllow: \//);
  assert.match(policy.sitemap, /https:\/\/example.com\/shine\/p3-our-work-page-2.html/);
  assert.doesNotMatch(policy.sitemap, /p6-admin|p7-clients/);
  assert.equal(crawlerPolicy({ siteUrl: null }, publicPages).sitemap, null);
  assert.equal(new JSDOM(searchMetadata(source, 'index.html', { ...config, siteUrl: null })).window.document.querySelector('[rel=canonical]'), null);
  assert.throws(() => siteBase('http://localhost:5173'));
});

test('built pages contain accurate copy, approved metrics and crawlable twelve-card pages without JavaScript', async () => {
  await build();
  const clients = JSON.parse(await readFile(new URL('../data/public-clients.json', import.meta.url), 'utf8'));
  const titles = new Set(), descriptions = new Set();
  for (const path of publicPages) {
    const html = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const doc = new JSDOM(html).window.document;
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.doesNotMatch(doc.documentElement.outerHTML, /\bISO\b|살균|멸균|감염|sanitation|sterile|disinfect/i);
    assert.ok(doc.querySelector('.related-pages a[href]'));
    assert.equal(doc.querySelector('header [data-path="p3-our-work"]').textContent, '거래처와 작업사례');
    titles.add(doc.title); descriptions.add(doc.querySelector('meta[name=description]').content);
    assert.ok(doc.querySelector('script[type="application/ld+json"]'));
  }
  assert.equal(titles.size, publicPages.length); assert.equal(descriptions.size, publicPages.length);
  const main = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(main, /98\.4%/); assert.match(main, /12<\/span>/); assert.match(main, /4<\/span>/);
  assert.match(main, /등록 거래처/); assert.doesNotMatch(main, />60<\/span>/);
  const names = [];
  for (let page = 1; page <= Math.ceil(clients.length / 12); page++) {
    const html = await readFile(new URL(`../${clientPagePath(page)}`, import.meta.url), 'utf8');
    const doc = new JSDOM(html).window.document;
    const cards = [...doc.querySelectorAll('.work-client')];
    assert.equal(cards.length, clients.slice((page - 1) * 12, page * 12).length);
    assert.ok(cards.every(card => !card.hidden));
    assert.equal(doc.querySelectorAll('#client-pagination button').length, 0);
    if (clients.length > 12) assert.equal(doc.querySelector('#client-pagination [aria-current=page]').getAttribute('href'), `./${clientPagePath(page)}#client-directory`);
    names.push(...cards.map(card => card.querySelector('h3').textContent));
  }
  assert.deepEqual(names, clients.map(client => client.publicName));
  for (const path of ['p6-admin.html', 'p7-clients.html']) {
    const doc = new JSDOM(await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).window.document;
    assert.match(doc.querySelector('meta[name=robots]').content, /noindex/);
  }
  const config = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
  const sitemap = new JSDOM(await readFile(new URL('../sitemap.xml', import.meta.url), 'utf8'), { contentType: 'application/xml' }).window.document;
  assert.equal(sitemap.querySelectorAll('loc').length, publicPages.length + Math.ceil(clients.length / 12) - 1);
  assert.ok([...sitemap.querySelectorAll('loc')].every(loc => loc.textContent.startsWith(config.siteUrl)));
  assert.doesNotMatch(sitemap.documentElement.outerHTML, /p6-admin|p7-clients/);
  const home = new JSDOM(main).window.document;
  assert.equal(home.querySelector('[rel=canonical]').href, config.siteUrl);
  const work = new JSDOM(await readFile(new URL('../p3-our-work.html', import.meta.url), 'utf8')).window.document;
  const embedded = JSON.parse(work.querySelector('#public-client-data').textContent);
  assert.equal(embedded.length, clients.length);
  assert.ok(embedded.every(client => Object.keys(client).sort().join(',') === 'address,category,clientGroup,publicName'));
  const specialist = await readFile(new URL('../p2-why-specialist.html', import.meta.url), 'utf8');
  assert.doesNotMatch(specialist, /단일 걸레|일반 외주 미화업체|장비 구조 이해 부재/);
  assert.match(specialist, /샤인크린 병원청소 관리 기준/);
  const service = await readFile(new URL('../p1-hospital-regular-cleaning.html', import.meta.url), 'utf8');
  assert.match(service, /서울 전역/); assert.match(service, /경기 전역/);
});

test('snapshot refresh rejects unexpected fields and malformed public data', () => {
  const fields = { publicName: { stringValue: '뮤*의원' }, category: { stringValue: '피부과' }, address: { stringValue: '서울' }, clientGroup: { stringValue: '병원' } };
  assert.equal(decodePublicDocuments([{ fields }])[0].publicName, '뮤*의원');
  assert.throws(() => decodePublicDocuments([{ fields: { ...fields, cleanName: { stringValue: '원본명' } } }]));
});
