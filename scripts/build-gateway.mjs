// n8n 게이트웨이 워크플로우(n8n/web-gateway.json)를 생성한다.
//   node scripts/build-gateway.mjs [원본 워크플로우 JSON 폴더]
// 호출 대상 워크플로우의 ID와 입력 필드명이 원본 트리거 정의와 맞는지 검증한다. 폴더를 생략하면 n8n/workflows 를 쓴다.
//
// 기존 워크플로우(F01~F07)에는 webhook이 없으므로, 이 게이트웨이가 웹사이트의 요청을 받아
// Execute Workflow 노드로 기존 워크플로우를 호출한다. 기존 워크플로우는 수정하지 않는다.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 호출 대상 워크플로우. inputs는 각 워크플로우의 "Execute Workflow Trigger"에 선언된 입력이다.
const WORKFLOWS = {
  F01: {
    id: "DmykDmlhlWgPXYD5",
    name: "F01 고객 및 동의 정보 저장",
    inputs: {
      customer_name: "string",
      phone: "string",
      age: "number",
      current_device: "string",
      current_plan: "string",
      contract_end_date: "string",
      device_use_months: "number",
      usage_pattern: "string",
      consultation_goal: "string",
      interests: "string",
      target_monthly_budget: "number",
      privacy_consent: "boolean",
      marketing_consent: "boolean",
      recontact_consent: "boolean",
      preferred_brand: "string",
    },
  },
  F02: { id: "NGN6YgDidp9E3vtf", name: "F02 고객 데이터 분석", inputs: { customer_id: "string", consultation_id: "string" } },
  F03: {
    id: "UE93OTVJAdGtLZyl",
    name: "F03 맞춤 상품 추천",
    inputs: {
      customer_id: "string",
      analysis_id: "string",
      analysis: "object",
      recommendation_request: "string",
      customer: "object",
      consultation: "object",
    },
  },
  F04: {
    id: "1cmpN1S79uDoS2xw",
    name: "F04 상담 결과 처리",
    inputs: {
      customer_id: "string",
      consultation_id: "string",
      staff_id: "string",
      analysis_id: "string",
      consultation_result: "object",
      recording_url: "string",
      store_id: "string",
    },
  },
  F05: { id: "kSNl11r9lqQjBO5E", name: "F05 프로모션 대상 고객 선정", inputs: { document_id: "string", store_id: "string" } },
  F06: {
    id: "j9aDZV3iDfCQaFsM",
    name: "F06 일정 관리",
    inputs: {
      schedule_type: "string",
      customer_id: "string",
      consultation_id: "string",
      document_id: "string",
      preferred_follow_up_date: "string",
      contact_reason: "string",
    },
  },
  F07_S01: {
    id: "QFjC2ARP9Q6fCExH",
    name: "F07-S01 개별 메시지 처리",
    inputs: { schedule_id: "string", scheduled_contact_at: "string", message_data: "object" },
  },
};

// 기존 워크플로우가 쓰는 Postgres 자격증명. 같은 n8n 인스턴스에 import하면 자동으로 연결된다.
const POSTGRES_CREDENTIAL = { postgres: { id: "YVkzsBzhXmXxNLug", name: "KT_Project_Supabase_Postgres" } };

// F05의 Embeddings OpenAI 노드가 쓰는 OpenAI 자격증명. 프로모션 등록에서 같은 모델로 본문을 임베딩한다.
const OPENAI_CREDENTIAL = { openAiApi: { id: "nIiZAyshbU5fsKDS", name: "OpenAI account" } };

const nodes = [];
const connections = {};

// 노드 ID는 이름에서 만들어, 다시 생성해도 파일이 바뀌지 않게 한다.
function uuid(seed) {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// 경로별로 노드를 묶어 두었다가, 한 경로만 따로 내보낼 때 쓴다 (n8n/parts/*.json).
let group = "";
const groupOf = new Map();

function add(node, row, col) {
  nodes.push({ id: uuid(node.name), position: [col * 260, row * 240], ...node });
  groupOf.set(node.name, group);
  return node.name;
}

function link(from, to, output = 0) {
  const outputs = ((connections[from] ??= { main: [] }).main);
  while (outputs.length <= output) outputs.push([]);
  outputs[output].push({ node: to, type: "main", index: 0 });
}

const note = (name, content, row, height = 200) => {
  groupOf.set(name, group);
  nodes.push({
    id: uuid(name),
    name,
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [-520, row * 240 - 40],
    parameters: { content, height, width: 460 },
  });
};

// zWF Main의 Webhook 노드들이 쓰는 Header Auth 자격증명. 같은 인스턴스에서는 자동으로 연결된다.
const WEBHOOK_CREDENTIAL = { httpHeaderAuth: { id: "8QrcxiVCBX9yQfnT", name: "local연동용" } };

const webhook = (name, path) => ({
  name,
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  webhookId: uuid(`webhook:${path}`),
  credentials: WEBHOOK_CREDENTIAL,
  parameters: { httpMethod: "POST", path, authentication: "headerAuth", responseMode: "responseNode", options: {} },
});

const respond = (name) => ({
  name,
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  parameters: { respondWith: "firstIncomingItem", options: {} },
});

const code = (name, jsCode) => ({ name, type: "n8n-nodes-base.code", typeVersion: 2, parameters: { jsCode } });

const iff = (name, expression) => ({
  name,
  type: "n8n-nodes-base.if",
  typeVersion: 2.2,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
      conditions: [
        { id: uuid(`cond:${name}`), leftValue: `={{ ${expression} }}`, rightValue: "", operator: { type: "boolean", operation: "true", singleValue: true } },
      ],
      combinator: "and",
    },
    options: {},
  },
});

// 결과가 0건이어도 다음 노드가 실행되도록 alwaysOutputData를 켠다.
const postgres = (name, query, replacement) => ({
  name,
  type: "n8n-nodes-base.postgres",
  typeVersion: 2.6,
  alwaysOutputData: true,
  credentials: POSTGRES_CREDENTIAL,
  parameters: { operation: "executeQuery", query, options: { queryReplacement: `={{ ${replacement} }}` } },
});

