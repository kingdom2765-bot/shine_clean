import { analyticsConfig as config } from './analytics-config.js';
import { channelLabels, pageLabels, paidChannels, dayKey, DAY, buildLink, csv, parseCsv, validateCost, range } from './analytics-model.js';

const $ = selector => document.querySelector(selector);
const number = n => n === null || n === undefined ? '—' : new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 }).format(n);
const percent = n => `${(n * 100).toFixed(1)}%`;
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
function table(target, headers, rows, caption) {
  const host = $(target); host.replaceChildren();
  if (!rows.length) { host.append(el('p', '표시할 자료가 없습니다.', 'analytics-help')); return; }
  const t = el('table', undefined, 'analytics-table'); if (caption) t.append(el('caption', caption));
  const head = el('thead'), tr = el('tr'); for (const h of headers) { const th = el('th', h); th.scope = 'col'; tr.append(th); } head.append(tr);
  const body = el('tbody'); for (const row of rows) { const r = el('tr'); row.forEach(value => { const td = el('td'); if (value?.nodeType) td.append(value); else td.textContent = value ?? '—'; r.append(td); }); body.append(r); }
  t.append(head, body); host.append(t);
}
function download(name, rows) {
  const url = URL.createObjectURL(new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' })); const a = el('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const performanceHeaders = ['경로·캠페인', '방문 단위', '방문', '전화 클릭 방문', '클릭 횟수', '전화 클릭 전환율', '견적', '실제 전화', '유효 문의', '계약', '입력 광고비', '전화 클릭 방문당 비용', '견적당 비용', '유효 문의당 비용', '계약당 비용', '광고 노출', '광고 클릭'];
const performanceRow = r => [r.label, number(r.visitors), number(r.sessions), number(r.phoneVisitors), number(r.phoneClicks), percent(r.phoneRate), number(r.estimates), number(r.calls), number(r.qualified), number(r.contracts), number(r.spend) + (r.costIncomplete && r.spend !== null ? ' (일부 입력)' : ''), number(r.phoneCost), number(r.estimateCost), number(r.qualifiedCost), number(r.contractCost), number(r.impressions), number(r.adClicks)];

export function createAnalyticsManager() {
  let user, generation = 0, report, busy = false, reportRequest = 0, generatedLink = '';
  async function api(path, values = {}) {
    if (!user) throw new Error('관리자 로그인을 확인해 주세요.');
    if (!config.endpoint) throw new Error('방문 분석 서버 연결이 필요합니다. ANALYTICS.md의 배포 절차를 확인해 주세요.');
    const activeUser = user, current = generation;
    const token = await activeUser.getIdToken();
    const response = await fetch(`${config.endpoint.replace(/\/$/, '')}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(values) });
    if (current !== generation || user !== activeUser) throw new Error('로그인 상태가 변경되었습니다.');
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '서버에 연결하지 못했습니다.'); return data;
  }
  const filters = () => ({ from: $('#analytics-from').value, to: $('#analytics-to').value, channel: $('#analytics-channel').value, campaign: $('#analytics-campaign').value.trim(), kind: $('#analytics-kind').value, device: $('#analytics-device').value, includeExcluded: $('#analytics-include').checked });
  function period() {
    const value = $('#analytics-period').value, now = Date.now(); if (value === 'custom') return;
    $('#analytics-to').value = dayKey(value === 'yesterday' ? now - DAY : now);
    $('#analytics-from').value = dayKey(value === 'today' ? now : value === 'yesterday' ? now - DAY : now - (Number(value) - 1) * DAY);
  }
  function selectOptions(id, paidOnly = false, direct = false) {
    const select = $(id);
    for (const [key, label] of Object.entries(channelLabels)) if ((!paidOnly || paidChannels.includes(key)) && (direct || key !== 'direct:none')) { const option = el('option', label); option.value = key; select.append(option); }
  }
  selectOptions('#analytics-channel', false, true); selectOptions('#link-channel'); selectOptions('#cost-channel', true); selectOptions('#call-channel', false, true); $('#call-channel').value = 'direct:none';
  period(); $('#cost-day').value = $('#call-day').value = dayKey(Date.now()); $('#call-id').value = crypto.randomUUID();
  $('#history-from').value = dayKey(Date.now() - 364 * DAY); $('#history-to').value = dayKey(Date.now() - DAY); $('#link-url').value = config.siteUrl;
  try { $('#analytics-internal').checked = JSON.parse(localStorage.getItem('shine.analytics.internal')) === true; } catch { /* unavailable */ }
  $('#analytics-internal').addEventListener('change', () => { try { localStorage.setItem('shine.analytics.internal', JSON.stringify($('#analytics-internal').checked)); } catch { $('#analytics-connection').textContent = '브라우저 저장소를 사용할 수 없어 내부 방문 설정을 저장하지 못했습니다.'; } });
  $('#analytics-period').addEventListener('change', period);
  for (const id of ['#analytics-from', '#analytics-to']) $(id).addEventListener('change', () => { $('#analytics-period').value = 'custom'; });
  function render(data) {
    report = data; const t = data.total;
    const cards = [['방문 단위(추정)', 'visitors'], ['방문 횟수', 'sessions'], ['전화 클릭 방문', 'phoneVisitors'], ['전화 클릭 횟수', 'phoneClicks'], ['견적 접수', 'estimates'], ['실제 전화 상담', 'calls'], ['유효 문의', 'qualified'], ['계약 완료', 'contracts'], ['입력 광고비 (원)', 'spend']];
    $('#analytics-stats').replaceChildren(...cards.map(([label, key]) => { const card = el('div', undefined, 'admin-stat'); card.append(el('span', label), el('strong', number(t[key]))); if (data.previous) { const before = data.previous[key]; card.append(el('small', before === null || before === undefined || t[key] === null ? '이전 기간 비교 없음' : `이전 기간 대비 ${t[key] - before >= 0 ? '+' : ''}${number(t[key] - before)}`)); } return card; }));
    $('#analytics-empty').hidden = t.visitors > 0;
    const max = Math.max(1, ...data.days.map(d => d.visitors)); $('#analytics-trend').replaceChildren(...data.days.map(d => {
      const row = el('div', undefined, 'analytics-trend-row'), bars = el('div', undefined, 'analytics-trend-bars');
      for (const [key, className] of [['visitors', 'analytics-trend-bar'], ['phoneVisitors', 'analytics-trend-bar phone']]) { const bar = el('span', undefined, className); bar.style.width = `${d[key] / max * 100}%`; bar.title = `${d.label} ${key === 'visitors' ? '방문 단위' : '전화 클릭 방문'} ${d[key]}`; bars.append(bar); }
      row.append(el('span', d.label), bars, el('span', `방문 ${d.visitors} · 전화 ${d.phoneVisitors}`)); return row;
    }));
    table('#analytics-channels', performanceHeaders, data.channels.map(performanceRow)); table('#analytics-campaigns', performanceHeaders, data.campaigns.map(performanceRow));
    for (const [id, rows, name] of [['#analytics-pages', data.pages, '첫 방문 페이지'], ['#analytics-contents', data.contents, '소재'], ['#analytics-terms', data.terms, '키워드 코드']]) table(id, [name, '방문 단위', '방문', '조회', '전화 클릭 방문', '견적', '유효 문의', '계약'], rows.map(r => [r.label, number(r.visitors), number(r.sessions), number(r.views), number(r.phoneVisitors), number(r.estimates), number(r.qualified), number(r.contracts)]));
    const labels = { header: '상단·모바일 메뉴', footer: '하단', dialog: '팝업', body: '본문' }; $('#analytics-positions').textContent = (Object.entries(data.positions).map(([key, count]) => `${labels[key] || key}: ${number(count)}회`).join(' · ') || '전화 클릭 기록이 없습니다.') + (Object.keys(data.pageClicks || {}).length ? ' / 페이지: ' + Object.entries(data.pageClicks).map(([page, count]) => `${pageLabels[page] || page} ${count}회`).join(' · ') : '');
    $('#analytics-suspicious').replaceChildren(...data.suspicious.map(flag => {
      const card = el('article', undefined, 'analytics-flag'); card.append(el('strong', `${flag.day} · 방문 ID ${flag.visitor.slice(0, 12)}…`), el('p', `${flag.reasons.join(' / ') || '관리자 검토 기록'} · 방문 ${flag.sessions}회 · 조회 ${flag.views}회 · 전화 클릭 ${flag.phoneClicks}회`), el('p', `상태: ${{ pending: '검토 전', normal: '정상', excluded: '통계 제외' }[flag.status]} · 경로: ${flag.channels.map(c => channelLabels[c]).join(', ')}`));
      const time = value => new Intl.DateTimeFormat('ko-KR', { timeStyle: 'medium', timeZone: 'Asia/Seoul' }).format(value);
      card.append(el('p', `최초 방문 ${time(flag.firstAt)} · 최근 활동 ${time(flag.lastAt)}`));
      const note = el('textarea'); note.maxLength = 1000; note.value = flag.note; note.setAttribute('aria-label', '방문 검토 메모'); card.append(note);
      const actions = el('div', undefined, 'analytics-actions');
      for (const [status, label] of [['normal', '정상으로 표시'], ['excluded', '통계에서 제외'], ['pending', '검토 전으로 복원']]) { const button = el('button', label, 'admin-button secondary'); button.type = 'button'; button.addEventListener('click', async () => { button.disabled = true; try { await api('/review', { visitor: flag.visitor, status, note: note.value }); await load(); } catch (error) { $('#analytics-connection').textContent = error.message; } finally { button.disabled = false; } }); actions.append(button); } card.append(actions); return card;
    }));
    if (!data.suspicious.length) $('#analytics-suspicious').append(el('p', '탐지된 반복 방문·의심 활동이 없습니다.'));
    table('#analytics-costs', ['날짜', '채널', '캠페인', '광고비', '노출', '클릭'], data.costRows.map(c => [c.day, channelLabels[c.channel], c.campaign, number(c.spend), number(c.impressions), number(c.clicks)]));
    table('#analytics-calls', ['날짜', '출처', '캠페인', '상태·근거', '수정'], data.conversions.map(c => { const edit = el('button', c.evidence === 'manual' ? '불러오기' : '서비스 연동', 'admin-text-button'); edit.type = 'button'; edit.disabled = c.evidence !== 'manual'; edit.addEventListener('click', () => { $('#call-id').value = c.id.replace(/^call_/, ''); $('#call-day').value = c.day; $('#call-channel').value = c.source.channel; $('#call-campaign').value = c.source.campaign; $('#call-status').value = c.status; $('#call-note').value = c.note || ''; $('#call-id').focus(); }); const status = { new: '통화 확인', qualified: '유효 문의', contracted: '계약 완료', closed: '종료' }[c.status] || (c.connected ? '통화 연결' : '연결 안 됨'); return [c.day, channelLabels[c.source.channel], c.source.campaign || '미지정', `${status} · ${c.evidence === 'manual' ? '수동 기록' : '서명된 서비스 기록'}`, edit]; }));
    $('#analytics-export').disabled = $('#analytics-conversions-export').disabled = false;
    const last = data.status?.lastCollectedAt; $('#analytics-connection').textContent = `조회 완료 · ${data.from} ~ ${data.to} · 수집 시작: ${data.status?.firstCollectedAt ? dayKey(data.status.firstCollectedAt) : '기록 없음'} · 최근 방문 수집: ${last ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(last) : '수집 기록 없음'}`;
    $('#analytics-strategy').textContent = t.visitors < 100 ? '표본이 적습니다. 2~4주간 유입과 실제 문의 품질을 함께 확인한 뒤 예산을 조정하세요.' : '전화 클릭 비용과 견적·계약 비용을 함께 비교하세요. 방문이 많고 문의가 적으면 키워드·광고 문구·연결 페이지를 먼저 점검하세요.';
  }
  async function load() {
    const current = generation, request = ++reportRequest; busy = true; $('#analytics-refresh').disabled = true;
    // Do not leave exportable results from a previous filter after a failed query.
    report = undefined; $('#analytics-export').disabled = $('#analytics-conversions-export').disabled = true;
    for (const id of ['#analytics-stats', '#analytics-trend', '#analytics-channels', '#analytics-campaigns', '#analytics-pages', '#analytics-contents', '#analytics-terms', '#analytics-suspicious', '#analytics-calls', '#analytics-costs']) $(id).replaceChildren();
    $('#analytics-positions').textContent = ''; $('#analytics-empty').hidden = true;
    $('#analytics-connection').textContent = '통계를 불러오고 있습니다…';
    try { const values = filters(); range(values, Date.now()); const data = await api('/report', values); if (current === generation && request === reportRequest) render(data); }
    catch (error) { if (current === generation && request === reportRequest) $('#analytics-connection').textContent = error.message; }
    finally { if (current === generation && request === reportRequest) { busy = false; $('#analytics-refresh').disabled = false; } }
  }
  $('#analytics-filter-form').addEventListener('submit', event => { event.preventDefault(); if (!busy) void load(); });
  $('#analytics-export').addEventListener('click', () => { if (report) download(`shine-analytics-${report.from}-${report.to}.csv`, [performanceHeaders, ...report.channels.map(performanceRow), ...report.campaigns.map(performanceRow)]); });
  $('#analytics-conversions-export').addEventListener('click', () => { if (report) download(`shine-conversions-${report.from}.csv`, [['from', 'to', 'channel', 'campaign', 'estimates', 'actual_calls', 'qualified', 'contracts'], ...report.campaigns.map(r => [report.from, report.to, r.key.split('|')[1], r.key.split('|')[2], r.estimates, r.calls, r.qualified, r.contracts])]); });
  $('#analytics-link-form').addEventListener('submit', event => { event.preventDefault(); try { const url = new URL($('#link-url').value), site = new URL(config.siteUrl); if (url.origin !== site.origin || !url.pathname.startsWith(site.pathname)) throw new Error('현재 홈페이지 안의 연결 주소를 입력해 주세요.'); generatedLink = buildLink(url, { channel: $('#link-channel').value, campaign: $('#link-campaign').value.trim(), content: $('#link-content').value.trim(), term: $('#link-term').value.trim() }); $('#link-result').textContent = generatedLink; $('#link-copy').disabled = false; } catch (error) { generatedLink = ''; $('#link-copy').disabled = true; $('#link-result').textContent = error.message; } });
  $('#link-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(generatedLink); $('#link-result').textContent = `복사했습니다. ${generatedLink}`; } catch { $('#link-result').textContent = `주소를 선택해 복사해 주세요: ${generatedLink}`; } });
  async function saveCosts(rows) { const result = await api('/costs', { rows }); $('#cost-status').textContent = `${result.saved}행을 저장했습니다.`; await load(); }
  function formAction(id, feedback, handler) { $(id).addEventListener('submit', async event => { event.preventDefault(); const button = $(id).querySelector('button'); if (button.disabled) return; const current = generation; button.disabled = true; $(feedback).textContent = '저장 중입니다…'; try { await handler(); } catch (error) { if (current === generation) $(feedback).textContent = error.message; } finally { button.disabled = false; } }); }
  formAction('#analytics-cost-form', '#cost-status', async () => { const value = id => $(id).value === '' ? null : Number($(id).value); await saveCosts([validateCost({ day: $('#cost-day').value, channel: $('#cost-channel').value, campaign: $('#cost-campaign').value.trim(), spend: value('#cost-spend'), impressions: value('#cost-impressions'), clicks: value('#cost-clicks') })]); });
  $('#cost-template').addEventListener('click', () => download('shine-ad-cost-template.csv', [['day', 'channel', 'campaign', 'spend', 'impressions', 'clicks'], [dayKey(Date.now()), 'naver:cpc', 'gangnam-cleaning', 10000, '', '']]));
  $('#cost-file').addEventListener('change', async event => { const file = event.target.files[0]; if (!file) return; event.target.disabled = true; try { if (file.size > 1000000) throw new Error('CSV는 1MB 이내로 선택해 주세요.'); const [headers, ...rows] = parseCsv(await file.text()); if (headers?.join(',') !== 'day,channel,campaign,spend,impressions,clicks' || !rows.length || rows.length > 300) throw new Error('제공된 양식으로 1~300행을 입력해 주세요.'); const parsed = rows.map((r, i) => { if (r.length !== 6) throw new Error(`${i + 2}행의 열 수를 확인해 주세요.`); try { return validateCost({ day: r[0], channel: r[1], campaign: r[2], spend: r[3] === '' ? null : Number(r[3]), impressions: r[4] === '' ? null : Number(r[4]), clicks: r[5] === '' ? null : Number(r[5]) }); } catch (error) { throw new Error(`${i + 2}행: ${error.message}`); } }); await saveCosts(parsed); } catch (error) { $('#cost-status').textContent = error.message; } finally { event.target.value = ''; event.target.disabled = false; } });
  formAction('#analytics-call-form', '#call-feedback', async () => { await api('/call', { id: $('#call-id').value.trim(), day: $('#call-day').value, status: $('#call-status').value, source: { channel: $('#call-channel').value, campaign: $('#call-campaign').value.trim(), content: '', term: '' }, note: $('#call-note').value }); $('#call-feedback').textContent = '실제 전화 상담 기록을 저장했습니다.'; await load(); });
  $('#call-new').addEventListener('click', () => { $('#analytics-call-form').reset(); $('#call-id').value = crypto.randomUUID(); $('#call-day').value = dayKey(Date.now()); $('#call-channel').value = 'direct:none'; });
  formAction('#analytics-history-form', '#history-status', async () => { const data = await api('/history', { from: $('#history-from').value, to: $('#history-to').value }); table('#analytics-history', ['날짜', '방문 단위·일', '방문', '전화 클릭 방문·일', '견적', '유효 문의', '계약'], data.rows.map(r => [r.day, number(r.total.visitors), number(r.total.sessions), number(r.total.phoneVisitors), number(r.total.estimates), number(r.total.qualified), number(r.total.contracts)])); $('#history-status').textContent = `${data.rows.length}일의 익명 집계를 불러왔습니다.`; });
  return {
    async login(nextUser) { user = nextUser; generation++; $('#admin-notice').textContent = '방문·광고 분석 관리자로 로그인했습니다.'; if (!config.endpoint) { $('#analytics-connection').textContent = '분석 서버 미연결 · 추적 링크 생성은 이용할 수 있습니다. 서버 배포 후 analytics-config.js의 endpoint와 enabled 설정이 필요합니다.'; $('#analytics-integrations').textContent = '방문 수집·실제 통화 연동·광고 플랫폼 API: 연결 전'; return; } await load(); try { const status = await api('/integrations'); $('#analytics-integrations').textContent = `방문 수집: ${config.enabled ? '활성' : '중지'} · 광고비: 수동 입력·CSV · 실제 통화: 수동 기록·서명 웹훅 · 광고 플랫폼 API: ${status.platformApis === 'not-connected' ? '미연결' : '연결'} · 전환 자료: 관리용 CSV 내보내기`; } catch (error) { $('#analytics-integrations').textContent = error.message; } },
    clear() { generation++; reportRequest++; user = undefined; report = undefined; busy = false; $('#analytics-refresh').disabled = false; for (const id of ['#analytics-stats', '#analytics-trend', '#analytics-channels', '#analytics-campaigns', '#analytics-pages', '#analytics-contents', '#analytics-terms', '#analytics-suspicious', '#analytics-calls', '#analytics-costs', '#analytics-history']) $(id).replaceChildren(); for (const id of ['#analytics-connection', '#analytics-integrations', '#analytics-positions', '#analytics-strategy', '#call-feedback', '#history-status', '#cost-status']) $(id).textContent = ''; $('#analytics-export').disabled = $('#analytics-conversions-export').disabled = true; $('#call-note').value = ''; },
  };
}
