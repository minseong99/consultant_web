"use client";

import { useEffect, useState } from "react";
import { Steps } from "@/components/Steps";
import { Badge, Button, Card, EmptyState, ErrorNote, Spinner } from "@/components/ui";
import { formatDate, formatPhone } from "@/lib/format";
import { lookup, PROMOTION_STATUS } from "@/lib/labels";
import type { DocumentRow, PromotionResult } from "@/lib/types";

type Run = { loading: boolean; result: PromotionResult | null };

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<DocumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, Run>>({});

  useEffect(() => {
    fetch("/api/staff/promotions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) throw new Error(data.message);
        setPromotions(data.promotions);
      })
      .catch((cause) => {
        setPromotions([]);
        setError(cause instanceof Error && cause.message ? cause.message : "프로모션을 불러오지 못했습니다.");
      });
  }, []);

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
        {promotions === null ? (
          <div className="flex justify-center py-16 text-brand-600">
            <Spinner className="!size-6" />
          </div>
        ) : promotions.length === 0 ? (
          !error && <EmptyState>이 매장에 등록된 프로모션이 없습니다.</EmptyState>
        ) : (
          promotions.map((promotion) => {
            const state = runs[promotion.document_id];
            const result = state?.result;
            const status = result && "status" in result ? lookup(PROMOTION_STATUS, result.status) : null;
            return (
              <Card
                key={promotion.document_id}
                title={promotion.file_name}
                action={
                  <Button size="sm" loading={state?.loading} onClick={() => run(promotion.document_id)}>
                    대상 선정 및 일정 생성
                  </Button>
                }
              >
                <p className="text-slate-600">
                  기간 {formatDate(promotion.valid_from)} ~ {formatDate(promotion.valid_until)}
                  <span className="ml-3 text-[13px] text-slate-400">{promotion.document_id}</span>
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
