import { readFile, writeFile, readdir, unlink, copyFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sortPublicClients, clientPageSize } from '../public-client-model.js';
import { clientPagePath, publicPages, searchMetadata, relatedLinks, crawlerPolicy, siteBase } from './seo.mjs';

const root = new URL('../', import.meta.url);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

async function renderWork(source, clients, page = 1) {
  const { cases } = JSON.parse(await readFile(new URL('data/work.json', root), 'utf8'));
  const clientHtml = clients.slice((page - 1) * clientPageSize, page * clientPageSize).map(client => `<article class="work-client"><div class="work-client-heading"><h3>${escapeHtml(client.publicName)}</h3><span class="work-client-group" data-group="${escapeHtml(client.clientGroup)}">${escapeHtml(client.clientGroup)}</span></div><p class="work-client-category">${escapeHtml(client.category || '종목 미등록')}</p><p class="work-client-address"><span>소재지</span>${escapeHtml(client.address || '주소 미등록')}</p></article>`).join('\n');
  const caseHtml = cases.map((item, index) => `<article class="work-case"><button type="button" data-case="${index}" aria-haspopup="dialog" aria-controls="case-dialog"><div class="work-case-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.area)} 공간 이미지 — 실제 작업 사진이 아닌 예시" loading="lazy"><span>공간 안내용 예시 이미지</span><span class="work-image-arrow" aria-hidden="true">↗</span></div><div class="work-case-copy"><div class="work-case-meta"><span>공간 안내</span><span>${escapeHtml(item.area)}</span></div><h3>${escapeHtml(item.title)}</h3><p>일반 의료공간 안내</p><span class="work-case-more">관리 포인트 보기 <span aria-hidden="true">→</span></span></div></button></article><template id="case-template-${index}"><img class="case-detail-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.area)} 공간을 설명하는 공간 안내용 예시 이미지"><div class="case-detail-copy"><span class="eyebrow">공간별 관리 안내</span><h2 id="case-title">${escapeHtml(item.title)}</h2><p class="case-detail-meta">일반 의료공간 안내 · ${escapeHtml(item.area)}</p><p>${escapeHtml(item.description)}</p><h3>관리 포인트</h3><ul>${item.tasks.map(task => `<li>${escapeHtml(task)}</li>`).join('')}</ul><p class="case-detail-note">공간 안내용 예시 이미지와 관리 항목입니다.</p></div></template>`).join('\n');
  const pageCount = Math.max(1, Math.ceil(clients.length / clientPageSize));
  const pagination = pageCount > 1 ? Array.from({ length: pageCount }, (_, index) => `<a href="./${clientPagePath(index + 1)}#client-directory" aria-label="${index + 1}페이지"${index + 1 === page ? ' aria-current="page"' : ''}>${index + 1}</a>`).join('') : '';
  return source.replaceAll('{{clientCount}}', String(clients.length)).replace('{{publicClientData}}', JSON.stringify(clients).replace(/</g, '\\u003c')).replace('{{clientPage}}', String(page)).replace('{{clientPagination}}', pagination).replace('{{clientSummary}}', `전체 ${clients.length}개 등록 거래처 · 병원 우선 표시 · ${page} / ${pageCount} 페이지`).replace('{{clients}}', clientHtml).replace('{{cases}}', caseHtml);
}

// 공통 영역은 빌드 시 조합하므로 JavaScript 없이도 표시됩니다.
export async function build(options = {}) {
  await copyFile(new URL('functions/lib/analytics-model.js', root), new URL('analytics-model.js', root));
  const config = { ...JSON.parse(await readFile(new URL('site.config.json', root), 'utf8')), ...options.config };
  if (process.env.SITE_URL && !options.config) config.siteUrl = process.env.SITE_URL;
  siteBase(config.siteUrl);
  const clients = sortPublicClients(JSON.parse(await readFile(new URL('data/public-clients.json', root), 'utf8')));
  const counts = { registeredClientCount: clients.length, hospitalClientCount: clients.filter(client => client.clientGroup === '병원').length, officeClientCount: clients.filter(client => client.clientGroup === '사무실').length };
  const parts = Object.fromEntries(await Promise.all(['header', 'footer', 'dialog'].map(async name => [name, await readFile(new URL(`components/${name}.html`, root), 'utf8')])));
  const pages = (await readdir(new URL('pages/', root), { recursive: true })).filter(name => name.endsWith('.html')).map(name => name.replaceAll('\\', '/'));
  const pageCount = Math.max(1, Math.ceil(clients.length / clientPageSize));
  const generated = Array.from({ length: pageCount - 1 }, (_, index) => clientPagePath(index + 2));
  const outputs = [...pages, ...generated];
  for (const name of outputs) {
    const sourceName = generated.includes(name) ? 'p3-our-work.html' : name;
    let source = await readFile(new URL(`pages/${sourceName}`, root), 'utf8');
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
      html = html.replace('</main>', `${relatedLinks(sourceName)}</main>`);
      html = searchMetadata(html, name, config);
      html = html.replace('</body>', '<script src="analytics.js" type="module"></script></body>');
    }
    if (!publicPages.includes(sourceName)) html = html.replace('</head>', '<link rel="icon" href="./assets/brand/favicon.svg" type="image/svg+xml"></head>');
    if (/\{\{[^}]+\}\}/.test(html)) throw new Error(`${name}: 미완성 템플릿이 있습니다.`);
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
  const paths = [...publicPages, ...generated];
  const { robots, sitemap } = crawlerPolicy(config, paths);
  await writeFile(new URL('robots.txt', root), robots);
  if (sitemap) await writeFile(new URL('sitemap.xml', root), sitemap);
  else await unlink(new URL('sitemap.xml', root)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  return outputs;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) console.log(`Built: ${(await build()).join(', ')}`);
