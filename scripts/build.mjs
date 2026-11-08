import { readFile, writeFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

async function renderWork(source) {
  const { clients, cases } = JSON.parse(await readFile(new URL('data/work.json', root), 'utf8'));
  const clientHtml = clients.map((client, index) => `<article class="work-client" data-name="${escapeHtml(client.name)}" data-region="${escapeHtml(client.region)}" data-specialty="${escapeHtml(client.specialty)}"${index >= 12 ? ' hidden' : ''}><div class="work-client-top"><span>${escapeHtml(client.id)}</span><span>가상 예시</span></div><h3>${escapeHtml(client.name)}</h3><p>${escapeHtml(client.region)}</p><span class="work-specialty">${escapeHtml(client.specialty)}</span></article>`).join('\n');
  const caseHtml = cases.map((item, index) => `<article class="work-case"><button type="button" data-case="${index}" aria-haspopup="dialog" aria-controls="case-dialog"><div class="work-case-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.area)} 공간 이미지 — 실제 작업 사진이 아닌 예시" loading="lazy"><span>시안용 이미지</span><span class="work-image-arrow" aria-hidden="true">↗</span></div><div class="work-case-copy"><div class="work-case-meta"><span>${escapeHtml(item.id)} · 가상 기록</span><span>${escapeHtml(item.area)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.region)} · ${escapeHtml(item.specialty)}</p><span class="work-case-more">관리 포인트 보기 <span aria-hidden="true">→</span></span></div></button></article><template id="case-template-${index}"><img class="case-detail-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.area)} 공간을 설명하는 시안용 이미지"><div class="case-detail-copy"><span class="eyebrow">${escapeHtml(item.id)} · 가상 작업 기록</span><h2 id="case-title">${escapeHtml(item.title)}</h2><p class="case-detail-meta">${escapeHtml(item.region)} · ${escapeHtml(item.specialty)} · ${escapeHtml(item.area)}</p><p>${escapeHtml(item.description)}</p><h3>관리 포인트</h3><ul>${item.tasks.map(task => `<li>${escapeHtml(task)}</li>`).join('')}</ul><p class="case-detail-note">화면 구성을 위한 가상 사례이며, 이미지는 실제 작업 전·후 사진이 아닙니다.</p></div></template>`).join('\n');
  return source.replace('{{clients}}', clientHtml).replace('{{cases}}', caseHtml);
}

// 공통 영역은 빌드 시 조합하므로 JavaScript 없이도 표시됩니다.
export async function build() {
  const parts = Object.fromEntries(await Promise.all(['header', 'footer', 'dialog'].map(async (name) =>
    [name, await readFile(new URL(`components/${name}.html`, root), 'utf8')]
  )));
  const pages = (await readdir(new URL('pages/', root))).filter((name) => name.endsWith('.html'));
  for (const name of pages) {
    let source = await readFile(new URL(`pages/${name}`, root), 'utf8');
    if (name === 'p3-our-work.html') source = await renderWork(source);
    for (const part of ['header', 'footer', 'dialog']) {
      if (source.split(`{{${part}}}`).length !== 2) throw new Error(`${name}: ${part} 공통 영역이 정확히 하나 필요합니다.`);
    }
    const activePage = source.match(/data-page="([^"]+)"/)?.[1];
    let html = source.replace(/\{\{(header|footer|dialog)\}\}/g, (_, part) => parts[part]);
    html = html.replace(/<a\b([^>]*data-path="(p1-hospital-regular-cleaning|p2-why-specialist|p3-our-work|p4-change-guide|p5-estimate)"[^>]*)>/g, (_, attributes, route) =>
      `<a${attributes.replace(/href="[^"]*"/, `href="./${route}.html"`)}>`
    );
    // Only the matching navigation item receives the current-page indicator.
    html = html.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/g, (nav) => nav.replace(/<a\b([^>]*)>/g, (anchor, attributes) =>
      activePage && attributes.includes(`data-path="${activePage}"`) ? `<a aria-current="page"${attributes}>` : anchor
    ));
    await writeFile(new URL(name, root), html);
  }
  return pages;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.log(`Built: ${(await build()).join(', ')}`);
}
