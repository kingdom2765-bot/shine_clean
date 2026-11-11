export { clientPagePath } from '../public-client-model.js';
export function siteBase(value) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('siteUrl에는 정식 HTTPS 사이트 주소를 입력해 주세요.');
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export const publicPages = ['index.html', 'p1-hospital-regular-cleaning.html', 'p2-why-specialist.html', 'p3-our-work.html', 'p4-change-guide.html', 'p5-estimate.html', 'area/gangnam.html', 'area/seocho.html', 'clinic/dermatology.html', 'clinic/plastic-surgery.html', 'guide/cost.html', 'guide/faq.html', 'service/hospital-regular-cleaning.html', 'service/area-detail-cleaning.html', 'service/hospital-deep-cleaning.html', 'clinic/dentistry.html', 'clinic/obstetrics-gynecology.html', 'clinic/korean-medicine.html', 'area/songpa.html', 'area/gangdong.html'];
const labels = ['홈', '서비스 제공 범위', '인력·품질관리', '거래처·작업 기록', '업체교체 안내', '무료견적 상담', '강남구 병원청소', '서초구 병원청소', '피부과 청소', '성형외과 청소', '병원청소 비용', '자주 묻는 질문', '병원 정기청소', '공간별 세부 집중청소', '병원 대청소', '치과 청소', '산부인과 청소', '한의원 청소', '송파구 병원청소', '강동구 병원청소'];
export const pageUrl = (base, path) => base ? new URL(path === 'index.html' ? './' : path, base).href : null;
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function relatedLinks(path) {
  if (!publicPages.includes(path)) return '';
  const links = {
    'index.html': [2, 3, 4, 10, 11],
    'p1-hospital-regular-cleaning.html': [12, 13, 14, 8, 9, 6, 7, 10, 5],
    'p2-why-specialist.html': [12, 13, 3, 4, 6, 7, 5],
    'p3-our-work.html': [6, 7, 8, 9, 5],
    'p4-change-guide.html': [12, 14, 10, 11, 2, 5],
    'p5-estimate.html': [1, 10, 4],
    'area/gangnam.html': [7, 8, 9, 12, 13, 3, 5],
    'area/seocho.html': [6, 8, 10, 12, 14, 3, 5],
    'area/songpa.html': [6, 7, 19, 12, 13, 10, 5],
    'area/gangdong.html': [6, 7, 18, 12, 14, 10, 5],
    'clinic/dermatology.html': [9, 6, 7, 12, 13, 10, 5],
    'clinic/plastic-surgery.html': [8, 6, 7, 12, 14, 4, 5],
    'clinic/dentistry.html': [16, 17, 12, 13, 10, 4, 5],
    'clinic/obstetrics-gynecology.html': [15, 17, 12, 10, 2, 4, 5],
    'clinic/korean-medicine.html': [15, 16, 12, 13, 10, 4, 5],
    'guide/cost.html': [12, 13, 14, 4, 11, 5],
    'guide/faq.html': [1, 4, 10, 6, 7, 5],
    'service/hospital-regular-cleaning.html': [1, 13, 14, 10, 2, 5],
    'service/area-detail-cleaning.html': [1, 12, 14, 10, 8, 9, 5],
    'service/hospital-deep-cleaning.html': [1, 12, 13, 10, 4, 6, 7, 5],
  };
  const indexes = links[path];
  const heading = path === 'index.html' ? '더 궁금한 내용이 있으신가요?' : '상담 전 함께 확인하세요';
  const description = path === 'index.html' ? '관리 방식과 병원청소 실적, 업체교체·비용·자주 묻는 질문을 확인하세요.' : '서비스 범위와 관리 방식, 병원청소 실적을 확인하고 상담을 준비하세요.';
  const relatedLabels = { 2: '인력·품질관리', 3: '병원청소 실적·작업사례', 4: '청소업체 교체 안내', 5: '무료 견적 요청' };
  return `<aside class="related-pages" aria-label="관련 서비스 안내"><h2>${heading}</h2><p>${description}</p><nav aria-label="관련 정보">${indexes.filter(index => publicPages[index] !== path).map(index => `<a href="./${publicPages[index]}">${relatedLabels[index] || labels[index]} <span aria-hidden="true">↗</span></a>`).join('')}</nav></aside>`;
}

