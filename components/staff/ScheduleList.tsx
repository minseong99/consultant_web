"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Steps, type Step } from "@/components/Steps";
import { Badge, Button, EmptyState, ErrorNote, inputClass, SourceLabel, StatusLine } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { lookup, SCHEDULE_STATUS, SCHEDULE_SUBTYPE, SCHEDULE_TYPE, SEND_STATUS } from "@/lib/labels";
import { MESSAGE_MAX_LENGTH, messageBytes, SMS_BYTES } from "@/lib/message";
import type { MessageDraftResult, ScheduleItem, SendNowResult } from "@/lib/types";

// 요청을 보낸 시각. 경과 시간 표시에 쓴다(이벤트 처리 안에서만 부른다).
const clock = () => Date.now();

type Tracking = { requesting: boolean; result: SendNowResult | null; startedAt: number };

// [지금 발송]을 누른 뒤 발송 전까지의 상태: 초안 작성 중 → 직원이 확인·수정 → (전송은 Tracking 이 맡는다)
type Compose = {
  phase: "drafting" | "editing";
  text: string;
  /** AI가 만든 초안. 직원이 고쳤는지 알아보는 데만 쓴다(저장하지 않는다). */
  draft: string;
  /** 초안을 만들지 못한 이유. 이때는 직원이 직접 써서 보낼 수 있다. */
  draftError: string | null;
  startedAt: number;
};

