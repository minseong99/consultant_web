"use client";

import Link from "next/link";
import { useState } from "react";
import { useStaffFeed } from "@/components/staff/FeedProvider";
import { Badge, EmptyState, inputClass, Pagination, Spinner, StatusLine } from "@/components/ui";
import { formatDateTime, formatPhone, todayKST } from "@/lib/format";
import type { CustomerListItem } from "@/lib/types";

// 한 화면에 들어오는 수. 고객이 늘어도 아래로 길어지지 않게 쪽으로 나눈다.
const PAGE_SIZE = 10;

type FilterKey = "all" | "today" | "waiting" | "done";
const FILTERS: { key: FilterKey; label: string; test: (customer: CustomerListItem, today: string) => boolean }[] = [
  { key: "all", label: "전체", test: () => true },
  { key: "today", label: "오늘 접수", test: (c, today) => !!c.registered_at && todayKST(new Date(c.registered_at)) === today },
  { key: "waiting", label: "상담 전", test: (c) => !c.last_consulted_at },
  { key: "done", label: "상담 완료", test: (c) => !!c.last_consulted_at },
];

export default function CustomersPage() {
  const { feed, fresh } = useStaffFeed();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(1);

  const keyword = query.trim().toLowerCase();
  const digits = keyword.replace(/\D/g, "");
  const searched = (feed?.customers ?? []).filter(
    (c) => !keyword || c.customer_name.toLowerCase().includes(keyword) || (digits !== "" && c.phone.includes(digits)),
  );
  const today = todayKST();
  const active = FILTERS.find((f) => f.key === filter)!;
  const matched = searched.filter((c) => active.test(c, today));
  const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
  // 검색이나 삭제로 쪽 수가 줄면 마지막 쪽을 보여 준다.
  const current = Math.min(page, pageCount);
  const customers = matched.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

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
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="고객 분류">
        {FILTERS.map((f) => {
          const selected = f.key === filter;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={`inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
                selected ? "bg-ink text-white" : "bg-white text-stone-700 ring-1 ring-inset ring-stone-200 hover:bg-stone-50"
              }`}
            >
              {f.label}
              <span className={`tabular-nums ${selected ? "text-stone-300" : "text-stone-500"}`}>{searched.filter((c) => f.test(c, today)).length}</span>
            </button>
          );
        })}
      </div>

      {!feed ? (
        <div className="flex justify-center py-16 text-stone-500">
          <Spinner className="!size-6" />
        </div>
      ) : customers.length === 0 ? (
        <EmptyState>{keyword ? "검색 결과가 없습니다." : filter === "all" ? "아직 등록된 고객이 없습니다." : "해당하는 고객이 없습니다."}</EmptyState>
      ) : (
        <>
        <ul className="surface divide-y divide-stone-100 overflow-hidden">
          {customers.map((customer) => (
            <li key={customer.customer_id} className={fresh.has(customer.customer_id) ? "animate-flash" : ""}>
              <Link
                href={`/staff/customers/${customer.customer_id}`}
                className="flex min-h-16 items-center gap-5 px-5 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
              >
                <span className="w-32 shrink-0 sm:w-36">
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
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="flex items-center gap-2">
                    {/* 분석은 끝나지 않았을 때만 알린다. 끝난 것이 보통이라 매 행에 적지 않는다. */}
                    {!customer.has_analysis && <StatusLine state="active" label="분석 중" />}
                    <Badge tone={customer.last_consulted_at ? "gray" : "blue"}>{customer.last_consulted_at ? "상담 완료" : "상담 전"}</Badge>
                  </span>
                  {!customer.consent.recontact && <span className="text-[12px] font-semibold text-warning">재연락 미동의</span>}
                </span>
                <span className="hidden w-28 shrink-0 text-right text-[13px] tabular-nums text-stone-500 sm:block">{formatDateTime(customer.registered_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Pagination
          label="고객 목록 쪽 이동"
          summary={`${matched.length}명 중 ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, matched.length)}`}
          current={current}
          pageCount={pageCount}
          onChange={setPage}
        />
        </>
      )}
    </>
  );
}
