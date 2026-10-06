// 워크플로우가 DB에 쓰는 상태값 → 한글 라벨·색. 모르는 값은 원문 그대로 회색으로 표시한다.

export type Tone = "gray" | "blue" | "amber" | "green" | "red" | "violet";

type LabelMap = Record<string, { label: string; tone: Tone }>;

export const SCHEDULE_STATUS: LabelMap = {
  scheduled: { label: "예정", tone: "blue" },
  processing: { label: "처리 중", tone: "amber" },
  sent: { label: "발송 완료", tone: "green" },
  failed: { label: "실패", tone: "red" },
  skipped: { label: "건너뜀", tone: "gray" },
  cancelled: { label: "취소", tone: "gray" },
};

export const SCHEDULE_TYPE: LabelMap = {
  contract: { label: "약정 만료 안내", tone: "violet" },
  reconsultation: { label: "재상담 안내", tone: "blue" },
  promotion: { label: "프로모션 안내", tone: "amber" },
};

export const SCHEDULE_SUBTYPE: Record<string, string> = {
  contract_notice_1: "1차 안내",
  contract_notice_2: "2차 안내",
  reconsultation_1d_before: "재상담 1일 전",
  promotion_start: "프로모션 시작",
  promotion_end_2d_before: "종료 2일 전",
};

export const SEND_STATUS: LabelMap = {
  pending: { label: "발송 대기", tone: "gray" },
  sending: { label: "발송 중", tone: "amber" },
  sent: { label: "발송 완료", tone: "green" },
  failed: { label: "실패", tone: "red" },
};

export const RESULT_STATUS: LabelMap = {
  completed: { label: "완료", tone: "green" },
  pending: { label: "보류", tone: "amber" },
  rejected: { label: "거절", tone: "red" },
  follow_up: { label: "후속 연락 필요", tone: "blue" },
};

export const INFORMATION_STATUS: LabelMap = {
  sufficient: { label: "정보 충분", tone: "green" },
  partial: { label: "일부 정보 부족", tone: "amber" },
  insufficient: { label: "정보 부족", tone: "red" },
};

export const PROMOTION_STATUS: LabelMap = {
  targeted: { label: "대상 선정 완료", tone: "green" },
  no_target: { label: "대상 없음", tone: "gray" },
  promotion_not_found: { label: "프로모션 없음", tone: "red" },
  condition_not_found: { label: "조건 문서 없음", tone: "amber" },
};

export function lookup(map: LabelMap, value: string | null | undefined) {
  if (!value) return { label: "-", tone: "gray" as Tone };
  return map[value] ?? { label: value, tone: "gray" as Tone };
}

export function scheduleTitle(type: string, subtype: string | null) {
  const base = lookup(SCHEDULE_TYPE, type).label;
  const sub = subtype ? SCHEDULE_SUBTYPE[subtype] : null;
  return sub ? `${base} · ${sub}` : base;
}
