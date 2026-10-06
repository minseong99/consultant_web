"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Steps, type Step } from "@/components/Steps";
import { Badge, Button, EmptyState, ErrorNote, SourceLabel } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { lookup, SCHEDULE_STATUS, SCHEDULE_SUBTYPE, SCHEDULE_TYPE, SEND_STATUS } from "@/lib/labels";
import type { ScheduleItem, SendNowResult } from "@/lib/types";

type Tracking = { requesting: boolean; result: SendNowResult | null; startedAt: number };

// [지금 발송]을 누른 뒤의 진행 상태. 일정·메시지의 실제 상태로만 채운다.
function sendSteps(schedule: ScheduleItem, tracking: Tracking): Step[] {
  const status = schedule.schedule_status;
  const message = schedule.message;
  const started = status !== "scheduled";
  const failed = status === "failed";
  const skipped = status === "skipped";
  const sent = status === "sent";
  // 요청이 끝났는데도 처리 중에 머물러 있으면 워크플로우가 중간에 멈춘 것이다.
  const stalled = !tracking.requesting && status === "processing";
  return [
    {
      label: "동의 확인",
      // 요청이 끝났는데도 예정 상태 그대로면 처리가 시작되지 못한 것이다.
      state: skipped ? "error" : started ? "done" : tracking.requesting ? "active" : "error",
      note: skipped ? "동의 조건이 맞지 않아 보내지 않았습니다" : !started && !tracking.requesting ? "처리가 시작되지 않았습니다" : undefined,
    },
    {
      label: "문자 작성",
      state: skipped ? "waiting" : message ? "done" : failed || stalled ? "error" : started ? "active" : "waiting",
      note: (failed || stalled) && !message ? "문자를 만들지 못했습니다" : undefined,
    },
    {
      label: "발송",
      state: sent ? "done" : failed && message ? "error" : message ? (tracking.requesting ? "active" : "error") : "waiting",
      note: !sent && message && !tracking.requesting && !failed ? "발송이 완료되지 않았습니다" : undefined,
    },
  ];
}

export function ScheduleList({
  items,
  showCustomer = true,
  focusId,
  fresh,
  onChanged,
  emptyText = "일정이 없습니다.",
  defaultOpenFirst = false,
  onSendStart,
}: {
  items: ScheduleItem[];
  showCustomer?: boolean;
  focusId?: string | null;
  fresh?: Set<string>;
  onChanged?: () => void;
  emptyText?: string;
  /** 첫 일정을 처음부터 펼쳐 둔다 (고객 상세의 "다음 후속 연락") */
  defaultOpenFirst?: boolean;
  /** [지금 발송]을 누른 순간 알린다 */
  onSendStart?: (scheduleId: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([focusId, defaultOpenFirst ? items[0]?.schedule_id : null].filter((v): v is string => Boolean(v))));
  const [tracking, setTracking] = useState<Record<string, Tracking>>({});
  const focusRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focusId) focusRef.current?.scrollIntoView({ block: "center" });
  }, [focusId]);

  function toggle(id: string) {
    setOpen((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendNow(id: string) {
    const startedAt = Date.now();
    onSendStart?.(id);
    setTracking((map) => ({ ...map, [id]: { requesting: true, result: null, startedAt } }));
    setOpen((set) => new Set(set).add(id));
    let result: SendNowResult;
    try {
      const response = await fetch("/api/staff/send-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule_id: id }),
      });
      result = await response.json();
    } catch {
      result = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    setTracking((map) => ({ ...map, [id]: { requesting: false, result, startedAt } }));
    onChanged?.();
  }

  if (items.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <ul className="divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
      {items.map((schedule) => {
        const status = lookup(SCHEDULE_STATUS, schedule.schedule_status);
        const type = lookup(SCHEDULE_TYPE, schedule.schedule_type);
        const subtype = schedule.schedule_subtype ? (SCHEDULE_SUBTYPE[schedule.schedule_subtype] ?? schedule.schedule_subtype) : null;
        const track = tracking[schedule.schedule_id];
        const expanded = open.has(schedule.schedule_id);
        const panelId = `schedule-${schedule.schedule_id}`;
        return (
          <li
            key={schedule.schedule_id}
            ref={schedule.schedule_id === focusId ? focusRef : undefined}
            className={`${fresh?.has(schedule.schedule_id) ? "animate-flash" : ""} ${schedule.schedule_id === focusId ? "ring-2 ring-inset ring-stone-400" : ""}`}
          >
            <div className="flex items-center gap-3 px-5">
              <button
                onClick={() => toggle(schedule.schedule_id)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
              >
                <span className="w-32 shrink-0 text-[14px] font-semibold tabular-nums">{formatDateTime(schedule.scheduled_contact_at)}</span>
                {showCustomer && <span className="w-32 shrink-0 truncate text-[15px] font-semibold">{schedule.customer_name}</span>}
                <span className="min-w-0 flex-1 truncate text-[14px] text-stone-700">
                  {type.label}
                  {subtype && <span className="text-stone-500"> · {subtype}</span>}
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="w-4 text-stone-400" aria-hidden>
                  {expanded ? "▴" : "▾"}
                </span>
              </button>
              {schedule.schedule_status === "scheduled" && (
                <Button size="sm" variant="secondary" loading={track?.requesting} onClick={() => sendNow(schedule.schedule_id)}>
                  지금 발송
                </Button>
              )}
            </div>

            {expanded && (
              <div id={panelId} className="flex animate-fade-in flex-col gap-4 border-t border-stone-100 bg-stone-50/60 px-5 py-4">
                <dl className="flex flex-wrap gap-x-8 gap-y-1 text-[13px]">
                  <div className="flex gap-2">
                    <dt className="text-stone-500">사유</dt>
                    <dd>{schedule.contact_reason ?? "-"}</dd>
                  </div>
                  {schedule.document_name && (
                    <div className="flex gap-2">
                      <dt className="text-stone-500">프로모션</dt>
                      <dd>{schedule.document_name}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="text-stone-500">기준일</dt>
                    <dd>{formatDate(schedule.reference_date)}</dd>
                  </div>
                </dl>

                {track && <Steps steps={sendSteps(schedule, track)} since={track.requesting ? track.startedAt : null} />}
                {track?.result && !track.result.success && <ErrorNote>{track.result.message}</ErrorNote>}

                {schedule.message ? (
                  <div>
                    <SourceLabel source="auto" label="AI가 작성한 문자" />
                    <p className="mt-1.5 max-w-xl rounded-xl rounded-tl-sm bg-white px-4 py-3 text-[14px] leading-relaxed ring-1 ring-stone-200">{schedule.message.message_content}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <Badge tone={lookup(SEND_STATUS, schedule.message.send_status).tone}>{lookup(SEND_STATUS, schedule.message.send_status).label}</Badge>
                      {schedule.message.sent_at && <span>{formatDateTime(schedule.message.sent_at)}</span>}
                      {schedule.message.send_channel && <span>· {schedule.message.send_channel.toUpperCase()}</span>}
                    </p>
                  </div>
                ) : (
                  !track && <p className="text-[13px] text-stone-500">문자는 발송할 때 고객 정보와 상담 내용을 바탕으로 작성됩니다.</p>
                )}

                {showCustomer && (
                  <Link href={`/staff/customers/${schedule.customer_id}`} className="text-[13px] font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-ink">
                    {schedule.customer_name} 고객 보기
                  </Link>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
