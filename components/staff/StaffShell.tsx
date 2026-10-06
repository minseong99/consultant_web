"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTime } from "@/lib/format";
import type { Notice, NoticeKind } from "@/lib/notify";
import { FeedProvider, useStaffFeed } from "./FeedProvider";
import { Wordmark } from "@/components/Wordmark";

type IconName = "today" | "customers" | "schedules" | "promotions" | "pin" | "logout" | "menu";

const NAV: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/staff", label: "오늘", icon: "today", match: (path) => path === "/staff" },
  { href: "/staff/customers", label: "고객", icon: "customers", match: (path) => path.startsWith("/staff/customers") },
  { href: "/staff/schedules", label: "후속 연락 일정", icon: "schedules", match: (path) => path.startsWith("/staff/schedules") },
  { href: "/staff/promotions", label: "프로모션", icon: "promotions", match: (path) => path.startsWith("/staff/promotions") },
];

// 메뉴 아이콘. 접힌 상태에서는 아이콘만 보이므로 메뉴마다 모양이 뚜렷이 달라야 한다.
const ICON_PATHS: Record<IconName, ReactNode> = {
  customers: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 13.8c2.1.6 3.5 2.4 3.5 5.2" />
    </>
  ),
  schedules: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  promotions: (
    <>
      <path d="M3.5 12.2V5.5a2 2 0 0 1 2-2h6.7a2 2 0 0 1 1.4.6l6.3 6.3a2 2 0 0 1 0 2.8l-6.7 6.7a2 2 0 0 1-2.8 0L4.1 13.6a2 2 0 0 1-.6-1.4Z" />
      <circle cx="8.5" cy="8.5" r="1.3" />
    </>
  ),
  pin: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  today: (
    <>
      <path d="M4 11.5 12 4.5l8 7" />
      <path d="M6.5 10v8.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" />
      <path d="M10 19.5v-5h4v5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: (
    <>
      <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" />
      <path d="M10.5 12H20m0 0-3.2-3.2M20 12l-3.2 3.2" />
    </>
  ),
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

const PIN_KEY = "staff-sidebar-pinned";

// 알림 종류는 기호와 글자로 구분한다(색에만 의존하지 않는다).
const NOTICE_STYLE: Record<NoticeKind, { icon: string; label: string; color: string }> = {
  customer: { icon: "＋", label: "새 고객", color: "text-ink" },
  schedule_created: { icon: "↻", label: "일정 생성", color: "text-info" },
  sent: { icon: "✓", label: "발송 완료", color: "text-success" },
  failed: { icon: "!", label: "발송 실패", color: "text-danger" },
  skipped: { icon: "–", label: "발송 안 함", color: "text-stone-600" },
  cancelled: { icon: "✕", label: "일정 취소", color: "text-stone-600" },
};

type Props = { staffId: string; storeName: string; children: ReactNode };

export function StaffShell(props: Props) {
  return (
    <FeedProvider>
      <Shell {...props} />
    </FeedProvider>
  );
}

