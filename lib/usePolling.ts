"use client";

import { useEffect, useRef } from "react";

// 화면 갱신 간격. 서버 조회는 Supabase 전송량과 함수 호출을 쓰므로, 보고 있지 않을 때는 느리게 돈다.
//   보고 있고 방금까지 조작함      3초   (접수·일정·발송 결과가 바로 보여야 하는 때)
//   보고 있지만 2분 넘게 조작 없음  15초
//   10분 넘게 조작 없음            60초  (화면을 켜 둔 채 자리를 비운 경우)
//   탭이 가려져 있음               30초  (다른 탭을 보는 동안에도 새 고객 알림은 받는다)
// 다시 조작하거나 탭으로 돌아오면 바로 한 번 조회하고 3초 간격으로 돌아간다.
export const POLL_FAST_MS = 3_000;
const POLL_IDLE_MS = 15_000;
const POLL_AWAY_MS = 60_000;
const POLL_HIDDEN_MS = 30_000;
const IDLE_AFTER_MS = 2 * 60_000;
const AWAY_AFTER_MS = 10 * 60_000;

export function usePolling(callback: () => void | Promise<void>) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer: number | undefined;
    let lastActivity = Date.now();
    let lastRun = 0;

    const delay = () => {
      if (document.hidden) return POLL_HIDDEN_MS;
      const quiet = Date.now() - lastActivity;
      return quiet > AWAY_AFTER_MS ? POLL_AWAY_MS : quiet > IDLE_AFTER_MS ? POLL_IDLE_MS : POLL_FAST_MS;
    };

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, delay());
    };

    const run = () => {
      lastRun = Date.now();
      void saved.current();
      schedule();
    };

    // 느리게 돌던 중이었다면 바로 따라잡는다. 방금 조회했으면 다음 조회만 빠른 간격으로 다시 잡는다.
    const catchUp = () => {
      if (Date.now() - lastRun >= POLL_FAST_MS) run();
      else schedule();
    };

    // 조작이 있을 때
    const wake = () => {
      const wasSlow = delay() > POLL_FAST_MS;
      lastActivity = Date.now();
      if (wasSlow) catchUp();
    };

    // 탭이 가려지면 느린 간격으로 다시 잡고, 돌아오면 바로 따라잡는다.
    const onVisibility = () => {
      if (document.hidden) return schedule();
      lastActivity = Date.now();
      catchUp();
    };

    timer = window.setTimeout(run, 0);
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "focus"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}
