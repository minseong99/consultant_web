"use client";

import Link from "next/link";
import { useState } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { Badge, EmptyState, inputClass, Spinner } from "@/components/ui";
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
          <h1 className="text-[26px] font-bold">고객</h1>
          <p className="mt-1 text-slate-600">고객이 정보를 등록하면 이 목록에 바로 나타납니다.</p>
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
        <div className="flex justify-center py-16 text-brand-600">
          <Spinner className="!size-6" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState>{keyword ? "검색 결과가 없습니다." : "아직 등록된 고객이 없습니다."}</EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
          {customers.map((customer) => (
            <li key={customer.customer_id} className={fresh.has(customer.customer_id) ? "animate-flash" : ""}>
              <Link href={`/staff/customers/${customer.customer_id}`} className="flex items-center gap-5 px-5 py-4 hover:bg-slate-50">
                <span className="w-44 shrink-0">
                  <span className="flex items-center gap-2 text-[17px] font-semibold">
                    {customer.customer_name}
                    {fresh.has(customer.customer_id) && <Badge tone="green">새 고객</Badge>}
                  </span>
                  <span className="text-[14px] text-slate-500">{formatPhone(customer.phone)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{customer.consultation_goal}</span>
                  <span className="block truncate text-[14px] text-slate-500">
                    {customer.current_device} · {customer.current_plan}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {customer.has_analysis ? <Badge tone="blue">분석 완료</Badge> : <Badge tone="amber">분석 중</Badge>}
                  {!customer.consent.recontact && <Badge>재연락 미동의</Badge>}
                </span>
                <span className="w-36 shrink-0 text-right text-[14px] text-slate-500">{formatDateTime(customer.registered_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