// 하위 워크플로우가 실패하거나 아무것도 반환하지 않아도 webhook 응답까지 도달하도록
// onError와 alwaysOutputData를 설정한다.
// each 가 true 면 들어온 항목마다 하위 워크플로우를 한 번씩 실행한다(기본은 전체를 한 번에 넘김).
function call(name, key, values, { each = false } = {}) {
  const workflow = WORKFLOWS[key];
  for (const field of Object.keys(values)) {
    if (!(field in workflow.inputs)) throw new Error(`${name}: ${key}에 없는 입력 필드 ${field}`);
  }
  return {
    name,
    type: "n8n-nodes-base.executeWorkflow",
    typeVersion: 1.3,
    alwaysOutputData: true,
    onError: "continueRegularOutput",
    parameters: {
      workflowId: { __rl: true, value: workflow.id, mode: "id" },
      ...(each ? { mode: "each" } : {}),
      workflowInputs: {
        mappingMode: "defineBelow",
        value: Object.fromEntries(Object.entries(values).map(([field, expr]) => [field, `={{ ${expr} }}`])),
        matchingColumns: [],
        schema: Object.entries(workflow.inputs).map(([id, type]) => ({
          id,
          displayName: id,
          required: false,
          defaultMatch: false,
          display: true,
          canBeUsedToMatch: true,
          type,
          removed: !(id in values),
        })),
        attemptToConvertTypes: false,
        convertFieldsToString: false,
      },
      options: { waitForSubWorkflow: true },
    },
  };
}

// ---------------------------------------------------------------------------
// 1. 고객 정보 접수: F01 → 응답 → (약정 만료일이 있으면) F06 약정 → F02 분석
// ---------------------------------------------------------------------------
{
  const r = 0;
  group = "customer-intake";
  note(
    "안내: 고객 접수",
    "## POST /webhook/web/customer-intake\n고객 화면(/join)의 제출을 받는다.\n\nF01 저장 → **먼저 응답** → 약정 만료일이 있으면 F06(contract) → F02 분석.\n\n응답: `{ success, customer_id }`",
    r,
  );
  const hook = add(webhook("접수 Webhook", "web/customer-intake"), r, 0);
  const f01 = add(
    call("F01 고객 및 동의 정보 저장", "F01", {
      customer_name: "$json.body.customer_name",
      phone: "$json.body.phone",
      age: "$json.body.age",
      current_device: "$json.body.current_device",
      current_plan: "$json.body.current_plan",
      contract_end_date: "$json.body.contract_end_date",
      device_use_months: "$json.body.device_use_months",
      usage_pattern: "$json.body.usage_pattern",
      consultation_goal: "$json.body.consultation_goal",
      interests: "$json.body.interests",
      target_monthly_budget: "$json.body.target_monthly_budget",
      privacy_consent: "$json.body.privacy_consent === true",
      marketing_consent: "$json.body.marketing_consent === true",
      recontact_consent: "$json.body.recontact_consent === true",
      preferred_brand: "$json.body.preferred_brand ?? null",
    }),
    r,
    1,
  );
  const build = add(
    code(
      "접수 응답 구성",
      `// F01은 저장에 성공하면 { customer_id, status: 'saved', contract_end_date } 를 반환한다.
// 개인정보 동의가 없으면 status 없이 끝난다.
const result = $input.first()?.json ?? {};
const body = $('접수 Webhook').first().json.body ?? {};

if (result.status === 'saved' && result.customer_id) {
  return [{ json: {
    success: true,
    customer_id: result.customer_id,
    has_contract_end_date: Boolean(body.contract_end_date),
  } }];
}

return [{ json: {
  success: false,
  error_code: body.privacy_consent === true ? 'INTAKE_FAILED' : 'CONSENT_REQUIRED',
  message: body.privacy_consent === true
    ? (result.error ? String(result.error) : '고객 정보를 저장하지 못했습니다.')
    : '개인정보 수집·이용 동의가 필요합니다.',
} }];`,
    ),
    r,
    2,
  );
  const reply = add(respond("접수 응답"), r, 3);
  const saved = add(iff("접수: 저장 성공?", "$('접수 응답 구성').first().json.success === true"), r, 4);
  const hasContract = add(iff("접수: 약정 만료일 있음?", "$('접수 응답 구성').first().json.has_contract_end_date === true"), r, 5);
  const f06 = add(
    call("접수: F06 약정 일정 생성", "F06", {
      schedule_type: "'contract'",
      customer_id: "$('접수 응답 구성').first().json.customer_id",
      consultation_id: "''",
      document_id: "''",
    }),
    r,
    6,
  );
  const f02 = add(
    call("접수: F02 고객 분석", "F02", {
      customer_id: "$('접수 응답 구성').first().json.customer_id",
      consultation_id: "''",
    }),
    r,
    7,
  );
  link(hook, f01);
  link(f01, build);
  link(build, reply);
  link(reply, saved);
  link(saved, hasContract, 0);
  link(hasContract, f06, 0);
  link(hasContract, f02, 1);
  link(f06, f02);
}

// ---------------------------------------------------------------------------
// 2. 추천 요청: 고객·최신 분석 조회 → F03 → 응답
// ---------------------------------------------------------------------------
{
  const r = 1.5;
  group = "recommend";
  note(
    "안내: 추천",
    "## POST /webhook/web/recommend\n요청: `{ customer_id }`\n\n고객과 최신 분석을 조회해 F03에 넘긴다. 분석이 아직 없으면 빈 분석으로 추천한다.\n\n응답: F03 반환값 그대로 (`recommendations[]`, `information_status`, `missing_information[]`)",
    r,
  );
  const hook = add(webhook("추천 Webhook", "web/recommend"), r, 0);
  const lookup = add(
    postgres(
      "추천: 고객·최신 분석 조회",
      `SELECT
    row_to_json(c) AS customer,
    a.analysis_id,
    a.analysis_data,
    row_to_json(co) AS consultation
FROM public.customers c
LEFT JOIN LATERAL (
    SELECT analysis_id, analysis_data
    FROM public.customer_analyses
    WHERE customer_id = c.customer_id
    ORDER BY created_at DESC
    LIMIT 1
) a ON TRUE
LEFT JOIN LATERAL (
    SELECT *
    FROM public.consultations
    WHERE customer_id = c.customer_id
    ORDER BY consulted_at DESC
    LIMIT 1
) co ON TRUE
WHERE c.customer_id = $1
LIMIT 1;`,
      "[ $json.body.customer_id ]",
    ),
    r,
    1,
  );
  const found = add(iff("추천: 고객 있음?", "Boolean($json.customer)"), r, 2);
  const input = add(
    code(
      "추천 입력 구성",
      `const row = $('추천: 고객·최신 분석 조회').first().json;

let analysis = row.analysis_data ?? {};
if (typeof analysis === 'string') {
  try { analysis = JSON.parse(analysis); } catch (error) { analysis = {}; }
}

return [{ json: {
  customer_id: row.customer.customer_id,
  analysis_id: row.analysis_id ?? '',
  analysis,
  customer: row.customer,
  consultation: row.consultation ?? {},
  recommendation_request: '기기·요금제 추천',
} }];`,
    ),
    r,
    3,
  );
  const f03 = add(
    call("F03 맞춤 상품 추천", "F03", {
      customer_id: "$json.customer_id",
      analysis_id: "$json.analysis_id",
      analysis: "$json.analysis",
      recommendation_request: "$json.recommendation_request",
      customer: "$json.customer",
      consultation: "$json.consultation",
    }),
    r,
    4,
  );
  const ok = add(
    code(
      "추천 응답 구성",
      `const result = $input.first()?.json ?? {};

if (result.success === true && Array.isArray(result.recommendations)) {
  return [{ json: result }];
}

return [{ json: {
  success: false,
  error_code: 'RECOMMEND_FAILED',
  message: result.error
    ? 'F03 실행 중 오류: ' + String(result.error.message ?? result.error)
    : 'F03 맞춤 상품 추천이 결과를 반환하지 않았습니다.',
} }];`,
    ),
    r,
    5,
  );
  const missing = add(
    code("추천: 고객 없음", `return [{ json: { success: false, error_code: 'CUSTOMER_NOT_FOUND', message: '고객 정보를 찾을 수 없습니다.' } }];`),
    r + 0.6,
    3,
  );
  const reply = add(respond("추천 응답"), r, 6);
  link(hook, lookup);
  link(lookup, found);
  link(found, input, 0);
  link(found, missing, 1);
  link(input, f03);
  link(f03, ok);
  link(ok, reply);
  link(missing, reply);
}

