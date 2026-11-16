# 병원청소 관리정보 운영 안내

현재 구현은 기존 정적 사이트와 npm 빌드를 사용합니다. 별도 서버·회원·댓글·유료 DB를 추가하지 않았습니다. 기존 견적관리 화면은 그대로 사용합니다.

## 지금 확인할 곳

- 개발 서버: `npm run dev`
- 목록: http://127.0.0.1:5173/info/
- 게시글 원본: `content/info/` (현재 검수·발행 완료 170건)
- 전달받은 통합 원문과 변환 기록: `content/imports/`
- SEO 검증 결과: `npm run info:audit` → `.local/info-audit.json`

사용자의 전체 검수 완료 및 사이트맵 반영 요청에 따라 170건을 발행 상태로 변경했습니다. 초기 발행일은 2026-11-12였으며, 이후 사용자의 명시적인 요청으로 170건 모두 2026-10-01~2026-11-12 사이에 무작위 배정한 표시 날짜를 사용합니다. 검수일은 실제 검수 날짜로 유지합니다. 검수 안내와 ‘검수 중’ 표시는 제거했습니다. 이후 새 초안은 개발 서버에서만 미리보기와 `noindex, nofollow`를 적용합니다. `npm run build`와 배포 패키지는 `published` 글만 생성하므로 초안이 공개되지 않습니다. `info/`는 생성물이며 직접 편집하지 않습니다.

최초 10건은 사용자 동의에 따라 SEO 제목을 H1로 사용했습니다. 최초 가져오기 시 누락 표 등 검수 항목을 변환 로그에 보존했고, 이후 전체 검수 완료를 확인하여 승인·발행했습니다.

## 다음 원고를 한 번에 가져오기

1. 콘텐츠 작성자가 준 통합 원고를 한 파일로 저장합니다. `.md` 또는 UTF-8 `.txt`를 사용할 수 있습니다.
2. 프로젝트 터미널에서 아래 명령을 실행합니다.

```powershell
npm run info:import -- "C:\원고\게시글10개.md"
npm run info:validate
```

표준 입력은 `#### 1. 글 제목`부터 시작합니다. 한 글마다 아래 관리정보 여섯 가지, `본문`, `관련 내부 링크`가 필요합니다. 관리정보 이름은 굵게 표시해도 됩니다.

```markdown
#### 1. 방문자가 읽을 글 제목
- 주요 검색어: 병원청소 전문업체
- 보조 검색어: 피부과 청소, 청소업체 선정
- SEO 제목: 검색 결과와 브라우저 탭에 사용할 제목
- 메타 설명: 검색 결과용 설명
- URL 제안: /info/gangnam-dermatology-provider-checklist
- 적용 코드: S1 · G1 · SK4

본문
실제 원고 문단

관련 내부 링크
- 지역 안내: https://www.wonnaecare.co.kr/area/gangnam.html
```

제목 헤더가 없는 이번 형식은 `--provisional-titles`를 명시해야 가져옵니다. 자동으로 공개하지 않습니다. 글 수·중복 ID·중복 URL·필수정보·적용 코드·관련 링크가 잘못되면 오류를 내고 가져오기를 중지합니다. 기존 파일을 덮어쓰지 않습니다.

50건 원고나 다음 묶음은 글 수와 새 ID 접두사를 지정합니다. **대량 발행을 승인하는 명령은 아닙니다.**

```powershell
npm run info:import -- "C:\원고\다음원고50개.md" --count 50 --id-prefix batch02
```

제목·설명·본문이 완전히 중복되면 오류입니다. 서로 비슷한 주장·내용의 실질적 차이는 사람이 검수해야 합니다.

## 저장되는 메타데이터

글마다 YAML Front Matter와 Markdown 본문을 저장합니다. 실제 변환된 10번의 주요 필드는 아래와 같습니다.