function Shell({ staffId, storeName, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { feed, error } = useStaffFeed();
  const pendingCount = feed?.schedules.filter((s) => s.schedule_status === "scheduled").length ?? 0;

  async function logout() {
    await fetch("/api/staff/logout", { method: "POST" });
    router.replace("/staff/login");
  }

  // 메뉴는 고정하지 않으면 보이지 않는다. 마우스가 화면 왼쪽 끝에 닿거나 위쪽의 [메뉴] 버튼을 누르면
  // 본문 위로 나타나고, 벗어나면 다시 숨는다. 고정하면 펼친 채로 두고 본문을 그만큼 밀어낸다.
  const [pinned, setPinned] = useState(false);
  const [peek, setPeek] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPinned(localStorage.getItem(PIN_KEY) === "1");
      } catch {
        // 저장소를 쓸 수 없으면 숨긴 상태로 둔다.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function togglePinned() {
    setPinned((value) => {
      try {
        localStorage.setItem(PIN_KEY, value ? "0" : "1");
      } catch {
        // 기억하지 못해도 이번 화면에서는 동작한다.
      }
      return !value;
    });
  }

  function open() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setPeek(true);
  }

  // 마우스가 살짝 벗어났다 돌아오는 경우를 위해 조금 기다렸다가 닫는다.
  function closeSoon() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPeek(false), 220);
  }

  function openWithKeyboard() {
    open();
    window.setTimeout(() => asideRef.current?.querySelector<HTMLElement>("a")?.focus(), 60);
  }

  const visible = pinned || peek;
  const rowClass =
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600";

  return (
    <div className="flex min-h-screen text-[15px]">
      {/* 고정했을 때만 본문에서 자리를 차지한다. */}
      <div className={`shrink-0 transition-[width] duration-200 ${pinned ? "w-56" : "w-0"}`} />
      {/* 화면 왼쪽 끝 24px. 마우스가 여기에 들어오면 메뉴를 연다. */}
      {!pinned && <div aria-hidden onMouseEnter={open} className="fixed left-0 top-0 z-30 h-screen w-6" />}
      <aside
        ref={asideRef}
        inert={!visible}
        onMouseEnter={open}
        onMouseLeave={() => !pinned && closeSoon()}
        onBlur={(event) => {
          if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) closeSoon();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pinned) setPeek(false);
        }}
        className={`fixed left-0 top-0 z-40 flex h-screen w-56 flex-col border-r border-stone-200 bg-white px-2 py-4 transition-[translate,box-shadow] duration-200 ${
          visible ? "translate-x-0" : "-translate-x-full"
        } ${visible && !pinned ? "shadow-xl" : ""}`}
      >
        <div className="flex h-9 items-center justify-between pl-2.5">
          <Wordmark size="sm" label="상담 지원" />
          <button
            type="button"
            onClick={togglePinned}
            aria-pressed={pinned}
            aria-label={pinned ? "메뉴 고정 해제" : "메뉴 고정"}
            title={pinned ? "메뉴 고정 해제" : "메뉴 고정"}
            className={`flex size-8 items-center justify-center rounded-md hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-600 ${pinned ? "text-brand-600" : "text-stone-500 hover:text-ink"}`}
          >
            <Icon name="pin" />
          </button>
        </div>
        <div className="mt-4 px-2.5">
          <p className="text-[12px] font-semibold text-stone-500">매장</p>
          <p className="truncate text-[14px] font-bold">{storeName}</p>
        </div>

        <nav className="mt-5 flex flex-col gap-0.5" aria-label="주 메뉴">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const count = item.href === "/staff/schedules" ? pendingCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${rowClass} ${active ? "bg-stone-100 text-ink" : "text-stone-600 hover:bg-stone-50 hover:text-ink"}`}
              >
                <span className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-brand-600" : ""}`}>
                  <Icon name={item.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {count > 0 && (
                  <span className="pr-1 text-[12px] font-medium tabular-nums text-stone-500">
                    <span className="sr-only">예정 </span>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <button type="button" onClick={logout} className={`${rowClass} mt-auto text-stone-600 hover:bg-stone-50 hover:text-ink`}>
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Icon name="logout" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            로그아웃 <span className="ml-1 text-[12px] font-medium text-stone-500">{staffId}</span>
          </span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-stone-200 bg-white/95 px-8 backdrop-blur">
          {!pinned && (
            <button
              type="button"
              onClick={openWithKeyboard}
              onMouseEnter={open}
              aria-label="메뉴 열기"
              aria-expanded={peek}
              className="-ml-3 flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <Icon name="menu" />
              메뉴
            </button>
          )}
          {error && <span className="text-[13px] font-semibold text-danger">연결 문제: {error}</span>}
          <span className="ml-auto" />
          <Bell />
        </header>
        <main className="mx-auto w-full max-w-[76rem] flex-1 px-8 py-7">{children}</main>
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
        className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        알림
        {unread > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold leading-5 text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-96 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-stone-200">
          <p className="border-b border-stone-100 px-4 py-3 text-[14px] font-bold">알림</p>
          {notices.length === 0 ? (
            <p className="px-4 py-8 text-center text-stone-500">아직 알림이 없습니다.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-stone-100 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <Link href={notice.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-stone-50">
                    <span className="min-w-0 flex-1">
                      <NoticeKindLabel kind={notice.kind} />
                      <span className="mt-0.5 block text-[14px] font-semibold leading-snug">{notice.title}</span>
                      {notice.body && <span className="mt-0.5 block truncate text-[13px] text-stone-500">{notice.body}</span>}
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-stone-500">{formatTime(notice.at)}</span>
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
    <div aria-live="polite" className="pointer-events-none fixed right-6 top-16 z-50 flex w-[24rem] flex-col gap-2.5">
      {toasts.map((toast) => (
        <Toast key={toast.id} notice={toast} onClose={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div className="pointer-events-auto flex animate-toast-in items-start gap-3 rounded-xl bg-white px-4 py-3.5 shadow-lg ring-1 ring-stone-200">
      <Link href={notice.href} onClick={onClose} className="min-w-0 flex-1">
        <NoticeKindLabel kind={notice.kind} />
        <span className="mt-0.5 block text-[15px] font-semibold leading-snug">{notice.title}</span>
        {notice.body && <span className="mt-0.5 block text-[13px] text-stone-600">{notice.body}</span>}
      </Link>
      <button onClick={onClose} aria-label="알림 닫기" className="flex size-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-ink">
        ✕
      </button>
    </div>
  );
}

function NoticeKindLabel({ kind }: { kind: NoticeKind }) {
  const style = NOTICE_STYLE[kind];
  return (
    <span className={`flex items-center gap-1 text-[12px] font-semibold ${style.color}`}>
      <span aria-hidden>{style.icon}</span>
      {style.label}
    </span>
  );
}
