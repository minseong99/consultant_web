# 실제 연동: n8n과 Supabase

샘플 데이터 모드가 아니라 실제 n8n 워크플로우와 Supabase에 붙여 쓰는 방법입니다. 화면만 보려면 이 문서는 필요 없습니다([README](../README.md)의 "실행").

## 1. 웹사이트를 실제 연동으로 바꾸기

`.env.local` 에서 `USE_MOCK=false` 로 바꾸고 나머지 값을 채웁니다. 개발 서버가 값을 바로 읽습니다.

Supabase에는 기존 테이블 외에 고객 상담 화면의 원격 조작을 위한 테이블이 하나 필요합니다. 없으면 원격 조작 띠만 나타나지 않고 나머지는 동작합니다.

```sql
create table public.consult_screens (
  customer_id varchar primary key references public.customers (customer_id) on delete cascade,
  slide       varchar     not null default 'recommend',
  updated_at  timestamptz not null default now(),
  ended_at    timestamptz,
  seen_at     timestamptz
);
alter table public.consult_screens enable row level security;
grant select, insert, update, delete on public.consult_screens to service_role;
```

## 2. n8n 폴더

| 경로 | 내용 |
|---|---|
| `n8n/workflows/*.json` | n8n에서 현재 발행된 워크플로우. 게이트웨이(`WF Main`), F01~F07과 서브 워크플로우, 매일 자동 발송. `npm run n8n:export` 로 갱신 |
| `n8n/parts/*.json` | 게이트웨이의 경로별 조각. `WF Main` 에서 한 경로만 바꿀 때 캔버스에 붙여 넣음 |
| `n8n/web-gateway.json` | 게이트웨이 전체. 새 n8n 인스턴스에 처음 import할 때 사용 |

`n8n/workflows` 는 실제로 동작 중인 상태의 기록입니다. 공개 저장소이므로 pinData(테스트 데이터)는 빼고 Google Calendar ID는 `<GOOGLE_CALENDAR_ID>` 로 바꿔 저장합니다. 자격증명은 이름과 ID만 들어 있고 값은 없습니다.

```bash
npm run gateway      # n8n/web-gateway.json 과 n8n/parts 생성. n8n/workflows 와 ID·입력 필드명을 대조
npm run n8n:export   # n8n의 발행본을 n8n/workflows 로 다시 내보냄 (.env.local 의 N8N_API_KEY 필요, 읽기만 함)
```

## 3. 게이트웨이의 경로

기존 워크플로우(F01~F07)에는 webhook이 없어서, 게이트웨이 `WF Main` 이 웹사이트의 요청을 받아 Execute Workflow 노드로 워크플로우를 부릅니다. 모든 경로는 `POST <N8N_BASE_URL>/<경로>` 이고 헤더 `x-web-secret` 으로 인증합니다. 응답은 `{ "success": true/false, … }` 이며 실패하면 `error_code` 와 `message` 가 들어갑니다.

| 경로 | 화면에서 | 호출 순서 | 걸리는 시간 |
|---|---|---|---|
| `web/customer-intake` | 고객이 접수를 제출 | F01 → 응답 → F06(약정) → F02 | 응답 3~5초, 분석은 25초 뒤 |
| `web/recommend` | 직원이 [맞춤 추천 받기] | 고객·분석 조회 → F03 → 응답 | 35~45초 |
| `web/consultation-result` | 직원이 상담 기록 저장 | 상담 행 생성 → F04 → F06(재상담) → 응답 → F02 | 응답 약 20초 |
| `web/message-draft` | 직원이 [지금 발송] | 일정 조회 → F07 문자 생성 → 응답 | 14~16초 |
| `web/message-send` | 직원이 [문자 전송] | 일정 선점 → 문자 저장 → F07 발송 → 응답 | 약 4초 |
| `web/promotion` | 직원이 [대상 선정 및 일정 생성] | F05 → 고객마다 F06(프로모션) → 응답 | 3~7초 |
| `web/promotion-parse` | 직원이 프로모션 PDF를 올림 | 입력 확인 → AI가 프로모션별로 나눔 → 응답 | 20건에 약 28초 |
| `web/promotion-register` | 직원이 프로모션을 등록 | 입력 정리 → 본문 임베딩 → 문서·본문 저장 → 응답 | 약 5초 |
| `web/send-now` | (화면에서 쓰지 않음) | 일정 조회 → F07 개별 처리 → 응답 | 약 19초 |

고객 목록, 분석, 일정, 문자, 프로모션 목록, 고객 상담 화면은 게이트웨이를 거치지 않고 웹사이트 서버가 Supabase를 조회합니다.

**게이트웨이를 고칠 때**는 n8n에서 직접 고치지 않고 `scripts/build-gateway.mjs` 를 고쳐 다시 생성합니다. 그 경로의 기존 노드를 지운 뒤 `n8n/parts/<경로>.json` 의 내용을 `WF Main` 캔버스에 붙여 넣고 publish합니다. 기존 노드를 남긴 채 붙이면 노드 이름 끝에 숫자가 붙습니다(동작은 합니다).