// ---------------------------------------------------------------------------
// 3. 상담 결과 저장: 상담 행 생성 → F04 → (필요하면) F06 → 응답 → F02 재분석
// ---------------------------------------------------------------------------
{
  const r = 3.2;
  group = "consultation-result";
  note(
    "안내: 상담 결과",
    "## POST /webhook/web/consultation-result\n요청: `customer_id, staff_id, store_id, notes, customer_response?, selected_product?, selected_plan?, follow_up_requested?, reconsultation_date?, recording_url?`\n\nF04·F06의 입력에 맞춘다.\n- 상담 행을 먼저 만들어 ID를 정한다 (F04가 같은 ID로 다시 저장)\n- 메모는 `consultation_text` 로, 고른 기기·요금제 이름은 메모 끝에 붙여 넘긴다\n- 재상담 예정일이 있으면 F06(reconsultation)에 `preferred_follow_up_date`, `contact_reason` 을 넘긴다\n- F04가 비우는 `store_id` 를 일정 조회 때 되돌린다\n\n순서: F04 → F06(일정) → **응답** → F02(분석 갱신). F02는 LLM 호출이라 30초쯤 걸리므로 응답을 먼저 보낸다 (응답 전에 두면 47초, 실측).\n\n응답: F04 반환값 + `schedules[]`",
    r,
    300,
  );
  const hook = add(webhook("상담 결과 Webhook", "web/consultation-result"), r, 0);
  // 저장이 실패해도 워크플로우가 멈추지 않고 '상담: 고객 없음' 에서 원인을 돌려주게 한다.
  const insert = add(
    {
      ...postgres(
      "상담 행 생성",
      `WITH inserted AS (
    INSERT INTO public.consultations (
        consultation_id,
        customer_id,
        consulted_at,
        staff_id,
        store_id,
        summary,
        preferred_follow_up_date
    )
    SELECT
        'CONS-' || (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint,
        c.customer_id,
        NOW(),
        $2,
        $3,
        $4,
        -- 재상담 예정일. F04가 같은 값을 다시 저장하지만, F04가 실패해도 남도록 여기서도 넣는다.
        NULLIF($5, '')::date
    FROM public.customers c
    WHERE c.customer_id = $1
    RETURNING consultation_id, customer_id
)
SELECT
    i.consultation_id,
    i.customer_id,
    COALESCE((
        SELECT analysis_id
        FROM public.customer_analyses
        WHERE customer_id = i.customer_id
        ORDER BY created_at DESC
        LIMIT 1
    ), '') AS analysis_id
FROM inserted i;`,
      `[
  $json.body.customer_id,
  $json.body.staff_id,
  $json.body.store_id,
  $json.body.notes,
  $json.body.reconsultation_date ?? ''
]`,
      ),
      onError: "continueRegularOutput",
    },
    r,
    1,
  );
  const created = add(iff("상담: 행 생성됨?", "Boolean($json.consultation_id)"), r, 2);
  const f04 = add(
    call("F04 상담 결과 처리", "F04", {
      customer_id: "$json.customer_id",
      consultation_id: "$json.consultation_id",
      staff_id: "$('상담 결과 Webhook').first().json.body.staff_id",
      analysis_id: "$json.analysis_id",
      // F04는 consultation_result 에서 consultation_text, customer_response, follow_up_requested, preferred_follow_up_date 만 읽는다.
      // 화면에서 고른 기기·요금제는 이름이라(F04는 ID 칸만 있음) 상담 내용 끝에 붙여 LLM이 읽게 한다.
      consultation_result: `{
  consultation_text: [
    $('상담 결과 Webhook').first().json.body.notes ?? '',
    $('상담 결과 Webhook').first().json.body.selected_product ? '선택한 기기: ' + $('상담 결과 Webhook').first().json.body.selected_product : '',
    $('상담 결과 Webhook').first().json.body.selected_plan ? '선택한 요금제: ' + $('상담 결과 Webhook').first().json.body.selected_plan : ''
  ].filter(Boolean).join('\\n'),
  customer_response: $('상담 결과 Webhook').first().json.body.customer_response ?? null,
  follow_up_requested: $('상담 결과 Webhook').first().json.body.follow_up_requested ?? null,
  preferred_follow_up_date: $('상담 결과 Webhook').first().json.body.reconsultation_date ?? null
}`,
      recording_url: "$('상담 결과 Webhook').first().json.body.recording_url ?? ''",
      // consultations.store_id 는 NOT NULL 이다. F04가 상담 행을 저장할 때 이 값을 쓴다.
      store_id: "$('상담 결과 Webhook').first().json.body.store_id ?? ''",
    }),
    r,
    3,
  );
  const check = add(
    code(
      "F04 결과 확인",
      `const result = $input.first()?.json ?? {};
const body = $('상담 결과 Webhook').first().json.body ?? {};
const row = $('상담 행 생성').first().json;
const ok = result.success === true;

// 직원이 재상담 예정일을 입력했으면 재상담 일정을 만든다.
// (F04는 일정 유형을 정하지 않는다. 약정 일정은 접수 때 만든다.)
let scheduleType = '';
if (ok && body.reconsultation_date) scheduleType = 'reconsultation';

return [{ json: {
  ok,
  f04: result,
  customer_id: row.customer_id,
  consultation_id: row.consultation_id,
  gateway_schedule_type: scheduleType,
  follow_up_date: body.reconsultation_date ?? '',
  contact_reason: result.follow_up_reason || '재상담 안내',
} }];`,
    ),
    r,
    4,
  );
  // F04가 실패하면 gateway_schedule_type 이 빈 값이라 일정 생성을 건너뛴다.
  // 앞 노드가 바뀌어도 깨지지 않도록 $json 대신 'F04 결과 확인' 을 직접 참조한다.
  const need = add(iff("상담: 일정 필요?", "$('F04 결과 확인').first().json.gateway_schedule_type !== ''"), r, 5);
  const f06 = add(
    call("상담: F06 일정 생성", "F06", {
      schedule_type: "$('F04 결과 확인').first().json.gateway_schedule_type",
      customer_id: "$('F04 결과 확인').first().json.customer_id",
      consultation_id: "$('F04 결과 확인').first().json.consultation_id",
      document_id: "''",
      preferred_follow_up_date: "$('F04 결과 확인').first().json.follow_up_date",
      contact_reason: "$('F04 결과 확인').first().json.contact_reason",
    }),
    r + 0.6,
    6,
  );
  const fetch = add(
    postgres(
      "상담: 생성된 일정 조회",
      `-- F04가 상담 행을 다시 저장하면서 store_id 를 비우므로(F04 입력에 매장이 없음) 여기서 되돌린다.
WITH kept AS (
    UPDATE public.consultations
    SET store_id = $4
    WHERE consultation_id = $1
      AND NULLIF($4, '') IS NOT NULL
      AND store_id IS DISTINCT FROM $4
    RETURNING consultation_id
)
SELECT
    schedule_id,
    customer_id,
    schedule_type,
    reference_date,
    scheduled_contact_at,
    calendar_event_id,
    schedule_status,
    contact_reason,
    consultation_id,
    schedule_subtype,
    document_id
FROM public.message_schedules
WHERE schedule_status = 'scheduled'
  AND (
      ($3 = 'reconsultation' AND consultation_id = $1)
      OR ($3 = 'contract' AND customer_id = $2 AND schedule_type = 'contract')
  )
ORDER BY scheduled_contact_at;`,
      `[
  $('F04 결과 확인').first().json.consultation_id,
  $('F04 결과 확인').first().json.customer_id,
  $('F04 결과 확인').first().json.gateway_schedule_type,
  $('상담 결과 Webhook').first().json.body.store_id ?? ''
]`,
    ),
    r,
    7,
  );
  const build = add(
    code(
      "상담 응답 구성",
      `const checked = $('F04 결과 확인').first().json;
const schedules = $input.all().map((item) => item.json).filter((row) => row && row.schedule_id);

if (!checked.ok) {
  const error = checked.f04?.error;
  return [{ json: {
    success: false,
    error_code: 'CONSULTATION_FAILED',
    message: error
      ? 'F04 실행 중 오류: ' + String(error.message ?? error)
      : 'F04 상담 결과 처리가 결과를 반환하지 않았습니다. 상담 메모는 저장되었습니다.',
    consultation_id: checked.consultation_id,
  } }];
}

return [{ json: { ...checked.f04, success: true, schedules } }];`,
    ),
    r,
    8,
  );
  const missing = add(
    code(
      "상담: 고객 없음",
      `// 상담 행을 만들지 못한 경우. 고객이 없어서인지, 저장 자체가 실패했는지 구분해 알려 준다.
const row = $('상담 행 생성').first()?.json ?? {};
const detail = row.error ? String(row.error.message ?? row.error) : (typeof row.message === 'string' ? row.message : '');
if (detail) {
  return [{ json: { success: false, error_code: 'CONSULTATION_SAVE_FAILED', message: '상담 기록을 저장하지 못했습니다. (' + detail + ')' } }];
}
return [{ json: { success: false, error_code: 'CUSTOMER_NOT_FOUND', message: '고객 정보를 찾을 수 없습니다.' } }];`,
    ),
    r + 0.6,
    3,
  );
  const reply = add(respond("상담 응답"), r, 9);
  // 응답을 보낸 뒤에 분석을 갱신한다. '상담 응답' 보다 오른쪽에 두어 응답이 먼저 실행되게 한다.
  const succeeded = add(iff("상담: F04 성공?", "$('F04 결과 확인').first().json.ok === true"), r, 10);
  const f02 = add(
    call("상담: F02 분석 갱신", "F02", {
      customer_id: "$('F04 결과 확인').first().json.customer_id",
      consultation_id: "$('F04 결과 확인').first().json.consultation_id",
    }),
    r,
    11,
  );
  link(hook, insert);
  link(insert, created);
  link(created, f04, 0);
  link(created, missing, 1);
  link(f04, check);
  link(check, need);
  link(need, f06, 0);
  link(need, fetch, 1);
  link(f06, fetch);
  link(fetch, build);
  link(build, reply);
  link(missing, reply);
  // '고객 없음' 경로는 F04가 실행되지 않았으므로 응답 뒤로 이어 가지 않는다.
  link(build, succeeded);
  link(succeeded, f02, 0);
}

