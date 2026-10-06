"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { ScheduleList } from "@/components/staff/ScheduleList";
import { Steps, type Step } from "@/components/Steps";
import { Badge, Button, Card, Chips, EmptyState, ErrorNote, inputClass, Spinner } from "@/components/ui";
import { addDays, formatDate, formatDateTime, formatPhone, formatWon, todayKST } from "@/lib/format";
import { INFORMATION_STATUS, lookup, RESULT_STATUS, scheduleTitle } from "@/lib/labels";
import type { AnalysisData, ConsultationResult, CustomerDetail, RecommendResult } from "@/lib/types";

const POLL_MS = 3000;

export default function CustomerDetailPage({ params }: PageProps<"/staff/customers/[id]">) {
  const { id } = use(params);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/customers/${encodeURIComponent(id)}`, { cache: "no-store" });
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
      setError(cause instanceof Error && cause.message ? cause.message : "고객 정보를 불러오지 못했습니다.");
    }
  }, [id, router]);

  // 분석 결과와 일정은 n8n이 나중에 저장하므로 주기적으로 다시 읽는다.
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  if (notFound) return <EmptyState>고객 정보를 찾을 수 없습니다.</EmptyState>;
  if (!detail) {
    return error ? (
      <ErrorNote>{error}</ErrorNote>
    ) : (
      <div className="flex justify-center py-16 text-brand-600">
        <Spinner className="!size-6" />
      </div>
    );
  }

  const { customer, consent, analysis, consultations, schedules } = detail;

  return (
    <>
      <Link href="/staff" className="text-[14px] font-medium text-slate-500 hover:text-ink">
        ← 고객 목록
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end gap-x-4 gap-y-1">
        <h1 className="text-[28px] font-bold">{customer.customer_name}</h1>
        <p className="pb-1 text-slate-600">
          {formatPhone(customer.phone)} · {customer.consultation_goal}
        </p>
      </div>
      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid grid-cols-[20rem_minmax(0,1fr)] items-start gap-5">
        <div className="flex flex-col gap-5">
          <Card title="기본 정보">
            <dl className="flex flex-col gap-3">
              <Info label="현재 기기" value={customer.current_device} />
              <Info label="현재 요금제" value={customer.current_plan} />
              <Info label="사용 패턴" value={customer.usage_pattern} />
              <Info label="상담 목적" value={customer.consultation_goal} />
              <Info label="나이" value={customer.age != null ? `${customer.age}세` : null} />
              <Info label="약정 만료일" value={customer.contract_end_date ? formatDate(customer.contract_end_date) : null} />
              <Info label="기기 사용 기간" value={customer.device_use_months != null ? `${customer.device_use_months}개월` : null} />
              <Info label="희망 월 예산" value={customer.target_monthly_budget != null ? formatWon(customer.target_monthly_budget) : null} />
              <Info label="관심사" value={customer.interests} />
            </dl>
          </Card>
          <Card title="동의 상태">
            {consent.withdrawn ? (
              <Badge tone="red">동의 철회</Badge>
            ) : (
              <ul className="flex flex-col gap-2.5">
                <ConsentRow label="개인정보 수집·이용" on={consent.privacy} />
                <ConsentRow label="재연락" on={consent.recontact} note="약정·재상담 안내에 필요" />
                <ConsentRow label="마케팅 수신" on={consent.marketing} note="프로모션 안내에 필요" />
              </ul>
            )}
            <p className="mt-3 text-[13px] text-slate-500">동의 일시 {formatDateTime(consent.consent_at)}</p>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card
            title="AI 고객 분석"
            action={analysis && <span className="text-[13px] text-slate-500">{formatDateTime(analysis.created_at)} 분석</span>}
          >
            {analysis ? (
              <AnalysisView data={analysis.analysis_data} />
            ) : (
              <p className="flex items-center gap-3 text-slate-600">
                <Spinner className="text-brand-600" />
                AI가 고객 정보를 분석하고 있습니다. 완료되면 자동으로 표시됩니다.
              </p>
            )}
          </Card>

          <RecommendCard customerId={customer.customer_id} />

          <ConsultationCard
            customerId={customer.customer_id}
            recontact={consent.recontact && !consent.withdrawn}
            analysisId={analysis?.analysis_id ?? null}
            onSaved={load}
          />

          <section>
            <h2 className="mb-2.5 text-[16px] font-semibold">후속 연락 일정</h2>
            <ScheduleList items={schedules} showCustomer={false} onChanged={load} emptyText="이 고객의 후속 연락 일정이 없습니다." />
          </section>

          <Card title="상담 이력">
            {consultations.length === 0 ? (
              <EmptyState>아직 상담 이력이 없습니다.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-4">
                {consultations.map((c) => {
                  const status = lookup(RESULT_STATUS, c.result_status);
                  return (
                    <li key={c.consultation_id} className="border-l-2 border-slate-200 pl-4">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] text-slate-500">
                        {formatDateTime(c.consulted_at)}
                        {c.result_status && <Badge tone={status.tone}>{status.label}</Badge>}
                        {c.follow_up_required && c.result_status !== "follow_up" && <Badge tone="blue">후속 연락 필요</Badge>}
                      </p>
                      <p className="mt-1.5 leading-relaxed">{c.summary}</p>
                      <dl className="mt-2 flex flex-col gap-1 text-[14px]">
                        <Info inline label="고객 반응" value={c.customer_response} />
                        <Info inline label="관심 상품" value={c.interested_product} />
                        <Info inline label="관심 요금제" value={c.interested_plan} />
                        <Info inline label="특이사항" value={c.special_notes} />
                        <Info inline label="후속 연락 사유" value={c.follow_up_reason} />
                        <Info inline label="재상담 예정" value={c.reconsultation_at ? formatDateTime(c.reconsultation_at) : null} />
                      </dl>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Info({ label, value, inline }: { label: string; value: string | null | undefined; inline?: boolean }) {
  if (inline) {
    if (!value) return null;
    return (
      <div className="flex gap-3">
        <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
        <dd>{value}</dd>
      </div>
    );
  }
  return (
    <div>
      <dt className="text-[13px] text-slate-500">{label}</dt>
      <dd className={value ? "font-medium" : "text-slate-400"}>{value || "미입력"}</dd>
    </div>
  );
}

function ConsentRow({ label, on, note }: { label: string; on: boolean; note?: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>
        {label}
        {note && <span className="block text-[13px] text-slate-500">{note}</span>}
      </span>
      <Badge tone={on ? "green" : "gray"}>{on ? "동의" : "미동의"}</Badge>
    </li>
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

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function AnalysisView({ data }: { data: AnalysisData }) {
  const features = list(data.important_features);
  const factors = list(data.recommendation_factors);
  const missing = list(data.missing_information);
  // LLM 출력이라 정의하지 않은 키가 올 수 있다. 버리지 않고 아래에 그대로 보여 준다.
  const extra = Object.entries(data ?? {}).filter(([key, value]) => !ANALYSIS_KNOWN.has(key) && value != null && value !== "");
  return (
    <div className="flex flex-col gap-4">
      {data.analysis_summary && <p className="rounded-lg bg-brand-50 px-4 py-3 text-[16px] leading-relaxed">{data.analysis_summary}</p>}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Info label="사용 성향" value={data.usage_profile} />
        <Info label="교체 사유" value={data.replacement_reason} />
        <Info label="가격 민감도" value={data.price_sensitivity} />
        <Info label="기기 변경 신호" value={data.device_change_signal} />
        <Info label="선호 제품군" value={data.preferred_product_group} />
      </dl>
      {features.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] text-slate-500">중요하게 보는 기능</p>
          <Chips items={features} />
        </div>
      )}
      {factors.length > 0 && (
        <div>
          <p className="mb-1.5 text-[13px] text-slate-500">추천 시 고려 요소</p>
          <Chips items={factors} />
        </div>
      )}
      {missing.length > 0 && (
        <p className="text-[14px] text-amber-800">
          <span className="font-semibold">상담 중 확인하면 좋은 정보:</span> {missing.join(", ")}
        </p>
      )}
      {extra.length > 0 && (
        <dl className="flex flex-col gap-1 text-[14px]">
          {extra.map(([key, value]) => (
            <Info key={key} inline label={key} value={typeof value === "string" ? value : JSON.stringify(value)} />
          ))}
        </dl>
      )}
    </div>
  );
}

function RecommendCard({ customerId }: { customerId: string }) {
  const storageKey = `recommend:${customerId}`;
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  // 추천은 DB에 저장되지 않으므로, 새로고침해도 보이도록 마지막 응답을 브라우저에 보관한다.
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
    setLoading(true);
    setRequested(true);
    let next: RecommendResult;
    try {
      const response = await fetch("/api/staff/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId }),
      });
      next = await response.json();
    } catch {
      next = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    setResult(next);
    setLoading(false);
    if (next.success) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // 보관에 실패해도 이번 결과는 화면에 표시된다.
      }
    }
  }

  const info = result?.success ? lookup(INFORMATION_STATUS, result.information_status) : null;
  const recommendations = result?.success ? [...result.recommendations].sort((a, b) => (a.recommendation_rank ?? 99) - (b.recommendation_rank ?? 99)) : [];

  return (
    <Card
      title="맞춤 추천"
      className="ring-2 !ring-brand-100"
      action={
        <Button size="sm" loading={loading} onClick={request}>
          {result?.success ? "다시 추천 받기" : "추천 받기"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {requested && (loading || (result && !result.success)) && (
          <Steps
            steps={[
              { label: "추천 요청 전송", state: "done" },
              {
                label: "프로모션·혜택 문서 검색 및 추천 생성 (F03)",
                state: loading ? "active" : "error",
                note: loading ? "고객 분석 결과를 바탕으로 생성 중" : undefined,
              },
            ]}
          />
        )}
        {result && !result.success && <ErrorNote>{result.message}</ErrorNote>}
        {!result && !loading && (
          <p className="text-slate-600">고객 분석 결과와 현재 프로모션·혜택 문서를 바탕으로 기기와 요금제를 추천합니다.</p>
        )}
        {result?.success && (
          <>
            {recommendations.length === 0 ? (
              <EmptyState>추천할 수 있는 상품을 찾지 못했습니다.</EmptyState>
            ) : (
              <ol className="grid grid-cols-2 gap-4">
                {recommendations.map((item, index) => (
                  <li
                    key={index}
                    className={`rounded-xl p-4 ${index === 0 ? "bg-brand-50 ring-2 ring-brand-500" : "bg-slate-50 ring-1 ring-slate-200"}`}
                  >
                    <p className={`text-[13px] font-bold ${index === 0 ? "text-brand-700" : "text-slate-500"}`}>
                      {item.recommendation_rank ?? index + 1}순위 추천
                    </p>
                    <p className="mt-1 text-[20px] font-bold leading-snug">{item.device_name ?? "기기 추천 없음"}</p>
                    {item.plan_name && <p className="font-medium text-slate-700">{item.plan_name}</p>}
                    {item.recommendation_reason && <p className="mt-3 text-[14px] leading-relaxed text-slate-700">{item.recommendation_reason}</p>}
                    <dl className="mt-3 flex flex-col gap-1 text-[14px]">
                      <Info inline label="예상 혜택" value={item.expected_benefit} />
                      <Info inline label="혜택 정보" value={item.benefit_info} />
                      <Info inline label="적용 조건" value={item.eligibility_condition} />
                    </dl>
                  </li>
                ))}
              </ol>
            )}
            <p className="flex flex-wrap items-center gap-2 text-[14px] text-slate-600">
              {info && <Badge tone={info.tone}>{info.label}</Badge>}
              {result.missing_information.length > 0 && <span>확인되지 않은 정보: {result.missing_information.join(", ")}</span>}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

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

function ConsultationCard({
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
  // 저장 시점의 분석 ID. 이후 다른 ID가 보이면 재분석(F02)이 끝난 것이다.
  const [analysisAtSubmit, setAnalysisAtSubmit] = useState<string | null | undefined>(undefined);

  const today = todayKST();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const datePassed = form.reconsultation_date !== "" && form.reconsultation_date <= today;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.notes.trim()) return setFormError("상담 메모를 입력해 주세요.");
    setFormError(null);
    setLoading(true);
    setResult(null);
    setAnalysisAtSubmit(analysisId);
    let next: ConsultationResult;
    try {
      const response = await fetch("/api/staff/consultation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, ...form }),
      });
      next = await response.json();
    } catch {
      next = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    setResult(next);
    setLoading(false);
    if (next.success) setForm(EMPTY_FORM);
    onSaved();
  }

  const submitted = loading || result !== null;
  const reanalyzed = result?.success === true && analysisAtSubmit !== undefined && analysisId !== analysisAtSubmit;
  const steps: Step[] = [
    { label: "상담 결과 전송", state: "done" },
    {
      label: "상담 결과 구조화 (F04) · 후속 일정 생성 (F06)",
      state: loading ? "active" : result?.success ? "done" : "error",
    },
    {
      label: "상담 내용을 반영해 고객 분석 갱신 (F02)",
      state: !result?.success ? "waiting" : reanalyzed ? "done" : "active",
    },
  ];
  const status = result?.success ? lookup(RESULT_STATUS, result.result_status) : null;

  return (
    <Card title="상담 결과 입력">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="notes" className="mb-1.5 block text-[14px] font-semibold">
            상담 메모 <span className="text-rose-500">*</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            className={inputClass}
            placeholder="예: Galaxy S26과 5G 스탠다드 69 요금제를 안내. 가격을 가족과 상의한 뒤 다시 방문하기로 함."
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <LabeledInput id="response" label="고객 반응" value={form.customer_response} onChange={(v) => set("customer_response", v)} placeholder="예: 긍정적, 가격 고민" />
          <LabeledInput id="product" label="관심 상품" value={form.selected_product} onChange={(v) => set("selected_product", v)} />
          <LabeledInput id="plan" label="관심 요금제" value={form.selected_plan} onChange={(v) => set("selected_plan", v)} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="reconsult" className="mb-1.5 block text-[14px] font-semibold">
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
          <div className="col-span-2">
            <LabeledInput id="recording" label="녹취 파일 URL (선택)" value={form.recording_url} onChange={(v) => set("recording_url", v)} placeholder="입력하면 음성을 텍스트로 변환해 분석합니다" />
          </div>
        </div>
        <label className="flex items-center gap-2.5">
          <input type="checkbox" className="size-5 accent-brand-600" checked={form.follow_up_requested} onChange={(e) => set("follow_up_requested", e.target.checked)} />
          고객이 추후 연락을 요청함
        </label>
        <p className={`text-[14px] ${datePassed || (form.reconsultation_date && !recontact) ? "text-amber-800" : "text-slate-500"}`}>
          {datePassed
            ? "재상담 예정일이 오늘이거나 지난 날짜이면 안내 일정이 생성되지 않습니다."
            : form.reconsultation_date && !recontact
              ? "이 고객은 재연락에 동의하지 않아 안내 일정이 생성되지 않습니다."
              : "재상담 예정일을 입력하면 하루 전에 안내 문자가 발송되도록 일정이 생성됩니다."}
        </p>
        {formError && <ErrorNote>{formError}</ErrorNote>}
        <div>
          <Button type="submit" loading={loading}>
            {loading ? "AI가 정리하는 중" : "상담 결과 저장"}
          </Button>
        </div>
      </form>

      {submitted && (
        <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-5">
          <Steps steps={steps} />
          {result && !result.success && <ErrorNote>{result.message}</ErrorNote>}
          {result?.success && (
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">AI가 정리한 상담 결과</span>
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
                {result.result_status !== "follow_up" && (
                  <Badge tone={result.follow_up_required ? "blue" : "gray"}>{result.follow_up_required ? "후속 연락 필요" : "후속 연락 불필요"}</Badge>
                )}
              </p>
              {result.summary && <p className="mt-2 leading-relaxed">{result.summary}</p>}
              {result.follow_up_reason && <p className="mt-1.5 text-[14px] text-slate-600">사유: {result.follow_up_reason}</p>}
              {result.schedules.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {result.schedules.map((schedule) => (
                    <li key={schedule.schedule_id} className="flex items-center gap-2 text-[15px]">
                      <span aria-hidden>🗓</span>
                      <span className="font-semibold">{scheduleTitle(schedule.schedule_type, schedule.schedule_subtype)}</span>
                      <span>{formatDateTime(schedule.scheduled_contact_at)} 발송 예정</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[14px] text-slate-500">생성된 후속 연락 일정이 없습니다.</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function LabeledInput({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold">
        {label}
      </label>
      <input id={id} className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
