# OAI-SearchBot 접속 기록

상태: 코드 준비 완료. Cloudflare 계정·도메인 연결 및 실제 배포는 미완료이며 아직 운영 기록을 수집하지 않습니다.

현재 GitHub Pages를 원본 서버로 유지하고 Cloudflare Worker Route에서 요청을 그대로 전달합니다. OAI-SearchBot User-Agent 요청의 시각(UTC), 경로, 메서드, User-Agent, Cloudflare가 제공한 IP, 응답 상태, 처리 시간, Ray ID만 별도 JSON 로그로 남깁니다. 쿼리 문자열·쿠키·인증 헤더·본문은 별도 로그에 담지 않습니다. 일반 방문자의 별도 접속 기록은 만들지 않으며 Worker 기본 invocation 로그도 끕니다. Cloudflare 플랫폼 자체의 운영 기록 정책은 별도로 적용됩니다.

## 계정 연결 후 적용

1. 가비아의 현재 네임서버와 DNS 레코드 전체를 백업합니다. 웹사이트·메일(MX, SPF, DKIM, DMARC)·인증 레코드를 확인합니다.
2. Cloudflare 계정에서 `wonnaecare.co.kr` 영역을 준비하고 기존 DNS 레코드를 대조합니다. 현재 유료 플랜 가입 없이 가능한 구성·로그 보관기간·무료 한도를 계정 화면에서 확인합니다. 한도 초과 시 사이트 요청 실패 가능성도 확인합니다.
3. Cloudflare가 지정한 네임서버를 확인한 뒤 가비아에서 전환합니다. `www`는 기존 GitHub Pages 원본을 가리키되 프록시를 활성화합니다. 원본 주소를 Worker 자신으로 바꾸지 않습니다. DNSSEC가 활성화되어 있다면 DS 레코드 전환 절차도 확인합니다.
4. GitHub Pages 도메인·인증서 상태를 확인하고 Cloudflare SSL/TLS는 Full (strict)을 사용합니다. OAI-SearchBot이 AI 봇 차단·챌린지 규칙에 막히지 않는지 확인합니다. 방화벽에서 차단된 요청은 이 Worker까지 도달하지 않을 수 있습니다.
5. Cloudflare 공식 Wrangler를 사용해 이 폴더의 `wrangler.jsonc`로 배포합니다. 예: `npx wrangler deploy --config deployment/crawler-logs/wrangler.jsonc`. 기존 Worker Route 충돌 여부를 먼저 확인하고 기존 라우트를 덮어쓰지 않습니다. 실제 계정과 도메인 검증 전에 실행하지 않습니다.
6. 홈페이지·하위 페이지·robots.txt·사이트맵·견적 접수를 검증합니다. Worker Observability의 Logs에서 `oai_searchbot_request`를 검색합니다. 합성 User-Agent 테스트는 실시 시각과 Ray ID를 따로 남겨 실제 검색봇 방문과 구분합니다.
7. User-Agent는 위조될 수 있습니다. 기록된 IP가 방문 시점의 OpenAI 공식 OAI-SearchBot CIDR 목록에 포함되는지 대조한 뒤 실제 방문으로 판정합니다. `identityVerified: false`는 자동 검증하지 않았다는 뜻입니다. 과거 방문 기록은 복원하지 않습니다.

계정 접근 권한이 있는 운영자만 로그를 열람합니다. Cloudflare 계정의 보관기간이 지난 기록은 없어질 수 있으므로 장기 보관이 필요하면 별도 저장 방식을 결정합니다. 무료·무제한·영구 보관을 보장하지 않습니다. 계정 설정 전에는 로그 보관기간을 확정하지 않습니다.

## 확인과 복구

로컬 검증: `node --test deployment/crawler-logs/worker.test.mjs`

Worker 도입 후 문제가 생기면 이 Worker Route를 해제하여 기존 원본 응답으로 복귀합니다. Cloudflare 자체 전환 문제가 있으면 백업한 가비아 네임서버·DNS와 DNSSEC 설정으로 복구합니다. DNS 전파에는 시간이 걸릴 수 있습니다.

공식 문서: [Worker Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Workers 요금·한도](https://developers.cloudflare.com/workers/platform/pricing/), [OAI-SearchBot IP 목록](https://openai.com/searchbot.json).
