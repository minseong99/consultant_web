"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { DeviceVisual } from "@/components/staff/DeviceVisual";
import { usePolling } from "@/lib/usePolling";
import { ScheduleList } from "@/components/staff/ScheduleList";
import { Steps, type Step } from "@/components/Steps";
import {
  Badge,
  Button,
  Chips,
  Clamp,
  Disclosure,
  Drawer,
  EmptyState,
  ErrorNote,
  inputClass,
  Skeleton,
  SourceLabel,
  Spinner,
  StatusLine,
  TabPanel,
  Tabs,
  TextButton,
  type TabDef,
} from "@/components/ui";
import {
  addDays,
  formatDate,
  formatDateTime,
  formatPhone,
  formatWon,
  todayKST,
} from "@/lib/format";
import {
  INFORMATION_STATUS,
  lookup,
  RESULT_STATUS,
  scheduleTitle,
} from "@/lib/labels";
import type {
  AnalysisData,
  Consultation,
  ConsultationResult,
  Customer,
  CustomerDetail,
  Recommendation,
  RecommendResult,
  SavedRecommendation,
  ScheduleItem,
} from "@/lib/types";

const TAB_ID = "customer";

type TabKey = "brief" | "recommend" | "record" | "followup";
type Consent = CustomerDetail["consent"];

export default function CustomerDetailPage({
  params,
}: PageProps<"/staff/customers/[id]">) {
  const { id } = use(params);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/staff/customers/${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await response.json();
      if (response.status === 404) return setNotFound(true);
      if (!data.success) throw new Error(data.message);
      setDetail(data);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "고객 정보를 불러오지 못했습니다.",
      );
    }
  }, [id, router]);

  // 분석 결과와 일정은 n8n이 나중에 저장하므로 주기적으로 다시 읽는다. 보고 있지 않을 때는 느리게 돈다.
  usePolling(load);

  if (notFound) return <EmptyState>고객 정보를 찾을 수 없습니다.</EmptyState>;
  if (!detail) {
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <div className="flex justify-center py-16 text-stone-500">
        <Spinner className="!size-6" />
      </div>
    );
  }

  return (
    <CustomerView
      key={detail.customer.customer_id}
      detail={detail}
      error={error}
      reload={load}
    />
  );
}

function CustomerView({
  detail,
  error,
  reload,
}: {
  detail: CustomerDetail;
  error: string | null;
  reload: () => void;
}) {
  const { customer, consent, analysis, consultations, schedules, saved_recommendation } = detail;
  const [tab, setTab] = useState<TabKey>("brief");
  const [drawer, setDrawer] = useState<"customer" | "analysis" | null>(null);
  const [recommendUnseen, setRecommendUnseen] = useState(false);
  // 상담 탭의 상태. 평소(idle)에는 지난 상담을 보여 주고, [상담 시작]을 누르면 기록 칸만 보이며(recording),
  // [상담 기록 저장 및 종료]로 저장이 끝나면 정리 결과만 보여 주고(done), [닫기]를 누르면 평소로 돌아간다.
  const [phase, setPhase] = useState<"idle" | "recording" | "done">("idle");
  // 새 상담을 시작할 때마다 기록 칸을 새로 만든다(앞 상담의 결과가 남지 않게).
  const [session, setSession] = useState(0);
  const tabRef = useRef<TabKey>("brief");
  // 다른 탭을 보는 동안 추천이 도착했을 때만 탭에 표시한다.
  const recommend = useRecommend(customer.customer_id, saved_recommendation, () =>
    setRecommendUnseen(tabRef.current !== "recommend"),
  );

  const upcoming = schedules.filter(
    (s) =>
      s.schedule_status === "scheduled" || s.schedule_status === "processing",
  );
  const canRecontact = consent.recontact && !consent.withdrawn;

  function startRecording() {
    go("record");
    if (phase === "done") setSession((value) => value + 1);
    setPhase("recording");
    // 기록 칸이 열리면 바로 적을 수 있게 메모 칸으로 간다.
    window.setTimeout(() => document.getElementById("notes")?.focus(), 80);
  }

  function go(next: TabKey) {
    tabRef.current = next;
    setTab(next);
    if (next === "recommend") setRecommendUnseen(false);
  }

  // 상담 순서(분석 → 추천 → 상담 기록)에서 지금 할 일 하나. 탭을 넘나드는 안내는 헤더의 이 한 줄뿐이다.
  const next: NextStep | null = recommend.loading
    ? { label: "추천 생성 중", since: recommend.startedAt, onClick: () => go("recommend") }
    : !analysis
      ? null
      : recommend.result?.success !== true
        ? {
            label: "맞춤 추천 받기",
            onClick: () => {
              go("recommend");
              recommend.request();
            },
          }
        : consultations.length === 0
          ? { label: "상담 시작", onClick: startRecording }
          : null;

  const tabs: TabDef<TabKey>[] = [
    { key: "brief", label: "고객 브리프" },
    {
      key: "recommend",
      label: "추천",
      count: recommend.result?.success ? recommend.result.recommendations.length : undefined,
      dot: recommendUnseen && tab !== "recommend",
    },
    { key: "record", label: "상담", count: consultations.length },
    { key: "followup", label: "후속 연락", count: upcoming.length },
  ];

  return (
    <>
      <Link href="/staff/customers" className="text-[13px] font-semibold text-stone-500 hover:text-ink">
        ← 고객 목록
      </Link>

      <CustomerHeader
        customer={customer}
        consent={consent}
        onOpenAll={() => setDrawer("customer")}
        next={next}
      />
      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-6">
        <Tabs tabs={tabs} active={tab} onChange={go} idPrefix={TAB_ID} />

        <TabPanel idPrefix={TAB_ID} tabKey="brief" active={tab === "brief"}>
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
            <CustomerBrief
              analysis={analysis}
              onOpenFull={() => setDrawer("analysis")}
            />
            <CustomerSaid customer={customer} />
          </div>
        </TabPanel>

        <TabPanel
          idPrefix={TAB_ID}
          tabKey="recommend"
          active={tab === "recommend"}
        >
          <RecommendationPanel
            recommend={recommend}
            customer={customer}
            analysis={analysis?.analysis_data ?? null}
          />
        </TabPanel>

        <TabPanel idPrefix={TAB_ID} tabKey="record" active={tab === "record"}>
          <div className="flex max-w-4xl flex-col gap-8">
            {/* 취소해도 적던 내용이 남도록 기록 칸은 화면에서만 숨긴다. */}
            <div hidden={phase === "idle"}>
              <ConsultationForm
                key={session}
                customerId={customer.customer_id}
                recontact={canRecontact}
                analysisId={analysis?.analysis_id ?? null}
                onSaved={reload}
                onFinished={() => setPhase("done")}
                onClose={() => {
                  // 종료한 상담의 결과를 닫으면 다음 상담을 위해 기록 칸을 새로 만든다.
                  if (phase === "done") setSession((value) => value + 1);
                  setPhase("idle");
                }}
              />
            </div>
            {/* 기록하는 동안과 종료 결과를 보는 동안에는 지난 상담을 보여 주지 않는다. [닫기]를 누르면 돌아온다. */}
            {phase === "idle" && <ConsultationHistory consultations={consultations} onStart={startRecording} />}
          </div>
        </TabPanel>

        <TabPanel
          idPrefix={TAB_ID}
          tabKey="followup"
          active={tab === "followup"}
        >
          <FollowUp
            schedules={schedules}
            upcoming={upcoming}
            canRecontact={canRecontact}
            onChanged={reload}
          />
        </TabPanel>
      </div>

      <Drawer
        open={drawer === "customer"}
        title="고객 정보 전체"
        source="customer"
        onClose={() => setDrawer(null)}
      >
        <CustomerAll customer={customer} consent={consent} />
      </Drawer>
      <Drawer
        open={drawer === "analysis"}
        title="전체 AI 분석"
        source="ai"
        onClose={() => setDrawer(null)}
      >
        {analysis && (
          <>
            <p className="mb-4 text-[12px] text-stone-500">
              {formatDateTime(analysis.created_at)}에 분석했습니다. 상담을
              저장하면 다시 분석됩니다.
            </p>
            <AnalysisFull data={analysis.analysis_data} />
          </>
        )}
      </Drawer>
    </>
  );
}

