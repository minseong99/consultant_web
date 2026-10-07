// 프로모션 목록에 보여 줄 요약과 그림을 정한다. 서버와 화면이 함께 쓴다.
// 요약은 등록할 때 저장한 본문("라벨: 값" 줄들)에서 읽는다. 본문에 없는 내용은 만들지 않는다.

export type PromotionSummary = {
  promotion_type: string;
  target_device: string;
  target_plan: string;
  target_customer: string;
  benefit: string;
  conditions: string;
};

export type DeviceRef = { device_id: string; device_name: string };

const LABELS: Record<string, keyof PromotionSummary> = {
  "프로모션 유형": "promotion_type",
  "대상 기기": "target_device",
  "대상 요금제": "target_plan",
  "대상 고객": "target_customer",
  혜택: "benefit",
  조건: "conditions",
};

/** 본문에서 요약을 읽는다. 읽을 것이 하나도 없으면 null */
export function parsePromotionContent(content: string | null | undefined): PromotionSummary | null {
  const summary: PromotionSummary = { promotion_type: "", target_device: "", target_plan: "", target_customer: "", benefit: "", conditions: "" };
  let found = false;
  for (const line of (content ?? "").split("\n")) {
    const at = line.indexOf(":");
    if (at === -1) continue;
    const key = LABELS[line.slice(0, at).trim()];
    const value = line.slice(at + 1).trim();
    if (key && value && value !== "-" && !summary[key]) {
      summary[key] = value;
      found = true;
    }
  }
  return found ? summary : null;
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
/** "Galaxy S26 256GB" → "Galaxy S26" */
const modelOf = (name: string) => name.replace(/\s+\d+\s?(GB|TB)$/i, "").trim();

/**
 * 대상 기기 글에 이름이 적힌 기기를 찾는다(최대 3개). 사진을 고르는 데 쓴다.
 * "Galaxy Z Fold8 Ultra / Fold8 / Flip8" 처럼 뒤쪽이 줄여 적힌 경우도 맞춘다.
 * "Galaxy 전 단말" 처럼 특정 기기가 없는 글은 아무것도 고르지 않는다.
 */
export function matchDevices(target: string | null | undefined, devices: DeviceRef[], limit = 3): DeviceRef[] {
  const whole = squash(target ?? "");
  if (!whole) return [];
  const parts = (target ?? "").split(/[/,·]/).map(squash).filter((part) => part.length >= 4);
  const picked = new Map<string, DeviceRef>();
  // 적힌 순서대로 고르기 위해, 글 조각마다 가장 잘 맞는 기기를 하나씩 찾는다.
  for (const part of parts.length ? parts : [whole]) {
    const hit =
      devices.find((device) => squash(modelOf(device.device_name)) === part) ??
      devices.find((device) => squash(modelOf(device.device_name)).endsWith(part) && /\d/.test(part)) ??
      devices.find((device) => part.includes(squash(modelOf(device.device_name)))) ??
      // "Galaxy A37" → "Galaxy A37 5G" 처럼 기기 이름 쪽이 더 긴 경우
      devices.find((device) => squash(modelOf(device.device_name)).startsWith(part) && /\d/.test(part));
    if (hit && !picked.has(squash(modelOf(hit.device_name)))) picked.set(squash(modelOf(hit.device_name)), hit);
    if (picked.size >= limit) break;
  }
  return [...picked.values()];
}

export type PromotionKind = "gift" | "discount" | "coupon" | "payback" | "bundle" | "wearable" | "general";

/** 사진이 없을 때 보여 줄 그림의 종류. 유형과 혜택에 적힌 낱말로 정한다. */
export function promotionKind(name: string, summary: PromotionSummary | null): PromotionKind {
  const text = `${summary?.promotion_type ?? ""} ${name} ${summary?.benefit ?? ""}`;
  if (/결합|가족/.test(text)) return "bundle";
  if (/페이백|캐시백|포인트/.test(text)) return "payback";
  if (/쿠폰/.test(text)) return "coupon";
  if (/사은품|증정|패키지|사전예약/.test(text)) return "gift";
  if (/워치|watch|2nd|버즈|buds/i.test(text)) return "wearable";
  if (/할인|%|0원/.test(text)) return "discount";
  return "general";
}
