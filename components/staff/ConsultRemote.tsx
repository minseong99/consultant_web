"use client";

import { useCallback, useRef, useState } from "react";
import { consultChartSlides } from "@/components/consult/ConsultCharts";
import type { ConsultScreenState, ConsultView } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

// 고객 상세 아래쪽에 고정되는 조작 띠. 직원이 고객 기기의 상담 화면을 장별로 넘기거나 종료한다.
// 어느 탭에서든 보이게 화면 아래에 띄운다. 고객 화면은 2초마다 조회해 따라오므로 누른 뒤 최대 2초쯤 걸린다.

// 고객 화면은 10초마다 조회 시각을 남긴다. 이 시간 안에 남긴 것이 있으면 보고 있다고 본다.
const SEEN_WITHIN_MS = 25_000;
// 어떤 장이 있는지(추천 내용에 따라 달라짐)는 이 간격으로만 다시 읽는다. 그 사이에는 상태만 묻는다.
const SLIDES_EVERY_MS = 60_000;
const RECOMMEND_SLIDE = { key: "recommend", label: "추천" };

type Remote = {
  slides: { key: string; label: string }[];
  state: ConsultScreenState | null;
  /** 고객이 지금 상담 화면을 열어 두었는지 */
  seen: boolean;
};

export function ConsultRemote({ customerId }: { customerId: string }) {
  const [remote, setRemote] = useState<Remote | null>(null);
  // 방금 누른 장. 저장되어 다음 조회에 반영될 때까지 눌린 것으로 보여 준다.
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slidesAt = useRef(0);
  const load = useCallback(async () => {
    try {
      const full = Date.now() - slidesAt.current >= SLIDES_EVERY_MS;
      const response = await fetch(`/api/staff/consult-screen?customer_id=${encodeURIComponent(customerId)}${full ? "" : "&light=1"}`, { cache: "no-store" });
      const data: { success: boolean; available?: boolean; view: ConsultView | null; state: ConsultScreenState | null } = await response.json();
      // 원격 조작을 쓸 수 없으면(상태를 저장할 곳이 없음) 띠를 보이지 않는다.
      if (!data.success || !data.available) return setRemote(null);
      const { view, state } = data;
      if (view) slidesAt.current = Date.now();
      const seenAt = state?.seen_at ? new Date(state.seen_at).getTime() : 0;
      setRemote((before) => ({
        slides: view ? [RECOMMEND_SLIDE, ...consultChartSlides(view).map(({ key, label }) => ({ key, label }))] : (before?.slides ?? [RECOMMEND_SLIDE]),
        state,
        seen: !state?.ended_at && Date.now() - seenAt < SEEN_WITHIN_MS,
      }));
      setPending(null);
    } catch {
      // 잠깐 끊긴 것은 다음 조회에서 따라잡는다.
    }
  }, [customerId]);
  usePolling(load);

  async function send(body: { slide: string } | { end: true }) {
    setError(null);
    try {
      const response = await fetch("/api/staff/consult-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, ...body }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
      await load();
    } catch (cause) {
      setPending(null);
      setError(cause instanceof Error && cause.message ? cause.message : "고객 화면에 전달하지 못했습니다.");
    }
  }

  if (!remote) return null;
  const { slides, state, seen } = remote;
  const ended = Boolean(state?.ended_at);
  const current = pending ?? state?.slide ?? "recommend";
  const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

  return (
    <>
      {/* 띠가 내용의 마지막 줄을 가리지 않게 자리를 비워 둔다. */}
      <div aria-hidden className="h-24" />
      <section aria-label="고객 화면 조작" className="fixed inset-x-3 bottom-3 z-30 ml-14 flex flex-col items-center md:bottom-5">
        <div className="flex max-w-full flex-col items-stretch gap-2 rounded-3xl bg-white p-2.5 shadow-[0_14px_40px_-12px_rgb(28_25_23/0.35)] ring-1 ring-stone-200 md:flex-row md:items-center md:gap-3 md:rounded-full md:py-2 md:pl-5 md:pr-2">
          <p className="flex items-center gap-2 whitespace-nowrap px-2 text-[13px] font-bold md:px-0">
            고객 화면
            <span className={`inline-flex items-center gap-1.5 font-semibold ${seen ? "text-success" : "text-stone-500"}`}>
              <span aria-hidden className={`size-2 rounded-full ${seen ? "animate-pulse-soft bg-success" : "bg-stone-300"}`} />
              {ended ? "종료함" : seen ? "보는 중" : "열려 있지 않음"}
            </span>
          </p>

          {confirming ? (
            <div className="flex items-center justify-between gap-2">
              <p className="whitespace-nowrap px-2 text-[13px] font-semibold">고객 화면을 닫을까요?</p>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  void send({ end: true });
                }}
                className={`h-10 rounded-full bg-ink px-4 text-[13px] font-bold text-white hover:bg-stone-700 ${focus}`}
              >
                닫기
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={`h-10 rounded-full px-3 text-[13px] font-semibold text-stone-600 hover:bg-stone-100 ${focus}`}>
                취소
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-1 md:gap-3">
              <div role="group" aria-label="보여 줄 장" className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-stone-100 p-1">
                {slides.map((slide) => (
                  <button
                    key={slide.key}
                    type="button"
                    disabled={!seen}
                    aria-pressed={seen && slide.key === current}
                    onClick={() => {
                      setPending(slide.key);
                      void send({ slide: slide.key });
                    }}
                    className={`h-9 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:text-stone-400 ${focus} ${
                      seen && slide.key === current ? "bg-ink text-white" : "text-stone-700 enabled:hover:bg-white"
                    }`}
                  >
                    {slide.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!seen}
                onClick={() => setConfirming(true)}
                className={`h-10 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold text-danger transition-colors enabled:hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-400 ${focus}`}
              >
                종료
              </button>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-center text-[12px] font-semibold text-danger">
            {error}
          </p>
        )}
      </section>
    </>
  );
}
