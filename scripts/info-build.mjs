import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { loadPosts, escapeHtml as e, regions, specialties, topics, tagsFor, topicFor, articlePath, articleHref, renderMarkdown } from './info-content.mjs';
import { siteBase } from './seo.mjs';

const pageSize = 12;
const canonicalPath = path => '/' + path.replace(/index\.html$/, '');
const card = post => `<article class="info-card"><div class="info-card-top"><div class="info-tags">${tagsFor(post).map(tag=>`<span>${e(tag)}</span>`).join('')}</div>${post.naver_blog_label === true ? '<span class="info-card-source">네이버 블로그</span>' : ''}</div><h2><a href="${articleHref(post)}">${e(post.title)} <span aria-hidden="true">↗</span></a></h2><p>${e(post.summary)}</p>${post.published_at ? `<time datetime="${post.published_at}">${post.published_at.replaceAll('-','.')}</time>` : post.status==='draft' ? '<span class="info-draft-label">검수 중</span>' : ''}</article>`;
const related = (post, posts) => posts.filter(item=>item.id!==post.id).map(item=>({item,score:Number(item.region===post.region)+Number(item.specialty===post.specialty)+Number(topicFor(item)===topicFor(post))})).sort((a,b)=>b.score-a.score).slice(0,3).map(({item})=>item);
const previewNotice = preview => preview ? '<aside class="info-preview-banner" role="note">게시 전 검수용 미리보기입니다. 초안은 공개 빌드와 사이트맵에서 제외됩니다.</aside>' : '';
function shell({title,description,path,body,config,preview=false,showPreviewNotice=preview,post}) {
  const base = siteBase(config.siteUrl);
  const url = base ? new URL(canonicalPath(path).slice(1),base).href : null;
  const breadcrumbs = [{ '@type':'ListItem',position:1,name:'홈',...(base?{item:base}:{}) },{'@type':'ListItem',position:2,name:'병원청소 관리정보',...(base?{item:new URL('info/',base).href}:{})},...(post?[{'@type':'ListItem',position:3,name:post.title,...(url?{item:url}:{})}]:[])];
  const schema = {'@context':'https://schema.org','@graph':[{'@type':'BreadcrumbList',itemListElement:breadcrumbs},...(post && post.status==='published' ? [{'@type':'Article',headline:post.title,description:post.meta_description,mainEntityOfPage:url,datePublished:post.published_at,...(post.updated_at?{dateModified:post.updated_at}:{}),publisher:{'@type':'Organization',name:config.businessName}}]:[])]};
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}">${preview?'<meta name="robots" content="noindex, nofollow">':''}${url?`<link rel="canonical" href="${e(url)}"><meta property="og:url" content="${e(url)}">`:''}<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:type" content="${post?'article':'website'}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"><link rel="icon" href="./assets/brand/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="./design-tokens.css"><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./info.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head><body class="content-page info-page">{{header}}<main id="main"><div class="content-container info-container">${previewNotice(showPreviewNotice)}${body}</div></main>{{footer}}{{dialog}}<script src="./app.js" defer></script>${post?'':'<script src="./info.js" defer></script>'}<script src="./analytics.js" type="module"></script></body></html>`;
}
const options = labels => Object.entries(labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
export function listing(posts,page,config,preview) {
  const pages = Math.max(1,Math.ceil(posts.length/pageSize));
  const pagination = Array.from({length:pages},(_,index)=>`<a href="/info/${index?'page/'+(index+1)+'/':''}"${page===index+1?' aria-current="page"':''}>${index+1}</a>`).join('');
  const data = posts.map(post=>({title:post.title,summary:post.summary,path:articleHref(post),region:post.region,specialty:post.specialty,topic:topicFor(post),tags:tagsFor(post),date:post.published_at,draft:post.status==='draft',naverBlogLabel:post.naver_blog_label===true}));
  return shell({title:'병원청소 관리정보 | 업체선정·비용·정기관리 - 원내케어',description:'병원청소 업체 선정, 교체, 비용, 정기청소 및 진료과별 관리기준을 안내하는 정보 모음',path:page===1?'info/index.html':`info/page/${page}/index.html`,config,preview,showPreviewNotice:preview && posts.some(post=>post.status==='draft'),body:`
<nav class="breadcrumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">/</span><span aria-current="page">병원청소 관리정보</span></nav>
<header class="info-heading"><p class="info-eyebrow">WONNAE CARE · KNOWLEDGE</p><h1>병원청소 관리정보</h1><p>업체를 고르는 기준부터 비용과 공간별 관리까지,<br class="info-desktop-break"> 병원 운영에 필요한 청소 정보를 살펴보세요.</p></header>
<details class="info-filter-panel" open><summary>글 찾기 · 필터</summary><form id="info-filters" role="search"><label class="info-search">제목·내용 검색<input type="search" name="q" aria-label="제목·내용 검색" placeholder="궁금한 내용을 입력하세요" maxlength="100"></label><label>주제<select name="topic" aria-label="주제"><option value="">전체 주제</option>${options(topics)}</select></label><label>지역<select name="region" aria-label="지역"><option value="">전체 지역</option>${options(regions)}</select></label><label>진료과<select name="specialty" aria-label="진료과"><option value="">전체 진료과</option>${options(specialties)}</select></label><button type="reset">초기화</button></form></details>
<p class="info-result" id="info-result" role="status">전체 ${posts.length}건</p><div id="info-list" class="info-list">${posts.slice((page-1)*pageSize,page*pageSize).map(card).join('')}</div><div id="info-empty" class="info-empty"${posts.length?' hidden':''}><p>${posts.length?'조건에 맞는 글이 없습니다.':'등록된 글을 준비하고 있습니다.'}</p><button type="button" id="info-reset">필터 초기화</button></div><nav id="info-pagination" class="info-pagination" aria-label="게시글 페이지">${pages>1?pagination:''}</nav>
<aside class="info-list-footer"><p>우리 병원에 필요한 작업 범위가 궁금하신가요?</p><a href="/service/hospital-regular-cleaning.html">정기청소 서비스 안내 ↗</a><a class="content-button" href="/p5-estimate.html?from=info" data-info-estimate>무료 견적 요청</a></aside><script id="info-data" type="application/json">${JSON.stringify({posts:data,page,pageSize}).replace(/</g,'\\u003c')}</script>`});
}
const serviceLabels = {'/p5-estimate.html':'무료 견적 요청','/p4-change-guide.html':'청소업체 교체 안내','/p2-why-specialist.html':'인력·품질관리','/guide/cost.html':'병원청소 비용','/guide/faq.html':'자주 묻는 질문','/service/hospital-regular-cleaning.html':'병원 정기청소','/service/area-detail-cleaning.html':'공간별 세부 집중청소','/service/hospital-deep-cleaning.html':'병원 대청소'};
function linkLabel(path) { const key=path.split('#')[0]; return serviceLabels[key] || (key.startsWith('/area/')?regions[key.split('/').pop().replace('.html','')]+' 병원청소':key.startsWith('/clinic/')?specialties[key.split('/').pop().replace('.html','')]+' 청소':'관련 안내'); }
export function detail(post,posts,config,preview) {
  const index = posts.indexOf(post);
  const links = [...new Set([...post.related_links, ...(post.region?[`/area/${post.region}.html`]:[]),...(post.specialty?[`/clinic/${post.specialty}.html`]:[])])];
  return shell({title:post.seo_title,description:post.meta_description,path:articlePath(post),config,preview:preview && post.status!=='published',showPreviewNotice:preview && post.status==='draft',post,body:`
<nav class="breadcrumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">/</span><a href="/info/">병원청소 관리정보</a><span aria-hidden="true">/</span><span>글 읽기</span></nav>
<article class="info-article"><header class="info-article-header"><div class="info-tags">${tagsFor(post).map(tag=>`<span>${e(tag)}</span>`).join('')}</div><h1>${e(post.title)}</h1>${post.published_at?`<p class="info-date"><time datetime="${post.published_at}">게시 ${post.published_at}</time>${post.updated_at?` · 수정 ${post.updated_at}`:''}</p>`:''}</header><div class="info-prose">${renderMarkdown(post.body_markdown)}</div></article>
<aside class="info-related-services"><h2>관련 서비스 안내</h2><nav>${links.filter(link=>!link.startsWith('/p5-estimate')).map(link=>`<a href="${e(link)}">${e(linkLabel(link))} ↗</a>`).join('')}</nav><a class="content-button" href="/p5-estimate.html?from=info&amp;article=${e(post.slug)}" data-info-estimate>무료 견적 요청</a></aside>
<aside class="info-related"><h2>함께 읽으면 좋은 글</h2><div class="info-list">${related(post,posts).map(card).join('')}</div></aside>
<nav class="info-article-nav" aria-label="이전 다음 글">${posts[index-1]?`<a href="${articleHref(posts[index-1])}">← 이전 글</a>`:'<span></span>'}<a href="/info/">목록으로</a>${posts[index+1]?`<a href="${articleHref(posts[index+1])}">다음 글 →</a>`:'<span></span>'}</nav>`});
}
export async function infoOutputs(root, config, preview=false) {
  const all = await loadPosts(root);
  const visible = all.filter(post=>preview || post.status==='published');
  const outputs = [];
  for(let page=1;page<=Math.max(1,Math.ceil(visible.length/pageSize));page++) outputs.push({path:page===1?'info/index.html':`info/page/${page}/index.html`,html:listing(visible,page,config,preview && visible.some(post=>post.status!=='published'))});
  for(const post of visible) outputs.push({path:articlePath(post),html:detail(post,visible,config,preview)});
  const published = all.filter(post=>post.status==='published');
  const sitemap = ['info/',...Array.from({length:Math.max(0,Math.ceil(published.length/pageSize)-1)},(_,i)=>`info/page/${i+2}/`),...published.map(post=>articleHref(post).slice(1))];
  return { outputs, posts:visible, sitemap };
}
const pageTopics = {
  'p1-hospital-regular-cleaning.html': ['quality', 'spaces'],
  'p2-why-specialist.html': ['quality', 'selection'],
  'p4-change-guide.html': ['switching'],
  'guide/cost.html': ['cost'],
  'service/hospital-regular-cleaning.html': ['quality', 'spaces'],
  'service/area-detail-cleaning.html': ['spaces'],
  'service/hospital-deep-cleaning.html': ['spaces'],
};
export function relatedInfoPosts(path, posts) {
  const [type,file] = path.split('/');
  const key = file?.replace('.html','');
  const wanted = pageTopics[path];
  const candidates = posts.filter(post=>post.status==='published').filter(post=>
    type==='area' ? post.region===key : type==='clinic' ? post.specialty===key : wanted?.includes(topicFor(post))
  ).filter(post=>path!=='service/hospital-deep-cleaning.html' || /대청소|집중청소|이전|인테리어|입주/.test(post.title+' '+post.summary));
  const score = post => Number(post.related_links.some(link=>link.split('#')[0]==='/'+path))*4 +
    (wanted ? wanted.length-wanted.indexOf(topicFor(post)) : 0);
  candidates.sort((a,b)=>score(b)-score(a) || (b.published_at||'').localeCompare(a.published_at||'') || a.id.localeCompare(b.id));
  // Region and specialty hubs cover distinct reader needs before filling remaining slots.
  const selected = [];
  if(type==='area' || type==='clinic') for(const topic of Object.keys(topics)) {
    const match=candidates.find(post=>topicFor(post)===topic);
    if(match) selected.push(match);
  }
  for(const post of candidates) if(selected.length<5 && !selected.includes(post)) selected.push(post);
  return selected.slice(0,5);
}
export function relatedInfo(path, posts) {
  const matches=relatedInfoPosts(path,posts);
  if (!matches.length) return '';
  const [type,file]=path.split('/');
  const key=file?.replace('.html','');
  const heading=type==='area'?`${regions[key]} 병원청소 관련 글`:type==='clinic'?`${specialties[key]} 청소 관련 글`:'함께 읽으면 좋은 병원청소 정보';
  return `<aside class="related-pages info-context-links" aria-label="관련 병원청소 관리정보"><h2>${e(heading)}</h2><nav>${matches.map(post=>`<a href=".${articleHref(post)}">${e(post.title)} <span aria-hidden="true">↗</span></a>`).join('')}<a href="./info/">관리정보 전체 보기 ↗</a></nav></aside>`;
}
export async function cleanInfoOutputs(root,outputs) {
  const manifest=resolve(root,'.local/info-generated.json');
  let prior=[];try{prior=JSON.parse(await readFile(manifest,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const current=outputs.map(output=>output.path);
  for(const path of prior) if(!current.includes(path) && /^info\/(?:[a-z0-9-]+\/|page\/\d+\/)?index\.html$/.test(path)) await unlink(resolve(root,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await mkdir(dirname(manifest),{recursive:true}); await writeFile(manifest,JSON.stringify(current,null,2));
}
