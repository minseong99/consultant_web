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
  Card,
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
  const { customer, consent, analysis, consultations, schedules } = detail;
  const [tab, setTab] = useState<TabKey>("brief");
  const [drawer, setDrawer] = useState<"customer" | "analysis" | null>(null);
  const [recommendUnseen, setRecommendUnseen] = useState(false);
  const tabRef = useRef<TabKey>("brief");
  // 다른 탭을 보는 동안 추천이 도착했을 때만 탭에 표시한다.
  const recommend = useRecommend(customer.customer_id, () =>
    setRecommendUnseen(tabRef.current !== "recommend"),
  );

  const upcoming = schedules.filter(
    (s) =>
      s.schedule_status === "scheduled" || s.schedule_status === "processing",
  );
  const canRecontact = consent.recontact && !consent.withdrawn;

  function go(next: TabKey) {
    tabRef.current = next;
    setTab(next);
    if (next === "recommend") setRecommendUnseen(false);
  }

  const tabs: TabDef<TabKey>[] = [
    { key: "brief", label: "고객 브리프" },
    {
      key: "recommend",
      label: "추천",
      dot: recommendUnseen && tab !== "recommend",
    },
    { key: "record", label: "상담 기록", count: consultations.length },
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
            <aside className="flex flex-col gap-4">
              <NextAction
                hasAnalysis={Boolean(analysis)}
                recommend={recommend}
                onRecommend={() => {
                  go("recommend");
                  recommend.request();
                }}
                onGo={go}
              />
              <NextFollowUpSummary
                next={upcoming[0]}
                canRecontact={canRecontact}
                onGo={() => go("followup")}
              />
              <LatestConsultation
                latest={consultations[0]}
                onGo={() => go("record")}
              />
            </aside>
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
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
            <ConsultationForm
              customerId={customer.customer_id}
              recontact={canRecontact}
              analysisId={analysis?.analysis_id ?? null}
              onSaved={reload}
            />
            <ConsultationHistory consultations={consultations} />
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
}: {
  customer: Customer;
  consent: Consent;
  onOpenAll: () => void;
}) {
  const remaining = customer.contract_end_date
    ? daysUntil(customer.contract_end_date)
    : null;
  return (
    <header className="mt-3 rounded-xl bg-white px-6 pb-2 pt-5 ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[20px] font-bold leading-tight">
            {customer.customer_name}
          </h1>
          <p className="mt-1 text-[15px] text-stone-700">
            <Clamp lines={2}>{customer.consultation_goal}</Clamp>
          </p>
        </div>
        <TextButton onClick={onOpenAll} className="shrink-0">
          고객 정보 전체
        </TextButton>
      </div>
      <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-stone-200 py-3 text-[14px]">
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
      <section
        aria-busy="true"
        className="rounded-xl bg-white p-6 ring-1 ring-stone-200"
      >
        <SourceLabel source="ai" />
        <h2 className="mt-1 text-[17px] font-bold">고객 브리프</h2>
        <div className="mt-3">
          <StatusLine
            state="active"
            label="AI가 고객 정보를 분석하고 있습니다"
            note="보통 30초 안팎, 끝나면 자동으로 표시됩니다"
          />
        </div>
        <div className="mt-5 flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-4 h-4 w-2/3" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </section>
    );
  }
  const data = analysis.analysis_data;
  const features = list(data.important_features);
  const missing = list(data.missing_information);
  return (
    <section className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
      <div className="flex items-center justify-between gap-3">
        <SourceLabel source="ai" />
        <span className="text-[12px] text-stone-500">
          {formatDateTime(analysis.created_at)} 분석
        </span>
      </div>
      <h2 className="mt-1 text-[17px] font-bold">고객 브리프</h2>
      {data.analysis_summary && (
        <p className="mt-3 rounded-lg border-l-[3px] border-info bg-ai-surface px-4 py-3 text-[15px] leading-relaxed">
          <Clamp lines={3}>{data.analysis_summary}</Clamp>
        </p>
      )}
      <dl className="mt-4 flex flex-col divide-y divide-stone-200 border-b border-stone-200">
        <BriefRow label="변경 신호" value={data.device_change_signal} />
        <BriefRow label="중요 요소" value={firstFew(features, 3)} lines={1} />
        <BriefRow label="가격 성향" value={data.price_sensitivity} />
        <BriefRow label="상담 중 확인" value={firstFew(missing, 2)} />
      </dl>
      <TextButton onClick={onOpenFull} className="mt-3">
        전체 AI 분석 보기
      </TextButton>
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
  return (
    <div className="flex gap-4 py-3">
      <dt className="w-24 shrink-0 text-[13px] font-semibold text-stone-500">
        {label}
      </dt>
      <dd
        className={`min-w-0 flex-1 text-[14px] leading-relaxed ${value ? "" : "text-stone-400"}`}
      >
        {value ? <Clamp lines={lines}>{value}</Clamp> : "분석에 없음"}
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
        <Field label="기기 변경 신호" value={data.device_change_signal} />
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
// 브리프 탭의 오른쪽: 다음 행동, 다음 연락, 최근 상담
// ---------------------------------------------------------------------------
function AsideSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="text-[13px] font-semibold text-stone-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function NextAction({
  hasAnalysis,
  recommend,
  onRecommend,
  onGo,
}: {
  hasAnalysis: boolean;
  recommend: RecommendState;
  onRecommend: () => void;
  onGo: (tab: TabKey) => void;
}) {
  const ready = recommend.result?.success === true;
  return (
    <Card>
      <h2 className="text-[13px] font-semibold text-stone-500">다음 행동</h2>
      {recommend.loading ? (
        <div className="mt-3 flex flex-col gap-3">
          <StatusLine
            state="active"
            label="추천 생성 중"
            since={recommend.startedAt}
          />
          <p className="text-[13px] leading-relaxed text-stone-600">
            기다리는 동안 브리프의 &lsquo;상담 중 확인&rsquo; 항목을 고객에게
            물어보세요.
          </p>
          <Button variant="secondary" onClick={() => onGo("recommend")}>
            추천 탭 보기
          </Button>
        </div>
      ) : ready ? (
        <div className="mt-3 flex flex-col gap-3">
          <StatusLine state="done" label="추천이 준비됐습니다" />
          <Button onClick={() => onGo("recommend")}>추천 보기</Button>
          <Button variant="secondary" onClick={() => onGo("record")}>
            상담 기록 작성
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-[14px] leading-relaxed">
            {hasAnalysis
              ? "브리프를 확인했다면 맞춤 추천을 받아 보세요."
              : "분석이 끝나면 더 정확한 추천을 받을 수 있습니다."}
          </p>
          <Button onClick={onRecommend}>추천 받기</Button>
          <Button variant="secondary" onClick={() => onGo("record")}>
            상담 기록 작성
          </Button>
        </div>
      )}
    </Card>
  );
}

