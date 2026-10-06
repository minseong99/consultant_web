# consultant_web

통신 매장 "상담 지원 AI Agent"(n8n 워크플로우 + Supabase)의 **시연 영상 촬영용 웹사이트**입니다.
분석·추천·일정 계산·문자 생성은 모두 n8n이 하고, 이 웹사이트는 n8n을 호출하고 결과를 보여 주기만 합니다.

| 경로 | 대상 | 설명 |
|---|---|---|
| `/` | 시연 진행자 | 두 화면으로 가는 진입 페이지 |
| `/join` | 고객 (모바일) | 동의 → 정보 입력 → 접수 완료 |
| `/staff` | 직원 (PC) | 고객 목록, 고객 상세(AI 분석·맞춤 추천·상담 결과 입력), 후속 연락 일정, 프로모션, 알림 |

## 실행

```bash
npm install
cp .env.example .env.local
npm run dev
```

http://localhost:3000 을 엽니다. 기본값은 **MOCK 모드**(`USE_MOCK=true`)라서 n8n·Supabase 없이 내장 샘플 데이터로 전체 흐름이 동작합니다. MOCK 모드에서는 직원 로그인에 비밀번호가 필요 없습니다.

MOCK 데이터는 서버 메모리에 있으므로 개발 서버를 다시 시작하면 초기화됩니다. 로컬 전용이며 Vercel 같은 서버리스 배포에서는 동작하지 않습니다.

## 환경변수

모두 서버 전용입니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요.

| 이름 | 설명 |
|---|---|
| `USE_MOCK` | `true`(기본)면 샘플 데이터, `false`면 실제 n8n·Supabase 연동 |
| `N8N_BASE_URL` | 게이트웨이 webhook 기본 주소. 예: `https://gotu4545.app.n8n.cloud/webhook` |
| `N8N_WEB_SECRET` | 게이트웨이 Webhook 노드의 Header Auth(`x-web-secret`) 값 |
| `SUPABASE_URL` | Supabase 프로젝트 주소 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버에서 조회할 때 쓰는 service role key. **절대 커밋하지 마세요** |
| `STAFF_DEMO_PASSWORD` | 직원 로그인 공용 비밀번호 |
| `STAFF_DEFAULT_ID` | (선택) 로그인 화면에서 처음 선택되어 있을 직원 ID |
| `SESSION_SECRET` | 세션 쿠키 서명용 임의 문자열 (`openssl rand -hex 32`) |

`.env.local` 은 gitignore 되어 있습니다.

## 구조

```
app/join                     고객 화면
app/staff/(auth)/login       직원 로그인
app/staff/(app)/...          직원 화면 (세션이 없으면 로그인으로 이동)
app/api/join                 고객 접수 (로그인 불필요, 서버에서 입력 재검증)
app/api/staff/*              직원용 API (서명된 세션이 없으면 401)
lib/backend/index.ts         화면이 쓰는 데이터 접근 인터페이스
lib/backend/mock.ts          MOCK 구현 (메모리)
lib/backend/real.ts          실제 구현 (Supabase 조회 + n8n 게이트웨이 호출)
lib/n8n.ts                   n8n 호출은 모두 이 파일을 거침
lib/notify.ts                알림 생성 규칙 (직전 조회 결과와 비교)
lib/labels.ts                상태값 → 한글 라벨·색
lib/fields.ts                고객 입력 폼의 항목·문구
lib/types.ts                 Supabase 스키마 타입
n8n/web-gateway.json         n8n에 import하는 게이트웨이 워크플로우
scripts/build-gateway.mjs    게이트웨이 JSON 생성·검증 스크립트
```

- 브라우저는 n8n이나 Supabase를 직접 호출하지 않습니다. 모두 `/api/...` 를 거칩니다.
- 웹사이트는 Supabase에 쓰지 않습니다. 쓰기는 전부 n8n을 통합니다.
- 알림은 Supabase Realtime이 아니라 `/api/staff/feed` 를 3초 간격으로 조회해 만듭니다(`components/staff/FeedProvider.tsx`). Realtime·RLS 설정에 의존하지 않고, 브라우저에 개인정보 테이블 조회 권한을 열지 않기 위해서입니다.
- 고객 입력 항목이나 문구를 바꾸려면 `lib/fields.ts` 만 고치면 됩니다.