export function searchMetadata(html, path, config) {
  const base = siteBase(config.siteUrl);
  const url = pageUrl(base, path);
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1] || config.businessName;
  const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  const organizationId = base ? `${base}#organization` : '#organization';
  const graph = [{ '@type': 'Organization', '@id': organizationId, name: config.businessName, telephone: config.telephone, ...(config.businessNumber ? { taxID: config.businessNumber } : {}), ...(config.businessAddress ? { address: { '@type': 'PostalAddress', streetAddress: config.businessAddress, addressCountry: 'KR' } } : {}), ...(base ? { url: base } : {}) },
    { '@type': 'WebPage', name: title, description, inLanguage: 'ko-KR', ...(url ? { '@id': url, url } : {}), about: { '@id': organizationId } }];
  const serviceNames = {
    'index.html': '병원청소',
    'p1-hospital-regular-cleaning.html': '병원청소 서비스 제공 범위',
    'service/hospital-regular-cleaning.html': '병원 정기청소',
    'service/area-detail-cleaning.html': '공간별 세부 집중청소',
    'service/hospital-deep-cleaning.html': '병원 대청소',
    'clinic/dermatology.html': '피부과 청소',
    'clinic/plastic-surgery.html': '성형외과 청소',
    'clinic/dentistry.html': '치과 청소',
    'clinic/obstetrics-gynecology.html': '산부인과 청소',
    'clinic/korean-medicine.html': '한의원 청소',
    'area/songpa.html': '송파구 병원청소',
    'area/gangdong.html': '강동구 병원청소',
    'area/gangnam.html': '강남구 병원청소',
    'area/seocho.html': '서초구 병원청소',
  };
  if (serviceNames[path]) graph.push({ '@type': 'Service', name: serviceNames[path], serviceType: serviceNames[path], provider: { '@id': organizationId }, areaServed: config.serviceAreas.map(name => ({ '@type': 'AdministrativeArea', name })), ...(url ? { url } : {}) });
  if (config.legalName) graph[0].legalName = config.legalName;
  if (config.brandEnglishName) graph[0].alternateName = config.brandEnglishName;
  if (base) graph[0].logo = new URL('assets/brand/wonnae-care.svg', base).href;
  const category = { area: '지역별 청소', clinic: '진료과별 청소', guide: '청소 정보', service: '병원청소' }[path.split('/')[0]];
  if (category && base) graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: '홈', item: base },
    { '@type': 'ListItem', position: 2, name: category, ...(category === '병원청소' ? { item: pageUrl(base, 'p1-hospital-regular-cleaning.html') } : {}) },
    { '@type': 'ListItem', position: 3, name: labels[publicPages.indexOf(path)], item: url },
  ] });
  const naverMeta = config.naverSiteVerification ? `<meta name="naver-site-verification" content="${escapeHtml(config.naverSiteVerification)}">` : '';
  const googleMeta = config.googleSiteVerification ? `<meta name="google-site-verification" content="${escapeHtml(config.googleSiteVerification)}">` : '';
  const image = new URL('assets/clinic-lobby-wonnae.png', base || 'https://www.wonnaecare.co.kr/').href;
  const imageMeta = html.includes('property="og:image"') ? '' : `<meta property="og:image" content="${escapeHtml(image)}">`;
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return html.replace('</head>', `<link rel="icon" href="./assets/brand/favicon.svg" type="image/svg+xml">${naverMeta}${googleMeta}${imageMeta}${url ? `<link rel="canonical" href="${escapeHtml(url)}"><meta property="og:url" content="${escapeHtml(url)}">` : ''}<meta property="og:type" content="website"><meta property="og:site_name" content="${escapeHtml(config.businessName)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><script type="application/ld+json">${schema}</script></head>`);
}

export function crawlerPolicy(config, paths) {
  const base = siteBase(config.siteUrl);
  const robots = `User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n${base ? `\nSitemap: ${new URL('sitemap.xml', base).href}\n` : ''}`;
  const sitemap = base ? `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(path => `  <url><loc>${escapeHtml(pageUrl(base, path))}</loc></url>`).join('\n')}\n</urlset>\n` : null;
  return { robots, sitemap };
}
