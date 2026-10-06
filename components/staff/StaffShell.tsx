"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTime } from "@/lib/format";
import type { Notice, NoticeKind } from "@/lib/notify";
import { FeedProvider, useStaffFeed } from "./FeedProvider";

const NAV = [
  { href: "/staff", label: "고객", match: (path: string) => path === "/staff" || path.startsWith("/staff/customers") },
  { href: "/staff/schedules", label: "후속 연락 일정", match: (path: string) => path.startsWith("/staff/schedules") },
  { href: "/staff/promotions", label: "프로모션", match: (path: string) => path.startsWith("/staff/promotions") },
];

const NOTICE_STYLE: Record<NoticeKind, { icon: string; color: string }> = {
  customer: { icon: "👤", color: "border-l-brand-500" },
  schedule_created: { icon: "🗓", color: "border-l-sky-500" },
  sent: { icon: "✉️", color: "border-l-emerald-500" },
  failed: { icon: "⚠️", color: "border-l-rose-500" },
  skipped: { icon: "⏭", color: "border-l-slate-400" },
  cancelled: { icon: "✖️", color: "border-l-slate-400" },
};

type Props = { staffId: string; storeName: string; mock: boolean; children: ReactNode };

export function StaffShell(props: Props) {
  return (
    <FeedProvider>
      <Shell {...props} />
    </FeedProvider>
  );
}

function Shell({ staffId, storeName, mock, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { feed, error } = useStaffFeed();
  const pendingCount = feed?.schedules.filter((s) => s.schedule_status === "scheduled").length ?? 0;

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" });
    router.replace("/staff/login");
  }

  return (
    <div className="flex min-h-screen text-[15px]">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-ink px-4 py-6 text-slate-200">
        <p className="px-2 text-[13px] font-semibold text-brand-100">KT 매장 상담 지원 AI Agent</p>
        <p className="px-2 text-[19px] font-bold text-white">{storeName}</p>
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 font-medium transition-colors ${active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/6"}`}
              >
                {item.label}
                {item.href === "/staff/schedules" && pendingCount > 0 && (
                  <span className="rounded-full bg-white/15 px-2 text-[13px]">{pendingCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 text-[13px] text-slate-400">
          <p>{staffId}</p>
          <button onClick={logout} className="mt-1 underline underline-offset-2 hover:text-white">
            로그아웃
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-end gap-3 border-b border-slate-200 bg-white/90 px-8 backdrop-blur">
          {error && <span className="mr-auto text-[14px] text-rose-600">연결 문제: {error}</span>}
          {mock && (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[12px] font-bold tracking-wide text-amber-800" title="n8n·Supabase 없이 샘플 데이터로 동작 중">
              MOCK
            </span>
          )}
          <span className="text-[13px] text-slate-500">시연 모드 · 실제 문자는 발송되지 않습니다</span>
          <Bell />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-7">{children}</main>
      </div>
      <Toasts />
    </div>
  );
}

function Bell() {
  const { notices, unread, markAllRead } = useStaffFeed();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    setOpen((value) => !value);
    markAllRead();
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={`알림 ${unread}건`}
        aria-expanded={open}
        className="relative flex size-10 items-center justify-center rounded-full text-[20px] hover:bg-slate-100"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[12px] font-bold leading-5 text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-96 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200">
          <p className="border-b border-slate-100 px-4 py-3 font-semibold">알림</p>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-slate-500">아직 알림이 없습니다.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <Link href={notice.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                    <span aria-hidden>{NOTICE_STYLE[notice.kind].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{notice.title}</span>
                      {notice.body && <span className="mt-0.5 block truncate text-[13px] text-slate-500">{notice.body}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] text-slate-400">{formatTime(notice.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStaffFeed();
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-6 top-18 z-50 flex w-[26rem] flex-col gap-3">
      {toasts.map((toast) => (
        <Toast key={toast.id} notice={toast} onClose={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const style = NOTICE_STYLE[notice.kind];
  return (
    <div className={`pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl border-l-4 bg-white px-4 py-3.5 shadow-lg ring-1 ring-slate-200 ${style.color}`}>
      <span className="text-[22px] leading-none" aria-hidden>
        {style.icon}
      </span>
      <Link href={notice.href} onClick={onClose} className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug">{notice.title}</span>
        {notice.body && <span className="mt-0.5 block text-[14px] text-slate-600">{notice.body}</span>}
      </Link>
      <button onClick={onClose} aria-label="알림 닫기" className="text-slate-400 hover:text-slate-700">
        ✕
      </button>
    </div>
  );
}
