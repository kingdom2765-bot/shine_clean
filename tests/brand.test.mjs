import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('all built pages use the new brand and preserve the legal business name', async () => {
  const paths = (await readdir(new URL('../', import.meta.url))).filter(name => /^(index|p\d+-.*)\.html$/.test(name));
  for (const path of paths) {
    const doc = new JSDOM(await readFile(new URL(`../${path}`, import.meta.url), 'utf8')).window.document;
    assert.match(doc.title, /원내케어/, path);
    for (const node of doc.querySelectorAll('meta[content], [alt], [aria-label]')) {
      for (const attribute of ['content', 'alt', 'aria-label']) {
        const value = node.getAttribute(attribute) || '';
        if (attribute === 'content' && /^https:\/\//.test(value)) continue;
        assert.doesNotMatch(value.replaceAll('샤인크린환경', ''), /샤인크린|SHINE[ _-]?CLEAN/i, `${path}: ${attribute}`);
      }
    }
    assert.equal(doc.querySelector('header .wordmark-image')?.getAttribute('src'), 'assets/brand/wonnae-care.svg', path);
    assert.equal(doc.querySelectorAll('[src="assets/clinic-lobby.jpg"]').length, 0, `${path}: obsolete branded photo`);
    assert.equal(doc.querySelector('header a[aria-label="원내케어 홈"]')?.getAttribute('href'), './', path);
    assert.equal(doc.querySelector('header .brand-wordmark')?.getAttribute('aria-label'), '원내케어 WONNAE CARE', path);
    const footer = doc.querySelector('footer');
    const legal = [...footer.querySelectorAll('dt')].find(dt => dt.textContent === '상호');
    assert.equal(legal.nextElementSibling.textContent, '샤인크린환경', path);
    assert.match(footer.textContent, /742-77-00222/);
    const words = doc.createTreeWalker(doc.body, 4);
    while (words.nextNode()) {
      const text = words.currentNode;
      if (!/원내케어|WONNAE CARE/.test(text.textContent) || text.parentElement.closest('script,style')) continue;
      assert.ok(text.parentElement.closest('.brand-accent,.brand-wordmark'), `${path}: brand text must use brand styling`);
    }
    assert.doesNotMatch(doc.body.textContent.replaceAll('샤인크린환경', ''), /샤인크린|SHINE CLEAN/i, path);
    const schema = doc.querySelector('[type="application/ld+json"]');
    if (schema) {
      assert.equal(doc.querySelector('meta[property="og:site_name"]')?.content, '원내케어', path);
      const org = JSON.parse(schema.textContent)['@graph'].find(item => item['@type'] === 'Organization');
      assert.equal(org.name, '원내케어');
      assert.equal(org.alternateName, 'WONNAE CARE');
      assert.equal(org.legalName, '샤인크린환경');
      assert.match(org.logo, /\/assets\/brand\/wonnae-care\.svg$/);
    }
  }
  for (const asset of ['wonnae-care.svg', 'wonnae-care-compact.svg', 'favicon.svg']) {
    const svg = await readFile(new URL(`../assets/brand/${asset}`, import.meta.url), 'utf8');
    assert.match(svg, /<path/); assert.doesNotMatch(svg, /<text\b/);
    if (asset !== 'favicon.svg') assert.match(svg, /원내케어 · HOSPITAL CLEANING/);
  }
  assert.equal(await readFile(new URL('../auth-hosting/wonnae-care.svg', import.meta.url), 'utf8'), await readFile(new URL('../assets/brand/wonnae-care.svg', import.meta.url), 'utf8'));
  const auth = await readFile(new URL('../auth-hosting/auth-action.html', import.meta.url), 'utf8');
  assert.match(auth, /원내케어/); assert.doesNotMatch(auth, /샤인크린|SHINE CLEAN/);
});
