import { readFile, readdir, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePost, renderMarkdown, escapeHtml as e } from './info-content.mjs';
import { siteBase } from './seo.mjs';

export const lawLabel = '환경관리 법령·지침';
export const lawHref = post => `/hospital-law/${post.category}/${post.slug}/`;
const categories = { 'facilities':'의료시설·위생 기준', 'infection-control':'감염관리·환경표면 청소', 'instruments':'의료기구 소독·멸균', 'disinfection':'법정 정기소독', 'medical-waste':'의료폐기물', 'laundry':'의료기관 세탁물', 'air-quality':'실내공기질·환기', 'water-hygiene':'건물 급수위생', 'responsibility':'환경관리 운영·책임' };
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

export async function loadLawPosts(root) {
  const directory = resolve(root, 'content/hospital-law');
  const files = await readdir(directory);
  const posts = await Promise.all(files.filter(name => name.endsWith('.md')).map(async name => decodePost(await readFile(resolve(directory,name),'utf8'))));
  const paths = new Set();
  for (const post of posts) {
    if (!categories[post.category] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || !['draft','published'].includes(post.status)) throw new Error(`법령 글 분류·주소·상태 오류: ${post.id}`);
    if (!['법적 의무','공식 지침·권고','원내케어 실무 참고'].includes(post.basis)) throw new Error(`법령 글 근거 구분 오류: ${post.id}`);
    if (paths.has(lawHref(post))) throw new Error(`법령 글 중복 주소: ${post.id}`);
    paths.add(lawHref(post));
    for (const key of ['title','seo_title','meta_description','summary','author','answer','body_markdown']) if (typeof post[key] !== 'string' || !post[key].trim()) throw new Error(`법령 글 ${key} 누락: ${post.id}`);
    if (!Array.isArray(post.sources) || !post.sources.length) throw new Error(`법령 근거 누락: ${post.id}`);
    for (const source of post.sources) {
      if (!source.title || !source.scope || !source.version || new URL(source.url).protocol !== 'https:') throw new Error(`법령 근거 형식 오류: ${post.id}`);
    }
    if (post.status === 'published' && (!date(post.published_at) || !date(post.checked_at) || (post.updated_at && (!date(post.updated_at) || post.updated_at < post.published_at)))) throw new Error(`법령 글 발행·확인 날짜 오류: ${post.id}`);
  }
  return posts.sort((a,b) => (b.published_at || '').localeCompare(a.published_at || '') || a.id.localeCompare(b.id));
}

