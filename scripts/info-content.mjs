import { readFile, readdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { Marked } from 'marked';

export const regions = { gangnam: '강남구', seocho: '서초구', songpa: '송파구', gangdong: '강동구' };
export const specialties = { dermatology: '피부과', 'plastic-surgery': '성형외과', dentistry: '치과', 'obstetrics-gynecology': '산부인과', 'korean-medicine': '한의원' };
export const topics = { selection: '업체선정·추천', switching: '업체교체', cost: '비용·계약', spaces: '공간·진료과', quality: '정기청소·품질관리' };
const storyTopics = { S1: 'selection', S2: 'selection', S3: 'switching', S4: 'switching', S5: 'cost', S6: 'spaces', S7: 'spaces', S8: 'quality', S9: 'quality', S10: 'cost' };
const regionCodes = { G: 'gangnam', SC: 'seocho', SP: 'songpa', GD: 'gangdong' };
const specialtyCodes = { SK: 'dermatology', PS: 'plastic-surgery', DT: 'dentistry', OB: 'obstetrics-gynecology', KM: 'korean-medicine' };
const intents = ['병원청소', '병원청소 업체', '병원청소 비용', '병원 청소업체 교체', '병원청소 업체 추천', '병원청소 추천', '병원청소 전문업체', '병원 정기청소'];
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const articlePath = post => `info/${post.slug}/index.html`;
export const articleHref = post => `/info/${post.slug}/`;
export const topicFor = post => storyTopics[post.storyline];
export const tagsFor = post => [regions[post.region], specialties[post.specialty], topics[topicFor(post)]].filter(Boolean);

export function internalPath(value) {
  const url = new URL(value, 'https://www.wonnaecare.co.kr');
  if (url.origin !== 'https://www.wonnaecare.co.kr' || url.search || /%|\\|\.\./.test(url.pathname)) throw new Error(`허용되지 않은 내부 링크: ${value}`);
  return url.pathname + url.hash;
}
function safeHref(value) {
  if (/[\u0000-\u0020\u007f]/.test(value) || /^(?:javascript|data|vbscript):/i.test(value)) return null;
  try {
    const url = new URL(value, 'https://www.wonnaecare.co.kr');
    if (!['https:', 'http:', 'tel:'].includes(url.protocol)) return null;
    return url.origin === 'https://www.wonnaecare.co.kr' ? url.pathname + url.search + url.hash : url.href;
  } catch { return null; }
}
const markdown = new Marked({ gfm: true, renderer: {
  html({ text }) { return escapeHtml(text); },
  heading({ tokens, depth }) { const level = Math.min(6, Math.max(2, depth)); return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`; },
  link({ href, tokens }) { const safe = safeHref(href); const label = this.parser.parseInline(tokens); return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : label; },
  image({ text }) { return escapeHtml(text); },
} });
export function renderMarkdown(body) { return markdown.parse(body); }
export function encodePost(post) {
  const { body_markdown, ...metadata } = post;
  return `---\n${stringify(metadata, { lineWidth: 0 })}---\n\n${body_markdown.trim()}\n`;
}
export function decodePost(source) {
  const match = source.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('YAML Front Matter가 필요합니다.');
  return { ...parse(match[1], { maxAliasCount: 0 }), body_markdown: match[2].trim() };
}
function normalizeBody(body) {
  const lines = body.replace(/&#x20;/gi, ' ').replace(/\\\s*$/gm, '').split('\n');
  return lines.map((line, index) => {
    const text = line.trim();
    const next = lines[index + 1] || '';
    if (text && text.length < 65 && !/^[#>|\-*\d]+[.\s]|[.!?。]$/.test(text) && (!index || !lines[index - 1].trim()) && (/^\s+\S/.test(next) || /^\s*(?:[-*]|\d+\.)\s/.test(next))) return `## ${text}`;
    return line.trimStart();
  }).join('\n').trim();
}

export function importManuscript(source, { expected = 10, provisionalTitles = false } = {}) {
  source = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/&#x20;/gi, ' ');
  const headers = [...source.matchAll(/^####\s+(\d+)\.\s*(.+)$/gm)];
  const starts = headers.length ? headers.map(match => match.index) : [...source.matchAll(/^-\s*(?:\*\*)?주요 검색어\s*:(?:\*\*)?\s*/gm)].map(match => match.index);
  if (starts.length !== expected) throw new Error(`원고 ${expected}건이 필요하지만 ${starts.length}건을 찾았습니다. 가져오지 않았습니다.`);
  if (!headers.length && !provisionalTitles) throw new Error('게시글 제목 헤더가 없습니다. 제목을 보완하거나 --provisional-titles로 초안만 가져오세요.');
  const posts = starts.map((start, index) => {
    const block = source.slice(start, starts[index + 1] ?? source.length);
    const metadata = {};
    for (const match of block.matchAll(/^-\s*(?:\*\*)?(주요 검색어|보조 검색어|SEO 제목|메타 설명|URL 제안|적용 코드)\s*:(?:\*\*)?\s*(.+)$/gm)) {
      if (metadata[match[1]]) throw new Error(`${index + 1}번: 관리정보가 중복됩니다.`);
      metadata[match[1]] = match[2].trim();
    }
    for (const key of ['주요 검색어', '보조 검색어', 'SEO 제목', '메타 설명', 'URL 제안', '적용 코드']) if (!metadata[key]) throw new Error(`${index + 1}번: ${key} 누락`);
    const url = internalPath(metadata['URL 제안']);
    const slug = url.match(/^\/info\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)?.[1];
    if (!slug) throw new Error(`${index + 1}번: /info/영문-slug/ 경로가 필요합니다.`);
    const codes = metadata['적용 코드'].split(/\s*[·,|]\s*/);
    const [storyline, region_feature, specialty_feature] = codes;
    if (!storyTopics[storyline] || !/^(?:G|SC|SP|GD)[1-5]$/.test(region_feature) || !/^(?:SK|PS|DT|OB|KM)[1-5]$/.test(specialty_feature) || codes.length !== 3) throw new Error(`${index + 1}번: 적용 코드 오류`);
    const bodyMarker = block.match(/^(?:\*\*)?본문(?:\*\*)?\s*$/m);
    const relatedMarker = block.match(/^(?:\*\*)?관련 내부 링크(?:\*\*)?\s*$/m);
    if (!bodyMarker || !relatedMarker || bodyMarker.index >= relatedMarker.index) throw new Error(`${index + 1}번: 본문/관련 내부 링크 구분을 확인하세요.`);
    const body_markdown = normalizeBody(block.slice(bodyMarker.index + bodyMarker[0].length, relatedMarker.index));
    const related_links = [...new Set([...block.slice(relatedMarker.index).matchAll(/https:\/\/www\.wonnaecare\.co\.kr\/[^\s)\]]+/g)].map(match => internalPath(match[0])))];
    if (!related_links.length) throw new Error(`${index + 1}번: 관련 링크 누락`);
    const review_warnings = [];
    if (!headers.length) review_warnings.push('원문 제목 헤더 누락: SEO 제목을 임시 제목으로 사용했습니다.');
    if (/위 표|아래 표/.test(body_markdown) && !/^\s*\|/m.test(body_markdown)) review_warnings.push('본문이 표를 참조하지만 원고에 표가 없습니다.');
    if (/원내케어.{0,8}(?:는|가|의)/.test(body_markdown)) review_warnings.push('원내케어 운영방식에 관한 사실 표현의 운영자 검수가 필요합니다.');
    const title = headers.length ? headers[index][2].trim() : metadata['SEO 제목'].replace(/\s*\|\s*원내케어\s*$/, '');
    const summary = body_markdown.replace(/^#+\s+.*$/gm, '').replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
    return { id: `wn-${String(headers.length ? Number(headers[index][1]) : index + 1).padStart(3, '0')}`, status: 'draft', slug, title, seo_title: metadata['SEO 제목'], meta_description: metadata['메타 설명'], storyline,
      region: regionCodes[region_feature.replace(/\d$/, '')], specialty: specialtyCodes[specialty_feature.replace(/\d$/, '')], search_intent: metadata['주요 검색어'], primary_keyword: metadata['주요 검색어'], secondary_keywords: metadata['보조 검색어'].split(/[,，]/).map(value => value.trim()), region_feature, specialty_feature, summary, published_at: null, updated_at: null, related_links, review_warnings, body_markdown };
  });
  assertUnique(posts);
  if (expected === 10 && new Set(posts.map(post => post.storyline)).size !== 10) throw new Error('시범 10건에는 S1~S10이 각각 한 건씩 필요합니다.');
  return posts;
}
function assertUnique(posts) {
  for (const field of ['id', 'slug', 'title', 'seo_title', 'meta_description', 'body_markdown']) if (new Set(posts.map(post => post[field])).size !== posts.length) throw new Error(`중복된 게시글 ${field}`);
}
export async function validatePosts(posts, root) {
  assertUnique(posts);
  const paths = new Set(posts.map(articleHref));
  const publishedPaths = new Set(posts.filter(post=>post.status==='published').map(articleHref));
  const warnings = [];
  for (const post of posts) {
    const fail = message => { throw new Error(`${post.id}: ${message}`); };
    for (const field of ['id','slug','title','seo_title','meta_description','summary','body_markdown']) if (typeof post[field] !== 'string' || !post[field].trim()) fail(`${field} 누락`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || post.slug.length > 120) fail('slug 형식 오류');
    if (!['draft','approved','published'].includes(post.status) || !storyTopics[post.storyline] || !intents.includes(post.search_intent)) fail('상태·분류 오류');
    if (post.region !== null && !regions[post.region] || post.specialty !== null && !specialties[post.specialty]) fail('지역·진료과 오류');
    if (post.region_feature && regionCodes[post.region_feature.replace(/\d$/, '')] !== post.region || post.specialty_feature && specialtyCodes[post.specialty_feature.replace(/\d$/, '')] !== post.specialty) fail('지역·진료과 코드 불일치');
    if (!Array.isArray(post.related_links) || !post.related_links.length) fail('관련 링크 누락');
    for (const date of ['published_at','updated_at']) if (post[date] && (!/^\d{4}-\d{2}-\d{2}$/.test(post[date]) || new Date(post[date]).toISOString().slice(0,10) !== post[date])) fail(`${date} 날짜 오류`);
    if (post.status === 'published' && (!post.published_at || !post.reviewed_at || post.review_warnings?.length)) fail('게시일·검수 완료·경고 해결이 필요합니다.');
    if (post.updated_at && post.published_at && post.updated_at < post.published_at) fail('수정일이 게시일보다 빠릅니다.');
    if (/^\s*[-*]\s*(?:\*\*)?(?:주요 검색어|보조 검색어|SEO 제목|메타 설명|URL 제안|적용 코드)\s*:/m.test(post.body_markdown)) fail('본문에 관리정보가 섞였습니다.');
    const links = [...post.related_links, ...[...renderMarkdown(post.body_markdown).matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g,'&')).filter(href => href.startsWith('/'))];
    for (const link of links) {
      const path = internalPath(link).split('#')[0];
      if (path.startsWith('/info/') && path !== '/info/' && !paths.has(path)) fail(`없는 게시글 링크: ${link}`);
      if (post.status==='published' && path.startsWith('/info/') && path!=='/info/' && !publishedPaths.has(path)) fail(`미발행 글로 연결됩니다: ${link}`);
      else if (!path.startsWith('/info/')) {
        try {
          const file = await readFile(resolve(root, 'pages', path === '/' ? 'index.html' : path.slice(1)), 'utf8');
          const anchor = link.split('#')[1];
          if (anchor && !file.includes(`id="${anchor}"`)) fail(`없는 앵커: ${link}`);
        } catch (error) { if (error.code === 'ENOENT') fail(`없는 내부 링크: ${link}`); throw error; }
      }
    }
    if (post.title.length > 80 || post.meta_description.length > 180) warnings.push(`${post.id}: 제목 또는 설명 길이를 검토하세요.`);
    if (post.body_markdown.length < 120) warnings.push(`${post.id}: 본문이 짧습니다.`);
    for (const warning of post.review_warnings || []) warnings.push(`${post.id}: ${warning}`);
  }
  return warnings;
}
export async function loadPosts(root) {
  const directory = resolve(root, 'content/info');
  let files; try { files = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const posts = await Promise.all(files.filter(name => name.endsWith('.md')).sort().map(async name => decodePost(await readFile(resolve(directory, name), 'utf8'))));
  await validatePosts(posts, root);
  return posts.sort((a,b) => (b.published_at || '').localeCompare(a.published_at || '') || a.id.localeCompare(b.id));
}
