import type { ReactNode } from "react";
import { SourceLabel } from "@/components/ui";
import { daysUntil, formatDate, formatWon, todayKST } from "@/lib/format";
import type { ConsultView } from "@/lib/types";

// 고객 상담 화면의 그래프. DB에 실제로 있는 값으로만 그리고, 계산한 값은 무엇으로 계산했는지 함께 적는다.
// 그래프마다 한 가지만 말하며, 색에만 기대지 않도록 이름과 값을 글자로 적고 요약 문장을 둔다.

type Bar = { key: string; tag: string; name: string; value: number; tone: "current" | "first" | "other" };

const BAR_TONE: Record<Bar["tone"], string> = {
  current: "bg-stone-400",
  first: "bg-brand-600",
  other: "bg-stone-700",
};

const signedWon = (value: number) => `${formatWon(Math.abs(value))} ${value > 0 ? "높습니다" : "낮습니다"}`;

function ChartCard({ title, summary, note, children }: { title: string; summary: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="surface p-6">
      <h3 className="text-[17px] font-bold">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-stone-700">{summary}</p>
      <div className="mt-5">{children}</div>
      {note && <p className="mt-4 text-[13px] leading-relaxed text-stone-500">{note}</p>}
    </section>
  );
}

// 가로 막대. 길이는 0에서 시작하고, 기준선(예산)이 있으면 막대마다 같은 자리에 세로 표시를 둔다.
function Bars({ bars, reference }: { bars: Bar[]; reference?: { label: string; value: number } }) {
  const max = Math.max(...bars.map((bar) => bar.value), reference?.value ?? 0);
  const percent = (value: number) => (max > 0 ? (value / max) * 100 : 0);
  const at = reference ? percent(reference.value) : 0;
  return (
    <div>
      {reference && (
        <div aria-hidden className="relative mb-1 h-5">
          <span
            className={`absolute bottom-0 whitespace-nowrap text-[12px] font-semibold tabular-nums text-stone-600 ${at > 60 ? "-translate-x-full pr-1.5" : "pl-1.5"}`}
            style={{ left: `${at}%` }}
          >
            <span className="mr-1 inline-block h-3 w-0.5 translate-y-0.5 rounded-full bg-ink" />
            {reference.label} {formatWon(reference.value)}
          </span>
        </div>
      )}
      <div>
        <ul className="space-y-4">
          {bars.map((bar) => (
            <li key={bar.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[14px]">
                  <span className={`mr-2 font-bold ${bar.tone === "first" ? "text-brand-700" : "text-stone-600"}`}>{bar.tag}</span>
                  <span className="font-semibold">{bar.name}</span>
                </span>
                <span className="shrink-0 text-[15px] font-bold tabular-nums">{formatWon(bar.value)}</span>
              </div>
              <div className="relative mt-1.5 h-3 rounded-r bg-stone-100">
                <div className={`h-full rounded-r ${BAR_TONE[bar.tone]}`} style={{ width: `${percent(bar.value)}%` }} />
                {reference && <span aria-hidden className="absolute -bottom-1.5 -top-1.5 w-0.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-white" style={{ left: `${at}%` }} />}
              </div>
            </li>
          ))}
        </ul>
      </div>
      {reference && (
        <p className="sr-only">
          {reference.label} {formatWon(reference.value)}
        </p>
      )}
    </div>
  );
}

// 같은 것이 여러 순위에 추천되면 막대 하나로 묶고 "1·2순위"로 적는다.
function groupByName<T extends { name: string; value: number }>(items: (T & { rank: number | null })[]) {
  const groups: { name: string; value: number; ranks: (number | null)[] }[] = [];
  for (const item of items) {
    const found = groups.find((group) => group.name === item.name);
    if (found) found.ranks.push(item.rank);
    else groups.push({ name: item.name, value: item.value, ranks: [item.rank] });
  }
  return groups.map((group, index) => ({
    key: `${group.name}-${index}`,
    tag: group.ranks.some((rank) => rank == null) ? "추천" : `${group.ranks.join("·")}순위`,
    name: group.name,
    value: group.value,
    tone: index === 0 ? ("first" as const) : ("other" as const),
  }));
}

function FeeCompare({ view }: { view: ConsultView }) {
  const plans = groupByName(
    view.recommendations.flatMap((item) =>
      item.plan?.monthly_fee != null ? [{ name: item.plan.plan_name, value: item.plan.monthly_fee, rank: item.rank }] : [],
    ),
  );
  const current = view.current_plan_fee;
  const bars: Bar[] = [...(current != null ? [{ key: "current", tag: "지금", name: view.current_plan, value: current, tone: "current" as const }] : []), ...plans];
  if (plans.length === 0 || bars.length < 2) return null;

  const first = plans[0];
  const budget = view.target_monthly_budget != null && view.target_monthly_budget > 0 ? view.target_monthly_budget : null;
  const summary: string[] = [];
  if (current != null) {
    summary.push(
      first.value === current
        ? `${first.tag} 요금제의 월 요금은 지금과 같습니다.`
        : `${first.tag} 요금제는 지금보다 월 ${signedWon(first.value - current)} (${formatWon(first.value)} − ${formatWon(current)}).`,
    );
  }
  if (budget != null) {
    summary.push(
      first.value <= budget
        ? `알려 주신 희망 월 예산 ${formatWon(budget)} 안에 들어옵니다.`
        : `알려 주신 희망 월 예산 ${formatWon(budget)}보다 ${formatWon(first.value - budget)} 높습니다.`,
    );
  }
  if (summary.length === 0) summary.push("추천 요금제의 월 요금입니다.");

  return (
    <ChartCard
      title="월 요금 비교"
      summary={summary.join(" ")}
      note={
        <>
          {current == null && "지금 쓰시는 요금제의 월 요금은 확인되지 않아 비교에 넣지 못했습니다. "}
          요금제의 기본 월 요금이며 약정·결합 할인은 반영되어 있지 않습니다.
        </>
      }
    >
      <Bars bars={bars} reference={budget != null ? { label: "희망 월 예산", value: budget } : undefined} />
    </ChartCard>
  );
}

function DevicePriceCompare({ view }: { view: ConsultView }) {
  const bars = groupByName(
    view.recommendations.flatMap((item) =>
      item.device?.device_price != null ? [{ name: item.device.device_name, value: item.device.device_price, rank: item.rank }] : [],
    ),
  );
  if (bars.length < 2) return null;
  const high = bars.reduce((a, b) => (b.value > a.value ? b : a));
  const low = bars.reduce((a, b) => (b.value < a.value ? b : a));
  return (
    <ChartCard
      title="기기 가격 비교"
      summary={
        high.value === low.value
          ? "추천 기기의 가격이 같습니다."
          : `추천 기기의 가격 차이는 최대 ${formatWon(high.value - low.value)}입니다 (${high.name} ${formatWon(high.value)} − ${low.name} ${formatWon(low.value)}).`
      }
      note="기기의 기본 가격이며 지원금·할인은 반영되어 있지 않습니다."
    >
      <Bars bars={bars} />
    </ChartCard>
  );
}

// 오늘부터 만료일까지 달력으로 센 개월과 날
function monthsAndDays(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  const anchor = new Date(Date.UTC(fy, fm - 1 + months, fd));
  const days = Math.round((Date.UTC(ty, tm - 1, td) - anchor.getTime()) / 86_400_000);
  return { months, days };
}

// 오늘부터 약정 만료일까지의 시간 띠. 약정 시작일은 알 수 없으므로 진행률이 아니라 남은 기간만 그린다.
function ContractBand({ endDate }: { endDate: string }) {
  const today = todayKST();
  const left = daysUntil(endDate, today);
  if (left <= 0) {
    return (
      <div>
        <p className="text-[13px] text-stone-500">약정</p>
        <p className="mt-0.5 text-[20px] font-bold">{left === 0 ? "오늘 약정이 끝납니다" : "약정이 끝났습니다"}</p>
        <p className="mt-1 text-[14px] tabular-nums text-stone-600">만료일 {formatDate(endDate)}</p>
      </div>
    );
  }
  const { months, days } = monthsAndDays(today, endDate);
  // 그 사이의 매달 1일에 눈금을 둔다. 너무 길면(3년 초과) 눈금을 생략한다.
  const ticks: { at: number; label: string }[] = [];
  if (left <= 366 * 3) {
    const [y, m] = today.split("-").map(Number);
    for (let i = 1; ; i++) {
      const first = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10);
      const offset = daysUntil(first, today);
      if (offset >= left) break;
      ticks.push({ at: (offset / left) * 100, label: `${Number(first.slice(5, 7))}월` });
    }
  }
  const labelEvery = Math.ceil(ticks.length / 6) || 1;
  return (
    <div>
      <p className="text-[13px] text-stone-500">약정 만료까지</p>
      <p className="mt-0.5 text-[20px] font-bold tabular-nums">
        {left}일
        {months > 0 && (
          <span className="ml-2 text-[15px] font-semibold text-stone-600">
            ({months}개월{days > 0 ? ` ${days}일` : ""})
          </span>
        )}
      </p>
      <div aria-hidden className="mt-5 px-1.5">
        <div className="relative h-1.5 rounded-full bg-stone-300">
          {ticks.map((tick, index) => (
            <span key={tick.at} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-stone-400" style={{ left: `${tick.at}%` }}>
              {index % labelEvery === 0 && tick.at > 6 && tick.at < 90 && (
                <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[11px] text-stone-500">{tick.label}</span>
              )}
            </span>
          ))}
          <span className="absolute left-0 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white" />
          <span className="absolute left-full top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-white" />
        </div>
      </div>
      <div className="mt-7 flex justify-between text-[13px] tabular-nums">
        <span className="font-semibold">오늘</span>
        <span className="font-semibold">만료일 {formatDate(endDate)}</span>
      </div>
    </div>
  );
}

