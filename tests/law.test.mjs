import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { loadLawPosts, lawOutputs, lawDetail, lawHref } from '../scripts/law-build.mjs';
import { encodePost } from '../scripts/info-content.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const config = JSON.parse(await readFile(resolve(root,'site.config.json'),'utf8'));
const posts = await loadLawPosts(root);

test('every law article displays only its law-check date below the heading', () => {
  for (const post of posts) {
    const doc = new JSDOM(lawDetail(post,config)).window.document;
    const header = doc.querySelector('.info-article-header');
    assert.equal(header.querySelector('.law-checked-date time')?.dateTime,post.checked_at,post.id);
    assert.match(header.textContent,/법령 확인 기준일/);
    assert.doesNotMatch(header.textContent,/작성:|최초 발행/);
  }
});

test('law articles expose real content, matching breadcrumb schema and official source links', () => {
  const post = posts[0];
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  assert.equal(doc.querySelectorAll('h1').length,1);
  assert.equal(doc.querySelector('h1').textContent,post.title);
  assert.equal(doc.querySelector('meta[name=description]').content,post.meta_description);
  assert.equal(doc.querySelector('link[rel=canonical]').href,config.siteUrl.replace(/\/$/,'')+lawHref(post));
  const crumbs = [...doc.querySelectorAll('.breadcrumbs a,.breadcrumbs [aria-current]')].map(node=>node.textContent);
  const graph = JSON.parse(doc.querySelector('[type="application/ld+json"]').textContent)['@graph'];
  assert.deepEqual(crumbs,['홈','청소 정보','환경관리 법령·지침',post.title]);
  assert.deepEqual(graph.find(item=>item['@type']==='BreadcrumbList').itemListElement.map(item=>item.name),crumbs);
  const article = graph.find(item=>item['@type']==='Article');
  assert.equal(article.datePublished,'2026-11-16T00:00:00+09:00');
  assert.equal(article.dateModified,undefined);
  assert.equal(article.author.name,'원내케어');
  assert.equal(doc.querySelector('meta[name=robots]'),null);
  for (const link of doc.querySelectorAll('.law-toc a')) assert.ok(doc.getElementById(link.getAttribute('href').slice(1)));
  assert.ok(doc.querySelectorAll('table').length>=3);
  assert.ok([...doc.querySelectorAll('#sources ~ .law-table-wrap a')].some(link=>new URL(link.href).hostname==='www.law.go.kr'));
  assert.doesNotMatch(doc.querySelector('main').textContent,/nepla|발행 전 확정|\[발행일\]/i);
  assert.match(doc.querySelector('main').textContent,/치아와 방부제/);
  assert.match(doc.querySelector('main').textContent,/한시적 조치/);
});

test('law metadata honors a configured hosting subpath', () => {
  const doc = new JSDOM(lawDetail(posts[0],{...config,siteUrl:'https://example.com/shine/'})).window.document;
  assert.equal(doc.querySelector('link[rel=canonical]').href,'https://example.com/shine'+lawHref(posts[0]));
});

