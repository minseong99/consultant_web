"use client";

import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Tone } from "@/lib/labels";

// 상태 배지. 색만으로 구분하지 않도록 항상 글자와 함께 쓴다.
const TONES: Record<Tone, string> = {
  gray: "bg-stone-100 text-stone-700 ring-stone-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  violet: "bg-stone-100 text-stone-800 ring-stone-300",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, disabled, children, className = "", ...rest }: ButtonProps) {
  const variants = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
    secondary: "bg-white text-ink ring-1 ring-inset ring-stone-200 hover:bg-stone-50 disabled:text-stone-400",
    ghost: "text-stone-700 hover:bg-stone-100 disabled:text-stone-300",
  };
  const sizes = { sm: "h-9 px-3 text-[13px]", md: "h-10 px-4 text-[14px]", lg: "h-13 px-5 text-[16px]" };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-[background-color,transform] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** 글자처럼 보이는 보조 버튼. "자세히 보기", "근거 보기" 같은 펼침에 쓴다. */
export function TextButton({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex min-h-9 items-center gap-1 rounded-md text-[13px] font-semibold text-stone-700 underline decoration-stone-300 underline-offset-4 hover:text-ink hover:decoration-stone-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="처리 중"
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  );
}

// 카드는 독립된 판단 단위(추천, 주요 입력, AI 결과)에만 쓴다. 관련 정보는 Section 으로 묶는다.
export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="text-[16px] font-bold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 px-4 py-8 text-center text-[14px] text-stone-600">{children}</p>;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-danger ring-1 ring-inset ring-red-200">
      <span aria-hidden className="font-bold">
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-md bg-stone-100 px-2 py-1 text-[13px] text-stone-800">
          {item}
        </li>
      ))}
    </ul>
  );
}

export const inputClass =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-[15px] placeholder:text-stone-400 focus:border-stone-500 focus:outline-2 focus:outline-stone-300";

// ---------------------------------------------------------------------------
// 출처 표시. 고객이 입력한 것, 직원이 적은 것, AI가 만든 것, 자동으로 생긴 것을 구분한다.
// 색만으로 구분하지 않도록 기호와 글자를 함께 쓴다.
// ---------------------------------------------------------------------------
const SOURCES = {
  customer: { mark: "○", label: "고객 입력", className: "text-stone-600" },
  staff: { mark: "✎", label: "직원 기록", className: "text-stone-600" },
  ai: { mark: "✦", label: "AI 분석", className: "text-info" },
  recommend: { mark: "✦", label: "AI 추천", className: "text-info" },
  auto: { mark: "↻", label: "자동 생성", className: "text-stone-600" },
} as const;

export type Source = keyof typeof SOURCES;

export function SourceLabel({ source, label }: { source: Source; label?: string }) {
  const s = SOURCES[source];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold ${s.className}`}>
      <span aria-hidden>{s.mark}</span>
      {label ?? s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 진행 상태 한 줄. 실제로 흐른 시간만 보여 준다(진행률은 알 수 없으므로 표시하지 않는다).
// ---------------------------------------------------------------------------
export function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

export function formatElapsed(seconds: number) {
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

export type StatusState = "waiting" | "active" | "done" | "error";

export function StatusLine({ state, label, note, since = null }: { state: StatusState; label: string; note?: string; since?: number | null }) {
  const elapsed = useElapsed(state === "active" ? since : null);
  return (
    <span className="flex items-start gap-2 text-[13px]">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
        {state === "active" && <Spinner className="!size-3.5 text-stone-500" />}
        {state === "done" && <span className="font-bold text-success">✓</span>}
        {state === "error" && <span className="font-bold text-danger">!</span>}
        {state === "waiting" && <span className="size-1.5 rounded-full bg-stone-300" />}
      </span>
      <span className={state === "waiting" ? "text-stone-400" : state === "error" ? "text-danger" : state === "active" ? "font-semibold text-ink" : "text-stone-700"}>
        <span className="sr-only">{state === "done" ? "완료: " : state === "error" ? "실패: " : state === "active" ? "진행 중: " : "대기: "}</span>
        {label}
        {state === "active" && since !== null && <span className="ml-1.5 font-normal tabular-nums text-stone-500">· {formatElapsed(elapsed)}</span>}
        {note && <span className="ml-1.5 font-normal text-stone-500">· {note}</span>}
      </span>
    </span>
  );
}

/** 결과가 들어올 자리의 뼈대 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse-soft rounded-md bg-stone-200 ${className}`} />;
}