// 기기 사용 기간. 한 칸이 한 달이고 12칸마다 띄운다.
function UsageMonths({ months, device }: { months: number; device: string }) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const shown = Math.min(months, 72);
  return (
    <div>
      <p className="text-[13px] text-stone-500">{device} 사용 기간</p>
      <p className="mt-0.5 text-[20px] font-bold tabular-nums">
        {months}개월
        {years > 0 && (
          <span className="ml-2 text-[15px] font-semibold text-stone-600">
            ({years}년{rest > 0 ? ` ${rest}개월` : ""})
          </span>
        )}
      </p>
      {months > 0 && (
        <>
          <div aria-hidden className="mt-4 flex flex-wrap gap-x-2.5 gap-y-1.5">
            {Array.from({ length: Math.ceil(shown / 12) }, (_, year) => (
              <span key={year} className="flex gap-0.5">
                {Array.from({ length: Math.min(12, shown - year * 12) }, (_, month) => (
                  <span key={month} className="h-4 w-1.5 rounded-[2px] bg-stone-500" />
                ))}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-stone-500">한 칸이 한 달, 한 묶음이 1년입니다{months > shown ? ` (${shown}개월까지 표시)` : ""}.</p>
        </>
      )}
    </div>
  );
}

// 약정 만료까지 남은 기간과 기기 사용 기간. 둘 다 없으면 그리지 않는다.
function Timeline({ view }: { view: ConsultView }) {
  const hasUsage = view.device_use_months != null && view.device_use_months >= 0;
  if (!view.contract_end_date && !hasUsage) return null;
  return (
    <section className="surface p-6">
      <h3 className="text-[17px] font-bold">약정과 사용 기간</h3>
      <p className="mt-1.5">
        <SourceLabel source="customer" label="접수할 때 알려 주신 내용으로 계산" />
      </p>
      <div className={`mt-5 grid gap-x-10 gap-y-7 ${view.contract_end_date && hasUsage ? "sm:grid-cols-2" : ""}`}>
        {view.contract_end_date && <ContractBand endDate={view.contract_end_date} />}
        {hasUsage && <UsageMonths months={view.device_use_months!} device={view.current_device} />}
      </div>
    </section>
  );
}

export type ConsultSlide = { key: string; label: string; node: ReactNode };

/** 상담 화면에서 한 장씩 넘겨 보는 그래프. 그릴 값이 있는 것만 돌려준다(비교는 값이 둘 이상일 때). */
export function consultChartSlides(view: ConsultView): ConsultSlide[] {
  return [
    { key: "fee", label: "월 요금", node: FeeCompare({ view }) },
    { key: "price", label: "기기 가격", node: DevicePriceCompare({ view }) },
    { key: "timeline", label: "약정", node: Timeline({ view }) },
  ].filter((slide) => slide.node !== null);
}
