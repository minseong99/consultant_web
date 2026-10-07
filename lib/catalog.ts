// 고객 접수 화면의 "현재 사용 기기", "현재 요금제" 선택지를 DB의 devices·plans 행에서 만든다.
// 묶음(종류)은 이름 규칙으로 나눈다. DB에 행을 추가하면 화면에 바로 나타나고, 규칙에 없는 이름은 "기타"나 제조사 이름 묶음으로 간다.
import type { OptionGroup } from "./fields";

export type DeviceRow = { device_name: string; manufacturer: string | null };
export type PlanRow = { plan_id: string; plan_name: string; monthly_fee: number | null };
export type JoinOptions = { current_device: OptionGroup[]; current_plan: OptionGroup[] };

/** DB에 없지만 요금제 선택에 항상 넣는 항목 (번호이동·모르는 경우) */
export const PLAN_EXTRA: OptionGroup = {
  label: "모름·타사",
  keywords: "몰라 모름 skt lg 유플러스 알뜰폰 타사",
  options: ["잘 모르겠어요", "다른 통신사 이용 중"],
};

const DEVICE_RULES: { label: string; keywords: string; test: (name: string, maker: string) => boolean }[] = [
  { label: "갤럭시 S", keywords: "갤럭시 삼성 samsung 에스 울트라 플러스", test: (name) => /^Galaxy S\d/i.test(name) },
  { label: "갤럭시 Z 플립", keywords: "갤럭시 삼성 samsung 폴더블 플립 제트", test: (name) => /^Galaxy Z Flip/i.test(name) },
  { label: "갤럭시 Z 폴드", keywords: "갤럭시 삼성 samsung 폴더블 폴드 제트", test: (name) => /^Galaxy Z Fold/i.test(name) },
  { label: "갤럭시 A", keywords: "갤럭시 삼성 samsung 에이", test: (name) => /^Galaxy A\d/i.test(name) },
  { label: "갤럭시 기타", keywords: "갤럭시 삼성 samsung 점프", test: (name, maker) => /^Galaxy/i.test(name) || /samsung/i.test(maker) },
  { label: "아이폰", keywords: "아이폰 애플 apple 프로 맥스 플러스 에어", test: (name, maker) => /^iPhone/i.test(name) || /apple/i.test(maker) },
];

const PLAN_RULES: { label: string; keywords: string; test: (name: string) => boolean }[] = [
  { label: "초이스", keywords: "5G 무제한 choice", test: (name) => name.startsWith("초이스") },
  { label: "베이직", keywords: "basic", test: (name) => name.startsWith("베이직") },
  { label: "요고", keywords: "yogo 다이렉트 무약정 온라인", test: (name) => name.startsWith("요고") },
];

/** "Galaxy S25 256GB" → "Galaxy S25". 지금 쓰는 기기를 고를 때 용량까지 묻지 않는다. */
export function deviceLabel(name: string) {
  return name.replace(/\s+\d+\s?(GB|TB)$/i, "").trim();
}

// 이름 속 첫 숫자(세대)를 꺼낸다. 없으면 맨 뒤로 보낸다.
const generation = (name: string) => Number(name.match(/\d+/)?.[0] ?? 0);

export function groupDevices(rows: DeviceRow[]): OptionGroup[] {
  const buckets = new Map<string, { keywords?: string; names: Set<string> }>();
  for (const row of rows) {
    const name = deviceLabel(row.device_name ?? "");
    if (!name) continue;
    const maker = row.manufacturer ?? "";
    const rule = DEVICE_RULES.find((r) => r.test(name, maker));
    const label = rule?.label ?? (maker || "기타");
    if (!buckets.has(label)) buckets.set(label, { keywords: rule?.keywords, names: new Set() });
    buckets.get(label)!.names.add(name);
  }
  // 규칙에 적은 순서를 먼저, 그 밖의 제조사는 뒤에 둔다. 묶음 안에서는 최신 세대부터.
  const order = (label: string) => {
    const index = DEVICE_RULES.findIndex((r) => r.label === label);
    return index === -1 ? DEVICE_RULES.length : index;
  };
  return [...buckets.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b, "ko"))
    .map(([label, { keywords, names }]) => ({
      label,
      keywords,
      options: [...names].sort((a, b) => generation(b) - generation(a) || a.length - b.length || a.localeCompare(b)),
    }));
}

export function groupPlans(rows: PlanRow[]): OptionGroup[] {
  const sorted = rows
    .filter((row) => row.plan_name)
    .sort((a, b) => (a.monthly_fee ?? 0) - (b.monthly_fee ?? 0) || a.plan_id.localeCompare(b.plan_id));
  const groups: OptionGroup[] = [];
  for (const row of sorted) {
    const rule = PLAN_RULES.find((r) => r.test(row.plan_name));
    const label = rule?.label ?? "기타";
    let group = groups.find((g) => g.label === label);
    if (!group) groups.push((group = { label, keywords: rule?.keywords, options: [], notes: {} }));
    if (group.options.includes(row.plan_name)) continue;
    group.options.push(row.plan_name);
    if (row.monthly_fee != null) group.notes![row.plan_name] = `월 ${row.monthly_fee.toLocaleString("ko-KR")}원`;
  }
  const order = (label: string) => {
    const index = PLAN_RULES.findIndex((r) => r.label === label);
    return index === -1 ? PLAN_RULES.length : index;
  };
  return [...groups.sort((a, b) => order(a.label) - order(b.label)), PLAN_EXTRA];
}
