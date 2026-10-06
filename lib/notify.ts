import { formatDateTime } from "./format";
import { lookup, SCHEDULE_TYPE, scheduleTitle } from "./labels";
import type { Feed, ScheduleItem } from "./types";

export type NoticeKind = "customer" | "schedule_created" | "sent" | "failed" | "skipped" | "cancelled";

export type Notice = {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  href: string;
  at: string;
};

// 한 번의 폴링에서 같은 유형의 일정이 이 개수 이상 생기면 한 건으로 묶는다 (프로모션).
const GROUP_THRESHOLD = 4;

const STATUS_NOTICES: Record<string, { kind: NoticeKind; title: (s: ScheduleItem) => string; body: (s: ScheduleItem) => string }> = {
  sent: {
    kind: "sent",
    title: (s) => `${s.customer_name} 고객에게 문자가 발송되었습니다`,
    body: (s) => scheduleTitle(s.schedule_type, s.schedule_subtype),
  },
  failed: {
    kind: "failed",
    title: (s) => `${s.customer_name} 고객 문자 발송에 실패했습니다`,
    body: (s) => scheduleTitle(s.schedule_type, s.schedule_subtype),
  },
  skipped: {
    kind: "skipped",
    title: (s) => `${s.customer_name} 고객 문자를 발송하지 않았습니다`,
    body: () => "동의 조건을 충족하지 않습니다",
  },
  cancelled: {
    kind: "cancelled",
    title: (s) => `${s.customer_name} 고객 ${scheduleTitle(s.schedule_type, s.schedule_subtype)} 일정이 취소되었습니다`,
    body: (s) => s.contact_reason ?? "",
  },
};

/**
 * 직전 스냅샷과 비교해 알림을 만든다. 첫 스냅샷(prev 없음)은 기준선이므로 알림이 없다.
 * 표에 없는 상태 변화(processing 진입, scheduled 복귀 등)는 알림을 만들지 않는다.
 */
export function diffFeed(prev: Feed | null, next: Feed): Notice[] {
  if (!prev) return [];
  const at = next.fetched_at;
  const notices: Notice[] = [];

  const knownCustomers = new Set(prev.customers.map((c) => c.customer_id));
  for (const customer of next.customers) {
    if (knownCustomers.has(customer.customer_id)) continue;
    notices.push({
      id: `customer:${customer.customer_id}`,
      kind: "customer",
      title: `새 고객 ${customer.customer_name} 님이 정보를 등록했습니다`,
      body: customer.consultation_goal,
      href: `/staff/customers/${customer.customer_id}`,
      at,
    });
  }

  const previous = new Map(prev.schedules.map((s) => [s.schedule_id, s.schedule_status]));
  const created = next.schedules.filter((s) => !previous.has(s.schedule_id));
  const byType = new Map<string, ScheduleItem[]>();
  for (const schedule of created) {
    byType.set(schedule.schedule_type, [...(byType.get(schedule.schedule_type) ?? []), schedule]);
  }
  for (const [type, items] of byType) {
    if (items.length >= GROUP_THRESHOLD) {
      notices.push({
        id: `created:${type}:${at}`,
        kind: "schedule_created",
        title: `${lookup(SCHEDULE_TYPE, type).label} 일정 ${items.length}건이 생성되었습니다`,
        body: items[0].document_name ?? items[0].contact_reason ?? "",
        href: "/staff/schedules",
        at,
      });
      continue;
    }
    for (const schedule of items) {
      notices.push({
        id: `created:${schedule.schedule_id}`,
        kind: "schedule_created",
        title: `${schedule.customer_name} 고객 ${lookup(SCHEDULE_TYPE, schedule.schedule_type).label} 일정이 생성되었습니다`,
        body: `${formatDateTime(schedule.scheduled_contact_at)} 발송 예정 · ${schedule.contact_reason ?? ""}`,
        href: `/staff/schedules?focus=${schedule.schedule_id}`,
        at,
      });
    }
  }

  for (const schedule of next.schedules) {
    const before = previous.get(schedule.schedule_id);
    if (before === undefined || before === schedule.schedule_status) continue;
    const template = STATUS_NOTICES[schedule.schedule_status];
    if (!template) continue;
    notices.push({
      id: `${template.kind}:${schedule.schedule_id}:${at}`,
      kind: template.kind,
      title: template.title(schedule),
      body: template.body(schedule),
      href: `/staff/schedules?focus=${schedule.schedule_id}`,
      at,
    });
  }

  return notices;
}