## 실제 연동

### 1. 게이트웨이 워크플로우 import

기존 워크플로우(F01~F07)에는 webhook이 없습니다. `n8n/web-gateway.json` 이 웹사이트의 요청을 받아 기존 워크플로우를 호출합니다. 기존 워크플로우는 수정하지 않습니다.

1. n8n에서 새 워크플로우를 만들고 `⋯` → **Import from File** → `n8n/web-gateway.json`
2. Webhook 노드 5개 각각에서 **Credential for Header Auth** 를 새로 만듭니다. Name은 `x-web-secret`, Value는 임의의 긴 문자열(이 값을 `.env.local` 의 `N8N_WEB_SECRET` 에 넣습니다). 한 번 만든 자격증명을 5개 노드에서 같이 선택하면 됩니다.
3. Postgres 노드 5개의 자격증명이 `KT_Project_Supabase_Postgres` 로 연결됐는지 확인합니다(같은 인스턴스면 자동 연결).
4. Execute Workflow 노드 11개가 각각 올바른 워크플로우를 가리키는지 확인합니다(ID로 지정되어 있음).
5. 워크플로우를 **활성화**합니다. 활성화 전에는 `/webhook/` 대신 `/webhook-test/` 주소로, 편집 화면에서 "Listen for test event"를 누른 상태에서만 호출됩니다.

> **이 게이트웨이는 n8n에서 실행해 보지 못한 상태로 작성되었습니다.** 스크립트로 확인한 것은 JSON 형식, 노드 연결, 호출 대상 워크플로우의 ID와 입력 필드명이 원본과 일치하는지까지입니다. import 후 아래 curl로 경로별로 한 번씩 확인하세요. 특히 Execute Workflow 노드에 객체(`customer`, `analysis`, `message_data` 등)를 넘기는 부분과 Respond to Webhook 뒤에 이어지는 실행은 n8n 버전에 따라 설정을 손봐야 할 수 있습니다.

스크립트는 경로별 조각 파일도 함께 만듭니다(`n8n/parts/*.json`). 이미 import한 워크플로우에서 한 경로만 바꿀 때는, 그 경로의 기존 노드를 지우고 조각 파일의 내용을 n8n 캔버스에 붙여 넣으면 됩니다.

게이트웨이를 고치려면 `scripts/build-gateway.mjs` 를 수정하고 다시 생성합니다. 원본 워크플로우 JSON 폴더를 넘기면 ID·입력 필드명을 대조합니다.

```bash
npm run gateway -- ../workflow_json
```

### 2. 경로별 확인

```bash
export N8N=https://gotu4545.app.n8n.cloud/webhook
export SECRET=<N8N_WEB_SECRET 값>
```

고객 접수 — `{ "success": true, "customer_id": "CUST-..." }` 가 오고, 잠시 뒤 `customer_analyses` 와 (약정 만료일이 있으면) `message_schedules` 에 행이 생깁니다.

```bash
curl -s -X POST "$N8N/web/customer-intake" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_name":"테스트고객","phone":"01000000001","current_device":"Galaxy S23","current_plan":"5G 69 요금제","usage_pattern":"유튜브 시청","consultation_goal":"기기 변경 상담","age":30,"contract_end_date":"2027-01-31","device_use_months":24,"target_monthly_budget":70000,"interests":"카메라","privacy_consent":true,"marketing_consent":true,"recontact_consent":true}'
```

추천 — `recommendations` 배열이 옵니다.

```bash
curl -s -X POST "$N8N/web/recommend" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_id":"<customer_id>"}'
```

상담 결과 — F04 결과와 `schedules` 배열이 옵니다. `reconsultation_date` 는 내일 이후 날짜여야 일정이 생깁니다.

```bash
curl -s -X POST "$N8N/web/consultation-result" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_id":"<customer_id>","staff_id":"<staff_id>","store_id":"<store_id>","notes":"가격을 가족과 상의한 뒤 다시 방문하기로 함","reconsultation_date":"<YYYY-MM-DD>"}'
```

즉시 발송 — `schedule_status` 와 `send_status` 가 모두 `sent` 여야 정상입니다.

```bash
curl -s -X POST "$N8N/web/send-now" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"schedule_id":"<schedule_id>"}'
```

프로모션 — `status` 가 `targeted` / `no_target` / `promotion_not_found` 중 하나로 옵니다.