// ---------------------------------------------------------------------------
// 4. 즉시 발송(시연용): 일정 1건 조회 → F07-S01(현재 시각으로) → 결과 조회 → 응답
// ---------------------------------------------------------------------------
{
  const r = 5.2;
  group = "send-now";
  note(
    "안내: 즉시 발송",
    "## POST /webhook/web/send-now\n요청: `{ schedule_id }`\n\nF07 메인은 당일 예정분만 조회하므로, 시연에서는 일정 1건을 골라 F07-S01을 **현재 시각**으로 호출한다 (예약 시각 대기 없이 바로 처리).\n\n조회 쿼리는 F07 메인의 `[조회] 오늘의 메시지 발송 대상` 과 같은 형태다.\n\n응답: `{ success, schedule_id, schedule_status, message_id, send_status }`",
    r,
    260,
  );
  const hook = add(webhook("즉시 발송 Webhook", "web/send-now"), r, 0);
  const lookup = add(
    postgres(
      "발송: 일정 조회",
      `SELECT
    ms.schedule_id,
    ms.customer_id,
    ms.schedule_type,
    ms.schedule_subtype,
    ms.contact_reason,
    ms.document_id,
    c.customer_name,
    c.phone,
    c.current_device,
    c.current_plan,
    c.usage_pattern,
    c.contract_end_date,
    c.device_use_months,
    c.preferred_brand,
    c.target_monthly_budget,
    c.interests,
    con.summary AS consultation_summary
FROM public.message_schedules AS ms
INNER JOIN public.customers AS c
    ON c.customer_id = ms.customer_id
LEFT JOIN public.consultations AS con
    ON con.consultation_id = ms.consultation_id
WHERE ms.schedule_id = $1
  AND ms.schedule_status = 'scheduled'
LIMIT 1;`,
      "[ $json.body.schedule_id ]",
    ),
    r,
    1,
  );
  const found = add(iff("발송: 예정 상태 일정 있음?", "Boolean($json.schedule_id)"), r, 2);
  const s01 = add(
    call("F07-S01 개별 메시지 처리", "F07_S01", {
      schedule_id: "$json.schedule_id",
      scheduled_contact_at: "$now.toISO()",
      message_data: `{
  customer_id: $json.customer_id,
  schedule_type: $json.schedule_type,
  schedule_subtype: $json.schedule_subtype ?? null,
  contact_reason: $json.contact_reason ?? null,
  customer_name: $json.customer_name,
  phone: $json.phone,
  current_device: $json.current_device ?? null,
  current_plan: $json.current_plan ?? null,
  usage_pattern: $json.usage_pattern ?? null,
  contract_end_date: $json.contract_end_date ?? null,
  device_use_months: $json.device_use_months ?? null,
  preferred_brand: $json.preferred_brand ?? null,
  target_monthly_budget: $json.target_monthly_budget ?? null,
  interests: $json.interests ?? null,
  consultation_summary: $json.consultation_summary ?? null,
  document_id: $json.document_id ?? null
}`,
    }),
    r,
    3,
  );
  const after = add(
    postgres(
      "발송: 결과 조회",
      `SELECT
    ms.schedule_id,
    ms.schedule_status,
    m.message_id,
    m.send_status
FROM public.message_schedules ms
LEFT JOIN public.messages m
    ON m.schedule_id = ms.schedule_id
WHERE ms.schedule_id = $1
LIMIT 1;`,
      "[ $('즉시 발송 Webhook').first().json.body.schedule_id ]",
    ),
    r,
    4,
  );
  const build = add(
    code(
      "발송 응답 구성",
      `const row = $input.first()?.json ?? {};
const called = $('F07-S01 개별 메시지 처리').first()?.json ?? {};
const scheduleId = row.schedule_id ?? $('즉시 발송 Webhook').first().json.body.schedule_id;

// 발송 여부는 n8n 실행 결과가 아니라 DB에 기록된 상태로 판단한다.
// 호출 뒤에도 일정이 scheduled 그대로면 F07-S01이 시작되지 못한 것이다.
// (예: 하위 워크플로우의 호출 허용 설정, 입력 오류) 원인을 웹사이트에서 볼 수 있게 오류 내용을 함께 돌려준다.
if (called.error || row.schedule_status === 'scheduled') {
  const detail = called.error ? String(called.error.message ?? called.error) : null;
  return [{ json: {
    success: false,
    error_code: 'SEND_NOT_STARTED',
    message: detail
      ? 'F07-S01 실행 중 오류: ' + detail
      : 'F07-S01 개별 메시지 처리가 일정을 처리하지 않았습니다. n8n 실행 기록을 확인하세요.',
    schedule_id: scheduleId,
    schedule_status: row.schedule_status ?? null,
  } }];
}

return [{ json: {
  success: true,
  schedule_id: scheduleId,
  schedule_status: row.schedule_status ?? null,
  message_id: row.message_id ?? null,
  send_status: row.send_status ?? null,
} }];`,
    ),
    r,
    5,
  );
  const missing = add(
    code("발송: 일정 없음", `return [{ json: { success: false, error_code: 'NOT_SCHEDULED', message: '예정 상태의 일정을 찾을 수 없습니다.' } }];`),
    r + 0.6,
    3,
  );
  const reply = add(respond("발송 응답"), r, 6);
  link(hook, lookup);
  link(lookup, found);
  link(found, s01, 0);
  link(found, missing, 1);
  link(s01, after);
  link(after, build);
  link(build, reply);
  link(missing, reply);
}