function NextFollowUpSummary({
  next,
  canRecontact,
  onGo,
}: {
  next: ScheduleItem | undefined;
  canRecontact: boolean;
  onGo: () => void;
}) {
  return (
    <AsideSection title="다음 후속 연락">
      {next ? (
        <>
          <p className="text-[15px] font-semibold tabular-nums">
            {formatDateTime(next.scheduled_contact_at)}
          </p>
          <p className="text-[14px] text-stone-700">
            {scheduleTitle(next.schedule_type, next.schedule_subtype)}
          </p>
          <TextButton onClick={onGo} className="mt-1">
            후속 연락 보기
          </TextButton>
        </>
      ) : (
        <p className="text-[14px] text-stone-600">
          {canRecontact
            ? "예정된 연락이 없습니다."
            : "재연락에 동의하지 않아 안내 일정이 만들어지지 않습니다."}
        </p>
      )}
    </AsideSection>
  );
}

function LatestConsultation({
  latest,
  onGo,
}: {
  latest: Consultation | undefined;
  onGo: () => void;
}) {
  if (!latest) return null;
  const status = lookup(RESULT_STATUS, latest.result_status);
  return (
    <AsideSection title="최근 상담">
      <p className="flex flex-wrap items-center gap-2 text-[13px] text-stone-500">
        {formatDateTime(latest.consulted_at)}
        {latest.result_status && (
          <Badge tone={status.tone}>{status.label}</Badge>
        )}
      </p>
      <p className="mt-1 text-[14px] leading-relaxed">
        <Clamp lines={2}>{latest.summary}</Clamp>
      </p>
      <TextButton onClick={onGo} className="mt-1">
        상담 이력 보기
      </TextButton>
    </AsideSection>
  );
}

// ---------------------------------------------------------------------------
// 추천
// ---------------------------------------------------------------------------
type RecommendState = {
  result: RecommendResult | null;
  loading: boolean;
  startedAt: number | null;
  request: () => void;
};

