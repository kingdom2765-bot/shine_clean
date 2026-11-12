// Shared, dependency-free measurement rules. Copied to the public bundle by build.mjs.
export const DAY = 86400000;
export const SESSION_MS = 30 * 60000;
export const ATTRIBUTION_MS = 30 * DAY;
export const channelLabels = Object.freeze({
  'naver:organic': '네이버 자연검색', 'google:organic': '구글 자연검색', 'daum:organic': '다음 자연검색', 'bing:organic': '빙 자연검색',
  'naver:cpc': '네이버 파워링크', 'google:cpc': '구글 검색광고', 'chatgpt:paid': 'ChatGPT 광고', 'naver:paid_content': '네이버 파워컨텐츠',
  'naver:blog': '네이버 블로그', 'naver:place': '네이버 스마트플레이스', 'google:place': '구글 비즈니스 프로필', 'kakao:place': '카카오맵',
  'chatgpt:referral': 'ChatGPT 무료 유입', 'external:referral': '외부 사이트', 'direct:none': '직접·출처 불명',
});
export const paidChannels = ['naver:cpc', 'google:cpc', 'chatgpt:paid', 'naver:paid_content'];
export const pageLabels = {
  'index.html': '홈',
  'p1-hospital-regular-cleaning.html': '서비스 제공 범위',
  'p2-why-specialist.html': '왜 전문업체인가',
  'p3-our-work.html': '거래처와 작업사례',
  'p4-change-guide.html': '업체교체 안내',
  'p5-estimate.html': '무료견적 신청',
  'area/gangnam.html': '강남구 병원청소',
  'area/seocho.html': '서초구 병원청소',
  'area/songpa.html': '송파구 병원청소',
  'area/gangdong.html': '강동구 병원청소',
  'clinic/dermatology.html': '피부과 청소',
  'clinic/plastic-surgery.html': '성형외과 청소',
  'clinic/dentistry.html': '치과 청소',
  'clinic/obstetrics-gynecology.html': '산부인과 청소',
  'clinic/korean-medicine.html': '한의원 청소',
  'guide/cost.html': '병원청소 비용',
  'guide/faq.html': '자주 묻는 질문',
  'service/hospital-regular-cleaning.html': '병원 정기청소',
  'service/area-detail-cleaning.html': '공간별 세부 집중청소',
  'service/hospital-deep-cleaning.html': '병원 대청소',
};
export const dayKey = time => new Date(Number(time) + 9 * 3600000).toISOString().slice(0, 10);
export const dayStart = day => Date.parse(`${day}T00:00:00+09:00`);
export const slug = value => /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(String(value || '')) ? String(value) : '';
export function safePage(value) {
  const infoPath = String(value || '').split(/[?#]/)[0].replace(/^\//,'');
  if (/^info\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)?$/.test(infoPath) && infoPath.length<=140) return infoPath;
  const segments = String(value || '').split(/[?#]/)[0].split('/');
  const nested = segments.slice(-2).join('/');
  if (Object.hasOwn(pageLabels, nested)) return nested;
  const name = segments.pop() || 'index.html';
  return Object.hasOwn(pageLabels, name) || /^p3-our-work-page-\d{1,3}\.html$/.test(name) ? name : 'index.html';
}
export function safeSource(source = {}) {
  const channel = Object.hasOwn(channelLabels, source.channel) ? source.channel : 'direct:none';
  return { channel, campaign: slug(source.campaign), content: slug(source.content), term: slug(source.term) };
}
export function classify(url, referrer = '') {
  const current = new URL(url); const q = current.searchParams;
  let host = ''; try { host = new URL(referrer).hostname.toLowerCase(); } catch { /* no referrer */ }
  const within = domain => host === domain || host.endsWith(`.${domain}`);
  const source = q.get('utm_source')?.toLowerCase(); const medium = q.get('utm_medium')?.toLowerCase();
  const aliases = { paid_search: 'cpc', organic_search: 'organic', paid: 'paid', paid_content: 'paid_content', blog: 'blog', place: 'place', referral: 'referral', cpc: 'cpc', organic: 'organic' };
  const tagged = `${source}:${aliases[medium] || medium}`;
  let channel = Object.hasOwn(channelLabels, tagged) ? tagged : '';
  if (!channel && source === 'chatgpt.com') channel = 'chatgpt:referral';
  if (!channel && (q.has('gclid') || q.has('gbraid') || q.has('wbraid'))) channel = 'google:cpc';
  if (!channel && (q.has('n_keyword_id') || q.has('n_ad') || q.get('n_campaign_type') === '1')) channel = 'naver:cpc';
  if (!channel && q.get('n_campaign_type') === '3') channel = 'naver:paid_content';
  if (!channel) {
    if (host === current.hostname) channel = 'direct:none';
    else if (within('blog.naver.com')) channel = 'naver:blog';
    else if (within('map.naver.com') || within('place.naver.com')) channel = 'naver:place';
    else if (within('map.kakao.com')) channel = 'kakao:place';
    else if (within('naver.com')) channel = 'naver:organic';
    else if (/^(?:www\.)?google\.(?:com|co\.kr)$/.test(host)) channel = 'google:organic';
    else if (within('daum.net')) channel = 'daum:organic';
    else if (within('bing.com')) channel = 'bing:organic';
    else if (within('chatgpt.com') || within('chat.openai.com')) channel = 'chatgpt:referral';
    else channel = host ? 'external:referral' : 'direct:none';
  }
  return safeSource({ channel, campaign: q.get('utm_campaign'), content: q.get('utm_content'), term: q.get('utm_term') });
}
export function attribution(current, previous, now) {
  if (current.channel !== 'direct:none') return { source: current, at: now };
  return previous && previous.at <= now && now - previous.at <= ATTRIBUTION_MS ? previous : { source: current, at: now };
}
export function buildLink(base, values) {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('올바른 홈페이지 주소를 입력해 주세요.');
  const source = safeSource(values);
  if (source.channel === 'direct:none') throw new Error('유입 경로를 선택해 주세요.');
  if (!source.campaign) throw new Error('캠페인은 영문 소문자·숫자·하이픈으로 80자 이내로 입력해 주세요.');
  url.search = ''; url.hash = '';
  const [platform, medium] = source.channel.split(':');
  for (const [key, value] of Object.entries({ source: platform, medium, campaign: source.campaign, content: source.content, term: source.term })) if (value) url.searchParams.set(`utm_${key}`, value);
  return url.href;
}
export function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}
export function parseCsv(input) {
  const rows = []; let row = [], cell = '', quoted = false;
  const text = String(input).replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell); cell = '';
      if (c !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
    } else cell += c;
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  row.push(cell); if (row.some(Boolean)) rows.push(row); return rows;
}
export function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(dayStart(value)) && dayKey(dayStart(value)) === value; }
export function range(input, now, maxDays = 90) {
  const from = input.from || dayKey(now - 6 * DAY), to = input.to || dayKey(now);
  if (!validDay(from) || !validDay(to) || from > to || to > dayKey(now) || dayStart(from) < dayStart(dayKey(now)) - (maxDays - 1) * DAY || (dayStart(to) - dayStart(from)) / DAY >= maxDays) throw new Error(`최근 ${maxDays}일 이내의 기간을 선택해 주세요.`);
  return { from, to };
}
export function validateCost(row) {
  if (!validDay(row.day) || !paidChannels.includes(row.channel) || !slug(row.campaign)) throw new Error('날짜·유료 채널·캠페인을 확인해 주세요.');
  for (const key of ['spend', 'impressions', 'clicks']) if (row[key] !== null && row[key] !== undefined && (!Number.isSafeInteger(row[key]) || row[key] < 0 || row[key] > 1000000000)) throw new Error('비용·노출·클릭은 0 이상의 정수로 입력해 주세요.');
  if (row.spend === null || row.spend === undefined) throw new Error('광고비를 입력해 주세요.');
  return { day: row.day, channel: row.channel, campaign: row.campaign, spend: row.spend, impressions: row.impressions ?? null, clicks: row.clicks ?? null };
}
export function suspicion(visits) {
  const sessions = new Set(visits.map(v => v.session)); const views = visits.reduce((n, v) => n + v.views, 0);
  const reasons = [];
  if (sessions.size >= 10) reasons.push('하루 10회 이상 방문');
  if (visits.some(v => v.burst >= 30)) reasons.push('5분 내 30회 이상 조회');
  if (visits.some(v => v.reloads >= 10)) reasons.push('같은 페이지 반복 조회');
  if (new Set(visits.filter(v => v.paidEntry).map(v => v.session)).size >= 5) reasons.push('유료 경로로 5회 이상 방문');
  if (visits.some(v => v.regular >= 10)) reasons.push('일정한 간격의 반복 활동');
  return { reasons, sessions: sessions.size, views };
}
const metric = () => ({ visitors: 0, newVisitors: 0, returningVisitors: 0, sessions: 0, views: 0, phoneVisitors: 0, phoneClicks: 0, phoneSessions: 0, estimates: 0, qualified: 0, contracts: 0, calls: 0, spend: null, impressions: null, adClicks: null, costIncomplete: false });
export function summarize(visits, conversions = [], costs = [], filters = {}, reviews = {}) {
  const accepted = visits.filter(v => (filters.includeExcluded || reviews[v.visitor]?.status !== 'excluded') && (!filters.channel || v.source.channel === filters.channel) && (!filters.campaign || v.source.campaign === filters.campaign) && (!filters.device || v.device === filters.device) && (!filters.kind || (filters.kind === 'paid') === paidChannels.includes(v.source.channel)));
  const groups = new Map(); const unique = new Map();
  function get(key, label) { if (!groups.has(key)) { groups.set(key, { key, label, ...metric() }); unique.set(key, { visitors: new Set(), newVisitors: new Set(), sessions: new Set(), phones: new Set(), phoneSessions: new Set(), expectedCosts: new Set(), actualCosts: new Set() }); } return groups.get(key); }
  get('total', '전체');
  for (const v of accepted) {
    const keys = [['total', '전체'], [`channel|${v.source.channel}`, channelLabels[v.source.channel]], [`day|${v.day}`, v.day], [`campaign|${v.source.channel}|${v.source.campaign}`, `${channelLabels[v.source.channel]} / ${v.source.campaign || '미지정'}`], [`page|${v.landing}`, pageLabels[v.landing] || v.landing], [`content|${v.source.content || '(none)'}`, v.source.content || '소재 미지정'], [`term|${v.source.term || '(none)'}`, v.source.term || '키워드 미지정']];
    for (const [key, label] of keys) {
      const r = get(key, label), u = unique.get(key); u.visitors.add(v.visitor); u.sessions.add(v.session);
      if (!v.returning) u.newVisitors.add(v.visitor);
      if (paidChannels.includes(v.source.channel)) u.expectedCosts.add(`${v.day}|${v.source.channel}|${v.source.campaign}`);
      r.views += v.views; r.phoneClicks += v.phoneClicks;
      if (v.phoneClicks) { u.phones.add(v.visitor); u.phoneSessions.add(v.session); }
    }
  }
  const matches = c => (!filters.channel || c.source.channel === filters.channel) && (!filters.campaign || c.source.campaign === filters.campaign) && (!filters.device || c.device === filters.device) && (!filters.kind || (filters.kind === 'paid') === paidChannels.includes(c.source.channel)) && (filters.includeExcluded || reviews[c.visitor]?.status !== 'excluded');
  for (const c of conversions.filter(matches)) {
    const keys = [['total', '전체'], [`channel|${c.source.channel}`, channelLabels[c.source.channel]], [`day|${c.day}`, c.day], [`campaign|${c.source.channel}|${c.source.campaign}`, `${channelLabels[c.source.channel]} / ${c.source.campaign || '미지정'}`], [`content|${c.source.content || '(none)'}`, c.source.content || '소재 미지정'], [`term|${c.source.term || '(none)'}`, c.source.term || '키워드 미지정']];
    if (c.landing) keys.push([`page|${c.landing}`, pageLabels[c.landing] || c.landing]);
    for (const [key, label] of keys) {
      const r = get(key, label); r.estimates += c.type === 'estimate' ? 1 : 0; r.calls += c.type === 'call' && c.connected !== false ? 1 : 0; r.qualified += c.qualified ? 1 : 0; r.contracts += c.contracted ? 1 : 0;
    }
  }
  for (const c of costs) {
    if (filters.device || (filters.channel && c.channel !== filters.channel) || (filters.campaign && c.campaign !== filters.campaign) || filters.kind === 'free') continue;
    for (const [key, label] of [['total', '전체'], [`channel|${c.channel}`, channelLabels[c.channel]], [`day|${c.day}`, c.day], [`campaign|${c.channel}|${c.campaign}`, `${channelLabels[c.channel]} / ${c.campaign}`]]) {
      const r = get(key, label); r.spend = (r.spend ?? 0) + c.spend;
      unique.get(key).actualCosts.add(`${c.day}|${c.channel}|${c.campaign}`);
      if (c.impressions !== null) r.impressions = (r.impressions ?? 0) + c.impressions;
      if (c.clicks !== null) r.adClicks = (r.adClicks ?? 0) + c.clicks;
    }
  }
  for (const [key, r] of groups) {
    const u = unique.get(key); Object.assign(r, { visitors: u.visitors.size, newVisitors: u.newVisitors.size, returningVisitors: u.visitors.size - u.newVisitors.size, sessions: u.sessions.size, phoneVisitors: u.phones.size, phoneSessions: u.phoneSessions.size });
    r.costIncomplete = [...u.expectedCosts].some(cost => !u.actualCosts.has(cost));
    r.phoneRate = r.sessions ? r.phoneSessions / r.sessions : 0;
    r.phoneCost = r.spend !== null && r.phoneVisitors ? r.spend / r.phoneVisitors : null;
    r.estimateCost = r.spend !== null && r.estimates ? r.spend / r.estimates : null;
    r.qualifiedCost = r.spend !== null && r.qualified ? r.spend / r.qualified : null;
    r.contractCost = r.spend !== null && r.contracts ? r.spend / r.contracts : null;
    if (r.costIncomplete) r.phoneCost = r.estimateCost = r.qualifiedCost = r.contractCost = null;
  }
  return { total: groups.get('total'), channels: [...groups.values()].filter(g => g.key.startsWith('channel|')), campaigns: [...groups.values()].filter(g => g.key.startsWith('campaign|')), days: [...groups.values()].filter(g => g.key.startsWith('day|')).sort((a, b) => a.label.localeCompare(b.label)), pages: [...groups.values()].filter(g => g.key.startsWith('page|')), contents: [...groups.values()].filter(g => g.key.startsWith('content|')), terms: [...groups.values()].filter(g => g.key.startsWith('term|')) };
}
