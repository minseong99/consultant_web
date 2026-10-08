"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { ScheduleList } from "@/components/staff/ScheduleList";
import { Button, Drawer, Spinner, Tabs } from "@/components/ui";
import { addDays, todayKST } from "@/lib/format";
import { lookup, SCHEDULE_TYPE } from "@/lib/labels";
import type { ScheduleItem } from "@/lib/types";

const TABS = [
  { key: "upcoming", label: "예정", statuses: ["scheduled", "processing"], empty: "예정된 일정이 없습니다." },
  { key: "sent", label: "발송 완료", statuses: ["sent"], empty: "발송된 문자가 없습니다." },
  { key: "other", label: "실패·건너뜀·취소", statuses: ["failed", "skipped", "cancelled"], empty: "해당하는 일정이 없습니다." },
] as const;

type TabKey = (typeof TABS)[number]["key"];
type View = "calendar" | "list";

function tabOf(schedule: ScheduleItem): TabKey {
  return TABS.find((tab) => (tab.statuses as readonly string[]).includes(schedule.schedule_status))?.key ?? "other";
}

/** 시각(ISO)의 한국 날짜 YYYY-MM-DD */
const dayOf = (value: string) => todayKST(new Date(value));

export default function SchedulesPage() {
  return (
    <Suspense>
      <Schedules />
    </Suspense>
  );
}