function useRecommend(
  customerId: string,
  onArrived: () => void,
): RecommendState {
  const storageKey = `recommend:${customerId}`;
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  // 추천은 DB에 저장되지 않으므로, 새로고침해도 보이도록 마지막 응답을 브라우저 탭에 보관한다.
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

  return { result, loading, startedAt, request };
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
  const { result, loading, startedAt, request } = recommend;
  // 근거를 보고 있는 추천의 순번. null 이면 서랍이 닫혀 있다.
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const info = result?.success
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
    { label: "기기 변경 신호", value: analysis?.device_change_signal ?? null },
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
            {result?.success
              ? "추천 결과는 저장되지 않습니다. 이 브라우저 탭을 닫으면 사라지니, 필요한 내용은 상담 기록에 남겨 주세요."
              : "고객 분석과 등록된 기기·요금제·프로모션을 근거로 추천합니다."}
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
                className="rounded-xl bg-white p-5 ring-1 ring-stone-200"
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
    <li className={`flex flex-col rounded-xl bg-white p-5 ${primary ? "ring-2 ring-brand-600" : "ring-1 ring-stone-200"}`}>
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
}: {
  customerId: string;
  recontact: boolean;
  analysisId: string | null;
  onSaved: () => void;
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
    if (next.success) setForm(EMPTY_FORM);
    onSaved();
  }

  const submitted = loading || result !== null;
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
      <div className="rounded-xl bg-white p-6 ring-1 ring-stone-200">
        <SourceLabel source="staff" />
        <h2 className="mt-1 text-[17px] font-bold">상담 기록</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-5">
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
              {loading ? "저장하는 중" : "상담 기록 저장"}
            </Button>
          </div>
        </form>
      </div>

      {submitted && (
        <div
          ref={resultRef}
          className="mt-4 scroll-mb-6 rounded-xl border-l-[3px] border-info bg-ai-surface p-5 ring-1 ring-ai-line"
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

function ConsultationHistory({
  consultations,
}: {
  consultations: Consultation[];
}) {
  return (
    <aside className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="text-[13px] font-semibold text-stone-500">
        상담 이력{" "}
        {consultations.length > 0 && (
          <span className="tabular-nums">{consultations.length}</span>
        )}
      </h2>
      {consultations.length === 0 ? (
        <p className="mt-2 text-[14px] text-stone-600">
          아직 상담 이력이 없습니다.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-stone-200 border-t border-stone-200">
          {consultations.map((c) => {
            const status = lookup(RESULT_STATUS, c.result_status);
            const hasDetail =
              c.customer_response ||
              c.interested_product ||
              c.interested_plan ||
              c.special_notes ||
              c.follow_up_reason ||
              c.preferred_follow_up_date;
            return (
              <li key={c.consultation_id} className="py-3">
                <p className="flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                  {formatDateTime(c.consulted_at)}
                  {c.result_status && (
                    <Badge tone={status.tone}>{status.label}</Badge>
                  )}
                  {c.follow_up_required && c.result_status !== "follow_up" && (
                    <Badge tone="blue">후속 연락 필요</Badge>
                  )}
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed">
                  <Clamp lines={2}>{c.summary}</Clamp>
                </p>
                <Disclosure
                  label="자세히 보기"
                  openLabel="접기"
                  className="mt-1"
                >
                  <dl className="flex flex-col gap-3">
                    <Field label="요약" value={c.summary} />
                    {hasDetail && (
                      <>
                        {c.customer_response && (
                          <Field
                            label="고객 반응"
                            value={c.customer_response}
                          />
                        )}
                        {c.interested_product && (
                          <Field
                            label="관심 상품"
                            value={c.interested_product}
                          />
                        )}
                        {c.interested_plan && (
                          <Field
                            label="관심 요금제"
                            value={c.interested_plan}
                          />
                        )}
                        {c.special_notes && (
                          <Field label="특이사항" value={c.special_notes} />
                        )}
                        {c.follow_up_reason && (
                          <Field
                            label="후속 연락 사유"
                            value={c.follow_up_reason}
                          />
                        )}
                        {c.preferred_follow_up_date && (
                          <Field
                            label="재상담 예정일"
                            value={formatDate(c.preferred_follow_up_date)}
                          />
                        )}
                      </>
                    )}
                  </dl>
                </Disclosure>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
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