// ---------------------------------------------------------------------------
// 5. 프로모션: F05 대상 선정 → (대상이 있으면) F06 프로모션 일정 → 응답
// ---------------------------------------------------------------------------
{
  const r = 6.9;
  group = "promotion";
  note(
    "안내: 프로모션",
    "## POST /webhook/web/promotion\n요청: `{ document_id, store_id }`\n\nF05로 대상을 선정하고, `targeted` 이면 F06(promotion)으로 일정을 만든다.\n\n응답: F05 반환값 그대로 (`status`, `target_count`, `target_customers[]`)",
    r,
  );
  const hook = add(webhook("프로모션 Webhook", "web/promotion"), r, 0);
  const f05 = add(call("F05 프로모션 대상 고객 선정", "F05", { document_id: "$json.body.document_id", store_id: "$json.body.store_id" }), r, 1);
  const check = add(
    code(
      "F05 결과 확인",
      `const result = $input.first()?.json ?? {};

if (typeof result.status !== 'string') {
  return [{ json: { targeted: false, response: {
    success: false,
    error_code: 'PROMOTION_FAILED',
    message: result.error
      ? 'F05 실행 중 오류: ' + String(result.error.message ?? result.error)
      : 'F05 프로모션 대상 고객 선정이 결과를 반환하지 않았습니다.',
  } } }];
}

// F06 프로모션 일정은 고객 한 명씩 만든다. F05가 선정한 고객 ID 목록을 넘겨 다음 노드에서 한 명씩 나눈다.
const targetIds = Array.isArray(result.target_customers)
  ? result.target_customers.map((c) => c.customer_id).filter(Boolean)
  : [];

return [{ json: { targeted: result.status === 'targeted' && targetIds.length > 0, document_id: result.document_id, target_ids: targetIds, response: result } }];`,
    ),
    r,
    2,
  );
  const targeted = add(iff("프로모션: 대상 있음?", "$json.targeted === true"), r, 3);
  const split = add(
    code(
      "프로모션: 대상 고객 나누기",
      `const checked = $('F05 결과 확인').first().json;
return checked.target_ids.map((customerId) => ({ json: { document_id: checked.document_id, customer_id: customerId } }));`,
    ),
    r + 0.6,
    4,
  );
  const f06 = add(
    call(
      "프로모션: F06 일정 생성",
      "F06",
      {
        schedule_type: "'promotion'",
        customer_id: "$json.customer_id",
        consultation_id: "''",
        document_id: "$json.document_id",
      },
      { each: true },
    ),
    r + 0.6,
    5,
  );
  const build = add(code("프로모션 응답 구성", `return [{ json: $('F05 결과 확인').first().json.response }];`), r, 6);
  const reply = add(respond("프로모션 응답"), r, 7);
  link(hook, f05);
  link(f05, check);
  link(check, targeted);
  link(targeted, split, 0);
  link(split, f06);
  link(targeted, build, 1);
  link(f06, build);
  link(build, reply);
}

