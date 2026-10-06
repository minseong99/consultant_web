"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Steps } from "@/components/Steps";
import { Badge, Button, Card, EmptyState, ErrorNote, inputClass, Spinner } from "@/components/ui";
import { todayKST, formatDate, formatPhone } from "@/lib/format";
import { lookup, PROMOTION_STATUS } from "@/lib/labels";
import type { DocumentRow, PromotionRegisterResult, PromotionResult } from "@/lib/types";

type Run = { loading: boolean; result: PromotionResult | null };

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

const labelClass = "mb-1.5 block text-[14px] font-semibold";

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
    setRuns((map) => ({ ...map, [documentId]: { loading: true, result: null } }));
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
    setRuns((map) => ({ ...map, [documentId]: { loading: false, result } }));
  }

  return (
    <>
      <h1 className="text-[26px] font-bold">프로모션</h1>
      <p className="mt-1 text-slate-600">프로모션 문서의 조건으로 대상 고객을 선정하고 안내 일정을 만듭니다. 마케팅·재연락에 동의한 고객만 대상이 됩니다.</p>

      <div className="mt-6 flex flex-col gap-4">
        {error && <ErrorNote>{error}</ErrorNote>}

        <Card
          title="프로모션 등록"
          action={
            <Button size="sm" variant={formOpen ? "secondary" : "primary"} onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? "닫기" : "새 프로모션 등록"}
            </Button>
          }
        >
          {!formOpen ? (
            <p className="text-slate-600">
              {registered
                ? "프로모션을 등록했습니다. 아래 목록에서 대상 선정 및 일정 생성을 실행하세요."
                : "프로모션 내용을 입력하면 대상 고객 선정과 안내 문자 작성에 쓰입니다."}
            </p>
          ) : (
            <form onSubmit={register} className="flex flex-col gap-4">
              <div>
                <label htmlFor="promotion_name" className={labelClass}>
                  프로모션 이름 <span className="text-red-500">*</span>
                </label>
                <input id="promotion_name" required className={inputClass} placeholder="예: Galaxy S26 사전예약 프로모션" value={form.promotion_name} onChange={field("promotion_name")} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="valid_from" className={labelClass}>
                    시작일 <span className="text-red-500">*</span>
                  </label>
                  <input id="valid_from" type="date" required className={inputClass} value={form.valid_from} onChange={field("valid_from")} />
                </div>
                <div>
                  <label htmlFor="valid_until" className={labelClass}>
                    종료일 <span className="text-red-500">*</span>
                  </label>
                  <input id="valid_until" type="date" required className={inputClass} value={form.valid_until} onChange={field("valid_until")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="target_device" className={labelClass}>
                    대상 기기
                  </label>
                  <input id="target_device" className={inputClass} placeholder="예: Galaxy S26" value={form.target_device} onChange={field("target_device")} />
                </div>
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
              </div>
              <div>
                <label htmlFor="benefit" className={labelClass}>
                  혜택 <span className="text-red-500">*</span>
                </label>
                <textarea id="benefit" required rows={2} className={inputClass} placeholder="예: 사전예약 시 Galaxy Watch 증정, 기기값 10만원 할인" value={form.benefit} onChange={field("benefit")} />
                <p className="mt-1 text-[13px] text-slate-500">안내 문자에 이 내용이 들어갑니다. 적지 않은 혜택은 문자에 쓰이지 않습니다.</p>
              </div>
              <div>
                <label htmlFor="conditions" className={labelClass}>
                  조건
                </label>
                <textarea id="conditions" rows={2} className={inputClass} placeholder="예: 매장 방문 개통, 선착순 100명" value={form.conditions} onChange={field("conditions")} />
              </div>
              {formError && <ErrorNote>{formError}</ErrorNote>}
              <div>
                <Button type="submit" loading={saving}>
                  등록
                </Button>
              </div>
            </form>
          )}
        </Card>

        {promotions === null ? (
          <div className="flex justify-center py-16 text-brand-600">
            <Spinner className="!size-6" />
          </div>
        ) : promotions.length === 0 ? (
          !error && <EmptyState>이 매장에 등록된 프로모션이 없습니다.</EmptyState>
        ) : (
          // 방금 등록한 프로모션을 맨 위에 두고, 기간이 끝난 프로모션은 아래로 내려 실행을 막는다.
          [...promotions]
            .sort(
              (a, b) =>
                Number(b.document_id === registered) - Number(a.document_id === registered) ||
                Number(isEnded(a.valid_until)) - Number(isEnded(b.valid_until)),
            )
            .map((promotion) => {
            const ended = isEnded(promotion.valid_until);
            const state = runs[promotion.document_id];
            const result = state?.result;
            const status = result && "status" in result ? lookup(PROMOTION_STATUS, result.status) : null;
            return (
              <Card
                key={promotion.document_id}
                title={promotion.file_name}
                action={
                  <Button size="sm" loading={state?.loading} disabled={ended} onClick={() => run(promotion.document_id)}>
                    대상 선정 및 일정 생성
                  </Button>
                }
              >
                <p className="text-slate-600">
                  기간 {formatDate(promotion.valid_from)} ~ {formatDate(promotion.valid_until)}
                  <span className="ml-3 text-[13px] text-slate-400">{promotion.document_id}</span>
                  {promotion.document_id === registered && (
                    <span className="ml-3">
                      <Badge tone="green">방금 등록</Badge>
                    </span>
                  )}
                  {ended && (
                    <span className="ml-3">
                      <Badge tone="gray">기간 종료</Badge>
                    </span>
                  )}
                </p>
                {state && (
                  <div className="mt-4 flex flex-col gap-3">
                    <Steps
                      steps={[
                        { label: "요청 전송", state: "done" },
                        {
                          label: "대상 고객 선정 (F05) · 안내 일정 생성 (F06)",
                          state: state.loading ? "active" : status ? "done" : "error",
                        },
                      ]}
                    />
                    {result && !status && !result.success && "message" in result && <ErrorNote>{result.message}</ErrorNote>}
                    {result && status && "target_customers" in result && (
                      <div>
                        <p className="flex items-center gap-2">
                          <Badge tone={status.tone}>{status.label}</Badge>
                          <span className="font-semibold">대상 {result.target_count}명</span>
                        </p>
                        {result.target_customers.length > 0 && (
                          <ul className="mt-3 divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                            {result.target_customers.map((target) => (
                              <li key={target.customer_id} className="flex items-center gap-4 px-4 py-2.5">
                                <span className="w-28 font-semibold">{target.customer_name}</span>
                                <span className="w-36 text-[14px] text-slate-500">{formatPhone(target.phone)}</span>
                                <span className="text-[14px] text-slate-600">{(target.match_reasons ?? []).join(", ")}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