// ---------------------------------------------------------------------------
// 헤더: 누구인지, 왜 왔는지, 지금 무엇을 쓰는지
// ---------------------------------------------------------------------------
type NextStep = { label: string; onClick: () => void; since?: number | null };

function daysUntil(dateString: string) {
  const [y, m, d] = dateString.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = todayKST().split("-").map(Number);
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000,
  );
}

function CustomerHeader({
  customer,
  consent,
  onOpenAll,
  next,
}: {
  customer: Customer;
  consent: Consent;
  onOpenAll: () => void;
  next: NextStep | null;
}) {
  const remaining = customer.contract_end_date
    ? daysUntil(customer.contract_end_date)
    : null;
  return (
    <header className="surface mt-3 px-6 pb-3 pt-6">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          {/* 사진 대신 이름 첫 글자. 고객을 번호가 아닌 사람으로 보이게 한다. */}
          <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[22px] font-bold text-brand-700">
            {customer.customer_name.trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight">
              {customer.customer_name}
              <span className="ml-1 text-[16px] font-semibold text-stone-500">님</span>
            </h1>
            <p className="mt-1 text-[15px] text-stone-600">
              <Clamp lines={2}>{customer.consultation_goal}</Clamp>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-4">
            {/* 고객이 보는 상담 화면을 이 고객으로 새 탭에 연다. */}
            <a
              href={`/consult/open?customer=${encodeURIComponent(customer.customer_id)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 rounded-md text-[13px] font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-ink hover:decoration-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              고객 화면 열기
              <span aria-hidden>↗</span>
            </a>
            <TextButton onClick={onOpenAll}>고객 정보 전체</TextButton>
          </div>
          {next && (
            <button
              type="button"
              onClick={next.onClick}
              className="inline-flex min-h-9 items-center gap-2 rounded-full bg-brand-50 px-3.5 text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {next.since ? (
                <StatusLine state="active" label={next.label} since={next.since} />
              ) : (
                <>
                  <span className="text-[12px] font-medium text-brand-700/70">다음</span>
                  {next.label}
                  <span aria-hidden>→</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
      <dl className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-[14px]">
        <HeaderItem label="현재 기기" value={customer.current_device} />
        <HeaderItem label="현재 요금제" value={customer.current_plan} />
        <HeaderItem
          label="약정 만료"
          value={
            customer.contract_end_date === null || remaining === null ? null : (
              <>
                <span
                  className={
                    remaining <= 30 ? "font-bold text-warning" : "font-semibold"
                  }
                >
                  {remaining > 0
                    ? `D-${remaining}`
                    : remaining === 0
                      ? "오늘"
                      : "만료됨"}
                </span>
                <span className="ml-1.5 text-stone-500">
                  {formatDate(customer.contract_end_date)}
                </span>
              </>
            )
          }
        />
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          {consent.withdrawn ? (
            <ConsentMark on={false} label="동의 철회" />
          ) : (
            <>
              <ConsentMark
                on={consent.recontact}
                label={consent.recontact ? "재연락 동의" : "재연락 미동의"}
              />
              <ConsentMark
                on={consent.marketing}
                label={consent.marketing ? "마케팅 동의" : "마케팅 미동의"}
              />
            </>
          )}
        </div>
      </dl>
    </header>
  );
}

function HeaderItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[12px] font-semibold text-stone-500">{label}</dt>
      <dd className={value ? "font-semibold" : "text-stone-400"}>
        {value || "미입력"}
      </dd>
    </div>
  );
}

function ConsentMark({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[13px] font-semibold ${on ? "text-success" : "text-warning"}`}
    >
      <span aria-hidden>{on ? "✓" : "✕"}</span>
      {label}
    </span>
  );
}

function CustomerAll({
  customer,
  consent,
}: {
  customer: Customer;
  consent: Consent;
}) {
  return (
    <div className="flex flex-col gap-7">
      <dl className="flex flex-col gap-4">
        <Field label="이름" value={customer.customer_name} />
        <Field label="휴대폰 번호" value={formatPhone(customer.phone)} />
        <Field label="현재 기기" value={customer.current_device} />
        <Field label="현재 요금제" value={customer.current_plan} />
        <Field label="주요 사용 패턴" value={customer.usage_pattern} />
        <Field label="상담 목적" value={customer.consultation_goal} />
        <Field
          label="나이"
          value={customer.age != null ? `${customer.age}세` : null}
        />
        <Field
          label="약정 만료일"
          value={
            customer.contract_end_date
              ? formatDate(customer.contract_end_date)
              : null
          }
        />
        <Field
          label="기기 사용 기간"
          value={
            customer.device_use_months != null
              ? `${customer.device_use_months}개월`
              : null
          }
        />
        <Field
          label="희망 월 예산"
          value={
            customer.target_monthly_budget != null
              ? formatWon(customer.target_monthly_budget)
              : null
          }
        />
        <Field label="선호 브랜드" value={customer.preferred_brand} />
        <Field label="관심사" value={customer.interests} />
      </dl>
      <section>
        <h3 className="text-[14px] font-bold">동의 상태</h3>
        {consent.withdrawn ? (
          <p className="mt-2 text-[14px] text-warning">
            동의를 철회한 고객입니다. 안내 문자가 발송되지 않습니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3 text-[14px]">
            <ConsentRow label="개인정보 수집·이용" on={consent.privacy} />
            <ConsentRow
              label="재연락"
              on={consent.recontact}
              note="약정 만료·재상담 안내에 필요합니다"
            />
            <ConsentRow
              label="마케팅 수신"
              on={consent.marketing}
              note="프로모션 안내에 필요합니다"
            />
          </ul>
        )}
        <p className="mt-3 text-[12px] text-stone-500">
          동의 일시 {formatDateTime(consent.consent_at)}
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-stone-500">{label}</dt>
      <dd
        className={`mt-0.5 text-[14px] leading-relaxed ${value ? "" : "text-stone-400"}`}
      >
        {value || "미입력"}
      </dd>
    </div>
  );
}

function ConsentRow({
  label,
  on,
  note,
}: {
  label: string;
  on: boolean;
  note?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3">
      <span>
        {label}
        {note && (
          <span className="block text-[12px] text-stone-500">{note}</span>
        )}
      </span>
      <ConsentMark on={on} label={on ? "동의" : "미동의"} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// 고객 브리프: AI 분석에서 지금 상담에 필요한 것만
// ---------------------------------------------------------------------------
function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

/** 목록의 앞 몇 개만 이어 보여 준다. 나머지는 개수로만 알린다. */
function firstFew(items: string[], count: number) {
  if (items.length === 0) return null;
  const rest = items.length - count;
  return items.slice(0, count).join(" · ") + (rest > 0 ? ` 외 ${rest}개` : "");
}

function CustomerBrief({
  analysis,
  onOpenFull,
}: {
  analysis: CustomerDetail["analysis"];
  onOpenFull: () => void;
}) {
  if (!analysis) {
    return (
      <section aria-busy="true">
        <SourceLabel source="ai" />
        <h2 className="mt-1 text-[17px] font-bold">고객 브리프</h2>
        <div className="mt-3 surface p-6">
          <StatusLine
            state="active"
            label="AI가 고객 정보를 분석하고 있습니다"
            note="보통 30초 안팎, 끝나면 자동으로 표시됩니다"
          />
        <div className="mt-5 flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-4 h-4 w-2/3" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        </div>
      </section>
    );
  }
  const data = analysis.analysis_data;
  const features = list(data.important_features);
  const missing = list(data.missing_information);
  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <SourceLabel source="ai" />
        <span className="text-[12px] text-stone-500">
          {formatDateTime(analysis.created_at)} 분석
        </span>
      </div>
      <h2 className="mt-1 text-[17px] font-bold">고객 브리프</h2>
      <div className="mt-3 surface p-6">
      {data.analysis_summary && (
        <p className="rounded-2xl bg-ai-surface px-5 py-4 text-[16px] leading-relaxed">
          <Clamp lines={3}>{data.analysis_summary}</Clamp>
        </p>
      )}
      <dl className="mt-3 flex flex-col">
        <BriefRow label="기기 교체 의향" value={data.device_change_signal} />
        <BriefRow label="중요하게 보는 것" value={firstFew(features, 3)} lines={1} />
        <BriefRow label="가격 민감도" value={data.price_sensitivity} />
        <BriefRow label="더 물어볼 것" value={firstFew(missing, 2)} />
      </dl>
      <TextButton onClick={onOpenFull} className="mt-3">
        전체 AI 분석 보기
      </TextButton>
      </div>
    </section>
  );
}

function BriefRow({
  label,
  value,
  lines = 2,
}: {
  label: string;
  value: string | null | undefined;
  lines?: 1 | 2;
}) {
  // 분석에 없는 항목은 줄째로 숨긴다.
  if (!value) return null;
  return (
    <div className="flex gap-4 py-2.5">
      <dt className="w-28 shrink-0 text-[13px] font-semibold text-stone-500">
        {label}
      </dt>
      <dd
        className="min-w-0 flex-1 text-[14px] leading-relaxed"
      >
        <Clamp lines={lines}>{value}</Clamp>
      </dd>
    </div>
  );
}

const ANALYSIS_KNOWN = new Set([
  "customer_id",
  "analysis_summary",
  "usage_profile",
  "replacement_reason",
  "important_features",
  "price_sensitivity",
  "preferred_product_group",
  "device_change_signal",
  "recommendation_factors",
  "missing_information",
]);

function AnalysisFull({ data }: { data: AnalysisData }) {
  const features = list(data.important_features);
  const factors = list(data.recommendation_factors);
  const missing = list(data.missing_information);
  // LLM 출력이라 정의하지 않은 키가 올 수 있다. 버리지 않고 아래에 그대로 보여 준다.
  const extra = Object.entries(data ?? {}).filter(
    ([key, value]) => !ANALYSIS_KNOWN.has(key) && value != null && value !== "",
  );
  return (
    <div className="flex flex-col gap-6">
      {data.analysis_summary && (
        <p className="text-[15px] leading-relaxed">{data.analysis_summary}</p>
      )}
      <dl className="flex flex-col gap-4">
        <Field label="사용 성향" value={data.usage_profile} />
        <Field label="교체 사유" value={data.replacement_reason} />
        <Field label="가격 민감도" value={data.price_sensitivity} />
        <Field label="기기 교체 의향" value={data.device_change_signal} />
        <Field label="선호 제품군" value={data.preferred_product_group} />
        {extra.map(([key, value]) => (
          <Field
            key={key}
            label={key}
            value={typeof value === "string" ? value : JSON.stringify(value)}
          />
        ))}
      </dl>
      {features.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
            중요하게 보는 기능
          </h3>
          <Chips items={features} />
        </section>
      )}
      {factors.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
            추천 시 고려 요소
          </h3>
          <BulletList items={factors} />
        </section>
      )}
      {missing.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold text-stone-500">
            상담 중 확인하면 좋은 정보
          </h3>
          <BulletList items={missing} />
        </section>
      )}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-[14px] leading-relaxed">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span
            aria-hidden
            className="mt-2 size-1 shrink-0 rounded-full bg-stone-400"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 브리프 탭의 오른쪽: 고객이 접수할 때 직접 알려 준 내용. 왼쪽의 AI 분석과 나란히 본다.
// ---------------------------------------------------------------------------
function CustomerSaid({ customer }: { customer: Customer }) {
  const rows = [
    { label: "상담 목적", value: customer.consultation_goal },
    { label: "주요 사용 패턴", value: customer.usage_pattern },
    { label: "희망 월 예산", value: customer.target_monthly_budget != null ? formatWon(customer.target_monthly_budget) : null },
    { label: "기기 사용 기간", value: customer.device_use_months != null ? `${customer.device_use_months}개월` : null },
    { label: "선호 브랜드", value: customer.preferred_brand },
    { label: "관심사", value: customer.interests },
    { label: "나이", value: customer.age != null ? `${customer.age}세` : null },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));
  return (
    <section>
      <SourceLabel source="customer" />
      <h2 className="mt-1 text-[17px] font-bold">고객이 알려 준 내용</h2>
      <dl className="surface mt-3 flex flex-col gap-4 p-5">
        {rows.map((row) => (
          <Field key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 추천
// ---------------------------------------------------------------------------
type RecommendState = {
  result: RecommendResult | null;
  loading: boolean;
  startedAt: number | null;
  // 이전에 받아 저장된 추천을 보여 주는 중이면 그 시각. 방금 받은 결과면 null.
  savedAt: string | null;
  request: () => void;
};

function useRecommend(
  customerId: string,
  saved: SavedRecommendation | null,
  onArrived: () => void,
): RecommendState {
  const storageKey = `recommend:${customerId}`;
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // 방금 받은 응답에는 저장되지 않는 혜택·조건이 들어 있어, 새로고침해도 보이도록 브라우저 탭에 보관한다.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) setResult(JSON.parse(saved));
      } catch {
        // 저장소를 쓸 수 없어도 화면은 그대로 동작한다.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  async function request() {
    if (loading) return;
    setLoading(true);
    setStartedAt(Date.now());
    let next: RecommendResult;
    try {
      const response = await fetch("/api/staff/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      next = await response.json();
    } catch {
      next = {
        success: false,
        error_code: "NETWORK",
        message: "네트워크 연결을 확인해 주세요.",
      };
    }
    setResult(next);
    setLoading(false);
    onArrived();
    if (next.success) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 보관에 실패해도 이번 결과는 화면에 표시된다.
      }
    }
  }

  // 이 탭에서 받은 결과가 없으면 DB에 저장된 최근 추천을 보여 준다.
  if (!result && saved && saved.recommendations.length > 0) {
    return {
      result: {
        success: true,
        customer_id: customerId,
        analysis_id: null,
        recommendations: saved.recommendations,
        information_status: "",
        missing_information: [],
      },
      loading,
      startedAt,
      savedAt: saved.saved_at ?? "",
      request,
    };
  }
  return { result, loading, startedAt, savedAt: null, request };
}

function RecommendationPanel({
  recommend,
  customer,
  analysis,
}: {
  recommend: RecommendState;
  customer: Customer;
  analysis: AnalysisData | null;
}) {
  const { result, loading, startedAt, savedAt, request } = recommend;
  // 근거를 보고 있는 추천의 순번. null 이면 서랍이 닫혀 있다.
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const info = result?.success && result.information_status
    ? lookup(INFORMATION_STATUS, result.information_status)
    : null;
  const recommendations = result?.success
    ? [...result.recommendations].sort(
        (a, b) => (a.recommendation_rank ?? 99) - (b.recommendation_rank ?? 99),
      )
    : [];
  const missing = result?.success ? result.missing_information : [];
  const evidence = evidenceIndex !== null ? recommendations[evidenceIndex] : undefined;

  // 추천에 함께 전달되는 고객 정보. 추천 이유를 읽을 때 대조할 수 있게 근거 영역에 보여 준다.
  const basis = [
    { label: "상담 목적", value: customer.consultation_goal },
    {
      label: "중요 기능",
      value: firstFew(list(analysis?.important_features), 3),
    },
    { label: "기기 교체 의향", value: analysis?.device_change_signal ?? null },
    { label: "선호 브랜드", value: customer.preferred_brand },
    {
      label: "희망 월 예산",
      value:
        customer.target_monthly_budget != null
          ? formatWon(customer.target_monthly_budget)
          : null,
    },
  ].filter((item): item is { label: string; value: string } =>
    Boolean(item.value),
  );

  return (
    <section>
      <div className="flex items-start justify-between gap-6">
        <div>
          <SourceLabel source="recommend" />
          <h2 className="mt-1 text-[17px] font-bold">맞춤 추천</h2>
          <p className="mt-1 text-[13px] text-stone-600">
            {!result?.success
              ? "고객 분석과 등록된 기기·요금제·프로모션을 근거로 추천합니다."
              : savedAt !== null
                ? `${savedAt ? `${formatDateTime(savedAt)}에 받은` : "이전에 받은"} 추천입니다. 고객 상황이 달라졌다면 다시 받아 보세요.`
                : "추천은 저장되어 다음에 이 고객을 열어도 볼 수 있습니다."}
          </p>
        </div>
        <Button
          variant={result?.success ? "secondary" : "primary"}
          loading={loading}
          onClick={request}
        >
          {loading
            ? "추천 생성 중"
            : result?.success
              ? "다시 추천 받기"
              : "추천 받기"}
        </Button>
      </div>

      {loading && (
        <div className="mt-5" aria-busy="true">
          <StatusLine
            state="active"
            label="추천 생성 중"
            since={startedAt}
            note="요청이 전달되었습니다 · 보통 30~55초"
          />
          <div className="mt-4 grid grid-cols-2 gap-5">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="surface p-5"
              >
                <div className="flex items-center gap-4">
                  <Skeleton className="h-28 w-24 shrink-0 !rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-3 h-6 w-3/5" />
                    <Skeleton className="mt-2 h-4 w-2/5" />
                  </div>
                </div>
                <Skeleton className="mt-5 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && result && !result.success && (
        <div className="mt-5">
          <ErrorNote>{result.message}</ErrorNote>
        </div>
      )}

      {!loading && !result && (
        <div className="mt-5">
          <EmptyState>
            [추천 받기]를 누르면 1·2순위 기기와 요금제를 추천합니다. 30~55초가
            걸립니다.
          </EmptyState>
        </div>
      )}

      {!loading && result?.success && (
        <div className="mt-5 flex flex-col gap-5">
          {recommendations.length === 0 ? (
            <EmptyState>추천할 수 있는 상품을 찾지 못했습니다.</EmptyState>
          ) : (
            <ol className="grid grid-cols-2 gap-5">
              {recommendations.map((item, index) => (
                <RecommendationCard key={index} item={item} rank={item.recommendation_rank ?? index + 1} primary={index === 0} onOpenEvidence={() => setEvidenceIndex(index)} />
              ))}
            </ol>
          )}
          {(info || missing.length > 0) && (
            <div className="flex flex-col gap-2 border-t border-stone-200 pt-4">
              {info && (
                <p className="flex items-center gap-2 text-[13px] text-stone-600">
                  추천에 쓴 정보 <Badge tone={info.tone}>{info.label}</Badge>
                </p>
              )}
              {missing.length > 0 && (
                <Disclosure
                  label={`아직 확인되지 않은 정보 ${missing.length}개`}
                >
                  <p className="mb-2 text-[13px] text-stone-600">
                    고객에게 물어보면 추천이 더 정확해집니다.
                  </p>
                  <BulletList items={missing} />
                </Disclosure>
              )}
            </div>
          )}
        </div>
      )}
      <Drawer
        open={evidence !== undefined}
        title={evidence ? `${evidence.recommendation_rank ?? (evidenceIndex ?? 0) + 1}순위 추천 근거` : "추천 근거"}
        source="recommend"
        onClose={() => setEvidenceIndex(null)}
      >
        {evidence && <RecommendationEvidence item={evidence} basis={basis} />}
      </Drawer>
    </section>
  );
}

function RecommendationCard({ item, rank, primary, onOpenEvidence }: { item: Recommendation; rank: number; primary: boolean; onOpenEvidence: () => void }) {
  const benefit = item.benefit_info ?? item.expected_benefit;
  return (
    <li className={`surface flex flex-col p-5 ${primary ? "ring-2 ring-brand-600" : ""}`}>
      <div className="flex items-center gap-4">
        {item.device_name && <DeviceVisual productId={item.product_id} deviceName={item.device_name} />}
        <div className="min-w-0">
          <p className={`text-[12px] font-bold ${primary ? "text-brand-600" : "text-stone-500"}`}>{rank}순위</p>
          <p className="mt-1.5 text-[18px] font-bold leading-snug">{item.device_name ?? "기기 추천 없음"}</p>
          <p className={`text-[14px] ${item.plan_name ? "font-semibold text-stone-700" : "text-stone-400"}`}>{item.plan_name ?? "요금제 추천 없음"}</p>
        </div>
      </div>

      {item.recommendation_reason && (
        <p className="mt-4 text-[14px] leading-relaxed">
          <Clamp lines={2}>{item.recommendation_reason}</Clamp>
        </p>
      )}
      {benefit && (
        <p className="mt-3 flex gap-2 text-[13px] leading-relaxed text-stone-700">
          <span className="shrink-0 font-semibold text-stone-500">혜택</span>
          <Clamp lines={2}>{benefit}</Clamp>
        </p>
      )}

      {/* 근거는 카드를 늘리지 않고 옆 서랍에서 본다. 카드 두 장의 높이가 달라지거나 아래 내용이 밀리지 않는다. */}
      <div className="mt-auto pt-3">
        <TextButton onClick={onOpenEvidence}>추천 근거 보기</TextButton>
      </div>
    </li>
  );
}

// 추천 한 건의 근거 전체. 서랍 안에 보여 준다.
function RecommendationEvidence({ item, basis }: { item: Recommendation; basis: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {item.device_name && <DeviceVisual productId={item.product_id} deviceName={item.device_name} />}
        <div className="min-w-0">
          <p className="text-[17px] font-bold leading-snug">{item.device_name ?? "기기 추천 없음"}</p>
          <p className={`text-[14px] ${item.plan_name ? "font-semibold text-stone-700" : "text-stone-400"}`}>{item.plan_name ?? "요금제 추천 없음"}</p>
        </div>
      </div>
      {item.recommendation_reason && (
        <section className="rounded-lg border-l-[3px] border-info bg-ai-surface px-4 py-3">
          <h3 className="text-[12px] font-semibold text-info">고객에게 맞는 이유</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed">{item.recommendation_reason}</p>
        </section>
      )}
      {basis.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold text-stone-500">추천에 반영된 고객 정보</h3>
          <dl className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed">
            {basis.map((b) => (
              <div key={b.label} className="flex gap-3">
                <dt className="w-24 shrink-0 text-stone-500">{b.label}</dt>
                <dd className="min-w-0 flex-1">{b.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {(item.expected_benefit || item.benefit_info || item.eligibility_condition) && (
        <section>
          <h3 className="text-[12px] font-semibold text-stone-500">적용 가능한 혜택</h3>
          <dl className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed">
            <InlineField label="예상 혜택" value={item.expected_benefit} />
            <InlineField label="혜택 정보" value={item.benefit_info} />
            <InlineField label="적용 조건" value={item.eligibility_condition} />
          </dl>
        </section>
      )}
    </div>
  );
}

function InlineField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 상담 기록
// ---------------------------------------------------------------------------
type FormState = {
  notes: string;
  customer_response: string;
  selected_product: string;
  selected_plan: string;
  follow_up_requested: boolean;
  reconsultation_date: string;
  recording_url: string;
};

const EMPTY_FORM: FormState = {
  notes: "",
  customer_response: "",
  selected_product: "",
  selected_plan: "",
  follow_up_requested: false,
  reconsultation_date: "",
  recording_url: "",
};

function ConsultationForm({
  customerId,
  recontact,
  analysisId,
  onSaved,
  onFinished,
  onClose,
}: {
  customerId: string;
  recontact: boolean;
  analysisId: string | null;
  onSaved: () => void;
  /** 저장에 성공해 상담이 끝났을 때 */
  onFinished: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // 저장 시점의 분석 ID. 이후 다른 ID가 보이면 재분석이 끝난 것이다.
  const [analysisAtSubmit, setAnalysisAtSubmit] = useState<
    string | null | undefined
  >(undefined);
  const resultRef = useRef<HTMLDivElement>(null);

  const today = todayKST();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const datePassed =
    form.reconsultation_date !== "" && form.reconsultation_date <= today;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.notes.trim()) return setFormError("상담 메모를 입력해 주세요.");
    setFormError(null);
    setLoading(true);
    setResult(null);
    setStartedAt(Date.now());
    setAnalysisAtSubmit(analysisId);
    // 결과 영역은 저장 버튼 아래에 생긴다. 화면 밖이면 보이는 곳으로 옮긴다.
    window.setTimeout(
      () =>
        resultRef.current?.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        }),
      50,
    );
    let next: ConsultationResult;
    try {
      const response = await fetch("/api/staff/consultation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, ...form }),
      });
      next = await response.json();
    } catch {
      next = {
        success: false,
        error_code: "NETWORK",
        message: "네트워크 연결을 확인해 주세요.",
      };
    }
    setResult(next);
    setLoading(false);
    setSavedAt(Date.now());
    if (next.success) {
      setForm(EMPTY_FORM);
      onFinished();
    }
    onSaved();
  }

  const submitted = loading || result !== null;
  const ended = result?.success === true;
  const reanalyzed =
    result?.success === true &&
    analysisAtSubmit !== undefined &&
    analysisId !== analysisAtSubmit;
  const steps: Step[] = [
    {
      label: loading
        ? "상담 내용 정리 중"
        : result?.success
          ? "AI 상담 정리 완료"
          : "상담 내용 정리",
      state: loading ? "active" : result?.success ? "done" : "error",
    },
    {
      label: reanalyzed ? "고객 분석 갱신 완료" : "고객 분석 갱신 중",
      state: !result?.success ? "waiting" : reanalyzed ? "done" : "active",
    },
  ];
  const status = result?.success
    ? lookup(RESULT_STATUS, result.result_status)
    : null;
  const dateHint = datePassed
    ? "재상담 예정일이 오늘이거나 지난 날짜이면 안내 일정이 만들어지지 않습니다."
    : form.reconsultation_date && !recontact
      ? "이 고객은 재연락에 동의하지 않아 안내 일정이 만들어지지 않습니다."
      : "입력하면 하루 전에 안내 문자가 발송되도록 일정이 만들어집니다.";

  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <SourceLabel source="staff" />
          <h2 className="mt-1 text-[17px] font-bold">{ended ? "상담을 종료했습니다" : "이번 상담 기록하기"}</h2>
        </div>
        {ended ? (
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        ) : (
          <TextButton onClick={onClose} disabled={loading}>
            취소
          </TextButton>
        )}
      </div>
      {/* 저장이 끝나면 입력 칸은 접고 정리 결과만 남긴다. */}
      <div className="mt-3 surface p-6" hidden={ended}>
        <form onSubmit={submit} className="flex flex-col gap-5">
          <div>
            <label
              htmlFor="notes"
              className="mb-1.5 block text-[13px] font-semibold"
            >
              상담 메모 <span className="text-danger">*</span>
            </label>
            <textarea
              id="notes"
              rows={5}
              className={inputClass}
              placeholder="예: Galaxy S26과 초이스90 요금제를 안내. 가격을 가족과 상의한 뒤 다시 방문하기로 함."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
            <p className="mt-1 text-[12px] text-stone-500">
              편하게 적으면 AI가 요약하고 상태와 후속 연락 여부를 정리합니다.
            </p>
          </div>

          <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-start gap-x-5 gap-y-1">
            <div>
              <label
                htmlFor="reconsult"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                재상담 예정일
              </label>
              <input
                id="reconsult"
                type="date"
                min={addDays(today, 1)}
                className={inputClass}
                value={form.reconsultation_date}
                onChange={(e) => {
                  set("reconsultation_date", e.target.value);
                  if (e.target.value) set("follow_up_requested", true);
                }}
              />
            </div>
            <label className="mt-7 flex min-h-11 items-center gap-2.5 text-[14px]">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={form.follow_up_requested}
                onChange={(e) => set("follow_up_requested", e.target.checked)}
              />
              고객이 추후 연락을 요청함
            </label>
            <p
              className={`col-span-2 text-[12px] ${datePassed || (form.reconsultation_date && !recontact) ? "font-semibold text-warning" : "text-stone-500"}`}
            >
              {dateHint}
            </p>
          </div>

          <Disclosure
            label="고객 반응·관심 상품·녹취 입력"
            openLabel="추가 입력 접기"
          >
            <div className="grid grid-cols-3 gap-4">
              <LabeledInput
                id="response"
                label="고객 반응"
                value={form.customer_response}
                onChange={(v) => set("customer_response", v)}
                placeholder="예: 긍정적, 가격 고민"
              />
              <LabeledInput
                id="product"
                label="관심 상품"
                value={form.selected_product}
                onChange={(v) => set("selected_product", v)}
              />
              <LabeledInput
                id="plan"
                label="관심 요금제"
                value={form.selected_plan}
                onChange={(v) => set("selected_plan", v)}
              />
              <div className="col-span-3">
                <LabeledInput
                  id="recording"
                  label="녹취 파일 URL"
                  value={form.recording_url}
                  onChange={(v) => set("recording_url", v)}
                  placeholder="입력하면 음성을 글로 바꿔 함께 분석합니다"
                />
              </div>
            </div>
          </Disclosure>

          {formError && <ErrorNote>{formError}</ErrorNote>}
          <div>
            <Button type="submit" loading={loading}>
              {loading ? "저장하는 중" : "상담 기록 저장 및 종료"}
            </Button>
          </div>
        </form>
      </div>

      {submitted && (
        <div
          ref={resultRef}
          className="mt-4 scroll-mb-6 rounded-2xl bg-ai-surface p-5"
          aria-live="polite"
        >
          <SourceLabel source="ai" label="AI 상담 정리" />
          <div className="mt-2">
            <Steps steps={steps} since={loading ? startedAt : savedAt} />
          </div>
          {result && !result.success && (
            <div className="mt-3">
              <ErrorNote>{result.message}</ErrorNote>
            </div>
          )}
          {loading && (
            <div className="mt-4 flex flex-col gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}
          {result?.success && (
            <div className="mt-4 border-t border-stone-200 pt-4">
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold text-stone-500">상태</span>
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
                {result.result_status !== "follow_up" && (
                  <Badge tone={result.follow_up_required ? "blue" : "gray"}>
                    {result.follow_up_required
                      ? "후속 연락 필요"
                      : "후속 연락 불필요"}
                  </Badge>
                )}
                <span className="text-stone-600">
                  ·{" "}
                  {result.schedules.length > 0
                    ? `후속 일정 ${result.schedules.length}건 생성`
                    : "생성된 후속 일정 없음"}
                </span>
              </p>
              {result.summary && (
                <p className="mt-2 text-[14px] leading-relaxed">
                  <Clamp lines={2}>{result.summary}</Clamp>
                </p>
              )}
              <Disclosure
                label="상세 결과 보기"
                openLabel="상세 결과 접기"
                className="mt-2"
              >
                <dl className="flex flex-col gap-3 text-[14px] leading-relaxed">
                  <Field label="요약" value={result.summary} />
                  <Field
                    label="후속 연락 사유"
                    value={result.follow_up_reason}
                  />
                </dl>
                {result.schedules.length > 0 && (
                  <>
                    <h3 className="mt-4 text-[12px] font-semibold text-stone-500">
                      생성된 후속 일정
                    </h3>
                    <ul className="mt-1.5 flex flex-col gap-1.5 text-[14px]">
                      {result.schedules.map((schedule) => (
                        <li
                          key={schedule.schedule_id}
                          className="flex flex-wrap items-center gap-x-3"
                        >
                          <span className="font-semibold tabular-nums">
                            {formatDateTime(schedule.scheduled_contact_at)}
                          </span>
                          <span className="text-stone-700">
                            {scheduleTitle(
                              schedule.schedule_type,
                              schedule.schedule_subtype,
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Disclosure>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// 이력은 날짜·상태·요약 한 줄만 보여 주고, 누르면 전체 내용이 서랍으로 열린다.
const HISTORY_LIMIT = 5;

function ConsultationHistory({
  consultations,
  onStart,
}: {
  consultations: Consultation[];
  /** 기록 칸이 이미 열려 있으면 없다 */
  onStart?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const opened = consultations.find((c) => c.consultation_id === openId);
  const shown = showAll ? consultations : consultations.slice(0, HISTORY_LIMIT);
  return (
    <section>
      <div className="flex items-end justify-between gap-4">
        <div>
          <SourceLabel source="staff" />
          <h2 className="mt-1 text-[17px] font-bold">
            지난 상담
            {consultations.length > 0 && (
              <span className="ml-1.5 text-[14px] font-semibold tabular-nums text-stone-500">{consultations.length}</span>
            )}
          </h2>
        </div>
        {onStart && <Button onClick={onStart}>상담 시작</Button>}
      </div>
      {consultations.length === 0 ? (
        <p className="surface mt-3 p-5 text-[14px] text-stone-600">
          아직 지난 상담이 없습니다.{onStart && " [상담 시작]을 눌러 첫 상담을 기록하세요."}
        </p>
      ) : (
        <ul className="surface mt-3 divide-y divide-stone-100 overflow-hidden">
          {shown.map((c) => {
            const status = lookup(RESULT_STATUS, c.result_status);
            return (
              <li key={c.consultation_id}>
                <button
                  type="button"
                  onClick={() => setOpenId(c.consultation_id)}
                  className="flex w-full flex-col gap-1 px-5 py-3.5 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
                >
                  <span className="flex flex-wrap items-center gap-2 text-[12px] tabular-nums text-stone-500">
                    {formatDateTime(c.consulted_at)}
                    {c.result_status && <Badge tone={status.tone}>{status.label}</Badge>}
                    {c.follow_up_required && c.result_status !== "follow_up" && <Badge tone="blue">후속 연락 필요</Badge>}
                  </span>
                  <span className="text-[14px] leading-relaxed">
                    <Clamp lines={1}>{c.summary}</Clamp>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {consultations.length > HISTORY_LIMIT && (
        <TextButton className="mt-2" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "최근 기록만 보기" : `이전 기록 ${consultations.length - HISTORY_LIMIT}건 더 보기`}
        </TextButton>
      )}

      <Drawer open={opened !== undefined} title="상담 기록" source="staff" onClose={() => setOpenId(null)}>
        {opened && (
          <>
            <p className="mb-4 flex flex-wrap items-center gap-2 text-[13px] tabular-nums text-stone-500">
              {formatDateTime(opened.consulted_at)}
              {opened.result_status && <Badge tone={lookup(RESULT_STATUS, opened.result_status).tone}>{lookup(RESULT_STATUS, opened.result_status).label}</Badge>}
              {opened.follow_up_required && opened.result_status !== "follow_up" && <Badge tone="blue">후속 연락 필요</Badge>}
            </p>
            <dl className="flex flex-col gap-4">
              <Field label="요약" value={opened.summary} />
              {opened.customer_response && <Field label="고객 반응" value={opened.customer_response} />}
              {opened.interested_product && <Field label="관심 상품" value={opened.interested_product} />}
              {opened.interested_plan && <Field label="관심 요금제" value={opened.interested_plan} />}
              {opened.special_notes && <Field label="특이사항" value={opened.special_notes} />}
              {opened.follow_up_reason && <Field label="후속 연락 사유" value={opened.follow_up_reason} />}
              {opened.preferred_follow_up_date && <Field label="재상담 예정일" value={formatDate(opened.preferred_follow_up_date)} />}
            </dl>
          </>
        )}
      </Drawer>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 후속 연락: 다음 한 건만 먼저, 나머지는 펼쳐서
// ---------------------------------------------------------------------------
function FollowUp({
  schedules,
  upcoming,
  canRecontact,
  onChanged,
}: {
  schedules: ScheduleItem[];
  upcoming: ScheduleItem[];
  canRecontact: boolean;
  onChanged: () => void;
}) {
  // [지금 발송]을 누른 일정은 발송이 끝나도 이 자리에 둔다. 다음 일정으로 바로 바뀌면 방금 보낸 문자를 볼 수 없다.
  const [heldId, setHeldId] = useState<string | null>(null);
  const held = heldId
    ? schedules.find((s) => s.schedule_id === heldId)
    : undefined;
  const shown = held ?? upcoming[0];
  const rest = schedules.filter((s) => s.schedule_id !== shown?.schedule_id);
  const title =
    held &&
    held.schedule_status !== "scheduled" &&
    held.schedule_status !== "processing"
      ? "방금 처리한 후속 연락"
      : "다음 후속 연락";
  return (
    <section className="max-w-4xl">
      <SourceLabel source="auto" />
      <h2 className="mt-1 text-[17px] font-bold">{title}</h2>
      <div className="mt-3">
        {shown ? (
          <ScheduleList
            key={shown.schedule_id}
            items={[shown]}
            showCustomer={false}
            onSendStart={setHeldId}
            onChanged={onChanged}
          />
        ) : (
          <EmptyState>
            {canRecontact
              ? "예정된 후속 연락이 없습니다. 재상담 예정일을 기록하면 안내 일정이 만들어집니다."
              : "재연락에 동의하지 않은 고객이라 안내 일정이 만들어지지 않습니다."}
          </EmptyState>
        )}
      </div>
      {rest.length > 0 && (
        <Disclosure
          label={`후속 일정 전체 보기 (${rest.length}건 더)`}
          openLabel="후속 일정 접기"
          className="mt-4"
        >
          <ScheduleList
            items={rest}
            showCustomer={false}
            onChanged={onChanged}
          />
        </Disclosure>
      )}
    </section>
  );
}