// ---------------------------------------------------------------------------
// 6. 프로모션 등록: 입력 정리 → 본문 임베딩 → documents + kt_promotion_vectors 저장 → 응답
//    대상 선정과 일정 생성은 등록 후 5번 경로(web/promotion)로 따로 실행한다.
// ---------------------------------------------------------------------------
{
  const r = 8.4;
  group = "promotion-register";
  note(
    "안내: 프로모션 등록",
    "## POST /webhook/web/promotion-register\n요청: `{ store_id, promotion_name, valid_from, valid_until, benefit, promotion_type?, target_device?, target_plan?, target_customer?, conditions? }`\n\n프로모션 문서 행(`documents`)과 본문 조각(`kt_promotion_vectors`, `document_id` 열과 메타데이터 양쪽에 문서 ID)을 한 번에 저장한다. F05가 대상 조건을 읽고 F07이 문자를 쓰는 데 이 조각을 쓴다.\n\n응답: `{ success, document_id, file_name, valid_from, valid_until }`",
    r,
    240,
  );
  const hook = add(webhook("프로모션 등록 Webhook", "web/promotion-register"), r, 0);
  const prepare = add(
    code(
      "등록 입력 정리",
      `const body = $input.first().json.body ?? {};
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isDate = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value);

const name = text(body.promotion_name);
const storeId = text(body.store_id);
const from = text(body.valid_from);
const until = text(body.valid_until);
const benefit = text(body.benefit);

const fail = (message) => [{ json: { valid: false, response: { success: false, error_code: 'INVALID_INPUT', message } } }];

if (!storeId) return fail('매장 정보가 없습니다.');
if (!name) return fail('프로모션 이름을 입력해 주세요.');
if (!isDate(from) || !isDate(until)) return fail('적용 기간을 입력해 주세요.');
if (from > until) return fail('종료일이 시작일보다 빠릅니다.');
if (!benefit) return fail('혜택 내용을 입력해 주세요.');

// documents.document_id 는 varchar(20) 이다. 'PROMO-' + 13자리 = 19자.
const documentId = 'PROMO-' + Date.now();

// F05(대상 조건 추출)와 F07(문자 생성)이 읽는 본문. 기존 프로모션 문서와 같은 형식으로 만든다.
const lines = [
  ['프로모션 ID', documentId],
  ['프로모션명', name],
  ['프로모션 유형', text(body.promotion_type)],
  ['대상 기기', text(body.target_device)],
  ['대상 요금제', text(body.target_plan)],
  ['대상 고객', text(body.target_customer)],
  ['혜택', benefit],
  ['조건', text(body.conditions)],
  ['적용 기간', from + ' ~ ' + until],
].filter(([, value]) => value).map(([label, value]) => label + ': ' + value);

return [{ json: {
  valid: true,
  document_id: documentId,
  store_id: storeId,
  file_name: name,
  // PDF에서 등록하면 원본이 보관된 경로가 온다. 직접 입력이면 web/<문서 ID>.
  file_path: text(body.file_path) || 'web/' + documentId,
  valid_from: from,
  valid_until: until,
  content: lines.join('\\n'),
  metadata: JSON.stringify({
    source: 'web',
    store_id: storeId,
    file_name: name,
    document_id: documentId,
    document_type: 'promotion',
  }),
} }];`,
    ),
    r,
    1,
  );
  const valid = add(iff("등록: 입력 유효?", "$json.valid === true"), r, 2);
  // F05의 Embeddings OpenAI 노드와 같은 모델(기본값 text-embedding-3-small, 1536차원)을 쓴다.
  const embed = add(
    {
      name: "등록: 본문 임베딩",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      alwaysOutputData: true,
      onError: "continueRegularOutput",
      credentials: OPENAI_CREDENTIAL,
      parameters: {
        method: "POST",
        url: "https://api.openai.com/v1/embeddings",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "openAiApi",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ model: 'text-embedding-3-small', input: $json.content }) }}",
        options: {},
      },
    },
    r,
    3,
  );
  // 문서 행과 본문 조각을 한 문장으로 저장한다. 임베딩이 없으면 vector 변환에서 실패해 둘 다 저장되지 않는다.
  const save = add(
    {
      ...postgres(
        "등록: 문서·본문 저장",
        `-- 같은 매장에 같은 이름의 프로모션이 있으면 새로 만들지 않고 그것을 돌려준다.
WITH existing AS (
    SELECT document_id, file_name, valid_from, valid_until
    FROM public.documents
    WHERE store_id = $2
      AND document_type = 'promotion'
      AND file_name = $3
    ORDER BY document_id
    LIMIT 1
),
doc AS (
    INSERT INTO public.documents (
        document_id, store_id, document_type, file_name, file_path, valid_from, valid_until
    )
    SELECT $1, $2, 'promotion', $3, $4, $5::date, $6::date
    WHERE NOT EXISTS (SELECT 1 FROM existing)
    RETURNING document_id, file_name, valid_from, valid_until
),
-- 문서에 연결되지 않은 본문 조각 중 같은 프로모션명이 있으면(예전에 CSV로 넣은 자료) 새로 넣지 않고 그 조각을 이 문서에 연결한다.
linked AS (
    UPDATE public.kt_promotion_vectors v
    SET document_id = doc.document_id,
        metadata = COALESCE(v.metadata, '{}'::jsonb) || $8::jsonb
    FROM doc
    WHERE v.vector_id = (
        SELECT c.vector_id
        FROM public.kt_promotion_vectors c
        WHERE c.document_id IS NULL
          AND position('프로모션명: ' || $3::text || E'\\n' IN c.content || E'\\n') > 0
        ORDER BY c.vector_id
        LIMIT 1
    )
    RETURNING v.vector_id
),
vec AS (
    -- F05의 조각 확인과 F07의 본문 조회는 document_id 열을, F05의 검색은 metadata 의 document_id 를 본다. 둘 다 채운다.
    INSERT INTO public.kt_promotion_vectors (content, metadata, embedding, document_id)
    SELECT $7, $8::jsonb, $9::vector, doc.document_id
    FROM doc
    WHERE NOT EXISTS (SELECT 1 FROM linked)
    RETURNING vector_id
)
SELECT
    doc.document_id,
    doc.file_name,
    doc.valid_from,
    doc.valid_until,
    COALESCE((SELECT vector_id FROM linked), (SELECT vector_id FROM vec)) AS vector_id,
    false AS already_exists
FROM doc
UNION ALL
SELECT
    existing.document_id,
    existing.file_name,
    existing.valid_from,
    existing.valid_until,
    NULL,
    true
FROM existing;`,
        `(() => {
  const p = $('등록 입력 정리').first().json;
  return [
    p.document_id, p.store_id, p.file_name, p.file_path, p.valid_from, p.valid_until,
    p.content, p.metadata,
    JSON.stringify($json.data?.[0]?.embedding ?? null),
  ];
})()`,
      ),
      onError: "continueRegularOutput",
    },
    r,
    4,
  );
  const build = add(
    code(
      "등록 응답 구성",
      `const input = $('등록 입력 정리').first().json;
if (!input.valid) return [{ json: input.response }];

const saved = $input.first()?.json ?? {};
if (saved.document_id && saved.already_exists === true) {
  return [{ json: {
    success: true,
    already_exists: true,
    document_id: saved.document_id,
    file_name: saved.file_name,
    valid_from: String(saved.valid_from ?? '').slice(0, 10),
    valid_until: String(saved.valid_until ?? '').slice(0, 10),
  } }];
}
if (saved.document_id && saved.vector_id) {
  return [{ json: {
    success: true,
    document_id: saved.document_id,
    file_name: input.file_name,
    valid_from: input.valid_from,
    valid_until: input.valid_until,
  } }];
}

// 어느 단계에서 실패했는지 웹사이트에서 볼 수 있게 오류 내용을 함께 돌려준다.
let embedding = {};
try { embedding = $('등록: 본문 임베딩').first()?.json ?? {}; } catch (error) { embedding = {}; }
const reason = !Array.isArray(embedding.data)
  ? '본문 임베딩 실패: ' + String(embedding.error?.message ?? embedding.error ?? '응답 없음')
  : '저장 실패: ' + String(saved.message ?? saved.error?.message ?? '결과 없음');

return [{ json: { success: false, error_code: 'REGISTER_FAILED', message: '프로모션을 등록하지 못했습니다. ' + reason } }];`,
    ),
    r,
    5,
  );
  const reply = add(respond("등록 응답"), r, 6);
  link(hook, prepare);
  link(prepare, valid);
  link(valid, embed, 0);
  link(valid, build, 1);
  link(embed, save);
  link(save, build);
  link(build, reply);
}

