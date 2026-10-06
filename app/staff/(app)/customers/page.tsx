"use client";

import Link from "next/link";
import { useState } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { Badge, EmptyState, inputClass, Spinner, StatusLine } from "@/components/ui";
import { formatDateTime, formatPhone } from "@/lib/format";

export default function CustomersPage() {
  const { feed, fresh } = useStaffFeed();
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();
  const digits = keyword.replace(/\D/g, "");
  const customers = (feed?.customers ?? []).filter(
    (c) => !keyword || c.customer_name.toLowerCase().includes(keyword) || (digits !== "" && c.phone.includes(digits)),
  );

  return (
    <>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold">고객</h1>
          <p className="mt-1 text-[14px] text-stone-600">고객이 접수하면 이 목록 맨 위에 바로 나타납니다.</p>
        </div>
        <input
          type="search"
          className={`${inputClass} max-w-xs`}
          placeholder="이름 또는 전화번호 검색"
          aria-label="고객 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {!feed ? (
        <div className="flex justify-center py-16 text-stone-500">
          <Spinner className="!size-6" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState>{keyword ? "검색 결과가 없습니다." : "아직 등록된 고객이 없습니다."}</EmptyState>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
          {customers.map((customer) => (
            <li key={customer.customer_id} className={fresh.has(customer.customer_id) ? "animate-flash" : ""}>
              <Link
                href={`/staff/customers/${customer.customer_id}`}
                className="flex min-h-16 items-center gap-5 px-5 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
              >
                <span className="w-40 shrink-0">
                  <span className="flex items-center gap-2 text-[15px] font-bold">
                    <span className="truncate">{customer.customer_name}</span>
                    {fresh.has(customer.customer_id) && <Badge tone="red">새 고객</Badge>}
                  </span>
                  <span className="text-[12px] tabular-nums text-stone-500">{formatPhone(customer.phone)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{customer.consultation_goal}</span>
                  <span className="block truncate text-[13px] text-stone-500">
                    {customer.current_device} · {customer.current_plan}
                  </span>
                </span>
                <span className="flex w-52 shrink-0 flex-col items-start gap-0.5">
                  <StatusLine state={customer.has_analysis ? "done" : "active"} label={customer.has_analysis ? "AI 분석 완료" : "AI 분석 중"} />
                  {!customer.consent.recontact && <span className="pl-6 text-[12px] font-semibold text-warning">✕ 재연락 미동의</span>}
                </span>
                <span className="w-32 shrink-0 text-right text-[13px] tabular-nums text-stone-500">{formatDateTime(customer.registered_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
