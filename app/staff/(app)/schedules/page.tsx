"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { ScheduleList } from "@/components/staff/ScheduleList";
import { Spinner } from "@/components/ui";
import type { ScheduleItem } from "@/lib/types";

const TABS = [
  { key: "upcoming", label: "예정", statuses: ["scheduled", "processing"], empty: "예정된 일정이 없습니다." },
  { key: "sent", label: "발송 완료", statuses: ["sent"], empty: "발송된 문자가 없습니다." },
  { key: "other", label: "실패·건너뜀·취소", statuses: ["failed", "skipped", "cancelled"], empty: "해당하는 일정이 없습니다." },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function tabOf(schedule: ScheduleItem): TabKey {
  return TABS.find((tab) => (tab.statuses as readonly string[]).includes(schedule.schedule_status))?.key ?? "other";
}

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
  const [selected, setSelected] = useState<TabKey | null>(null);

  const schedules = feed?.schedules ?? [];
  const focused = focusId ? schedules.find((s) => s.schedule_id === focusId) : undefined;
  // 알림에서 넘어온 경우 해당 일정이 있는 탭을 연다. 탭을 직접 누르면 그 선택을 따른다.
  const active = selected ?? (focused ? tabOf(focused) : "upcoming");
  const tab = TABS.find((t) => t.key === active)!;
  const items = schedules.filter((s) => tabOf(s) === active);
  // 발송 완료 탭은 최근 발송이 위로 오게 한다.
  const ordered = active === "upcoming" ? items : [...items].reverse();

  return (
    <>
      <h1 className="text-[26px] font-bold">후속 연락 일정</h1>
      <p className="mt-1 text-slate-600">약정 만료·재상담·프로모션 안내 문자의 일정과 발송 현황입니다. 문자는 예약 시각에 자동으로 생성·발송됩니다.</p>

      <div role="tablist" className="mb-4 mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const count = schedules.filter((s) => tabOf(s) === t.key).length;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === active}
              onClick={() => setSelected(t.key)}
              className={`-mb-px border-b-2 px-4 py-2.5 font-semibold ${t.key === active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-ink"}`}
            >
              {t.label} <span className="ml-1 text-[14px] font-normal text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>

      {!feed ? (
        <div className="flex justify-center py-16 text-brand-600">
          <Spinner className="!size-6" />
        </div>
      ) : (
        <ScheduleList key={`${active}:${focusId ?? ""}`} items={ordered} focusId={focusId} fresh={fresh} onChanged={refresh} emptyText={tab.empty} />
      )}
    </>
  );
}