```yaml
id: wn-010
status: draft
slug: seocho-korean-medicine-waste-contract
title: 서초구 한의원 병원청소 업체 계약 | 의료폐기물 책임 구분
seo_title: 서초구 한의원 병원청소 업체 계약 | 의료폐기물 책임 구분
meta_description: 사용한 침 같은 의료폐기물은 일반 청소업체가 처리하는 대상이 아닙니다. 한의원이 청소 계약서에 명시해야 할 책임 구분 항목을 정리했습니다.
storyline: S10
region: seocho
specialty: korean-medicine
search_intent: 병원청소 업체
primary_keyword: 병원청소 업체
region_feature: SC4
specialty_feature: KM5
published_at: null
updated_at: null
related_links:
  - /area/seocho.html
  - /clinic/korean-medicine.html
  - /guide/faq.html
```

`title`은 H1, `seo_title`은 HTML title, `meta_description`은 description 태그에 각각 사용합니다. 코드·검색어·관리정보 라벨은 방문자 화면에 출력하지 않습니다. `summary`는 목록용 요약이며 글별로 편집할 수 있습니다. `region`·`specialty`는 향후 일반 글에 한해 `null`을 사용할 수 있고 해당 특징 코드도 비워 둡니다.

지역: G 강남 / SC 서초 / SP 송파 / GD 강동. 진료과: SK 피부과 / PS 성형외과 / DT 치과 / OB 산부인과 / KM 한의원. 각 특징 번호는 1~5입니다. S1~S10 스토리라인은 검색의도 8종과 별도로 관리합니다.

## 검수·승인·공개 순서

1. `content/info/`에서 임시 제목을 확정하고, 원고의 누락 자료·운영방식 표현을 검수합니다. 표를 보완하거나 표 참조 문장을 실제 내용에 맞게 고칩니다.
2. 아래 검사를 실행하고 개발 서버에서 PC·모바일을 확인합니다.

```powershell
npm run info:validate
npm run info:audit
npm test
```

3. **사용자가 원고 검수와 게시를 승인한 이후에만** 대상 ID를 명시하여 승인 상태로 변경합니다. `--reviewed`는 제목·원고·사실관계·경고를 직접 검수했다는 의미입니다. 승인 명령은 경고를 해제하고 실제 한국 날짜를 기록합니다.

```powershell
npm run info:approve -- --ids wn-001,wn-002 --reviewed
npm run info:publish -- --ids wn-001,wn-002 --reviewed
```

첫 발행일은 실행 당일의 한국 날짜입니다. 과거·미래 날짜로 첫 발행일을 만들지 않습니다. 승인되지 않은 글의 publish는 차단됩니다. 10건 모두 승인할 때에는 wn-001부터 wn-010까지 ID를 전부 명시합니다.

4. `npm run build`로 공개용 HTML·관련 글·사이트맵을 생성합니다. 발행하지 않은 상세 HTML은 이전 미리보기에서 남아 있더라도 제거합니다.
5. `npm run package`로 `_site/`를 만들고 기존 정적 호스팅 배포 절차를 사용합니다. 현재 프로젝트의 배포 대상은 `CNAME`과 `site.config.json`의 `www.wonnaecare.co.kr`입니다. **2026-11-12 실서비스 배포를 완료했습니다.** 배포 전에는 현재 배포본과 콘텐츠 파일을 백업하세요.
6. 배포 후 `/info/`, 상세 URL, `/sitemap.xml`을 확인합니다. Search Console·Bing Webmaster Tools 계정에서 사이트맵의 수집 상태를 확인합니다. 이 저장소에서 검색 계정 제출이나 색인 상태 확인은 자동 수행하지 않습니다.

현재 기존 29개 사이트맵 URL을 보존했습니다. 게시글 170개와 목록 15개를 더해 **214개**입니다. 색인 수나 검색 순위를 보장하는 수치는 아닙니다. 슬래시 없는 URL은 개발 서버에서 308로 정규 경로에 연결하며 GitHub Pages에서는 폴더의 index.html과 자기 canonical을 사용합니다.

