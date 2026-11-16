import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, unlink, copyFile, mkdir } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sortPublicClients, clientPageSize } from '../public-client-model.js';
import { clientPagePath, publicPages, searchMetadata, relatedLinks, crawlerPolicy, siteBase } from './seo.mjs';
import { infoOutputs, relatedInfo, cleanInfoOutputs } from './info-build.mjs';
import { lawOutputs, cleanLawOutputs } from './law-build.mjs';

const root = new URL('../', import.meta.url);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

async function renderWork(source, clients, page = 1) {
  const cases = JSON.parse(await readFile(new URL('data/work-cases.json', root), 'utf8'));
  const clientHtml = clients.slice((page - 1) * clientPageSize, page * clientPageSize).map(client => `<article class="work-client"><div class="work-client-heading"><h3>${escapeHtml(client.publicName)}</h3><span class="work-client-group" data-group="${escapeHtml(client.clientGroup)}">${escapeHtml(client.clientGroup)}</span></div><p class="work-client-category">${escapeHtml(client.category || '종목 미등록')}</p><p class="work-client-address"><span>소재지</span>${escapeHtml(client.address || '주소 미등록')}</p></article>`).join('\n');
  const caseHtml = cases.map(item => `<article class="work-case"><a class="work-case-link" href="${escapeHtml(item.path)}"><div class="work-case-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.alt)}" width="900" height="1600" loading="lazy"><span class="work-image-arrow" aria-hidden="true">↗</span></div><div class="work-case-copy"><div class="work-case-meta"><span>${escapeHtml(item.region)}</span><span>${escapeHtml(item.specialty)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p><span class="work-case-more">작업사례 보기 <span aria-hidden="true">→</span></span></div></a></article>`).join('\n');
  const pageCount = Math.max(1, Math.ceil(clients.length / clientPageSize));
  if (page > 1) source = source
    .replace(/<title>.*?<\/title>/s, `<title>병원청소 실적 목록 ${page}페이지 | 원내케어</title>`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="원내케어와 함께한 병원·사무실 업체 목록 ${page}/${pageCount}페이지입니다. 등록 업체의 지역과 종목을 확인하세요. 등록된 실제 업체명을 표시합니다."`);
  const pagination = pageCount > 1 ? Array.from({ length: pageCount }, (_, index) => `<a href="./${clientPagePath(index + 1)}#client-directory" aria-label="${index + 1}페이지"${index + 1 === page ? ' aria-current="page"' : ''}>${index + 1}</a>`).join('') : '';
  return source.replaceAll('{{clientCount}}', String(clients.length)).replace('{{publicClientData}}', JSON.stringify(clients).replace(/</g, '\\u003c')).replace('{{clientPage}}', String(page)).replace('{{clientPagination}}', pagination).replace('{{clientSummary}}', `전체 ${clients.length}개 등록 거래처 · 병원 우선 표시 · ${page} / ${pageCount} 페이지`).replace('{{clients}}', clientHtml).replace('{{cases}}', caseHtml);
}

// 공통 영역은 빌드 시 조합하므로 JavaScript 없이도 표시됩니다.
export async function build(options = {}) {
  const styleVersion = createHash('sha256').update(await readFile(new URL('styles.css', root))).digest('hex').slice(0,12);
  await copyFile(new URL('functions/lib/analytics-model.js', root), new URL('analytics-model.js', root));
  const config = { ...JSON.parse(await readFile(new URL('site.config.json', root), 'utf8')), ...options.config };
  if (process.env.SITE_URL && !options.config) config.siteUrl = process.env.SITE_URL;
  siteBase(config.siteUrl);
  if (config.googleAdsTagId && !/^AW-\d+$/.test(config.googleAdsTagId)) throw new Error('Google Ads 태그 ID 형식을 확인해 주세요.');
  const googleTag = config.googleAdsTagId ? `<script async src="https://www.googletagmanager.com/gtm.js?id=${config.googleAdsTagId}"></script><script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());</script>` : '';
  const clients = sortPublicClients(JSON.parse(await readFile(new URL('data/public-clients.json', root), 'utf8')));
  const counts = { registeredClientCount: clients.length, hospitalClientCount: clients.filter(client => client.clientGroup === '병원').length, officeClientCount: clients.filter(client => client.clientGroup === '사무실').length };
  const parts = Object.fromEntries(await Promise.all(['header', 'footer', 'dialog'].map(async name => [name, await readFile(new URL(`components/${name}.html`, root), 'utf8')])));
  const pages = (await readdir(new URL('pages/', root), { recursive: true })).filter(name => name.endsWith('.html')).map(name => name.replaceAll('\\', '/'));
  const pageCount = Math.max(1, Math.ceil(clients.length / clientPageSize));
  const generated = Array.from({ length: pageCount - 1 }, (_, index) => clientPagePath(index + 2));
  const info = await infoOutputs(fileURLToPath(root), config, options.previewInfo === true);
  const law = await lawOutputs(fileURLToPath(root), config, options.previewInfo === true);
  const contentOutputs = [...info.outputs, ...law.outputs];
  const outputs = [...pages, ...generated, ...contentOutputs.map(output=>output.path)];
  if (new Set(outputs).size !== outputs.length) throw new Error('생성 게시글 URL이 기존 페이지와 충돌합니다.');
  await cleanInfoOutputs(fileURLToPath(root), info.outputs);
  await cleanLawOutputs(fileURLToPath(root), law.outputs);
  for (const name of outputs) {
    const sourceName = generated.includes(name) ? 'p3-our-work.html' : name;
    let source = contentOutputs.find(output=>output.path===name)?.html ?? await readFile(new URL(`pages/${sourceName}`, root), 'utf8');
    if (sourceName === 'index.html') {
      const hospitals = clients.filter(client => client.clientGroup === '병원');
      const midpoint = Math.ceil(hospitals.length / 2);
      const rows = [hospitals.slice(0, midpoint), hospitals.slice(midpoint)].filter(row => row.length);
      source = source.replace('{{hospitalTicker}}', rows.map(row => {
        const names = row.map(client => `<li>${escapeHtml(client.publicName)}</li>`).join('');
        return `<div class="hospital-ticker-row"><div class="hospital-ticker-track"><ul>${names}</ul><ul aria-hidden="true">${names}</ul></div></div>`;
      }).join(''));
    }
    if (sourceName === 'p3-our-work.html') source = await renderWork(source, clients, name === sourceName ? 1 : Number(name.match(/page-(\d+)/)[1]));
    source = source.replace(/\{\{(registeredClientCount|hospitalClientCount|officeClientCount)\}\}/g, (_, key) => String(counts[key]));
    for (const part of ['header', 'footer', 'dialog']) {
      if (source.split(`{{${part}}}`).length !== 2) throw new Error(`${name}: ${part} 공통 영역이 정확히 하나 필요합니다.`);
    }
    const activePage = source.match(/data-page="([^"]+)"/)?.[1];
    let html = source.replace(/\{\{(header|footer|dialog)\}\}/g, (_, part) => parts[part]);
    html = html.replace(/\{\{(businessNumber|representativeName|businessAddress)\}\}/g, (_, key) => escapeHtml(config[key] || '준비중'));
    html = html.replace(/<a\b([^>]*data-path="(p1-hospital-regular-cleaning|p2-why-specialist|p3-our-work|p4-change-guide|p5-estimate)"[^>]*)>/g, (_, attributes, route) => `<a${attributes.replace(/href="[^"]*"/, `href="./${route}.html"`)}>`);
    html = html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, nav => nav.replace(/<a\b([^>]*)>/g, (anchor, attributes) => activePage && attributes.includes(`data-path="${activePage}"`) ? `<a aria-current="page"${attributes}>` : anchor));
    html = html.replace(/<a\b([^>]*)>/g, (anchor, attributes) => {
      if (attributes.includes('aria-current=') || !attributes.includes(`href="./${name}"`)) return anchor;
      return `<a aria-current="page"${attributes}>`;
    });
    if (publicPages.includes(sourceName)) {
      const contextualInfo = relatedInfo(sourceName, info.posts);
      html = html.replace('</main>', `${contextualInfo}${relatedLinks(sourceName)}</main>`);
      if (contextualInfo) html = html.replace('</head>','<link rel="stylesheet" href="./info.css"></head>');
      html = searchMetadata(html, name, config);
      html = html.replace('</body>', '<script src="analytics.js" type="module"></script></body>');
    }
    if (!publicPages.includes(sourceName)) html = html.replace('</head>', '<link rel="icon" href="./assets/brand/favicon.svg" type="image/svg+xml"></head>');
    if (sourceName === 'guide/index.html') html = searchMetadata(html, name, config);
    if (/\{\{[^}]+\}\}/.test(html)) throw new Error(`${name}: 미완성 템플릿이 있습니다.`);
    if (googleTag) html = html.replace('<head>', `<head>${googleTag}`);
    // Refresh cached styling when the shared stylesheet changes.
    html = html.replace(/href="(?:\.\/)?styles\.css"/g, `href="./styles.css?v=${styleVersion}"`);
    // Shared components use checkout-relative URLs, including on nested pages.
    const prefix = '../'.repeat(name.split('/').length - 1) || './';
    html = html.replace(/\b(href|src)="([^"#][^"]*)"/g, (match, attribute, value) => {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return match;
      if (!name.includes('/')) return match;
      return `${attribute}="${prefix}${value.replace(/^\.\//, '').replace(/^\//, '')}"`;
    });
    await mkdir(new URL('./', new URL(name, root)), { recursive: true });
    await writeFile(new URL(name, root), html);
  }
  // Remove only our own obsolete flat pagination files when the directory shrinks.
  for (const name of await readdir(root)) if (/^p3-our-work-page-[0-9]+\.html$/.test(name) && !generated.includes(name)) await unlink(new URL(name, root));
  const paths = [...publicPages, ...generated, 'guide/', ...info.sitemap, ...law.sitemap];
  const { robots, sitemap } = crawlerPolicy(config, paths, law.lastModified);
  await writeFile(new URL('robots.txt', root), robots);
  if (sitemap) await writeFile(new URL('sitemap.xml', root), sitemap);
  else await unlink(new URL('sitemap.xml', root)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  return outputs;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(`Built: ${(await build()).join(', ')}`);
