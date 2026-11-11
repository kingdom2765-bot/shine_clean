import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {publicPages} from '../scripts/seo.mjs';

test('five specialties have independent pages and consistent home, shared and clinic navigation',async()=>{
 const clinics=['dermatology','plastic-surgery','dentistry','obstetrics-gynecology','korean-medicine'];
 const paths=clinics.map(slug=>`clinic/${slug}.html`);
 const home=new JSDOM(await readFile(new URL('../index.html',import.meta.url),'utf8')).window.document;
 assert.equal(home.querySelectorAll('.home-specialty-grid>a').length,5);
 for(const path of paths){
  assert.ok(publicPages.includes(path));
  assert.ok(home.querySelector(`.home-specialty-grid>a[href="./${path}"]`));
  for(const nav of home.querySelectorAll('header .desktop-nav,header .mobile-nav'))assert.ok(nav.querySelector(`a[href="./${path}"]`));
  const d=new JSDOM(await readFile(new URL(`../${path}`,import.meta.url),'utf8')).window.document;
  assert.equal(d.querySelectorAll('.section-links a').length,5);
  assert.equal(d.querySelectorAll('.section-links a[aria-current="page"]').length,1);
  if(clinics.indexOf(path.split('/')[1].replace('.html',''))<2)continue;
  assert.equal(d.querySelectorAll('.content-faq').length,4);
  assert.equal(d.querySelectorAll('.content-hero .content-actions').length,0);
  const schema=JSON.parse(d.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
  assert.ok(schema.some(item=>item['@type']==='Service'));
  assert.match(d.querySelector('.content-hero img').alt,/예시/);
 }
});
