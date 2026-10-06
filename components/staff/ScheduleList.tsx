"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Steps, type Step } from "@/components/Steps";
import { Badge, Button, EmptyState, ErrorNote } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { lookup, SCHEDULE_STATUS, SCHEDULE_SUBTYPE, SCHEDULE_TYPE, SEND_STATUS } from "@/lib/labels";
import type { ScheduleItem, SendNowResult } from "@/lib/types";

type Tracking = { requesting: boolean; result: SendNowResult | null };

// [지금 발송]을 누른 뒤의 진행 단계. 일정·메시지의 실제 상태로만 채운다.
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
    { label: "발송 요청", state: "done" },
    {
      label: "동의 재확인 · 처리 시작 (F07-S01)",
      // 요청이 끝났는데도 예정 상태 그대로면 처리가 시작되지 못한 것이다.
      state: skipped ? "error" : started ? "done" : tracking.requesting ? "active" : "error",
      note: skipped ? "동의 조건 미충족으로 건너뜀" : !started && !tracking.requesting ? "처리가 시작되지 않았습니다" : undefined,
    },
    {
      label: "맞춤 문자 생성 (F07-S02)",
      state: skipped ? "waiting" : message ? "done" : failed || stalled ? "error" : started ? "active" : "waiting",
      note: (failed || stalled) && !message ? "문자를 생성하지 못했습니다" : undefined,
    },
    {
      label: "문자 발송 · 결과 기록 (F07-S03)",
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
}: {
  items: ScheduleItem[];
  showCustomer?: boolean;
  focusId?: string | null;
  fresh?: Set<string>;
  onChanged?: () => void;
  emptyText?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusId ? [focusId] : []));
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
    setTracking((map) => ({ ...map, [id]: { requesting: true, result: null } }));
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
    setTracking((map) => ({ ...map, [id]: { requesting: false, result } }));
    onChanged?.();
  }

  if (items.length === 0) return <EmptyState>{emptyText}</EmptyState>;

  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
      {items.map((schedule) => {
        const status = lookup(SCHEDULE_STATUS, schedule.schedule_status);
        const type = lookup(SCHEDULE_TYPE, schedule.schedule_type);
        const track = tracking[schedule.schedule_id];
        const expanded = open.has(schedule.schedule_id);
        return (
          <li
            key={schedule.schedule_id}
            ref={schedule.schedule_id === focusId ? focusRef : undefined}
            className={`px-5 py-4 ${fresh?.has(schedule.schedule_id) ? "animate-flash" : ""} ${schedule.schedule_id === focusId ? "ring-2 ring-inset ring-brand-500" : ""}`}
          >
            <div className="flex items-center gap-4">
              <button onClick={() => toggle(schedule.schedule_id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                <span className="w-36 shrink-0">
                  <span className="block font-semibold">{formatDateTime(schedule.scheduled_contact_at)}</span>
                  <span className="text-[13px] text-slate-500">예약 시각</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {showCustomer && <span className="text-[16px] font-semibold">{schedule.customer_name}</span>}
                    <Badge tone={type.tone}>{type.label}</Badge>
                    {schedule.schedule_subtype && (
                      <span className="text-[14px] text-slate-500">{SCHEDULE_SUBTYPE[schedule.schedule_subtype] ?? schedule.schedule_subtype}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[14px] text-slate-600">
                    {schedule.contact_reason ?? "-"}
                    {schedule.document_name && ` · ${schedule.document_name}`}
                    {` · 기준일 ${formatDate(schedule.reference_date)}`}
                  </span>
                </span>
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="text-slate-400" aria-hidden>
                  {expanded ? "▾" : "▸"}
                </span>
              </button>
              {schedule.schedule_status === "scheduled" && (
                <Button size="sm" variant="secondary" loading={track?.requesting} onClick={() => sendNow(schedule.schedule_id)}>
                  지금 발송 (시연용)
                </Button>
              )}
            </div>

            {expanded && (
              <div className="mt-4 flex flex-col gap-3 pl-40">
                {track && <Steps steps={sendSteps(schedule, track)} />}
                {track?.result && !track.result.success && <ErrorNote>{track.result.message}</ErrorNote>}
                {schedule.message ? (
                  <div>
                    <div className="max-w-md rounded-2xl rounded-bl-sm bg-emerald-50 px-4 py-3 text-[15px] leading-relaxed ring-1 ring-inset ring-emerald-200">
                      {schedule.message.message_content}
                    </div>
                    <p className="mt-1.5 flex items-center gap-2 text-[13px] text-slate-500">
                      <Badge tone={lookup(SEND_STATUS, schedule.message.send_status).tone}>{lookup(SEND_STATUS, schedule.message.send_status).label}</Badge>
                      {schedule.message.sent_at && <span>{formatDateTime(schedule.message.sent_at)} 발송</span>}
                      {schedule.message.send_channel && <span>· {schedule.message.send_channel.toUpperCase()}</span>}
                    </p>
                  </div>
                ) : (
                  !track && <p className="text-[14px] text-slate-500">문자는 발송 시점에 고객 정보와 상담 내용을 바탕으로 생성됩니다.</p>
                )}
                {showCustomer && (
                  <Link href={`/staff/customers/${schedule.customer_id}`} className="text-[14px] font-medium text-brand-600 hover:underline">
                    {schedule.customer_name} 고객 상세 보기 →
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