게시를 되돌리려면 해당 글의 `status`를 `draft`로 바꾸고 `npm run package` 후 다시 배포합니다. 관련 글·목록·사이트맵에서 함께 빠집니다. 완전한 버전 복원이 필요하면 콘텐츠와 배포본의 이전 백업을 같이 복원합니다.

## 구현 파일과 영향

- `scripts/info-content.mjs`: 원고 분리, YAML, 분류 매핑, Markdown 보안 렌더링, 검증
- `scripts/info-cli.mjs`: 일괄 가져오기·검수·승인·발행 상태 관리
- `scripts/info-build.mjs`: 목록·독립 상세·관련 글·SEO 생성
- `info.js`, `info.css`: 제목/요약 검색, 복합 필터, 12건 페이지 이동, 모바일 화면
- `scripts/build.mjs`, `serve.mjs`, `package-site.mjs`, `seo.mjs`: 기존 빌드·미리보기·사이트맵·배포 패키지 연결
- `components/header.html`: PC·모바일 `청소 정보` 하위 메뉴 추가
- 기존 홈·지역·진료과 HTML: 빌드 과정에서 진입 링크와 해당 글 2~3건을 자동 연결
- `tests/info.test.mjs`: 가져오기·보안·초안 비공개·필터·페이지 이동·추적 회귀 검사

기존 분석 수집기를 재사용합니다. 게시판의 견적 링크 클릭은 `estimate_link` 이벤트로 보내고 `estimateLinkClicks`, `estimateLinkPages`로 전화 클릭·페이지 조회와 구분합니다. 기존 관리자 보고서 API 응답에도 두 집계를 포함합니다. **이 측정 확장을 실서비스에서 사용하려면 정적 사이트와 함께 기존 analytics Functions 변경을 배포해야 합니다.** 새 분석 업체나 방문자 추적 도구는 추가하지 않았습니다.

## 현재 배포 기록

- 도메인: https://www.wonnaecare.co.kr/
- GitHub Pages 게시 브랜치: `codex/site-release`, 경로 `/`
- 배포 커밋: `ae8049273d525bda39b9edb876bf3bed662e7999`
- `_site/`의 공개 파일만 게시했습니다. 기존 `main` 브랜치는 보존했습니다.
- 사이트맵 214개 주소 모두 HTTP 200, 자기 canonical, noindex 없음 확인. 원고 파일 주소는 404입니다.
- 배포 전 설정: `.local/pages-before-release.json`, 검증 기록: `.local/live-release-verification.json`
- 다음 배포: `npm run package` 후 `_site` 저장소에서 변경을 커밋하고 `git push origin codex/site-release`를 실행합니다. GitHub Pages 빌드와 정식 URL을 확인하세요.
- 이전 서비스로 긴급 복귀할 때는 Pages 게시 원본을 기존 `main` 및 `/`로 복원합니다.
- 기존 분석 설정은 비활성 상태를 유지했습니다. 분석 Functions 배포나 수집 활성화는 이번 정적 홈페이지 배포에 포함하지 않았습니다.

### 전체 글 날짜 조정

사용자의 요청에 따라 170건의 표시 날짜 및 Article datePublished를 2026-10-01~2026-11-12의 43일에 무작위 배정했습니다. 날짜별 3~4건이며 목록도 변경 날짜순으로 정렬합니다. 실제 과거 작성 이력을 확인한 날짜는 아닙니다. 변경 전 파일은 `backups/article-dates-2026-11-12-1794487673919/`, 날짜 매핑은 `.local/article-date-changes.json`에 보관했습니다. 배포 커밋은 `95fe18137e29436c0792d90af183641b8efa3a09`입니다.

### 전화상담 번호 변경

2026-11-12 사용자의 요청으로 전 페이지 상담번호를 010-8781-3412로 변경했습니다. 전화 링크는 `tel:01087813412`, 구조화 데이터는 `+821087813412`를 사용합니다. 모바일 767px 이하에서는 번호 텍스트를 숨기고 전화상담 레이블로 연결합니다. 배포 커밋: `4f234825089faa1c2da03bfb8af7d4d46ce0b3cc`.
