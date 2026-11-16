import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { importManuscript, loadPosts, renderMarkdown, validatePosts, encodePost, decodePost, topicFor } from '../scripts/info-content.mjs';
import { infoOutputs, listing, detail, relatedInfo, relatedInfoPosts } from '../scripts/info-build.mjs';
import { safePage } from '../functions/lib/analytics-model.js';
import { nextVisit, normalizedEvent } from '../functions/lib/service.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(new URL('../site.config.json',import.meta.url),'utf8'));
const imports=await readdir(new URL('../content/imports/',import.meta.url));
const manuscript=await readFile(new URL('../content/imports/'+imports.find(name=>name.endsWith('.md')),import.meta.url),'utf8');
const posts=await loadPosts(root);

test('single real manuscript imports ten drafts without leaking metadata into bodies',()=>{
  assert.throws(()=>importManuscript(manuscript),/제목 헤더/);
  const parsed=importManuscript(manuscript,{provisionalTitles:true});
  assert.equal(parsed.length,10);assert.equal(new Set(parsed.map(post=>post.storyline)).size,10);
  assert.equal(parsed[9].slug,'seocho-korean-medicine-waste-contract');
  assert.equal(parsed[9].region,'seocho');assert.equal(parsed[9].specialty,'korean-medicine');
  assert.ok(parsed[6].review_warnings.some(warning=>warning.includes('표가 없습니다')));
  for(const post of parsed){assert.equal(post.status,'draft');assert.equal(post.published_at,null);assert.doesNotMatch(post.body_markdown,/주요 검색어:|적용 코드:|관련 내부 링크/);assert.deepEqual(decodePost(encodePost(post)),post);}
  assert.throws(()=>importManuscript(manuscript,{expected:9,provisionalTitles:true}),/9건/);
  assert.throws(()=>importManuscript(manuscript.replace('S10 · SC4 · KM5','S10 · X4 · KM5'),{provisionalTitles:true}),/코드/);
});
test('numbered headings become titles and duplicate URLs or missing fields fail',()=>{
  let index=0;const numbered=manuscript.replace(/^- 주요 검색어:/gm,()=>`#### ${++index}. 실제 제목 ${index}\n\n- 주요 검색어:`);
  const parsed=importManuscript(numbered);assert.equal(parsed[9].title,'실제 제목 10');
  assert.throws(()=>importManuscript(numbered.replace('gangnam-dental-cleaning-cost','gangnam-dermatology-finish-care')),/중복/);
  assert.throws(()=>importManuscript(numbered.replace('- 메타 설명:','- 빠진 항목:')),/메타 설명 누락/);
});
test('Markdown preserves headings, lists and tables while preventing active HTML and unsafe links',()=>{
  const html=renderMarkdown('# 제목\n\n<script>alert(1)</script>\n\n[실행](javascript:alert)\n\n![사진](https://example.com/fake.jpg)\n\n- **강조**\n\n|항목|내용|\n|---|---|\n|범위|바닥|');
  const doc=new JSDOM(html).window.document;
  assert.equal(doc.querySelector('h1'),null);assert.ok(doc.querySelector('h2'));assert.ok(doc.querySelector('table'));assert.ok(doc.querySelector('li strong'));assert.equal(doc.querySelector('script,img,a'),null);
});
test('drafts stay outside production outputs and sitemap; ten previews retain distinct metadata and one H1',async()=>{
  const production=await infoOutputs(root,config);const published=posts.filter(post=>post.status==='published'); assert.equal(production.outputs.length,published.length+Math.max(1,Math.ceil(published.length/12))); assert.equal(production.sitemap.length,production.outputs.length); for(const post of posts)assert.equal(production.sitemap.includes('info/'+post.slug+'/'),post.status==='published');
  const preview=await infoOutputs(root,config,true);assert.equal(preview.outputs.length, posts.length + Math.max(1, Math.ceil(posts.length / 12)));
  for(const post of posts){const doc=new JSDOM(preview.outputs.find(output=>output.path===`info/${post.slug}/index.html`).html).window.document;assert.equal(doc.title,post.seo_title);assert.equal(doc.querySelector('meta[name=description]').content,post.meta_description);assert.equal(doc.querySelectorAll('h1').length,1);assert.equal(doc.querySelector('h1').textContent,post.title);assert.ok(doc.querySelector('link[rel=canonical]').href.endsWith(`/info/${post.slug}/`));assert.equal(doc.querySelector('meta[name=robots]')?.content,post.status==='published'?undefined:'noindex, nofollow');assert.doesNotMatch(doc.querySelector('main').textContent,/주요 검색어:|보조 검색어:|SEO 제목:|메타 설명:|URL 제안:|적용 코드:|S10 · SC4 · KM5/);}
  assert.ok(relatedInfo('area/gangnam.html',preview.posts).includes('/info/'));
  assert.equal(Boolean(relatedInfo('area/gangnam.html',production.posts)),production.posts.some(post=>post.region==='gangnam'));
});
test('validation rejects missing links, bad anchors, unreviewed publication and mismatched codes',async()=>{
  await assert.rejects(validatePosts([{...posts[0],related_links:['/area/missing.html']}],root),/없는 내부 링크/);
  await assert.rejects(validatePosts([{...posts[0],related_links:['/area/gangnam.html#missing']}],root),/없는 앵커/);
  await assert.rejects(validatePosts([{...posts[0],status:'published',reviewed_at:null,review_warnings:['검수 필요'],published_at:null}],root),/검수/);
  await assert.rejects(validatePosts([{...posts[0],region:posts[0].region==='seocho'?'gangnam':'seocho'}],root),/코드 불일치/);
});
test('published detail emits article schema and real dates without noindex',()=>{
  const post={...posts[0],status:'published',published_at:'2026-11-12',reviewed_at:'2026-11-12',review_warnings:[]};
  const doc=new JSDOM(detail(post,[post],config,false)).window.document;
  assert.equal(doc.querySelector('meta[name=robots]'),null);assert.equal(doc.querySelector('time').dateTime,'2026-11-12');
  assert.ok(JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent)['@graph'].some(item=>item['@type']==='Article'));
});