function Schedules() {
  const { feed, fresh, refresh } = useStaffFeed();
  const focusId = useSearchParams().get("focus");
  const [view, setView] = useState<View>("calendar");

  const schedules = feed?.schedules ?? [];
  const focused = focusId ? schedules.find((s) => s.schedule_id === focusId) : undefined;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-[24px] font-bold">후속 연락 일정</h1>
          <p className="mt-1 text-[14px] text-stone-600">안내 문자는 예약 시각에 자동으로 작성·발송됩니다.</p>
        </div>
        <div role="group" aria-label="보기 방식" className="flex shrink-0 self-start rounded-lg bg-white p-0.5 ring-1 ring-stone-300 sm:self-auto">
          {(["calendar", "list"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`h-9 rounded-md px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-brand-600 ${view === key ? "bg-ink text-white" : "text-stone-600 hover:text-ink"}`}
            >
              {key === "calendar" ? "캘린더" : "목록"}
            </button>
          ))}
        </div>
      </div>

      {!feed ? (
        <div className="flex justify-center py-16 text-stone-500">
          <Spinner className="!size-6" />
        </div>
      ) : view === "calendar" ? (
        // 알림에서 넘어온 일정이 바뀌면 그 날짜로 다시 맞춘다.
        <CalendarView key={focused?.schedule_id ?? "none"} schedules={schedules} focused={focused} fresh={fresh} onChanged={refresh} now={new Date(feed.fetched_at).getTime()} />
      ) : (
        <ListView schedules={schedules} focusId={focusId} focused={focused} fresh={fresh} onChanged={refresh} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 캘린더: 달 전체에서 언제 무엇이 나가는지 보고, 날짜를 누르면 그날의 일정을 아래에 보여 준다.
// ---------------------------------------------------------------------------
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// 칸이 좁아 유형 이름을 줄여 쓴다.
const SHORT_TYPE: Record<string, string> = { contract: "약정", reconsultation: "재상담", promotion: "프로모션" };
const typeLabel = (type: string) => SHORT_TYPE[type] ?? lookup(SCHEDULE_TYPE, type).label;

/** 그 달 달력에 들어갈 날짜들(앞뒤 달의 날짜 포함, 일요일 시작, 7의 배수) */
function monthCells(month: string) {
  const first = `${month}-01`;
  const weekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((weekday + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => addDays(first, index - weekday));
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatDay(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return `${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${WEEKDAYS[date.getUTCDay()]})`;
}

function CalendarView({
  schedules,
  focused,
  fresh,
  onChanged,
  now,
}: {
  schedules: ScheduleItem[];
  focused: ScheduleItem | undefined;
  fresh: Set<string>;
  onChanged: () => void;
  /** 화면이 마지막으로 갱신된 시각. 예약 시각이 지난 일정을 가리는 기준 */
  now: number;
}) {
  // 예약 시각이 1시간 넘게 지났는데도 예정 상태로 남은 것은 자동 발송을 놓친 것이다.
  const isOverdue = (s: ScheduleItem) => s.schedule_status === "scheduled" && new Date(s.scheduled_contact_at).getTime() < now - 60 * 60 * 1000;
  const today = todayKST();
  const initialDay = focused ? dayOf(focused.scheduled_contact_at) : today;
  const [month, setMonth] = useState(initialDay.slice(0, 7));
  const [selected, setSelected] = useState(initialDay);
  // 날짜를 누르면 그날의 일정이 오른쪽 서랍으로 열린다. 다른 화면에서 일정을 지정해 들어온 경우에는 처음부터 열어 둔다.
  const [dayOpen, setDayOpen] = useState(Boolean(focused));

  const byDay = new Map<string, ScheduleItem[]>();
  for (const schedule of schedules) {
    const day = dayOf(schedule.scheduled_contact_at);
    byDay.set(day, [...(byDay.get(day) ?? []), schedule]);
  }
  const cells = monthCells(month);
  const [year, monthNumber] = month.split("-").map(Number);
  const dayItems = byDay.get(selected) ?? [];

  function goToday() {
    setMonth(today.slice(0, 7));
    setSelected(today);
    setDayOpen(false);
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      <section className="surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold tabular-nums" aria-live="polite">
            {year}년 {monthNumber}월
          </h2>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={goToday}>
              오늘
            </Button>
            <Button size="sm" variant="secondary" aria-label="이전 달" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </Button>
            <Button size="sm" variant="secondary" aria-label="다음 달" onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-xl border-l border-t border-stone-100">
          {WEEKDAYS.map((name, index) => (
            <div key={name} className={`border-b border-r border-stone-100 px-2 py-1.5 text-[12px] font-semibold ${index === 0 ? "text-danger" : "text-stone-500"}`}>
              {name}
            </div>
          ))}
          {cells.map((day) => {
            const items = byDay.get(day) ?? [];
            const inMonth = day.startsWith(month);
            const isToday = day === today;
            const isSelected = day === selected;
            const counts = new Map<string, number>();
            for (const item of items) counts.set(item.schedule_type, (counts.get(item.schedule_type) ?? 0) + 1);
            const missed = items.filter((s) => s.schedule_status === "failed" || s.schedule_status === "skipped").length;
            const overdue = items.filter(isOverdue).length;
            const allSent = items.length > 0 && items.every((s) => s.schedule_status === "sent");
            const hasFresh = items.some((s) => fresh.has(s.schedule_id));
            const lines = [...counts.entries()];
            return (
              <button
                key={day}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${formatDay(day)}, 일정 ${items.length}건`}
                onClick={() => {
                  setSelected(day);
                  if (!inMonth) setMonth(day.slice(0, 7));
                  // 일정이 없는 날은 선택 표시만 하고 서랍은 열지 않는다.
                  setDayOpen(items.length > 0);
                }}
                className={`relative flex min-h-[4.5rem] flex-col items-stretch gap-1 border-b border-r border-stone-100 p-2 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600 ${
                  isSelected ? "bg-stone-100 ring-2 ring-inset ring-ink" : "hover:bg-stone-50"
                } ${hasFresh ? "animate-flash" : ""} ${inMonth ? "" : "bg-stone-50/60"}`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums ${
                      isToday ? "bg-brand-600 font-bold text-white" : inMonth ? "font-semibold text-ink" : "text-stone-400"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </span>
                  {isToday && <span className="hidden text-[11px] font-semibold text-brand-600 sm:inline">오늘</span>}
                </span>
                {lines.slice(0, 3).map(([type, count]) => (
                  <span key={type} className={`flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[12px] ${allSent ? "bg-stone-100 text-stone-500" : "bg-stone-200/70 text-stone-800"}`}>
                    <span className="truncate">{typeLabel(type)}</span>
                    <span className="font-semibold tabular-nums">{count}</span>
                  </span>
                ))}
                {allSent && <span className="whitespace-nowrap text-[11px] font-semibold text-success">✓ 발송</span>}
                {missed > 0 && <span className="whitespace-nowrap text-[11px] font-semibold text-danger">! 미발송 {missed}</span>}
                {overdue > 0 && <span className="whitespace-nowrap text-[11px] font-semibold text-warning">! 지연 {overdue}</span>}
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-[13px] text-stone-500">일정이 있는 날짜를 누르면 그날의 연락이 오른쪽에 열립니다.</p>

      <Drawer open={dayOpen && dayItems.length > 0} wide title={`${formatDay(selected)} · 일정 ${dayItems.length}건`} onClose={() => setDayOpen(false)}>
        <ScheduleList key={`${selected}:${focused?.schedule_id ?? ""}`} items={dayItems} focusId={focused?.schedule_id} fresh={fresh} timeOnly onChanged={onChanged} />
      </Drawer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 목록: 상태별로 전체를 훑어볼 때
// ---------------------------------------------------------------------------
function ListView({
  schedules,
  focusId,
  focused,
  fresh,
  onChanged,
}: {
  schedules: ScheduleItem[];
  focusId: string | null;
  focused: ScheduleItem | undefined;
  fresh: Set<string>;
  onChanged: () => void;
}) {
  const [selectedTab, setSelectedTab] = useState<TabKey | null>(null);
  // 알림에서 넘어온 경우 해당 일정이 있는 탭을 연다. 탭을 직접 누르면 그 선택을 따른다.
  const active = selectedTab ?? (focused ? tabOf(focused) : "upcoming");
  const tab = TABS.find((t) => t.key === active)!;
  // [지금 발송]으로 다루는 중인 일정은 상태가 바뀌어도 이 탭에 남겨, 발송 결과와 보낸 문자를 그 자리에서 볼 수 있게 한다.
  // 탭을 바꾸면 풀린다.
  const [held, setHeld] = useState<{ tab: TabKey; ids: string[] }>({ tab: "upcoming", ids: [] });
  const heldIds = held.tab === active ? held.ids : [];
  const items = schedules.filter((s) => tabOf(s) === active || heldIds.includes(s.schedule_id));
  // 발송 완료 탭은 최근 발송이 위로 오게 한다.
  const ordered = active === "upcoming" ? items : [...items].reverse();

  return (
    <>
      <div className="mb-4 mt-5">
        <Tabs
          idPrefix="schedules"
          active={active}
          onChange={setSelectedTab}
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: schedules.filter((s) => tabOf(s) === t.key).length }))}
        />
      </div>
      <ScheduleList
        key={`${active}:${focusId ?? ""}`}
        items={ordered}
        focusId={focusId}
        fresh={fresh}
        onChanged={onChanged}
        emptyText={tab.empty}
        onSendStart={(id) => setHeld((current) => ({ tab: active, ids: current.tab === active && current.ids.includes(id) ? current.ids : [...(current.tab === active ? current.ids : []), id] }))}
      />
    </>
  );
}
