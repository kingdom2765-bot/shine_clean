import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { analyticsConfig } from '../analytics-config.js';

// Read-only checks: no visits, test estimates, costs or other records are created.
export async function verifyAnalytics(config, siteUrl, fetchImpl = fetch) {
  if (!config.enabled) throw new Error('방문 분석 수집이 비활성화되어 있습니다.');
  if (!config.endpoint) throw new Error('방문 분석 서버 주소가 없습니다.');
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('분석 서버에는 인증정보·쿼리 없는 HTTPS 주소를 사용해 주세요.');
  if (new URL(config.siteUrl).href !== new URL(siteUrl).href) throw new Error('분석용 홈페이지 주소와 site.config.json의 배포 주소가 다릅니다.');
  const origin = new URL(siteUrl).origin;
  const base = endpoint.href.replace(/\/$/, '');
  async function request(path, options) {
    try { return await fetchImpl(`${base}${path}`, { ...options, headers: { Origin: origin, ...options.headers }, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error('분석 서버에 연결하지 못했습니다. 서버 배포와 endpoint를 확인해 주세요.'); }
  }
  const health = await request('/health', { method: 'GET' });
  if (!health.ok) throw new Error(`분석 서버 상태 확인 실패(HTTP ${health.status}). 서버 배포와 허용 도메인을 확인해 주세요.`);
  if (health.headers.get('access-control-allow-origin') !== origin) throw new Error('분석 서버가 현재 홈페이지 도메인을 허용하지 않습니다.');
  let status;
  try { status = await health.json(); } catch { throw new Error('분석 서버 상태 응답이 올바른 JSON이 아닙니다.'); }
  if (status.service !== 'shine-analytics' || status.ready !== true) throw new Error('분석 서버와 데이터베이스의 준비 상태를 확인하지 못했습니다.');
  const preflight = await request('/collect', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
  const methods = (preflight.headers.get('access-control-allow-methods') || '').toUpperCase().split(',').map(v => v.trim());
  const headers = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(v => v.trim());
  if (preflight.status !== 204 || preflight.headers.get('access-control-allow-origin') !== origin || !methods.includes('POST') || !headers.includes('content-type') || !headers.includes('authorization')) throw new Error('분석 수집·관리자 API의 브라우저 교차 출처 요청(CORS) 설정을 확인해 주세요.');
  const report = await request('/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (report.status !== 401) throw new Error('관리자 통계 API가 비로그인 요청을 차단하는지 확인해 주세요.');
  return { endpoint: base, origin, serverReady: true, cors: true, adminProtected: true };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const site = JSON.parse(await readFile(new URL('../site.config.json', import.meta.url), 'utf8'));
    console.log(JSON.stringify(await verifyAnalytics(analyticsConfig, process.env.SITE_URL || site.siteUrl), null, 2));
    console.log('서버 연결 점검 완료. 실제 방문 저장·관리자 조회의 최종 확인은 별도로 필요합니다.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