**새 인스턴스에 처음 올릴 때**: `n8n/workflows` 의 F01~F07과 자동 발송 워크플로우를 import하고 `<GOOGLE_CALENDAR_ID>` 와 자격증명(Postgres, Supabase, OpenAI, Google Calendar)을 연결한 뒤, `n8n/web-gateway.json` 을 import합니다. Webhook 노드에 Header Auth 자격증명(Name `x-web-secret`, Value는 `.env.local` 의 `N8N_WEB_SECRET`)을 연결하고, 호출되는 워크플로우부터 차례로 publish합니다. 호출되는 워크플로우의 Settings에서 "This workflow can be called by" 가 호출을 허용하는지 확인합니다.

## 4. 경로별 확인

아래 호출은 **실제 DB와 Google Calendar에 데이터를 만들고 AI를 호출합니다.**

```bash
export N8N=<N8N_BASE_URL 값>
export SECRET=<N8N_WEB_SECRET 값>
```

고객 접수 — `{ "success": true, "customer_id": "CUST-..." }` 가 오고, 잠시 뒤 `customer_analyses` 와 (약정 만료일이 있으면) `message_schedules` 에 행이 생깁니다.

```bash
curl -s -X POST "$N8N/web/customer-intake" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_name":"테스트고객","phone":"01000000001","current_device":"Galaxy S23","current_plan":"초이스90 유튜브 프리미엄","usage_pattern":"유튜브 시청","consultation_goal":"기기 변경 상담","age":30,"contract_end_date":"2027-01-31","device_use_months":24,"target_monthly_budget":70000,"interests":"카메라","privacy_consent":true,"marketing_consent":true,"recontact_consent":true}'
```

추천 — `recommendations` 배열이 오고 `recommendations` 테이블에 저장됩니다. 분석이 끝난 고객이어야 합니다.

```bash
curl -s -X POST "$N8N/web/recommend" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_id":"<customer_id>"}'
```

상담 결과 — 정리된 결과와 `schedules` 배열이 옵니다. `reconsultation_date` 는 내일 이후여야 일정이 생깁니다.

```bash
curl -s -X POST "$N8N/web/consultation-result" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"customer_id":"<customer_id>","staff_id":"<staff_id>","store_id":"<store_id>","notes":"가격을 가족과 상의한 뒤 다시 방문하기로 함","reconsultation_date":"<YYYY-MM-DD>"}'
```

문자 초안 — `message_text` 가 옵니다. DB는 바뀌지 않습니다.

```bash
curl -s -X POST "$N8N/web/message-draft" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"schedule_id":"<schedule_id>"}'
```

문자 전송 — `schedule_status` 와 `send_status` 가 모두 `sent` 여야 정상입니다.

```bash
curl -s -X POST "$N8N/web/message-send" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"schedule_id":"<schedule_id>","message_text":"<보낼 내용>"}'
```

프로모션 대상 선정 — `status` 가 `targeted` / `no_target` / `promotion_not_found` 중 하나로 옵니다.

```bash
curl -s -X POST "$N8N/web/promotion" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"document_id":"<document_id>","store_id":"<store_id>"}'
```

프로모션 등록 — 문서 행과 본문 조각을 저장하고 `document_id` 를 돌려줍니다.

```bash
curl -s -X POST "$N8N/web/promotion-register" -H "content-type: application/json" -H "x-web-secret: $SECRET" -d '{"store_id":"<store_id>","promotion_name":"<이름>","valid_from":"2026-11-01","valid_until":"2026-11-30","benefit":"<혜택>","target_device":"<대상 기기>"}'
```

## 5. 알아 둘 동작

- 문자 발송은 MOCK입니다. 실제 SMS는 나가지 않고 DB에 발송 완료로 기록됩니다.
- 약정·재상담 일정은 재연락 동의가 있어야 생기고, 프로모션은 마케팅 동의까지 필요합니다.
- 재상담 안내는 재상담일 하루 전입니다. 재상담일이 내일이면 오늘의 다음 시각(10시/16시/19시)으로 잡히고, 19시 이후에는 생기지 않습니다.
- 프로모션은 시작일과 종료 2일 전에 안내 일정이 생깁니다.
- 맞춤 추천은 `recommendations` 에 기기, 요금제, 순위, 이유가 저장됩니다. 예상 혜택과 적용 조건은 저장되지 않아 방금 받은 응답에만 있습니다.
- AI를 거치는 호출은 10~55초가 걸립니다. 웹사이트의 n8n 호출 한도는 90초입니다.
- 자동 발송은 매일 09시와 18시(서울 시간)에 그날 예정된 일정을 조회해 발송합니다. [지금 발송]으로 보낸 일정은 예정일에 다시 나가지 않습니다.
- 같은 번호로 다시 접수하면 새 고객이 생기지 않고 기존 정보와 동의가 갱신됩니다.
- OpenAI, Google Calendar, Postgres 자격증명이 유효해야 합니다. Google Calendar 자격증명이 만료되면 일정 생성이 중간에 실패합니다.
