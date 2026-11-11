import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { build } from '../scripts/build.mjs';
import { siteBase, searchMetadata, crawlerPolicy, publicPages, clientPagePath } from '../scripts/seo.mjs';
import { decodePublicDocuments } from '../scripts/refresh-public-clients.mjs';

test('canonical URLs, structured data and sitemap honor the configured domain and subpath', () => {
  const config = { siteUrl: 'https://example.com/shine/', businessName: '원내케어', telephone: '1661-2816', serviceAreas: ['서울', '경기'] };
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
    assert.doesNotMatch(doc.documentElement.outerHTML, /\bISO\b|살균|sanitation|sterile|disinfect/i);
    assert.ok(doc.querySelector('.related-pages a[href]'));
    assert.equal(doc.querySelector('header a[href$="p3-our-work.html#clients"]').textContent, '거래처');
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
  assert.match(new JSDOM(specialist).window.document.body.textContent, /원내케어 병원청소 관리 기준/);
  const service = await readFile(new URL('../p1-hospital-regular-cleaning.html', import.meta.url), 'utf8');
  assert.match(service, /서울 전역/); assert.match(service, /경기 전역/);
});

test('snapshot refresh rejects unexpected fields and malformed public data', () => {
  const fields = { publicName: { stringValue: '뮤*의원' }, category: { stringValue: '피부과' }, address: { stringValue: '서울' }, clientGroup: { stringValue: '병원' } };
  assert.equal(decodePublicDocuments([{ fields }])[0].publicName, '뮤*의원');
  assert.throws(() => decodePublicDocuments([{ fields: { ...fields, cleanName: { stringValue: '원본명' } } }]));
});

test('nested content pages preserve local links, assets, breadcrumbs and all published FAQs', async () => {
  const root = new URL('../', import.meta.url);
  const documents = new Map();
  for (const path of publicPages) {
    documents.set(path, new JSDOM(await readFile(new URL(path, root), 'utf8'), { url: `https://example.com/shine/${path}` }).window.document);
  }
  for (const [path, doc] of documents) {
    const ids = [...doc.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, `${path}: unique IDs`);
    assert.ok(doc.querySelector('meta[property="og:image"]'));
    for (const node of doc.querySelectorAll('a[href],img[src],script[src],link[rel=stylesheet]')) {
      const value = node.getAttribute(node.hasAttribute('href') ? 'href' : 'src');
      if (!value || value === '#' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) continue;
      const target = new URL(value, doc.URL);
      assert.ok(target.pathname.startsWith('/shine/'), `${path}: ${value} honors a hosting subpath`);
      const local = target.pathname.slice('/shine/'.length) || 'index.html';
      await access(new URL(local, root));
      if (target.hash && documents.has(local)) assert.ok(documents.get(local).getElementById(target.hash.slice(1)), `${path}: ${value} resolves to a section`);
    }
    if (!path.includes('/')) continue;
    assert.equal(doc.querySelectorAll('.breadcrumbs [aria-current=page]').length, 1);
    assert.equal(doc.querySelectorAll('.section-links [aria-current=page]').length, 1);
    assert.ok(doc.querySelector('header a[aria-current=page]'));
    assert.ok(doc.querySelector('.content-cta a[href="../p5-estimate.html"]'));
    assert.doesNotMatch(doc.body.textContent, /개발·검수 메모|HERO|webp|마지막 CTA|---/);
    const graph = JSON.parse(doc.querySelector('[type="application/ld+json"]').textContent)['@graph'];
    const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement.at(-1).name, doc.querySelector('.breadcrumbs [aria-current=page]').textContent);
  }
  const faq = documents.get('guide/faq.html');
  assert.equal(faq.querySelectorAll('details.content-faq').length, 14);
  assert.deepEqual(['scope', 'cost', 'operations', 'contract'].map(category => faq.querySelectorAll(`#${category}-faq details`).length), [4, 4, 3, 3]);
  for (const item of faq.querySelectorAll('details.content-faq')) {
    assert.ok(item.querySelector('summary h3'));
    assert.ok(item.querySelector('p')?.textContent.trim());
  }
  assert.match(documents.get('clinic/plastic-surgery.html').body.textContent, /수술실 멸균.*포함되지 않습니다/s);
});

