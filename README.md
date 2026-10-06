# consultant_web

통신 매장 "상담 지원 AI Agent"(n8n 워크플로우 + Supabase)의 **시연 영상 촬영용 웹사이트**입니다.
분석·추천·일정 계산·문자 생성은 모두 n8n이 하고, 이 웹사이트는 n8n을 호출하고 결과를 보여 주기만 합니다.

| 경로 | 대상 | 설명 |
|---|---|---|
| `/` | 고객 | 서비스 첫 화면. 상담 접수 시작, 오른쪽 위에 직원 로그인 |
| `/join` | 고객 (모바일) | 동의 → 정보 입력 → 접수 완료 |
| `/staff` | 직원 (PC) | 오늘 화면(상담 대기·오늘 나갈 연락·확인 필요), 고객 목록과 고객 상세(브리프·추천·상담 기록·후속 연락), 후속 연락 일정(캘린더·목록), 프로모션 등록·대상 선정, 알림 |

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
n8n/workflows                n8n에서 현재 발행된 워크플로우 (내보낸 것)
n8n/parts, web-gateway.json  게이트웨이 조각과 전체 (생성물)
scripts/build-gateway.mjs    게이트웨이 JSON 생성·검증 스크립트
scripts/export-workflows.mjs n8n 발행본을 n8n/workflows 로 내보내는 스크립트
```

- 브라우저는 n8n이나 Supabase를 직접 호출하지 않습니다. 모두 `/api/...` 를 거칩니다.
- 웹사이트는 Supabase에 쓰지 않습니다. 쓰기는 전부 n8n을 통합니다.
- 알림은 Supabase Realtime이 아니라 `/api/staff/feed` 를 3초 간격으로 조회해 만듭니다(`components/staff/FeedProvider.tsx`). Realtime·RLS 설정에 의존하지 않고, 브라우저에 개인정보 테이블 조회 권한을 열지 않기 위해서입니다.
- 고객 입력 항목이나 문구를 바꾸려면 `lib/fields.ts` 만 고치면 됩니다.

## 실제 연동

### 1. n8n 워크플로우

`n8n/` 폴더에 세 가지가 있습니다.

| 경로 | 내용 |
|---|---|
| `n8n/workflows/*.json` | **n8n에서 현재 발행된 워크플로우 14개.** 게이트웨이(`WF Main`), F01~F07과 서브 워크플로우, 매일 자동 발송(`zWF04`). `npm run n8n:export` 로 갱신 |
| `n8n/parts/*.json` | 게이트웨이의 경로별 조각. `WF Main` 에서 한 경로만 바꿀 때 캔버스에 붙여 넣음 |
| `n8n/web-gateway.json` | 게이트웨이 전체. 새 n8n 인스턴스에 처음 import할 때 사용 |

`n8n/workflows` 는 실제로 동작 중인 상태의 기록입니다. 공개 저장소이므로 pinData(테스트 데이터)는 빼고 Google Calendar ID는 `<GOOGLE_CALENDAR_ID>` 로 바꿔 저장합니다. 자격증명은 이름과 ID만 들어 있고 값은 없습니다.

기존 워크플로우(F01~F07)에는 webhook이 없어서, 게이트웨이 `WF Main` 이 웹사이트의 요청을 받아 Execute Workflow 노드로 기존 워크플로우를 호출합니다. 경로는 6개입니다.

| 경로 | 화면 | 호출 |
|---|---|---|
| `web/customer-intake` | 고객 접수 | F01 → 응답 → F06(약정) → F02 |
| `web/recommend` | 추천 받기 | 고객·분석 조회 → F03 |
| `web/consultation-result` | 상담 결과 저장 | 상담 행 생성 → F04 → F06 → 응답 → F02 |
| `web/send-now` | 지금 발송 | 일정 조회 → F07 |
| `web/promotion` | 대상 선정 및 일정 생성 | F05 → F06(프로모션) |
| `web/promotion-register` | 새 프로모션 등록 | 본문 임베딩 → 문서·본문 저장 |

**게이트웨이를 고칠 때**는 n8n에서 직접 고치지 않고 `scripts/build-gateway.mjs` 를 고쳐 다시 생성합니다. 그 경로의 기존 노드를 지운 뒤 `n8n/parts/<경로>.json` 의 내용을 `WF Main` 캔버스에 붙여 넣고 publish합니다. 기존 노드를 남긴 채 붙이면 노드 이름 끝에 숫자가 붙습니다(동작은 합니다).

```bash
npm run gateway      # n8n/web-gateway.json 과 n8n/parts 생성. n8n/workflows 와 ID·입력 필드명을 대조
npm run n8n:export   # n8n의 발행본을 n8n/workflows 로 다시 내보냄 (.env.local 의 N8N_API_KEY 필요, 읽기만 함)
```

**새 인스턴스에 처음 올릴 때**: `n8n/workflows` 의 F01~F07·zWF04를 import하고 `<GOOGLE_CALENDAR_ID>` 와 자격증명(Postgres, Supabase, OpenAI, Google Calendar)을 연결한 뒤, `n8n/web-gateway.json` 을 import합니다. Webhook 노드 6개에 Header Auth 자격증명(Name `x-web-secret`, Value는 `.env.local` 의 `N8N_WEB_SECRET`)을 연결하고, 호출되는 워크플로우부터 차례로 publish합니다. 호출되는 워크플로우의 Settings에서 "This workflow can be called by" 가 호출을 허용하는지 확인하세요.

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

### 알아 둘 동작

- 문자 발송은 MOCK입니다. 실제 SMS는 나가지 않고 DB에 발송 완료로 기록됩니다.
- 약정·재상담 일정은 재연락 동의가 있어야 생기고, 프로모션은 마케팅 동의까지 필요합니다.
- 맞춤 추천은 DB에 저장되지 않고 화면에만 표시됩니다.
- LLM을 거치는 호출(분석, 추천, 상담 결과, 문자 생성)은 10~55초가 걸립니다. 웹사이트의 n8n 호출 한도는 90초입니다.
- `zWF04` 는 매일 09시와 18시(서울 시간)에 그날 예정된 일정을 조회해 발송합니다. 화면의 [지금 발송]은 이와 별개로 한 건을 바로 보냅니다.
- OpenAI·Google Calendar·Postgres 자격증명이 유효해야 합니다. Google Calendar 자격증명이 만료되면 일정 생성이 중간에 실패합니다.
- 게이트웨이가 보완하는 것: 상담 행 생성(F04는 update만 함), 재상담 예정일을 `reconsultation_at` 에 저장, F04의 `contract_expiry` 를 F06의 `contract` 로 매핑, F05가 선정한 고객 ID를 F06으로 전달, 프로모션 등록.

## 시연 촬영 순서

휴대폰 크기 창(`/join`)과 PC 창(`/staff`)을 나란히 놓고 촬영합니다. PC 창은 1280px 이상을 권장합니다.

1. **고객 제출** — `/join` 에서 세 가지 동의를 모두 체크하고, 약정 만료일을 포함해 정보를 입력한 뒤 제출
2. **직원 화면 알림** — `/staff` 고객 목록에 새 고객이 새로고침 없이 나타나고 "새 고객 등록" 알림, 이어서 "약정 만료 안내 일정 생성" 알림
3. **분석·추천** — 새 고객을 눌러 AI 고객 분석 확인, [추천 받기]로 맞춤 추천 카드 확인
4. **상담 결과** — 상담 메모와 재상담 예정일(내일)을 입력하고 저장 → AI가 정리한 결과 표시, "재상담 안내 일정 생성" 알림
5. **문자 발송** — 후속 연락 일정의 [지금 발송 (시연용)] → 처리 중 → 발송 완료, "문자 발송" 알림, 생성된 문자 본문 확인
6. **프로모션** — 프로모션 메뉴의 [새 프로모션 등록]에서 이름·기간·대상 기기·혜택을 입력해 등록 → 목록 맨 위의 [대상 선정 및 일정 생성] → 조건에 맞는 고객과 선정 사유 표시, 일정 생성 알림 → 그 일정을 [지금 발송]해 혜택이 담긴 문자 확인

주의할 점:

- **재연락 동의**를 체크하지 않으면 약정·재상담 일정이 생기지 않습니다.
- 재상담 예정일은 **내일**로 잡고 **19시 이전**에 촬영하세요. 하루 전 안내가 오늘 10시/16시/19시 중 다음 시각으로 잡히며, 19시 이후에는 일정이 생성되지 않습니다.
- 촬영마다 **새 전화번호**를 쓰세요. 같은 번호로 다시 제출하면 동의 기록이 중복으로 쌓입니다.
- 문자는 실제로 발송되지 않습니다(n8n의 발송 단계가 MOCK). 화면 상단에 "시연 모드"로 표기됩니다.
- 알림 목록은 페이지를 새로고침하면 비워집니다. 촬영 중에는 새로고침하지 말고 왼쪽 메뉴로 이동하세요.