// ---------------------------------------------------------------------------
// 7. 프로모션 PDF 분석: PDF에서 꺼낸 글자 → AI가 프로모션별로 나눔 → 응답
//    저장은 하지 않는다. 직원이 확인한 뒤 6번 경로(web/promotion-register)로 한 건씩 등록한다.
// ---------------------------------------------------------------------------
{
  const r = 9.9;
  group = "promotion-parse";
  note(
    "안내: 프로모션 PDF 분석",
    "## POST /webhook/web/promotion-parse\n요청: `{ text, file_name }` (웹사이트가 PDF에서 꺼낸 글자)\n\nAI가 문서 안의 프로모션을 하나씩 나눠 항목을 뽑는다. DB에는 쓰지 않는다.\n\n응답: `{ success, promotions: [{ promotion_name, promotion_type, target_device, target_plan, target_customer, benefit, conditions, valid_from, valid_until }] }`",
    r,
    240,
  );
  const hook = add(webhook("프로모션 분석 Webhook", "web/promotion-parse"), r, 0);
  const prepare = add(
    code(
      "분석 요청 구성",
      `const body = $input.first().json.body ?? {};
const text = typeof body.text === 'string' ? body.text.trim() : '';
if (text.length < 20) {
  return [{ json: { valid: false, response: { success: false, error_code: 'INVALID_INPUT', message: '분석할 내용이 없습니다.' } } }];
}

const field = { type: 'string' };
const names = ['promotion_name', 'promotion_type', 'target_device', 'target_plan', 'target_customer', 'benefit', 'conditions', 'valid_from', 'valid_until'];

const system = [
  '당신은 이동통신 매장의 프로모션 문서를 정리하는 도우미입니다.',
  '문서에 들어 있는 프로모션을 하나씩 나눠, 주어진 형식으로 돌려줍니다.',
  '',
  '규칙:',
  '- 문서에 실제로 적힌 내용만 씁니다. 없는 혜택, 조건, 날짜를 만들지 않습니다.',
  '- 같은 프로모션이 목록과 상세에 두 번 나오면 한 건으로 합칩니다.',
  '- promotion_name 에는 프로모션 이름만 넣습니다. P001 같은 문서 안의 번호는 넣지 않습니다.',
  '- benefit 에는 혜택과 혜택 금액을 함께 적습니다.',
  '- conditions 에는 조건과 제외 조건을 함께 적습니다.',
  '- valid_from, valid_until 은 YYYY-MM-DD 형식입니다. 문서에 날짜가 없거나 "-" 이면 빈 문자열로 둡니다. 날짜를 추측하지 않습니다.',
  '- 해당 값이 없는 칸은 빈 문자열로 둡니다.',
  '- 문서에 나온 순서대로 돌려줍니다.',
].join('\\n');

return [{ json: {
  valid: true,
  request: {
    model: 'gpt-5-mini',
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: '[파일 이름]\\n' + String(body.file_name ?? '') + '\\n\\n[문서 내용]\\n' + text },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'promotions',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['promotions'],
          properties: {
            promotions: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: names,
                properties: Object.fromEntries(names.map((name) => [name, field])),
              },
            },
          },
        },
      },
    },
  },
} }];`,
    ),
    r,
    1,
  );
  const valid = add(iff("분석: 입력 유효?", "$json.valid === true"), r, 2);
  const llm = add(
    {
      name: "분석: 프로모션 나누기",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.2,
      alwaysOutputData: true,
      onError: "continueRegularOutput",
      credentials: OPENAI_CREDENTIAL,
      parameters: {
        method: "POST",
        url: "https://api.openai.com/v1/chat/completions",
        authentication: "predefinedCredentialType",
        nodeCredentialType: "openAiApi",
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify($json.request) }}",
        options: { timeout: 95000 },
      },
    },
    r,
    3,
  );
  const build = add(
    code(
      "분석 응답 구성",
      `const input = $('분석 요청 구성').first().json;
if (!input.valid) return [{ json: input.response }];

const reply = $input.first()?.json ?? {};
const fail = (reason) => [{ json: { success: false, error_code: 'PARSE_FAILED', message: 'PDF 내용을 분석하지 못했습니다. ' + reason } }];

const content = reply.choices?.[0]?.message?.content;
if (typeof content !== 'string') return fail(String(reply.error?.message ?? reply.error ?? '응답 없음'));

let parsed;
try { parsed = JSON.parse(content); } catch (error) { return fail('결과 형식 오류'); }

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const blank = (value) => (value === '-' ? '' : value);
const date = (value) => (/^\\d{4}-\\d{2}-\\d{2}$/.test(text(value)) ? text(value) : '');

const promotions = (Array.isArray(parsed.promotions) ? parsed.promotions : [])
  .map((item) => ({
    promotion_name: text(item.promotion_name),
    promotion_type: blank(text(item.promotion_type)),
    target_device: blank(text(item.target_device)),
    target_plan: blank(text(item.target_plan)),
    target_customer: blank(text(item.target_customer)),
    benefit: blank(text(item.benefit)),
    conditions: blank(text(item.conditions)),
    valid_from: date(item.valid_from),
    valid_until: date(item.valid_until),
  }))
  .filter((item) => item.promotion_name);

return [{ json: { success: true, promotions } }];`,
    ),
    r,
    4,
  );
  const reply = add(respond("분석 응답"), r, 5);
  link(hook, prepare);
  link(prepare, valid);
  link(valid, llm, 0);
  link(valid, build, 1);
  link(llm, build);
  link(build, reply);
}

