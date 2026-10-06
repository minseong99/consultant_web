"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Disclosure, Drawer, EmptyState, ErrorNote, inputClass, Skeleton, SourceLabel, Spinner, StatusLine } from "@/components/ui";
import { todayKST, formatDate, formatPhone } from "@/lib/format";
import { lookup, PROMOTION_STATUS } from "@/lib/labels";
import type { DocumentRow, PromotionRegisterResult, PromotionResult } from "@/lib/types";

type Run = { loading: boolean; result: PromotionResult | null; startedAt: number };

const EMPTY_FORM = {
  promotion_name: "",
  valid_from: "",
  valid_until: "",
  promotion_type: "",
  target_device: "",
  target_plan: "",
  target_customer: "",
  benefit: "",
  conditions: "",
};

const labelClass = "mb-1.5 block text-[13px] font-semibold";

// 요청을 보낸 시각. 경과 시간 표시에 쓴다(이벤트 처리 안에서만 부른다).
const clock = () => Date.now();

function isEnded(validUntil: string | null) {
  return Boolean(validUntil) && String(validUntil).slice(0, 10) < todayKST();
}

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, Run>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch("/api/staff/promotions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message);
        setError(null);
        setPromotions(data.promotions);
      })
      .catch((cause) => {
        setPromotions((current) => current ?? []);
        setError(cause instanceof Error && cause.message ? cause.message : "프로모션을 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function register(event: FormEvent) {
    event.preventDefault();
    if (form.valid_from > form.valid_until) {
      setFormError("종료일이 시작일보다 빠릅니다.");
      return;
    }
    setSaving(true);
    setFormError(null);
    let result: PromotionRegisterResult;
    try {
      const response = await fetch("/api/staff/promotions/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      result = await response.json();
    } catch {
      result = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    setSaving(false);
    if (!result.success) {
      setFormError(result.message);
      return;
    }
    setRegistered(result.document_id);
    setForm(EMPTY_FORM);
    setFormOpen(false);
    await load();
  }

  const field = (name: keyof typeof EMPTY_FORM) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [name]: event.target.value }));

  async function run(documentId: string) {
    const startedAt = clock();
    setRuns((map) => ({ ...map, [documentId]: { loading: true, result: null, startedAt } }));
    let result: PromotionResult;
    try {
      const response = await fetch("/api/staff/promotions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document_id: documentId }),
      });
      result = await response.json();
    } catch {
      result = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    setRuns((map) => ({ ...map, [documentId]: { loading: false, result, startedAt } }));
  }

  const ordered =
    promotions === null
      ? []
      : // 방금 등록한 프로모션을 맨 위에 두고, 기간이 끝난 프로모션은 아래로 내려 실행을 막는다.
        [...promotions].sort(
          (a, b) => Number(b.document_id === registered) - Number(a.document_id === registered) || Number(isEnded(a.valid_until)) - Number(isEnded(b.valid_until)),
        );

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold">프로모션</h1>
          <p className="mt-1 text-[14px] text-stone-600">프로모션을 등록하고 조건에 맞는 고객에게 안내 일정을 만듭니다. 마케팅·재연락에 동의한 고객만 대상입니다.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>새 프로모션 등록</Button>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        {registered && !formOpen && (
          <p className="flex items-center gap-2 text-[13px] text-stone-700">
            <StatusLine state="done" label="프로모션을 등록했습니다" note="아래에서 [대상 선정 및 일정 생성]을 실행하세요" />
          </p>
        )}

        {promotions === null ? (
          <div className="flex justify-center py-16 text-stone-500">
            <Spinner className="!size-6" />
          </div>
        ) : ordered.length === 0 ? (
          !error && <EmptyState>이 매장에 등록된 프로모션이 없습니다. [새 프로모션 등록]으로 시작하세요.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {ordered.map((promotion) => {
              const ended = isEnded(promotion.valid_until);
              const upcoming = Boolean(promotion.valid_from) && String(promotion.valid_from).slice(0, 10) > todayKST();
              const state = runs[promotion.document_id];
              const result = state?.result;
              const status = result && "status" in result ? lookup(PROMOTION_STATUS, result.status) : null;
              const targets = result && "target_customers" in result ? result.target_customers : [];
              return (
                <li key={promotion.document_id} className="rounded-xl bg-white px-5 py-4 ring-1 ring-stone-200">
                  <div className="flex items-center gap-5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[16px] font-bold">{promotion.file_name}</span>
                        {promotion.document_id === registered && <Badge tone="red">방금 등록</Badge>}
                        <Badge tone={ended ? "gray" : upcoming ? "blue" : "green"}>{ended ? "기간 종료" : upcoming ? "시작 전" : "진행 중"}</Badge>
                      </p>
                      <p className="mt-0.5 text-[13px] tabular-nums text-stone-600">
                        {formatDate(promotion.valid_from)} ~ {formatDate(promotion.valid_until)}
                      </p>
                    </div>
                    <Button variant="secondary" loading={state?.loading} disabled={ended} onClick={() => run(promotion.document_id)}>
                      {state?.loading ? "선정하는 중" : "대상 선정 및 일정 생성"}
                    </Button>
                  </div>

                  {state && (
                    <div className="mt-4 border-t border-stone-200 pt-4" aria-live="polite">
                      {state.loading && (
                        <>
                          <StatusLine state="active" label="대상 고객 선정 중" since={state.startedAt} note="요청이 전달되었습니다 · 보통 20초 안팎" />
                          <Skeleton className="mt-3 h-4 w-40" />
                        </>
                      )}
                      {!state.loading && result && !status && !result.success && "message" in result && <ErrorNote>{result.message}</ErrorNote>}
                      {!state.loading && result && status && "target_customers" in result && (
                        <>
                          <p className="flex flex-wrap items-center gap-3">
                            <SourceLabel source="ai" label="AI 대상 선정" />
                            <span className="text-[16px] font-bold tabular-nums">대상 {result.target_count}명</span>
                            <Badge tone={status.tone}>{status.label}</Badge>
                            {result.target_count > 0 && <span className="text-[13px] text-stone-600">안내 일정이 만들어졌습니다</span>}
                          </p>
                          {"message" in result && typeof result.message === "string" && result.target_count === 0 && (
                            <p className="mt-1.5 text-[13px] text-stone-600">{result.message}</p>
                          )}
                          {targets.length > 0 && (
                            <Disclosure label="대상 고객 보기" openLabel="대상 고객 접기" className="mt-2">
                              <ul className="divide-y divide-stone-200 rounded-lg ring-1 ring-stone-200">
                                {targets.map((target) => (
                                  <li key={target.customer_id} className="flex items-baseline gap-4 px-4 py-2.5">
                                    <span className="w-32 shrink-0 truncate text-[14px] font-semibold">{target.customer_name}</span>
                                    <span className="w-32 shrink-0 text-[12px] tabular-nums text-stone-500">{formatPhone(target.phone)}</span>
                                    <span className="min-w-0 flex-1 text-[13px] text-stone-700">{(target.match_reasons ?? []).join(", ") || "선정 사유 없음"}</span>
                                  </li>
                                ))}
                              </ul>
                            </Disclosure>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Drawer open={formOpen} title="새 프로모션 등록" source="staff" onClose={() => setFormOpen(false)}>
        <form onSubmit={register} className="flex flex-col gap-5">
          <div>
            <label htmlFor="promotion_name" className={labelClass}>
              프로모션 이름 <span className="text-danger">*</span>
            </label>
            <input id="promotion_name" required className={inputClass} placeholder="예: Galaxy S26 사전예약 프로모션" value={form.promotion_name} onChange={field("promotion_name")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="valid_from" className={labelClass}>
                시작일 <span className="text-danger">*</span>
              </label>
              <input id="valid_from" type="date" required className={inputClass} value={form.valid_from} onChange={field("valid_from")} />
            </div>
            <div>
              <label htmlFor="valid_until" className={labelClass}>
                종료일 <span className="text-danger">*</span>
              </label>
              <input id="valid_until" type="date" required className={inputClass} value={form.valid_until} onChange={field("valid_until")} />
            </div>
          </div>
          <div>
            <label htmlFor="benefit" className={labelClass}>
              혜택 <span className="text-danger">*</span>
            </label>
            <textarea id="benefit" required rows={3} className={inputClass} placeholder="예: 사전예약 시 Galaxy Watch 증정, 기기값 10만원 할인" value={form.benefit} onChange={field("benefit")} />
            <p className="mt-1 text-[12px] text-stone-500">안내 문자에 이 내용이 들어갑니다. 적지 않은 혜택은 문자에 쓰이지 않습니다.</p>
          </div>
          <div>
            <label htmlFor="target_device" className={labelClass}>
              대상 기기
            </label>
            <input id="target_device" className={inputClass} placeholder="예: Galaxy S26" value={form.target_device} onChange={field("target_device")} />
            <p className="mt-1 text-[12px] text-stone-500">적으면 이 기기나 같은 브랜드에 관심을 보인 고객으로 대상이 좁혀집니다.</p>
          </div>

          <Disclosure label="대상 요금제·고객·조건 입력" openLabel="추가 입력 접기">
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="target_plan" className={labelClass}>
                  대상 요금제
                </label>
                <input id="target_plan" className={inputClass} placeholder="예: 초이스90 이상" value={form.target_plan} onChange={field("target_plan")} />
              </div>
              <div>
                <label htmlFor="promotion_type" className={labelClass}>
                  프로모션 유형
                </label>
                <input id="promotion_type" className={inputClass} placeholder="예: 기기변경, 사은품" value={form.promotion_type} onChange={field("promotion_type")} />
              </div>
              <div>
                <label htmlFor="target_customer" className={labelClass}>
                  대상 고객
                </label>
                <input id="target_customer" className={inputClass} placeholder="예: 기기를 24개월 이상 사용한 고객" value={form.target_customer} onChange={field("target_customer")} />
              </div>
              <div>
                <label htmlFor="conditions" className={labelClass}>
                  조건
                </label>
                <textarea id="conditions" rows={2} className={inputClass} placeholder="예: 매장 방문 개통, 선착순 100명" value={form.conditions} onChange={field("conditions")} />
              </div>
            </div>
          </Disclosure>

          {formError && <ErrorNote>{formError}</ErrorNote>}
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>
              {saving ? "등록하는 중" : "등록"}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setFormOpen(false)}>
              취소
            </Button>
          </div>
        </form>
      </Drawer>
    </>
  );
}