// [문자 전송]을 누른 뒤의 진행 상태. 일정·메시지의 실제 상태로만 채운다.
function sendSteps(schedule: ScheduleItem, tracking: Tracking): Step[] {
  const status = schedule.schedule_status;
  const started = status !== "scheduled";
  const failed = status === "failed";
  const skipped = status === "skipped";
  const sent = status === "sent";
  return [
    {
      label: "동의 확인",
      // 요청이 끝났는데도 예정 상태 그대로면 처리가 시작되지 못한 것이다.
      state: skipped ? "error" : started ? "done" : tracking.requesting ? "active" : "error",
      note: skipped ? "동의 조건이 맞지 않아 보내지 않았습니다" : !started && !tracking.requesting ? "처리가 시작되지 않았습니다" : undefined,
    },
    {
      label: "발송",
      // 요청이 끝났는데도 처리 중에 머물러 있으면 발송이 중간에 멈춘 것이다.
      state: sent ? "done" : skipped || !started ? "waiting" : failed ? "error" : tracking.requesting ? "active" : "error",
      note: failed ? "발송하지 못했습니다" : started && !sent && !skipped && !tracking.requesting ? "발송이 완료되지 않았습니다" : undefined,
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
  const [composing, setComposing] = useState<Record<string, Compose>>({});
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

  const stopComposing = (id: string) =>
    setComposing((map) => {
      const next = { ...map };
      delete next[id];
      return next;
    });

  // [지금 발송] / [다시 생성]: 문자 초안을 받아 편집 칸에 넣는다. 아직 발송하지 않는다.
  async function startDraft(id: string) {
    const startedAt = clock();
    onSendStart?.(id);
    setTracking((map) => {
      const next = { ...map };
      delete next[id];
      return next;
    });
    setComposing((map) => ({ ...map, [id]: { phase: "drafting", text: "", draft: "", draftError: null, startedAt } }));
    setOpen((set) => new Set(set).add(id));
    let result: MessageDraftResult;
    try {
      const response = await fetch("/api/staff/message-draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule_id: id }),
      });
      result = await response.json();
    } catch {
      result = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
    }
    if (!result.success && result.error_code === "NOT_SCHEDULED") {
      // 그사이 발송되었거나 취소된 일정. 편집 칸을 열지 않고 이유만 알린다.
      stopComposing(id);
      setTracking((map) => ({ ...map, [id]: { requesting: false, result, startedAt } }));
      onChanged?.();
      return;
    }
    const text = result.success ? result.message_text : "";
    setComposing((map) => ({ ...map, [id]: { phase: "editing", text, draft: text, draftError: result.success ? null : result.message, startedAt } }));
  }

  // [문자 전송]: 직원이 확인한 내용 그대로 보낸다.
  async function sendMessage(id: string, messageText: string) {
    const startedAt = clock();
    stopComposing(id);
    setTracking((map) => ({ ...map, [id]: { requesting: true, result: null, startedAt } }));
    let result: SendNowResult;
    try {
      const response = await fetch("/api/staff/message-send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule_id: id, message_text: messageText }),
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
        const compose = composing[schedule.schedule_id];
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
                <Button size="sm" variant="secondary" loading={track?.requesting} disabled={Boolean(compose)} onClick={() => startDraft(schedule.schedule_id)}>
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

                {compose?.phase === "drafting" && (
                  <div aria-live="polite">
                    <StatusLine state="active" label="문자 초안 작성 중" since={compose.startedAt} note="고객 정보와 상담 내용을 바탕으로 작성합니다 · 아직 발송되지 않습니다" />
                  </div>
                )}
                {compose?.phase === "editing" && (
                  <MessageEditor
                    compose={compose}
                    onChange={(text) => setComposing((map) => ({ ...map, [schedule.schedule_id]: { ...compose, text } }))}
                    onSend={() => sendMessage(schedule.schedule_id, compose.text.trim())}
                    onRegenerate={() => startDraft(schedule.schedule_id)}
                    onCancel={() => stopComposing(schedule.schedule_id)}
                  />
                )}

                {track && <Steps steps={sendSteps(schedule, track)} since={track.requesting ? track.startedAt : null} />}
                {track?.result && !track.result.success && <ErrorNote>{track.result.message}</ErrorNote>}

                {schedule.message ? (
                  <div>
                    <p className="text-[12px] font-semibold text-stone-500">{schedule.message.send_status === "sent" ? "보낸 문자" : "문자 내용"}</p>
                    <p className="mt-1.5 max-w-xl rounded-xl rounded-tl-sm bg-white px-4 py-3 text-[14px] leading-relaxed ring-1 ring-stone-200">{schedule.message.message_content}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-stone-500">
                      <Badge tone={lookup(SEND_STATUS, schedule.message.send_status).tone}>{lookup(SEND_STATUS, schedule.message.send_status).label}</Badge>
                      {schedule.message.sent_at && <span>{formatDateTime(schedule.message.sent_at)}</span>}
                      {schedule.message.send_channel && <span>· {schedule.message.send_channel.toUpperCase()}</span>}
                    </p>
                  </div>
                ) : (
                  !track && !compose && <p className="text-[13px] text-stone-500">[지금 발송]을 누르면 AI가 문자 초안을 만듭니다. 내용을 확인하고 고친 뒤 보낼 수 있습니다.</p>
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

// 발송 전 확인 칸. AI 초안을 보여 주고, 직원이 고친 뒤 [문자 전송]을 눌러야 나간다.
function MessageEditor({
  compose,
  onChange,
  onSend,
  onRegenerate,
  onCancel,
}: {
  compose: Compose;
  onChange: (text: string) => void;
  onSend: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
}) {
  const text = compose.text;
  const trimmed = text.trim();
  const bytes = messageBytes(trimmed);
  const edited = compose.draft !== "" && trimmed !== compose.draft.trim();
  const tooLong = trimmed.length > MESSAGE_MAX_LENGTH;
  return (
    <div className="max-w-xl">
      {compose.draftError ? (
        <ErrorNote>{compose.draftError} 아래에 직접 작성해 보낼 수 있습니다.</ErrorNote>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <SourceLabel source="ai" label={edited ? "AI 초안 · 수정함" : "AI 초안"} />
          <span className="text-[12px] text-stone-500">아직 발송되지 않았습니다. 내용을 확인하고 필요하면 고쳐 주세요.</span>
        </p>
      )}
      <textarea
        aria-label="보낼 문자 내용"
        rows={5}
        autoFocus
        className={`${inputClass} mt-2 !text-[14px] leading-relaxed`}
        value={text}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className={`mt-1 text-[12px] tabular-nums ${tooLong ? "font-semibold text-danger" : "text-stone-500"}`}>
        {trimmed.length}자 · {bytes}바이트 · {bytes <= SMS_BYTES ? "단문(SMS)" : "장문(LMS)"}
        {tooLong && ` · ${MESSAGE_MAX_LENGTH.toLocaleString("ko-KR")}자를 넘어 보낼 수 없습니다`}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!trimmed || tooLong} onClick={onSend}>
          문자 전송
        </Button>
        <Button size="sm" variant="secondary" onClick={onRegenerate}>
          다시 생성
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        {edited && <span className="text-[12px] text-stone-500">다시 생성하면 수정한 내용이 사라집니다</span>}
      </div>
    </div>
  );
}
