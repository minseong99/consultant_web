"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { Badge, Spinner, StatusLine } from "@/components/ui";
import { addDays, formatDate, formatDateTime, formatTime, todayKST } from "@/lib/format";
import { lookup, SCHEDULE_STATUS, scheduleTitle } from "@/lib/labels";
import type { CustomerListItem, ScheduleItem } from "@/lib/types";

const LIST_LIMIT = 6;

/** 시각(ISO)의 한국 날짜 YYYY-MM-DD */
const dayOf = (value: string | null) => (value ? todayKST(new Date(value)) : "");

// 오늘 접수했고, 접수한 뒤로 상담 기록이 없는 고객
function isWaiting(customer: CustomerListItem, today: string) {
  if (dayOf(customer.registered_at) !== today) return false;
  return !customer.last_consulted_at || customer.last_consulted_at < (customer.registered_at ?? "");
}

// 로그인 후 첫 화면. 통계가 아니라 오늘 할 일을 보여 준다.
export default function TodayPage() {
  const { feed, fresh } = useStaffFeed();
  const today = todayKST();
  // 화면이 갱신될 때(3초마다)의 시각을 기준으로 지연 여부를 본다.
  const now = feed ? new Date(feed.fetched_at).getTime() : 0;

  if (!feed) {
    return (
      <div className="flex justify-center py-16 text-stone-500">
        <Spinner className="!size-6" />
      </div>
    );
  }

  const waiting = feed.customers.filter((c) => isWaiting(c, today));
  const todays = feed.schedules.filter((s) => dayOf(s.scheduled_contact_at) === today);
  // 예약 시각이 1시간 넘게 지났는데도 예정 상태로 남은 것은 자동 발송을 놓친 것이다.
  const overdueBefore = new Date(now - 60 * 60 * 1000).toISOString();
  const isOverdue = (s: ScheduleItem) => s.schedule_status === "scheduled" && new Date(s.scheduled_contact_at).toISOString() < overdueBefore;
  const toSend = todays.filter((s) => (s.schedule_status === "scheduled" || s.schedule_status === "processing") && !isOverdue(s));
  const sentToday = todays.filter((s) => s.schedule_status === "sent").length;
  // 어제와 오늘 예정이었는데 발송되지 않은 것
  const yesterday = addDays(today, -1);
  const attention = feed.schedules.filter(
    (s) =>
      (s.schedule_status === "failed" || s.schedule_status === "skipped" || isOverdue(s)) && dayOf(s.scheduled_contact_at) >= yesterday && dayOf(s.scheduled_contact_at) <= today,
  );
  // 내일부터 7일
  const weekEnd = addDays(today, 7);
  const upcoming = feed.schedules.filter((s) => s.schedule_status === "scheduled" && dayOf(s.scheduled_contact_at) > today && dayOf(s.scheduled_contact_at) <= weekEnd);
  const upcomingByDay = new Map<string, ScheduleItem[]>();
  for (const schedule of upcoming) {
    const day = dayOf(schedule.scheduled_contact_at);
    upcomingByDay.set(day, [...(upcomingByDay.get(day) ?? []), schedule]);
  }

  return (
    <>
      <h1 className="text-[24px] font-bold">오늘</h1>
      <p className="mt-1 text-[14px] text-stone-600">{formatDate(today)}</p>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 md:grid-cols-2">
        {/* 문제가 있을 때만 맨 위에 보여 준다. */}
        {attention.length > 0 && (
          <Section id="attention" title="확인 필요" count={attention.length} unit="건" warning wide note="어제와 오늘 발송되지 않았거나 예약 시각이 지난 연락">
              <ScheduleRows items={attention.slice(0, LIST_LIMIT)} fresh={fresh} showStatus overdue={isOverdue} showDate />
            {attention.length > LIST_LIMIT && <p className="mt-2 text-[13px] text-stone-500">외 {attention.length - LIST_LIMIT}건</p>}
          </Section>
        )}

        <Section id="waiting" title="상담 대기" count={waiting.length} unit="명" emphasis note="오늘 접수했고 아직 상담 기록이 없는 고객" more={{ href: "/staff/customers", label: "고객 전체 보기" }}>
          {waiting.length === 0 ? (
            <Empty>대기 중인 고객이 없습니다. 고객이 접수하면 여기에 바로 나타납니다.</Empty>
          ) : (
            <ul className="divide-y divide-stone-200">
              {waiting.slice(0, LIST_LIMIT).map((customer) => (
                <li key={customer.customer_id} className={fresh.has(customer.customer_id) ? "animate-flash" : ""}>
                  <Row href={`/staff/customers/${customer.customer_id}`}>
                    <span className="w-14 shrink-0 text-[13px] tabular-nums text-stone-500">{formatTime(customer.registered_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[15px] font-bold">
                        <span className="truncate">{customer.customer_name}</span>
                        {fresh.has(customer.customer_id) && <Badge tone="red">새 고객</Badge>}
                      </span>
                      <span className="block truncate text-[13px] text-stone-600">{customer.consultation_goal}</span>
                      <span className="mt-1 block">
                        <StatusLine state={customer.has_analysis ? "done" : "active"} label={customer.has_analysis ? "AI 분석 완료" : "AI 분석 중"} />
                      </span>
                    </span>
                  </Row>
                </li>
              ))}
            </ul>
          )}
          {waiting.length > LIST_LIMIT && <p className="mt-2 text-[13px] text-stone-500">외 {waiting.length - LIST_LIMIT}명</p>}
        </Section>

        <Section id="to-send" title="오늘 나갈 연락" count={toSend.length} unit="건" note={sentToday > 0 ? `예약 시각에 자동으로 발송됩니다 · 오늘 발송 완료 ${sentToday}건` : "예약 시각에 자동으로 작성·발송됩니다"} more={{ href: "/staff/schedules", label: "일정 전체 보기" }}>
          {toSend.length === 0 ? (
            <Empty>{sentToday > 0 ? `오늘 예정된 연락 ${sentToday}건을 모두 보냈습니다.` : "오늘 나갈 연락이 없습니다."}</Empty>
          ) : (
            <ScheduleRows items={toSend.slice(0, LIST_LIMIT)} fresh={fresh} />
          )}
          {toSend.length > LIST_LIMIT && <p className="mt-2 text-[13px] text-stone-500">외 {toSend.length - LIST_LIMIT}건</p>}
        </Section>

        <Section id="upcoming" title="이번 주" count={upcoming.length} unit="건" note="앞으로 7일 동안 예정된 연락" wide more={{ href: "/staff/schedules", label: "일정 전체 보기" }}>
          {upcomingByDay.size === 0 ? (
            <Empty>앞으로 7일 동안 예정된 연락이 없습니다.</Empty>
          ) : (
            <ul className="divide-y divide-stone-200">
              {[...upcomingByDay.entries()].map(([day, items]) => {
                const kinds = new Map<string, number>();
                for (const item of items) {
                  const title = scheduleTitle(item.schedule_type, null);
                  kinds.set(title, (kinds.get(title) ?? 0) + 1);
                }
                return (
                  <li key={day} className="flex min-h-11 items-center gap-4 py-2">
                    <span className="w-28 shrink-0 text-[14px] font-semibold tabular-nums">{formatDate(day)}</span>
                    <span className="min-w-0 flex-1 break-words text-[14px] text-stone-700">
                      {[...kinds.entries()].map(([title, count]) => `${title} ${count}건`).join(" · ")}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}

function Section({
  id,
  title,
  count,
  unit,
  note,
  more,
  emphasis,
  warning,
  wide,
  children,
}: {
  id: string;
  title: string;
  count: number;
  unit: string;
  note?: string;
  more?: { href: string; label: string };
  /** 처리할 것이 있으면 숫자를 포인트 색으로 */
  emphasis?: boolean;
  warning?: boolean;
  /** 두 칸을 모두 차지 */
  wide?: boolean;
  children: ReactNode;
}) {
  const tone = warning ? "text-danger" : count === 0 ? "text-stone-400" : emphasis ? "text-brand-600" : "text-ink";
  return (
    <section id={id} className={`scroll-mt-16 rounded-xl bg-white p-5 ring-1 ${warning ? "ring-red-200" : "ring-stone-200"} ${wide ? "md:col-span-2" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-2 text-[16px] font-bold">
          {title}
          <span className={`text-[20px] tabular-nums leading-none ${tone}`}>{count}</span>
          <span className="-ml-1 text-[13px] font-semibold text-stone-500">{unit}</span>
        </h2>
        {more && (
          <Link href={more.href} className="shrink-0 text-[13px] font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-ink">
            {more.label}
          </Link>
        )}
      </div>
      {note && <p className="mt-0.5 text-[12px] text-stone-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="-mx-2 flex min-h-14 items-center gap-4 rounded-lg px-2 py-2 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600">
      {children}
    </Link>
  );
}

function ScheduleRows({
  items,
  fresh,
  showStatus,
  showDate,
  overdue,
}: {
  items: ScheduleItem[];
  fresh: Set<string>;
  showStatus?: boolean;
  /** 오늘이 아닌 일정이 섞일 때 날짜도 보여 준다 */
  showDate?: boolean;
  overdue?: (schedule: ScheduleItem) => boolean;
}) {
  return (
    <ul className="divide-y divide-stone-200">
      {items.map((schedule) => {
        const status = lookup(SCHEDULE_STATUS, schedule.schedule_status);
        return (
          <li key={schedule.schedule_id} className={fresh.has(schedule.schedule_id) ? "animate-flash" : ""}>
            <Row href={`/staff/schedules?focus=${schedule.schedule_id}`}>
              <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${showDate ? "w-32" : "w-14"}`}>
                {showDate ? formatDateTime(schedule.scheduled_contact_at) : formatTime(schedule.scheduled_contact_at)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">{schedule.customer_name}</span>
                <span className="block truncate text-[13px] text-stone-600">{scheduleTitle(schedule.schedule_type, schedule.schedule_subtype)}</span>
              </span>
              {overdue?.(schedule) ? (
                <Badge tone="amber">발송 지연</Badge>
              ) : (
                (showStatus || schedule.schedule_status === "processing") && <Badge tone={status.tone}>{status.label}</Badge>
              )}
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-[14px] text-stone-500">{children}</p>;
}