function breadcrumbs(post) {
  return [{ name:'홈', href:'/' },{ name:'청소 정보', href:'/guide/' },{ name:lawLabel, href:'/hospital-law/' },...(post ? [{ name:post.title, href:lawHref(post) }] : [])];
}
function shell({ title, description, path, body, config, post, preview=false, crumbs=breadcrumbs(post) }) {
  const base = siteBase(config.siteUrl);
  const url = base ? new URL(path.replace(/^\//,''),base).href : null;
  const organization = { '@type':'Organization', '@id':base ? `${base}#organization` : '#organization', name:config.businessName, ...(base ? {url:base} : {}) };
  const graph = [organization, { '@type':'BreadcrumbList',itemListElement:crumbs.map((crumb,index)=>({'@type':'ListItem',position:index+1,name:crumb.name,...(base?{item:new URL(crumb.href.replace(/^\//,''),base).href}:{})})) }];
  if (post && post.status === 'published') graph.push({ '@type':'Article', headline:post.title, description, inLanguage:'ko-KR', articleSection:lawLabel, ...(url?{mainEntityOfPage:url,url}:{}), author:{'@type':'Organization',name:post.author,...(base?{url:new URL('hospital-law/',base).href}:{})}, publisher:{'@id':organization['@id']}, datePublished:`${post.published_at}T00:00:00+09:00`, ...(post.updated_at?{dateModified:`${post.updated_at}T00:00:00+09:00`}:{}),citation:post.sources.map(source=>source.url) });
  else graph.push({'@type':'CollectionPage',name:title,description,...(url?{url}:{}),inLanguage:'ko-KR'});
  const breadcrumbHtml = `<nav class="breadcrumbs law-breadcrumbs" aria-label="현재 위치">${crumbs.map((crumb,index)=>`${index?'<span aria-hidden="true">/</span>':''}${index === crumbs.length-1?`<span aria-current="page">${e(crumb.name)}</span>`:`<a href="${e(crumb.href)}">${e(crumb.name)}</a>`}`).join('')}</nav>`;
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)}</title><meta name="description" content="${e(description)}">${preview?'<meta name="robots" content="noindex, nofollow">':''}${url?`<link rel="canonical" href="${e(url)}"><meta property="og:url" content="${e(url)}">`:''}<meta property="og:image" content="${e(new URL('assets/clinic-lobby-wonnae.png',base || 'https://www.wonnaecare.co.kr/').href)}"><meta property="og:image:alt" content="원내케어 병원 환경관리 안내"><meta property="og:type" content="${post?'article':'website'}"><meta property="og:site_name" content="원내케어"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css"><link rel="stylesheet" href="./design-tokens.css"><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./info.css"><link rel="stylesheet" href="./law.css"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c')}</script></head><body class="content-page info-page law-page">{{header}}<main id="main"><div class="content-container info-container">${breadcrumbHtml}${preview?'<aside class="info-preview-banner">게시 전 확인용입니다. 초안은 공개 빌드와 사이트맵에서 제외됩니다.</aside>':''}${body}</div></main>{{footer}}{{dialog}}<script src="./app.js" defer></script><script src="./analytics.js" type="module"></script></body></html>`;
}
const card = post => `<article class="info-card"><div class="info-tags"><span>${e(categories[post.category])}</span><span>${e(post.basis)}</span></div><h2><a href="${lawHref(post)}">${e(post.title)} <span aria-hidden="true">↗</span></a></h2><p>${e(post.summary)}</p><time datetime="${e(post.checked_at)}">법령 확인 ${e(post.checked_at)}</time></article>`;
const lawPageSize = 9;
const lawPageHref = page => page === 1 ? '/hospital-law/' : `/hospital-law/page/${page}/`;

function lawListing(posts, page, config) {
  const count = Math.max(1, Math.ceil(posts.length / lawPageSize));
  const pagination = count > 1 ? `<nav class="info-pagination" aria-label="법령 안내 페이지">${page > 1 ? `<a href="${lawPageHref(page-1)}" rel="prev" aria-label="이전 페이지">이전</a>` : ''}${Array.from({length:count},(_,i)=>`<a href="${lawPageHref(i+1)}" aria-label="${i+1}페이지"${page===i+1?' aria-current="page"':''}>${i+1}</a>`).join('')}${page < count ? `<a href="${lawPageHref(page+1)}" rel="next" aria-label="다음 페이지">다음</a>` : ''}</nav>` : '';
  return shell({title:`환경관리 법령·지침${page>1?` | ${page}페이지`:''} | 병원·의원 적용 기준 - 원내케어`,description:'병원과 의원의 환경관리 법령·지침을 질문별로 안내합니다. 적용 조건, 예외, 법적 의무와 실무 참고사항을 공식 원문과 함께 확인하세요.',path:lawPageHref(page),config,preview:posts.some(post=>post.status!=='published'),crumbs:page===1?breadcrumbs():[...breadcrumbs(),{name:`${page}페이지`,href:lawPageHref(page)}],body:`<div class="law-listing"><header class="info-heading"><p class="info-eyebrow">WONNAE CARE · ENVIRONMENTAL MANAGEMENT</p><h1>${lawLabel}</h1></header><section class="info-list" aria-label="환경관리 질문별 안내">${posts.slice((page-1)*lawPageSize,page*lawPageSize).map(card).join('')}</section>${pagination}</div>`});
}

export function lawDetail(post,config,preview=false) {
  const document = renderMarkdown(post.body_markdown);
  let section = 0;
  const headings = [];
  const prose = document.replace(/<h2>([\s\S]*?)<\/h2>/g,(_,title)=>{ const id=`section-${++section}`; headings.push({id,title:title.replace(/<[^>]+>/g,'')}); return `<h2 id="${id}">${title}</h2>`; }).replace(/<table>([\s\S]*?)<\/table>/g,(_,table)=>`<div class="law-table-wrap" role="region" aria-label="조건과 기준 비교표 · 가로로 스크롤할 수 있습니다" tabindex="0"><table>${table.replace(/<th>/g,'<th scope="col">')}</table></div>`);
  const sources = post.sources.map(source=>`<tr><th scope="row">${e(source.kind)}</th><td><a href="${e(source.url)}">${e(source.title)}</a><p>${e(source.version)}</p></td><td>${e(source.scope)}</td></tr>`).join('');
  const history = (post.history || []).map(item=>`<li><time datetime="${e(item.date)}">${e(item.date)}</time> — ${e(item.note)}</li>`).join('');
  return shell({title:post.seo_title,description:post.meta_description,path:lawHref(post),config,post,preview,body:`<article class="info-article law-article"><header class="info-article-header"><div class="info-tags"><span>${e(categories[post.category])}</span><span>${e(post.basis)}</span></div><h1>${e(post.title)}</h1><p class="law-checked-date">법령 확인 기준일 <time datetime="${e(post.checked_at)}">${e(post.checked_at)}</time></p></header><aside class="law-answer" aria-label="짧은 답변"><p class="law-kicker">짧은 답변</p><p>${e(post.answer)}</p></aside><nav class="law-toc" aria-label="이 글의 목차"><p>이 글에서 확인할 내용</p><ol>${headings.map(item=>`<li><a href="#${item.id}">${e(item.title)}</a></li>`).join('')}<li><a href="#sources">근거 원문</a></li></ol></nav><div class="info-prose">${prose}<h2 id="sources">근거 원문</h2><p>법령은 국가법령정보센터 원문을 기준으로 확인했습니다. 지침과 지자체 안내는 법령과 구분해 표시합니다.</p><div class="law-table-wrap" role="region" aria-label="법령과 지침 근거" tabindex="0"><table><thead><tr><th scope="col">구분</th><th scope="col">원문·확인한 버전</th><th scope="col">해당 내용</th></tr></thead><tbody>${sources}</tbody></table></div><h2 id="review-history">확인·수정 이력</h2><ul>${history}</ul><aside class="law-disclaimer"><p>${e(post.disclaimer || '이 글은 일반적인 법령 정보입니다. 개별 의료기관의 적용 여부와 한시적 조치 여부는 관할 구청의 폐기물 담당 부서 또는 관할 환경관서에 확인하시기 바랍니다.')}</p></aside></div></article><nav class="info-article-nav" aria-label="관련 안내"><a href="/hospital-law/">환경관리 법령·지침 목록</a></nav>`});
}

export async function lawOutputs(root,config,preview=false) {
  const all = await loadLawPosts(root);
  const posts = all.filter(post=>preview || post.status==='published');
  const listingPages = Array.from({length:Math.max(1,Math.ceil(posts.length/lawPageSize))},(_,i)=>i+1);
  const outputs = listingPages.map(page=>({path:lawPageHref(page).slice(1)+'index.html',html:lawListing(posts,page,config)}));
  for (const post of posts) outputs.push({path:lawHref(post).slice(1)+'index.html',html:lawDetail(post,config,post.status!=='published')});
  const published = all.filter(post=>post.status==='published');
  const lastModified = Object.fromEntries(published.map(post=>[lawHref(post).slice(1),post.updated_at || post.published_at]));
  const publicListings = Array.from({length:Math.max(1,Math.ceil(published.length/lawPageSize))},(_,i)=>lawPageHref(i+1).slice(1));
  if (published.length) {
    const latest = Object.values(lastModified).sort().at(-1);
    for (const path of publicListings) lastModified[path] = latest;
  }
  return {outputs,sitemap:[...publicListings,...published.map(post=>lawHref(post).slice(1))],lastModified};
}

// Only paths recorded by this generator may be removed when an article is unpublished.
export async function cleanLawOutputs(root,outputs) {
  const manifest = resolve(root,'.local/law-generated.json');
  let previous = [];
  try { previous = JSON.parse(await readFile(manifest,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const current = outputs.map(output=>output.path);
  for (const path of previous) if (!current.includes(path) && /^hospital-law\/(?:[a-z0-9-]+\/[a-z0-9-]+\/)?index\.html$/.test(path)) await unlink(resolve(root,path)).catch(error=>{if(error.code!=='ENOENT')throw error;});
  await mkdir(resolve(root,'.local'),{recursive:true});
  await writeFile(manifest,JSON.stringify(current,null,2));
}