test('nested navigation retains destinations and supports menu closure and Escape focus', async () => {
  const dom = new JSDOM(await readFile(new URL('../area/gangnam.html', import.meta.url), 'utf8'), { url: 'https://example.com/shine/area/gangnam.html', runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ addEventListener() {} });
  const doc = dom.window.document;
  const estimate = doc.querySelector('header [data-path="p5-estimate"]');
  const destination = estimate.href;
  dom.window.eval(await readFile(new URL('../app.js', import.meta.url), 'utf8'));
  assert.equal(estimate.href, destination);
  assert.equal(destination, 'https://example.com/shine/p5-estimate.html');
  doc.querySelector('.menu-toggle').click();
  assert.equal(doc.querySelector('#mobile-nav').hidden, false);
  const summary = doc.querySelector('#mobile-nav summary');
  summary.focus();
  summary.parentElement.open = true;
  doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(summary.parentElement.open, false);
  assert.equal(doc.querySelector('#mobile-nav').hidden, true);
  // Escape leaves focus on the visible menu toggle when the mobile menu closes.
  assert.equal(doc.activeElement, doc.querySelector('.menu-toggle'));
});

test('hospital cleaning has four independent destinations while the overview retains its sections and legacy anchors', async () => {
  const routes = [
    ['서비스 제공 범위', 'p1-hospital-regular-cleaning.html'],
    ['병원 정기청소', 'service/hospital-regular-cleaning.html'],
    ['공간별 세부 집중청소', 'service/area-detail-cleaning.html'],
    ['병원 대청소', 'service/hospital-deep-cleaning.html'],
  ];
  for (const [label, path] of routes) {
    const doc = new JSDOM(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), { url: `https://example.com/shine/${path}` }).window.document;
    assert.match(doc.querySelector('h1').textContent, path.startsWith('service/') ? new RegExp(label === '공간별 세부 집중청소' ? '공간별 세부 집중청소' : label) : /서비스 제공 범위/);
    for (const navigation of doc.querySelectorAll('.desktop-nav,#mobile-nav')) {
      const group = [...navigation.querySelectorAll('details')].find(item => item.querySelector('summary').textContent === '병원청소');
      assert.deepEqual([...group.querySelectorAll('a')].map(link => [link.textContent, link.href]), routes.map(([name, route]) => [name, `https://example.com/shine/${route}`]));
    }
    const tabs = [...doc.querySelectorAll('.service-tabs a')];
    assert.equal(tabs.length, 4);
    assert.equal(tabs.find(link => link.getAttribute('aria-current') === 'page').textContent, label);
    if (path.startsWith('service/')) {
      assert.equal(doc.querySelectorAll('.content-faq').length, 4);
      assert.equal(doc.querySelectorAll('.service-summary article').length, 3);
      assert.ok(doc.body.textContent.includes('의료폐기물'));
    } else {
      assert.equal(doc.querySelectorAll('main section').length, 6);
      for (const id of ['service-targets', 'scope', 'regular-cleaning', 'deep-cleaning', 'service-process', 'service-area']) assert.ok(doc.getElementById(id));
      assert.deepEqual([...doc.querySelectorAll('#service-comparison th a')].map(link => link.href), routes.slice(1).map(([, route]) => `https://example.com/shine/${route}`));
      assert.doesNotMatch(doc.body.textContent, /견적 산정에 영향을 주는 핵심 요인/);
    }
  }
  const home = new JSDOM(await readFile(new URL('../index.html', import.meta.url), 'utf8'), { url: 'https://example.com/shine/' }).window.document;
  assert.deepEqual([...home.querySelectorAll('.home-services a')].map(link => link.href), routes.slice(1).map(([, route]) => `https://example.com/shine/${route}`));
});
