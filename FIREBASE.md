# 무료견적 Firebase 연결

## 연결 대상

- 프로젝트: `trading-dashboard-480711`
- DB: Cloud Firestore Native, `(default)`, 서울 `asia-northeast3`
- 컬렉션: `estimate_requests`
- 확인: https://console.firebase.google.com/project/trading-dashboard-480711/firestore

웹 설정은 `firebase-client.js`에서 관리합니다. Firebase 공식 CDN의 모듈을 접수 시 불러오므로 인터넷 연결이 필요합니다. 서비스 계정 키를 브라우저 코드에 넣지 않습니다.

## 접수 흐름

폼 검증 → 신청 내용 확인 → 접수 버튼 → Firestore 저장 확인 → 접수번호 표시 순서입니다. 저장 중 중복 클릭을 막고, 실패 시 완료로 표시하지 않습니다. 전화번호는 숫자만 저장합니다. Firebase Analytics는 사용하지 않습니다.

문서 ID와 접수번호는 같은 UUID입니다. 저장 항목은 다음과 같습니다.

| 필드 | 내용 |
| --- | --- |
| clinicName / contactName / phone / address | 병원명 / 담당자 / 연락처 / 소재지 |
| clinicType / area / frequency | 진료 유형 / 면적 / 관리 주기 |
| changeConsultation / message | 업체 교체 상담 여부 / 요청사항 |
| requestId / status | 접수번호 / 초기 상태 `new` |
| privacyConsent / privacyVersion | 동의 여부 / 안내 버전 `2026-11-09` |
| createdAt / expiresAt | 서버 접수 시각 / 보관 기간 참고 시각 (자동 삭제 없음) |

## 보안 및 보관

실제 배포한 `firestore.rules`는 공개 신규 신청과 지정 관리자의 견적 관리만 허용합니다. 필수 필드, 길이, 선택값, 동의, 접수 시각, 만료 시각을 검증하며 공개 조회·수정·삭제와 다른 경로의 접근을 차단합니다. 프로젝트 소유자는 Firebase 콘솔에서, 지정된 관리자는 로그인한 /p6-admin.html 화면에서 신청을 관리합니다. 관리자 접근 조건과 사용 방법은 ADMIN.md를 참고합니다.

사용자 요청으로 `estimate_requests.expiresAt`의 자동 삭제(TTL) 정책을 해제했습니다. `expiresAt`은 기존 접수 스키마와의 호환을 위한 참고 날짜로 유지되며 자동 삭제를 실행하지 않습니다. 개인정보 보관 기간 안내는 90일로 유지하고 관리자가 확인하여 삭제하도록 변경했습니다. 자동 삭제 기능은 향후 별도 요청 시 구성합니다.

설정 파일은 `.firebaserc`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`입니다. 웹 보안 규칙은 REST로 배포했고 TTL은 Google Cloud CLI로 해제했습니다. 인덱스 제외 설정은 별도로 배포하지 않았습니다.

## 기존 데이터 백업

기존 `assets` 27건, `master_data` 하위 10건, `settings` 1건, 총 38건을 하위 컬렉션까지 백업했습니다. 현재 이 문서 38건이 모두 없는 것을 조회로 검증했습니다.

- 백업: `backups/firebase/legacy-20261109-000830/firestore-documents.json`
- 목록 및 체크섬: 같은 폴더의 `inventory.json`
- SHA256: `F50B9D7F9DCC637E9737A486682751D2BD0F556C7E59D8B814601514AF59B3DB`
- 이전 규칙 백업: `backups/firebase/rules-before-estimates-20261109-000736.json`

백업에는 기존 프로젝트 데이터가 들어 있으므로 외부에 공개하지 않습니다. `backups/`는 Git 제외 대상입니다. `scripts/backup-firestore.ps1`은 읽기 전용 백업 스크립트이며, `scripts/delete-legacy-firestore.ps1`은 체크섬과 문서 버전을 검증하는 기존 데이터 전용 삭제 스크립트입니다. 이미 없는 문서를 다시 삭제하지 않습니다.

## 검증

브라우저에서 가상 신청을 제출해 실제 저장, 접수번호, 동의 및 90일 만료를 확인했습니다. 공개 API를 통한 목록 조회·개별 조회·수정과 잘못된 형식의 신청은 거부되는 것을 확인했습니다. 가상 신청은 검증 후 제거했습니다. 문자·이메일 알림은 설정하지 않았습니다.
