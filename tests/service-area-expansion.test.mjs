import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {publicPages} from '../scripts/seo.mjs';
const root=new URL('../',import.meta.url);
const documentFor=async path=>new JSDOM(await readFile(new URL(`pages/${path}`,root),'utf8')).window.document;

test('Seoul service area names all 25 districts and links only to existing regional pages',async()=>{
 const d=await documentFor('p1-hospital-regular-cleaning.html');
 const districts=['강남구','서초구','송파구','강동구','강서구','양천구','구로구','금천구','영등포구','동작구','관악구','마포구','서대문구','은평구','종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구'];
 const names=[...d.querySelectorAll('.seoul-districts .seoul-district-card h4')].map(e=>e.textContent);
 assert.equal(names.length,25);
 assert.deepEqual(new Set(names),new Set(districts.map(name=>`${name} 병원청소`)));
 assert.equal(d.querySelectorAll('.seoul-district-card[href]').length,4);
 assert.ok(d.querySelector('.coverage-panel .seoul-districts'));
 assert.equal(d.querySelectorAll('.coverage-regions,.coverage-call,.seoul-district-more').length,0);
 for(const id of ['service-area','service-coverage','coverage-title'])assert.ok(d.getElementById(id));
});

test('regional lists start collapsed and Gyeonggi includes all 31 municipalities',async()=>{
 const d=await documentFor('p1-hospital-regular-cleaning.html');
 const groups=[...d.querySelectorAll('.coverage-locality-lists>details')];
 assert.equal(groups.length,2);
 for(const group of groups){
  assert.equal(group.hasAttribute('open'),false);
  assert.ok(group.querySelector(':scope>summary'));
 }
 const cities=['수원시','성남시','고양시','용인시','부천시','안산시','안양시','남양주시','화성시','평택시','의정부시','시흥시','파주시','김포시','광명시','광주시','군포시','이천시','오산시','하남시','양주시','구리시','안성시','포천시','의왕시','여주시','동두천시','과천시','가평군','양평군','연천군'];
 const names=[...d.querySelectorAll('.gyeonggi-city-grid h4')].map(e=>e.textContent);
 assert.equal(names.length,31);
 assert.deepEqual(new Set(names),new Set(cities.map(name=>`${name} 병원청소`)));
 assert.equal(d.querySelectorAll('.gyeonggi-city-grid a').length,0);
});

test('four regions are linked from home, desktop/mobile menus and each regional page',async()=>{
 const paths=['gangnam','seocho','songpa','gangdong'].map(slug=>`area/${slug}.html`);
 const home=await documentFor('index.html');
 const header=JSDOM.fragment(await readFile(new URL('components/header.html',root),'utf8'));
 assert.equal(home.querySelectorAll('.home-areas nav a').length,4);
 for(const path of paths){
  assert.ok(publicPages.includes(path));
  assert.ok(home.querySelector(`.home-areas nav a[href="./${path}"]`));
  for(const nav of header.querySelectorAll('.desktop-nav,.mobile-nav'))assert.ok(nav.querySelector(`a[href="./${path}"]`));
  const d=await documentFor(path);
  assert.equal(d.querySelectorAll('nav.section-links a').length,4);
  assert.equal(d.querySelectorAll('nav.section-links a[aria-current="page"]').length,1);
  assert.equal(d.querySelectorAll('.area-hero .content-actions').length,0);
  if(!/songpa|gangdong/.test(path))continue;
  assert.equal(d.querySelectorAll('.content-faq').length,3);
 }
});
