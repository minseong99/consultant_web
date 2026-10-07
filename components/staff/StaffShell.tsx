"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatTime } from "@/lib/format";
import type { Notice, NoticeKind } from "@/lib/notify";
import { FeedProvider, useStaffFeed } from "./FeedProvider";
import { Wordmark } from "@/components/Wordmark";

type IconName = "today" | "customers" | "schedules" | "promotions" | "pin" | "logout" | "bell";

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
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
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

  // 메뉴는 왼쪽에 아이콘만 있는 좁은 줄로 늘 보인다. 마우스를 올리거나 키보드로 들어가면 본문 위로 펼쳐져
  // 이름이 보이고, 벗어나면 다시 접힌다. 고정하면 펼친 채로 두고 본문을 그만큼 밀어낸다.
  // 알림도 이 줄에 있어 화면 위쪽에는 따로 띠를 두지 않는다.
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

  const visible = pinned || peek;
  const rowClass =
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600";

  return (
    <div className="flex min-h-screen text-[15px]">
      {/* 본문에서 차지하는 자리. 접혀 있으면 아이콘 줄만큼, 고정하면 펼친 폭만큼. */}
      <div className={`shrink-0 transition-[width] duration-200 ${pinned ? "w-56" : "w-14"}`} />
      <aside
        ref={asideRef}
        onMouseEnter={open}
        onMouseLeave={() => !pinned && closeSoon()}
        onFocus={open}
        onBlur={(event) => {
          if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) closeSoon();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pinned) setPeek(false);
        }}
        className={`fixed left-0 top-0 z-40 flex h-screen flex-col bg-white px-2 py-4 transition-[width,box-shadow] duration-200 ${visible ? "w-56" : "w-14"} ${
          visible && !pinned ? "shadow-xl" : "border-r border-stone-100"
        }`}
      >
        <div className="flex h-9 items-center justify-between overflow-hidden pl-2">
          {/* 터치 화면에서는 로고를 눌러 펼치고 접는다. */}
          <button
            type="button"
            onClick={() => !pinned && setPeek((value) => !value)}
            aria-label={visible ? "메뉴 접기" : "메뉴 펼치기"}
            aria-expanded={visible}
            className="flex min-w-0 items-center rounded-md focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <Wordmark size="sm" label={visible ? "상담 지원" : ""} />
          </button>
          {visible && (
            <button
              type="button"
              onClick={togglePinned}
              aria-pressed={pinned}
              aria-label={pinned ? "메뉴 고정 해제" : "메뉴 고정"}
              title={pinned ? "메뉴 고정 해제" : "메뉴 고정"}
              className={`flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-600 ${pinned ? "text-brand-600" : "text-stone-500 hover:text-ink"}`}
            >
              <Icon name="pin" />
            </button>
          )}
        </div>
        {/* 접혀 있어도 자리를 남겨, 펼칠 때 메뉴가 위아래로 움직이지 않게 한다. */}
        <div className={`mt-4 h-10 overflow-hidden whitespace-nowrap px-2.5 transition-opacity duration-200 ${visible ? "" : "opacity-0"}`}>
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
                aria-label={item.label}
                title={visible ? undefined : item.label}
                className={`${rowClass} ${active ? "bg-stone-100 text-ink" : "text-stone-600 hover:bg-stone-50 hover:text-ink"}`}
              >
                <span className={`flex size-5 shrink-0 items-center justify-center ${active ? "text-brand-600" : ""}`}>
                  <Icon name={item.icon} />
                </span>
                {visible && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {visible && count > 0 && (
                  <span className="pr-1 text-[12px] font-medium tabular-nums text-stone-500">
                    <span className="sr-only">예정 </span>
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-0.5">
          <Bell expanded={visible} rowClass={rowClass} />
          <button type="button" onClick={logout} aria-label="로그아웃" title={visible ? undefined : "로그아웃"} className={`${rowClass} text-stone-600 hover:bg-stone-50 hover:text-ink`}>
            <span className="flex size-5 shrink-0 items-center justify-center">
              <Icon name="logout" />
            </span>
            {visible && (
              <span className="min-w-0 flex-1 truncate">
                로그아웃 <span className="ml-1 text-[12px] font-medium text-stone-500">{staffId}</span>
              </span>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[76rem] flex-1 px-8 py-8">
          {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-danger">연결 문제: {error}</p>}
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function Bell({ expanded, rowClass }: { expanded: boolean; rowClass: string }) {
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
        type="button"
        onClick={toggle}
        aria-label={`알림 ${unread}건`}
        aria-expanded={open}
        title={expanded ? undefined : "알림"}
        className={`${rowClass} ${open ? "bg-stone-100 text-ink" : "text-stone-600 hover:bg-stone-50 hover:text-ink"}`}
      >
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <Icon name="bell" />
          {/* 접혀 있을 때는 숫자 대신 점으로 새 알림을 알린다. */}
          {unread > 0 && !expanded && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand-600 ring-2 ring-white" />}
        </span>
        {expanded && <span className="min-w-0 flex-1 truncate">알림</span>}
        {expanded && unread > 0 && <span className="flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold leading-5 text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute bottom-0 left-full ml-3 w-96 overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-stone-200">
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
    <div aria-live="polite" className="pointer-events-none fixed right-6 top-6 z-50 flex w-[24rem] flex-col gap-2.5">
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