const workflow = {
  name: "웹 게이트웨이 (시연용 웹사이트 연동)",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  pinData: {},
  tags: [],
};

// ---- 검증 ----
const problems = [];
const names = new Set();
for (const node of nodes) {
  if (names.has(node.name)) problems.push(`노드 이름 중복: ${node.name}`);
  names.add(node.name);
}
for (const [from, { main }] of Object.entries(connections)) {
  if (!names.has(from)) problems.push(`연결의 출발 노드가 없음: ${from}`);
  for (const target of main.flat()) if (!names.has(target.node)) problems.push(`연결의 도착 노드가 없음: ${target.node}`);
}
// 코드·표현식이 참조하는 노드 이름이 실제로 있는지 확인
for (const node of nodes) {
  for (const match of JSON.stringify(node.parameters).matchAll(/\$\('([^']+)'\)/g)) {
    if (!names.has(match[1])) problems.push(`${node.name}: 없는 노드를 참조함 → ${match[1]}`);
  }
}
// 모든 webhook에서 출발해 응답 노드에 도달할 수 있는지 확인
const reachesRespond = (start, seen = new Set()) => {
  if (seen.has(start)) return false;
  seen.add(start);
  if (nodes.find((n) => n.name === start)?.type === "n8n-nodes-base.respondToWebhook") return true;
  return (connections[start]?.main ?? []).flat().some((target) => reachesRespond(target.node, seen));
};
for (const node of nodes.filter((n) => n.type === "n8n-nodes-base.webhook")) {
  if (!reachesRespond(node.name)) problems.push(`${node.name}: 응답 노드에 도달하지 못함`);
}

// 기본값은 n8n에서 내보낸 발행본(n8n/workflows, scripts/export-workflows.mjs 로 갱신)이다.
const sourceDir = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? join(root, "n8n", "workflows");
if (sourceDir && existsSync(sourceDir)) {
  const originals = new Map();
  for (const file of readdirSync(sourceDir).filter((f) => f.endsWith(".json"))) {
    const data = JSON.parse(readFileSync(join(sourceDir, file), "utf8"));
    const trigger = data.nodes.find((n) => n.type === "n8n-nodes-base.executeWorkflowTrigger");
    originals.set(data.id, {
      file,
      inputs: (trigger?.parameters?.workflowInputs?.values ?? []).map((v) => ({ name: v.name, type: v.type ?? "string" })),
    });
  }
  for (const [key, wf] of Object.entries(WORKFLOWS)) {
    const original = originals.get(wf.id);
    if (!original) {
      problems.push(`${key}: 원본에 ID ${wf.id} 인 워크플로우가 없음`);
      continue;
    }
    const declared = new Map(original.inputs.map((i) => [i.name, i.type]));
    for (const [field, type] of Object.entries(wf.inputs)) {
      if (!declared.has(field)) problems.push(`${key} (${original.file}): 원본 트리거에 입력 '${field}' 없음`);
      else if (declared.get(field) !== type) problems.push(`${key}: 입력 '${field}' 타입 불일치 (원본 ${declared.get(field)}, 게이트웨이 ${type})`);
    }
    for (const field of declared.keys()) {
      if (!(field in wf.inputs)) problems.push(`${key} (${original.file}): 원본 입력 '${field}' 가 게이트웨이 정의에 없음`);
    }
  }
  console.log(`원본 워크플로우 ${originals.size}개와 대조했습니다.`);
} else {
  console.log("원본 폴더를 지정하지 않아 ID·입력 필드 대조는 건너뜁니다.");
}

// --allow-mismatch: n8n 쪽을 곧 고칠 예정일 때, 어긋난 점을 알리기만 하고 파일은 만든다.
if (problems.length) {
  console.error("검증 실패:\n- " + problems.join("\n- "));
  if (!process.argv.includes("--allow-mismatch")) process.exit(1);
  console.error("--allow-mismatch 로 계속합니다. 위 항목은 n8n에서 맞춰야 동작합니다.");
}

mkdirSync(join(root, "n8n"), { recursive: true });
const output = join(root, "n8n", "web-gateway.json");
writeFileSync(output, JSON.stringify(workflow, null, 2) + "\n");
JSON.parse(readFileSync(output, "utf8"));

// 한 경로만 기존 워크플로우(zWF Main)에 붙여 넣을 수 있도록 조각 파일도 만든다.
// n8n 캔버스에 파일 내용을 그대로 붙여 넣으면 노드와 연결이 함께 들어간다.
mkdirSync(join(root, "n8n", "parts"), { recursive: true });
for (const name of new Set(groupOf.values())) {
  const partNodes = nodes.filter((n) => groupOf.get(n.name) === name);
  const partNames = new Set(partNodes.map((n) => n.name));
  const partConnections = Object.fromEntries(Object.entries(connections).filter(([from]) => partNames.has(from)));
  writeFileSync(
    join(root, "n8n", "parts", `${name}.json`),
    JSON.stringify({ nodes: partNodes, connections: partConnections, pinData: {} }, null, 2) + "\n",
  );
}
console.log(`생성 완료: n8n/web-gateway.json (노드 ${nodes.length}개, webhook ${nodes.filter((n) => n.type.endsWith(".webhook")).length}개)`);
