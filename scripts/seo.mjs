export { clientPagePath } from '../public-client-model.js';
export function siteBase(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('siteUrl에는 정식 HTTPS 사이트 주소를 입력해 주세요.');
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export const publicPages = ['index.html', 'p1-hospital-regular-cleaning.html', 'p2-why-specialist.html', 'p3-our-work.html', 'p4-change-guide.html', 'p5-estimate.html'];
const labels = ['홈', '청소 범위·주기·견적', '인력·품질관리', '거래처·작업사례', '업체교체 안내', '무료견적 상담'];
export const pageUrl = (base, path) => base ? new URL(path === 'index.html' ? './' : path, base).href : null;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function relatedLinks(path) {
  if (!publicPages.includes(path)) return '';
  const indexes = path === 'p5-estimate.html' ? [1, 3, 4] : path === 'p4-change-guide.html' ? [1, 2, 3, 5] : [1, 2, 3, 4, 5];
  return `<aside class="related-pages" aria-label="관련 서비스 안내"><h2>상담 전 함께 확인하세요</h2><p>청소 범위와 관리 방식, 거래처 정보를 확인하고 병원에 맞는 상담을 준비하세요.</p><nav aria-label="관련 정보">${indexes.filter(index => publicPages[index] !== path).map(index => `<a href="./${publicPages[index]}">${labels[index]} <span aria-hidden="true">↗</span></a>`).join('')}</nav></aside>`;
}

export function searchMetadata(html, path, config) {
  const base = siteBase(config.siteUrl);
  const url = pageUrl(base, path);
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1] || config.businessName;
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  const organizationId = base ? `${base}#organization` : '#organization';
  const graph = [{ '@type': 'Organization', '@id': organizationId, name: config.businessName, telephone: config.telephone, ...(config.businessNumber ? { taxID: config.businessNumber } : {}), ...(config.businessAddress ? { address: { '@type': 'PostalAddress', streetAddress: config.businessAddress, addressCountry: 'KR' } } : {}), ...(base ? { url: base } : {}) },
    { '@type': 'WebPage', name: title, description, inLanguage: 'ko-KR', ...(url ? { '@id': url, url } : {}), about: { '@id': organizationId } }];
  if (path === 'index.html' || path === 'p1-hospital-regular-cleaning.html') graph.push({ '@type': 'Service', name: '병원·의원 정기청소', serviceType: '병원 정기청소', provider: { '@id': organizationId }, areaServed: config.serviceAreas.map(name => ({ '@type': 'AdministrativeArea', name })), ...(url ? { url } : {}) });
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return html.replace('</head>', `${url ? `<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:url" content="${escapeHtml(url)}">` : ''}<meta property="og:type" content="website"><meta property="og:site_name" content="${escapeHtml(config.businessName)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><script type="application/ld+json">${schema}</script></head>`);
}

export function crawlerPolicy(config, paths) {
  const base = siteBase(config.siteUrl);
  const robots = `User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n${base ? `\nSitemap: ${new URL('sitemap.xml', base).href}\n` : ''}`;
  const sitemap = base ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path => `  <url><loc>${escapeHtml(pageUrl(base, path))}</loc></url>`).join('\n')}\n</urlset>\n` : null;
  return { robots, sitemap };
}