test('infection-control article separates installation, dedicated staffing and clinic education', () => {
  const post = posts.find(item=>item.id==='law-004');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/100병상/);
  assert.match(main.textContent,/150병상/);
  assert.match(main.textContent,/소속 의료인·종사자·실습생/);
  assert.doesNotMatch(main.textContent,/시행본 확정 필요|\[발행일\]/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.equal(new Set(relatedLinks).size,3);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('laundry article separates bed requirements, employee uniform handling and prohibited items', () => {
  const post = posts.find(item=>item.id==='law-005');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/병상을 갖춘 의료기관/);
  assert.match(main.textContent,/환자와 접촉하는 의료기관 종사자의 근무복/);
  assert.match(main.textContent,/전량 위탁/);
  assert.match(main.textContent,/세탁금지 세탁물/);
  assert.doesNotMatch(main.textContent,/시행본 확정 필요|조문 번호 확정 필요|\[발행일\]/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.ok(relatedLinks.length>=4);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('environmental criteria hub article synthesizes all law categories and links all detailed guides', () => {
  const post = posts.find(item=>item.id==='law-006');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/의료폐기물 보관기간/);
  assert.match(main.textContent,/법정 정기소독/);
  assert.match(main.textContent,/실내공기질/);
  assert.match(main.textContent,/감염관리위원회/);
  assert.match(main.textContent,/의료기관세탁물/);
  assert.match(main.textContent,/저수조/);
  assert.doesNotMatch(main.textContent,/nepla|taxcanvas|geumcheon|ddm|seoul|incheon/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.ok(relatedLinks.includes('/hospital-law/responsibility/building-disinfection-air-water-duty/'));
  assert.ok(relatedLinks.includes('/hospital-law/medical-waste/medical-waste-separation-and-mixing-rules/'));
  assert.ok(relatedLinks.includes('/hospital-law/infection-control/environmental-surface-cleaning-disinfection-rules/'));
  assert.equal(new Set(relatedLinks).size,8);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('building environmental duty article details disinfection, air quality, water tank and clinic overlaps', () => {
  const post = posts.find(item=>item.id==='law-007');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/연면적 2,000㎡ 이상 사무실용 건축물 및 복합용도 건축물/);
  assert.match(main.textContent,/수도법/);
  assert.match(main.textContent,/저수조청소업자/);
  assert.match(main.textContent,/서울특별시 수도 조례/);
  assert.match(main.textContent,/제40조의3/);
  assert.match(main.textContent,/제22조의6/);
  assert.match(main.textContent,/교육·측정등 면제/);
  assert.doesNotMatch(main.textContent,/제22조의3 — 저수조의 청소|반기 1회 이상 \(6개월마다\)/);
  assert.doesNotMatch(main.textContent,/시행본 확정 필요|현행 조문 확정 필요|\[발행일\]/);
  assert.doesNotMatch(main.textContent,/geumcheon|seoul\.go\.kr\/env\/\?p=|incheon\.go\.kr\/water/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.ok(relatedLinks.length>=3);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('medical waste mixing and separation article details contact rule, ATC standard and exemptions', () => {
  const post = posts.find(item=>item.id==='law-008');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/혼합되거나 접촉된 폐기물/);
  assert.match(main.textContent,/생물·화학폐기물/);
  assert.match(main.textContent,/ATC/);
  assert.match(main.textContent,/건강검진/);
  assert.doesNotMatch(main.textContent,/2025\.10\.1 개정본 대조 필요|\[발행일\]/);
  assert.doesNotMatch(main.textContent,/medicaltimes|doctorsnews|gimpo|ehnews|dailymedi/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.ok(relatedLinks.length>=2);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('environmental surface cleaning and disinfection article details recommendation vs duty boundaries', () => {
  const post = posts.find(item=>item.id==='law-009');
  assert.ok(post);
  const doc = new JSDOM(lawDetail(post,config)).window.document;
  const main = doc.querySelector('main');
  assert.match(main.textContent,/다빈도 접촉 표면/);
  assert.match(main.textContent,/분무.*금지/);
  assert.match(main.textContent,/의료폐기물 보관장소/);
  assert.match(main.textContent,/의료기관 사용 기구 및 물품 소독 지침/);
  assert.match(main.textContent,/제2020-295호/);
  assert.doesNotMatch(main.textContent,/현행 고시 번호 확정 필요|\[발행일\]/);
  assert.doesNotMatch(main.textContent,/nepla|medicaltimes|seoul\.go\.kr\/welfare/);
  const articlePaths = new Set(posts.map(lawHref));
  const relatedLinks = [...main.querySelectorAll('a[href^="/hospital-law/"]')].map(link=>link.getAttribute('href')).filter(href=>href!=='/hospital-law/');
  assert.ok(relatedLinks.length>=4);
  for (const href of relatedLinks) assert.ok(articlePaths.has(href),href);
});

test('law listings paginate nine cards with crawlable navigation and unique canonical URLs', async () => {
  const isolated = await mkdtemp(resolve(tmpdir(),'wonnae-law-pages-'));
  await mkdir(resolve(isolated,'content/hospital-law'),{recursive:true});
  const examples = Array.from({length:19},(_,i)=>({...posts[0],id:`law-${String(i+1).padStart(3,'0')}`,slug:`example-${i+1}`,status:'published'}));
  for (const post of examples) await writeFile(resolve(isolated,`content/hospital-law/${post.slug}.md`),encodePost(post));
  const result = await lawOutputs(isolated,config);
  const hrefs = [];
  for (const [i,path] of ['hospital-law/','hospital-law/page/2/','hospital-law/page/3/'].entries()) {
    const output = result.outputs.find(item=>item.path===path+'index.html');
    const doc = new JSDOM(output.html).window.document;
    assert.equal(doc.querySelectorAll('.info-card').length,[9,9,1][i]);
    assert.equal(doc.querySelector('.info-result'),null);
    assert.equal(doc.querySelector('link[rel="canonical"]').href,new URL(path,config.siteUrl).href);
    assert.equal(doc.querySelector('.info-pagination [aria-current="page"]').textContent,String(i+1));
    assert.ok(result.sitemap.includes(path));
    hrefs.push(...[...doc.querySelectorAll('.info-card h2 a')].map(link=>link.getAttribute('href')));
  }
  assert.equal(new Set(hrefs).size,19);
  assert.deepEqual(new Set(hrefs),new Set(examples.map(lawHref)));
  await writeFile(resolve(isolated,'content/hospital-law/example-19.md'),encodePost({...examples[18],status:'draft'}));
  const reduced = await lawOutputs(isolated,config);
  assert.equal(reduced.outputs.some(item=>item.path==='hospital-law/page/3/index.html'),false);
  assert.equal(reduced.sitemap.includes('hospital-law/page/3/'),false);
});

test('law drafts are absent from public output and sitemap and receive noindex in previews', async () => {
  const isolated = await mkdtemp(resolve(tmpdir(),'wonnae-law-'));
  await mkdir(resolve(isolated,'content/hospital-law'),{recursive:true});
  const draft = {...posts[0],id:'draft-law',slug:'draft-example',status:'draft'};
  await writeFile(resolve(isolated,'content/hospital-law/draft.md'),encodePost(draft));
  const publicResult = await lawOutputs(isolated,config);
  assert.equal(publicResult.outputs.length,1);
  assert.deepEqual(publicResult.sitemap,['hospital-law/']);
  assert.doesNotMatch(publicResult.outputs[0].html,/draft-example/);
  const preview = await lawOutputs(isolated,config,true);
  assert.equal(preview.outputs.length,2);
  assert.match(preview.outputs[1].html,/noindex, nofollow/);
  assert.deepEqual(preview.sitemap,['hospital-law/']);
});
