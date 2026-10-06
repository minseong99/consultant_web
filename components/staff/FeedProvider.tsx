"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { diffFeed, type Notice } from "@/lib/notify";
import type { Feed } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

const TOAST_MS = 6000;

type FeedState = {
  feed: Feed | null;
  error: string | null;
  notices: Notice[];
  unread: number;
  toasts: Notice[];
  /** 이번 세션에서 새로 나타난 고객·일정 (목록에서 강조 표시) */
  fresh: Set<string>;
  markAllRead: () => void;
  dismissToast: (id: string) => void;
  refresh: () => void;
};

const FeedContext = createContext<FeedState | null>(null);

// 서버(/api/staff/feed)를 주기적으로 조회하고, 직전 결과와 달라진 점을 알림으로 만든다.
// 한 번의 조회가 끝나기 전에는 다음 조회를 시작하지 않는다(busy).
// 조회 방식은 이 훅 안에만 있으므로 나중에 Supabase Realtime으로 바꿀 수 있다.
export function FeedProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const previous = useRef<Feed | null>(null);
  const busy = useRef(false);
  const router = useRouter();

  const dismissToast = useCallback((id: string) => setToasts((list) => list.filter((n) => n.id !== id)), []);

  const poll = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch("/api/staff/feed", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/staff/login");
        return;
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.message ?? "데이터를 불러오지 못했습니다.");
      const next: Feed = { customers: data.customers, schedules: data.schedules, fetched_at: data.fetched_at };
      const added = diffFeed(previous.current, next);
      if (previous.current) {
        const knownCustomers = new Set(previous.current.customers.map((c) => c.customer_id));
        const knownSchedules = new Set(previous.current.schedules.map((s) => s.schedule_id));
        const ids = [
          ...next.customers.filter((c) => !knownCustomers.has(c.customer_id)).map((c) => c.customer_id),
          ...next.schedules.filter((s) => !knownSchedules.has(s.schedule_id)).map((s) => s.schedule_id),
        ];
        if (ids.length) setFresh((set) => new Set([...set, ...ids]));
      }
      previous.current = next;
      setFeed(next);
      setError(null);
      if (added.length) {
        setNotices((list) => [...added.slice().reverse(), ...list].slice(0, 100));
        setUnread((count) => count + added.length);
        setToasts((list) => [...list, ...added].slice(-4));
        for (const notice of added) {
          window.setTimeout(() => dismissToast(notice.id), TOAST_MS);
          if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
            new Notification(notice.title, { body: notice.body });
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "데이터를 불러오지 못했습니다.");
    } finally {
      busy.current = false;
    }
  }, [dismissToast, router]);

  // 보고 있을 때는 3초, 조작이 없거나 탭이 가려지면 느리게 조회한다 (lib/usePolling.ts).
  usePolling(poll);

  const markAllRead = useCallback(() => setUnread(0), []);

  return (
    <FeedContext.Provider value={{ feed, error, notices, unread, toasts, fresh, markAllRead, dismissToast, refresh: poll }}>
      {children}
    </FeedContext.Provider>
  );
}

export function useStaffFeed() {
  const value = useContext(FeedContext);
  if (!value) throw new Error("useStaffFeed는 FeedProvider 안에서만 사용할 수 있습니다.");
  return value;
}
