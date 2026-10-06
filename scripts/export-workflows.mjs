// n8n에서 현재 발행된 워크플로우를 읽어 n8n/workflows/ 에 저장한다 (읽기 전용 호출만 한다).
//   node scripts/export-workflows.mjs
// .env.local 의 N8N_API_KEY 가 필요하다. 저장소가 공개이므로 다음은 저장하지 않는다.
//   - pinData (테스트 고객 데이터와 서명된 스토리지 URL이 들어 있음)
//   - Google Calendar ID (자리표시자로 바꿈)
//   - 발행되지 않은 편집본 (동작 중인 것은 발행본이다)

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "https://gotu4545.app.n8n.cloud";

// 웹사이트 시연에 쓰는 워크플로우. 게이트웨이(WF Main)와 그것이 호출하는 것, 매일 자동 발송(WF04).
const WORKFLOW_IDS = [
  "Ugmi4IxYjIeU2aaT", // WF Main (웹 게이트웨이)
  "DmykDmlhlWgPXYD5", // F01 고객 및 동의 정보 저장
  "NGN6YgDidp9E3vtf", // F02 고객 데이터 분석
  "UE93OTVJAdGtLZyl", // F03 맞춤 상품 추천
  "1cmpN1S79uDoS2xw", // F04 상담 결과 처리
  "kSNl11r9lqQjBO5E", // F05 프로모션 대상 고객 선정
  "j9aDZV3iDfCQaFsM", // F06 일정 관리
  "ToiPmysSaFmYC7p1", // F06 약정 스케줄링 (서브)
  "xNdwg0CpkrO7UVTG", // F06 재상담 스케줄링 (서브)
  "ILuDzi3zxsuiZmgj", // F06 프로모션 스케줄링 (서브)
  "QFjC2ARP9Q6fCExH", // F07 개별 메시지 처리
  "fT4gWUVbI5Hpuegq", // F07 맞춤 메시지 생성 (서브)
  "CfAOBLyDDNAD50yU", // F07 문자 발송 및 결과 처리 (서브)
  "AGUr1pcjAH5Jrkrt", // zWF04 메세지 생성 및 발송
];

function apiKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const line = readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("N8N_API_KEY="));
  if (!line) throw new Error("N8N_API_KEY 가 없습니다 (.env.local)");
  return line.slice("N8N_API_KEY=".length).trim().replace(/^"|"$/g, "");
}

const key = apiKey();
const outDir = join(root, "n8n", "workflows");
mkdirSync(outDir, { recursive: true });
for (const file of readdirSync(outDir).filter((f) => f.endsWith(".json"))) rmSync(join(outDir, file));

const SECRET_LIKE = /eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|token=[A-Za-z0-9._-]{10,}/;
const rows = [];

for (const id of WORKFLOW_IDS) {
  const response = await fetch(`${HOST}/api/v1/workflows/${id}`, { headers: { "X-N8N-API-KEY": key } });
  if (!response.ok) throw new Error(`${id}: 조회 실패 (HTTP ${response.status})`);
  const workflow = await response.json();
  const published = workflow.activeVersion;
  if (!published) throw new Error(`${workflow.name}: 발행된 버전이 없습니다`);

  let text = JSON.stringify(
    { id: workflow.id, name: workflow.name, nodes: published.nodes, connections: published.connections, settings: workflow.settings ?? {} },
    null,
    2,
  );
  text = text.replace(/[a-z0-9]{20,}@group\.calendar\.google\.com/g, "<GOOGLE_CALENDAR_ID>");
  if (SECRET_LIKE.test(text)) throw new Error(`${workflow.name}: 키나 토큰으로 보이는 값이 있어 저장하지 않았습니다`);

  writeFileSync(join(outDir, `${workflow.name}.json`), text + "\n");
  rows.push({
    name: workflow.name,
    id: workflow.id,
    nodes: published.nodes.filter((n) => n.type !== "n8n-nodes-base.stickyNote").length,
    updatedAt: workflow.updatedAt,
    draft: workflow.activeVersionId !== workflow.versionId,
  });
}

for (const row of rows) {
  console.log(`${row.name} (${row.id}) 노드 ${row.nodes}개, 수정 ${row.updatedAt}${row.draft ? "  ※ 발행되지 않은 편집본이 따로 있음" : ""}`);
}
console.log(`\n${rows.length}개를 n8n/workflows/ 에 저장했습니다.`);