test('published articles provide contextual service links and accurate trade-record links',async()=>{
  const published=posts.filter(post=>post.status==='published');
  for(const post of published){
    const doc=new JSDOM(renderMarkdown(post.body_markdown)).window.document;
    const links=[...doc.querySelectorAll('a[href]')];
    assert.ok(links.length>=2 && links.length<=3,post.id+': focused body links');
    assert.equal(new Set(links.map(link=>link.getAttribute('href'))).size,links.length,post.id+': no duplicate body destinations');
    assert.ok(links.some(link=>link.getAttribute('href')===`/area/${post.region}.html`),post.id+': matching region');
    assert.ok(links.every(link=>link.textContent.trim()),post.id+': descriptive text');
  }
  // This also resolves every article URL and section anchor against page sources.
  await validatePosts(published,root);
  const tradeLinks=published.filter(post=>post.body_markdown.includes('/p3-our-work.html#clients'));
  assert.deepEqual(tradeLinks.map(post=>post.id).sort(),['wn-071','wn-094']);
});

test('hub recommendations match region or topic, cover different needs and exclude drafts',()=>{
  const regionPosts=posts.filter(post=>post.status==='published' && post.region==='gangnam');
  const draft={...regionPosts[0],id:'unpublished',status:'draft',published_at:'2099-01-01'};
  const chosen=relatedInfoPosts('area/gangnam.html',[draft,...posts]);
  assert.equal(chosen.length,5);
  assert.ok(chosen.every(post=>post.status==='published' && post.region==='gangnam'));
  assert.equal(new Set(chosen.map(topicFor)).size,5);
  assert.deepEqual(relatedInfoPosts('area/gangnam.html',[...posts].reverse()).map(post=>post.id),chosen.map(post=>post.id));
  for(const path of ['p2-why-specialist.html','p4-change-guide.html','guide/cost.html','service/hospital-regular-cleaning.html','service/area-detail-cleaning.html','service/hospital-deep-cleaning.html']){
    const selected=relatedInfoPosts(path,posts);
    assert.ok(selected.length>0 && selected.length<=5,path);
    assert.equal(new Set(selected.map(post=>post.id)).size,selected.length,path);
    if(path==='p4-change-guide.html')assert.ok(selected.every(post=>['S3','S4'].includes(post.storyline)));
    if(path==='guide/cost.html')assert.ok(selected.every(post=>['S5','S10'].includes(post.storyline)));
    if(path==='service/hospital-deep-cleaning.html'){
      const eligible=posts.filter(post=>post.status==='published'&&topicFor(post)==='spaces'&&/대청소|집중청소|이전|인테리어|입주/.test(post.title+' '+post.summary));
      assert.equal(selected.length,Math.min(5,eligible.length));
      assert.ok(selected.every(post=>eligible.includes(post)));
    }
  }
  assert.equal(relatedInfo('p6-admin.html',posts),'');
});
test('combined filters, empty results, reset, query reload and pagination work on 37 posts',async()=>{
  const many=Array.from({length:37},(_,index)=>({...posts[index%10],id:'test-'+index,slug:'post-'+index,title:`${posts[index%10].title} ${index}`}));
  const dom=new JSDOM(listing(many,1,config,true),{url:'https://www.wonnaecare.co.kr/info/',runScripts:'outside-only'});
  dom.window.matchMedia=()=>({matches:false});dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  dom.window.eval(await readFile(new URL('../info.js',import.meta.url),'utf8'));
  const $=selector=>dom.window.document.querySelector(selector);const input=(name,value)=>{const field=$(`[name=${name}]`);field.value=value;field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
  assert.equal(dom.window.document.querySelectorAll('#info-list article').length,12);assert.equal(dom.window.document.querySelectorAll('#info-pagination a').length,4);
  $('#info-pagination a:nth-child(2)').click();assert.match(dom.window.location.pathname,/page\/2/);
  input('region','seocho');input('specialty','korean-medicine');assert.equal(dom.window.document.querySelectorAll('#info-list article').length,many.filter(post=>post.region==='seocho'&&post.specialty==='korean-medicine').length);
  input('q','없는단어');assert.equal($('#info-empty').hidden,false);
  $('#info-reset').click();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(dom.window.document.querySelectorAll('#info-list article').length,12);assert.equal($('#info-empty').hidden,true);
});
test('board estimate clicks remain separate from phone clicks and pageviews',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const event=normalizedEvent({id,visitor:id,session:id,type:'estimate_link',page:'/info/test-article/',source:{channel:'direct:none'}},Date.now(),'test-secret');
  const visit=nextVisit(null,event);assert.equal(visit.estimateLinkClicks,1);assert.equal(visit.views,0);assert.equal(visit.phoneClicks,0);assert.equal(visit.estimateLinkPages['info/test-article/'],1);assert.equal(safePage('/info/../../secrets'),'index.html');
});