```bash
curl -s -X POST "$N8N/web/promotion" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"document_id":"<document_id>","store_id":"<store_id>"}'
```

프로모션 등록 — 문서 행과 본문 조각을 저장하고 `document_id` 를 돌려줍니다. 실제 데이터가 생깁니다.

```bash
curl -s -X POST "$N8N/web/promotion-register" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"store_id":"<store_id>","promotion_name":"<이름>","valid_from":"2026-11-01","valid_until":"2026-11-30","benefit":"<혜택>","target_device":"<대상 기기>"}'
```

### 3. 웹사이트 전환

`.env.local` 에서 `USE_MOCK=false` 로 바꾸고 나머지 값을 채운 뒤 개발 서버를 다시 시작합니다. 우상단의 MOCK 배지가 사라지면 실제 연동 상태입니다.

### 연동 전 확인

원본 워크플로우의 알려진 문제입니다. 게이트웨이로 우회할 수 없어 n8n에서 직접 고쳐야 합니다.

| 기능 | 문제 | 고치기 전 웹사이트 동작 |
|---|---|---|
| 맞춤 추천 (F03) | 빈 Set 노드(`고객 정보 입력`)가 입력을 지우고, `기종 정보 조회`·`요금제 정보 조회` 의 쿼리가 비어 있음. 상품 목록이 테스트 값 | [추천 받기]가 오류를 표시하거나 "테스트 모델"을 추천 |
| 문자 발송 (F07-S03) | 입력 필드명이 `"message_id "`(끝에 공백)였던 문제. 수정했다고 전달받았으나 S01의 호출 매핑까지 반영됐는지 확인 필요 | [지금 발송] 후 "발송이 완료되지 않았습니다" 표시, 일정이 처리 중에 머묾 |
| 프로모션 문자 (F07-S02) | 프로모션 정보 조회가 임시 값이라 문자 생성이 항상 실패 | 프로모션 일정의 [지금 발송] 버튼을 비활성화해 둠 |

그 밖에 OpenAI·Google Calendar·Postgres 자격증명이 유효해야 합니다. Google Calendar 자격증명이 만료되면 일정 생성이 중간에 실패합니다.

게이트웨이가 보완하는 것: 상담 행 생성(F04는 update만 함), 재상담 예정일을 `reconsultation_at` 에 저장, F04의 `contract_expiry` 를 F06의 `contract` 로 매핑.

## 시연 촬영 순서

휴대폰 크기 창(`/join`)과 PC 창(`/staff`)을 나란히 놓고 촬영합니다. PC 창은 1280px 이상을 권장합니다.

1. **고객 제출** — `/join` 에서 세 가지 동의를 모두 체크하고, 약정 만료일을 포함해 정보를 입력한 뒤 제출
2. **직원 화면 알림** — `/staff` 고객 목록에 새 고객이 새로고침 없이 나타나고 "새 고객 등록" 알림, 이어서 "약정 만료 안내 일정 생성" 알림
3. **분석·추천** — 새 고객을 눌러 AI 고객 분석 확인, [추천 받기]로 맞춤 추천 카드 확인
4. **상담 결과** — 상담 메모와 재상담 예정일(내일)을 입력하고 저장 → AI가 정리한 결과 표시, "재상담 안내 일정 생성" 알림
5. **문자 발송** — 후속 연락 일정의 [지금 발송 (시연용)] → 처리 중 → 발송 완료, "문자 발송" 알림, 생성된 문자 본문 확인

주의할 점:

- **재연락 동의**를 체크하지 않으면 약정·재상담 일정이 생기지 않습니다.
- 재상담 예정일은 **내일**로 잡고 **19시 이전**에 촬영하세요. 하루 전 안내가 오늘 10시/16시/19시 중 다음 시각으로 잡히며, 19시 이후에는 일정이 생성되지 않습니다.
- 촬영마다 **새 전화번호**를 쓰세요. 같은 번호로 다시 제출하면 동의 기록이 중복으로 쌓입니다.
- 문자는 실제로 발송되지 않습니다(n8n의 발송 단계가 MOCK). 화면 상단에 "시연 모드"로 표기됩니다.
- 알림 목록은 페이지를 새로고침하면 비워집니다. 촬영 중에는 새로고침하지 말고 왼쪽 메뉴로 이동하세요.