// ---------------------------------------------------------------------------
// 펼침. 처음에는 접혀 있고, 누르면 아래에 내용이 나온다.
// ---------------------------------------------------------------------------
export function Disclosure({
  label,
  openLabel,
  children,
  defaultOpen = false,
  className = "",
}: {
  label: ReactNode;
  openLabel?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <TextButton aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        {open ? (openLabel ?? label) : label}
        <span aria-hidden className="text-stone-400">
          {open ? "▴" : "▾"}
        </span>
      </TextButton>
      {open && (
        <div id={id} className="mt-3 animate-fade-in">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 오른쪽에서 열리는 서랍. 상담 중 항상 볼 필요가 없는 전체 정보를 담는다.
// ---------------------------------------------------------------------------
export function Drawer({ open, title, source, onClose, children }: { open: boolean; title: string; source?: Source; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="닫기" className="absolute inset-0 animate-fade-in cursor-default bg-stone-900/30" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-[30rem] max-w-full animate-drawer-in flex-col bg-white shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
          <div>
            {source && <SourceLabel source={source} />}
            <h2 id={titleId} className="text-[17px] font-bold">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="flex size-9 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 탭. 좌우 화살표로 이동할 수 있다.
// ---------------------------------------------------------------------------
export type TabDef<K extends string> = { key: K; label: string; count?: number; dot?: boolean };

export function Tabs<K extends string>({ tabs, active, onChange, idPrefix }: { tabs: TabDef<K>[]; active: K; onChange: (key: K) => void; idPrefix: string }) {
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((t) => t.key === active);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.key);
    document.getElementById(`${idPrefix}-tab-${next.key}`)?.focus();
  }
  return (
    <div role="tablist" onKeyDown={onKeyDown} className="flex gap-1 border-b border-stone-200">
      {tabs.map((tab) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            id={`${idPrefix}-tab-${tab.key}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`-mb-px flex min-h-11 items-center gap-1.5 border-b-2 px-4 text-[14px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600 ${
              selected ? "border-brand-600 text-ink" : "border-transparent text-stone-500 hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="text-[12px] font-medium tabular-nums text-stone-500">{tab.count}</span>}
            {tab.dot && (
              <span className="flex items-center" title="새 결과가 있습니다">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-600" />
                <span className="sr-only">새 결과 있음</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 탭 패널. 꺼진 탭도 내용은 유지해, 진행 중인 요청과 결과가 사라지지 않게 한다. */
export function TabPanel({ idPrefix, tabKey, active, children }: { idPrefix: string; tabKey: string; active: boolean; children: ReactNode }) {
  return (
    <div id={`${idPrefix}-panel-${tabKey}`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${tabKey}`} hidden={!active} className="min-h-[calc(100dvh-7rem)] pt-6">
      {children}
    </div>
  );
}

/** 긴 글을 몇 줄만 보여 준다. 전체는 펼침이나 서랍에서 본다. */
export function Clamp({ lines = 2, children, className = "" }: { lines?: 1 | 2 | 3; children: ReactNode; className?: string }) {
  const clamp = lines === 1 ? "line-clamp-1" : lines === 2 ? "line-clamp-2" : "line-clamp-3";
  return <span className={`${clamp} ${className}`}>{children}</span>;
}
