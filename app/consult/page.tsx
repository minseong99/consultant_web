"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { consultChartSlides, type ConsultSlide } from "@/components/consult/ConsultCharts";
import { DeviceVisual } from "@/components/staff/DeviceVisual";
import { Button, ErrorNote, inputClass, Skeleton } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { isValidPhone } from "@/lib/fields";
import { formatDateTime, formatWon } from "@/lib/format";
import type { ConsultRecommendation, ConsultScreenView, ConsultView } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

// 상담하는 자리에서 고객이 직접 보는 화면. 이름과 휴대폰 번호로 본인을 확인한 뒤,
// 직원이 받아 둔 추천을 보여 준다. 조회만 하며 이 화면에서 추천을 새로 만들지 않는다.
export default function ConsultPage() {
  // undefined: 확인 중, null: 본인 확인 필요
  const [view, setView] = useState<ConsultScreenView | null | undefined>(undefined);
  // 직원이 화면을 종료했다. 인사 화면을 보여 주고, 다시 보려면 본인 확인부터 한다.
  const [ended, setEnded] = useState(false);

  // 이미 확인된 고객(새로 고침, 직원이 열어 준 화면)은 바로 보여 준다.
  useEffect(() => {
    let alive = true;
    fetch("/api/consult")
      .then((response) => response.json())
      .then((data) => alive && setView(data.success ? data.view : null))
      .catch(() => alive && setView(null));
    return () => {
      alive = false;
    };
  }, []);

  async function leave() {
    await fetch("/api/consult", { method: "DELETE" }).catch(() => {});
    setView(null);
  }

  if (view === undefined) {
    return (
      <Shell>
        <Skeleton className="mt-10 h-8 w-48" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Shell>
    );
  }
  if (ended) {
    return (
      <Shell>
        <section className="flex flex-1 animate-rise-in flex-col pt-8">
          <h1 className="text-[28px] font-bold leading-snug">
            상담이 끝났습니다
            <br />
            방문해 주셔서 감사합니다
          </h1>
          <p className="mt-2 text-[15px] text-stone-600">궁금한 점은 직원에게 편하게 물어봐 주세요.</p>
          <div className="mt-auto pt-8">
            <Link
              href="/"
              className="flex h-13 w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-ink ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              처음 화면으로
            </Link>
          </div>
        </section>
      </Shell>
    );
  }
  if (view === null) {
    return (
      <Shell>
        <Identify onFound={setView} />
      </Shell>
    );
  }
  return (
    <Shell wide onLeave={leave}>
      <Screen
        view={view}
        onChange={setView}
        onEnded={() => {
          setEnded(true);
          setView(null);
        }}
      />
    </Shell>
  );
}

function Shell({ wide, onLeave, children }: { wide?: boolean; onLeave?: () => void; children: ReactNode }) {
  return (
    <main className={`mx-auto flex min-h-screen w-full flex-col pb-12 pt-8 ${wide ? "page-x" : "max-w-md bg-white px-5"}`}>
      <header className="flex min-h-9 items-center justify-between">
        <Wordmark size="sm" label="상담 화면" />
        {onLeave && (
          <button
            type="button"
            onClick={onLeave}
            className="inline-flex min-h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-stone-600 hover:bg-stone-200/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            나가기
          </button>
        )}
      </header>
      {children}
    </main>
  );
}

function Identify({ onFound }: { onFound: (view: ConsultScreenView) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !isValidPhone(phone)) {
      setError({ message: "이름과 휴대폰 번호를 확인해 주세요. (예: 01012345678)", notFound: false });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/consult", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_name: name, phone }),
      });
      const data = await response.json();
      if (data.success) onFound(data.view);
      else setError({ message: data.message ?? "확인하지 못했습니다. 직원에게 문의해 주세요.", notFound: data.error_code === "NOT_FOUND" });
    } catch {
      setError({ message: "연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.", notFound: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 animate-rise-in flex-col pt-8">
      <h1 className="text-[28px] font-bold leading-snug">
        고객님을 위해
        <br />
        준비한 내용을 보여 드릴게요
      </h1>
      <p className="mt-2 text-[15px] text-stone-600">접수할 때 입력하신 이름과 휴대폰 번호를 알려 주세요.</p>

      <label className="mt-8 block text-[14px] font-semibold" htmlFor="consult-name">
        이름
      </label>
      <input id="consult-name" className={`mt-1.5 ${inputClass}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
      <label className="mt-5 block text-[14px] font-semibold" htmlFor="consult-phone">
        휴대폰 번호
      </label>
      <input
        id="consult-phone"
        className={`mt-1.5 ${inputClass}`}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        inputMode="numeric"
        placeholder="01012345678"
        autoComplete="off"
      />

      {error && (
        <div className="mt-5">
          <ErrorNote>{error.message}</ErrorNote>
          {error.notFound && (
            <p className="mt-3 text-[14px] text-stone-600">
              아직 접수 전이라면{" "}
              <Link href="/join" className="font-semibold text-ink underline decoration-stone-300 underline-offset-4 hover:decoration-stone-500">
                먼저 접수해 주세요
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="mt-auto pt-8">
        <Button type="submit" size="lg" loading={loading} className="w-full !rounded-full">
          확인
        </Button>
      </div>
    </form>
  );
}

// 고객은 화면을 만지지 않고 보고만 있는 때가 많으므로, 조작이 없어도 이 간격으로 조회해 직원이 넘기는 대로 따라간다.
// 이 조회는 직원이 고른 장만 묻는 가벼운 것이고, 화면 내용 전체는 장이 바뀌었을 때(직원이 넘기거나 추천을 새로 받음)와
// FULL_MS 마다만 다시 읽는다. 추천을 기다리는 동안에는 바로 나타나도록 매번 전체를 읽는다.
const FOLLOW_MS = 2_000;
const FULL_MS = 60_000;

function Screen({ view, onChange, onEnded }: { view: ConsultScreenView; onChange: (view: ConsultScreenView | null) => void; onEnded: () => void }) {
  // 직원이 추천을 새로 받거나 장을 넘기면 따라 바뀐다. 확인이 풀렸으면(시간 만료) 본인 확인으로, 직원이 종료했으면 인사 화면으로 간다.
  const lastFull = useRef(0);
  const waiting = view.recommendations.length === 0;
  const followed = view.remote?.updated_at ?? null;
  const refresh = useCallback(async () => {
    try {
      let full = waiting || Date.now() - lastFull.current >= FULL_MS;
      let response = await fetch(full ? "/api/consult" : "/api/consult?light=1", { cache: "no-store" });
      let data = await response.json();
      if (data.success && !full && data.remote && data.remote.updated_at !== followed) {
        full = true;
        response = await fetch("/api/consult", { cache: "no-store" });
        data = await response.json();
      }
      if (data.success) {
        if (!full) return;
        lastFull.current = Date.now();
        onChange(data.view);
      } else if (data.error_code === "ENDED") onEnded();
      else if (response.status === 401 || response.status === 404) onChange(null);
    } catch {
      // 잠깐 끊긴 것은 다음 조회에서 따라잡는다.
    }
  }, [onChange, onEnded, waiting, followed]);
  usePolling(refresh, FOLLOW_MS);

  // 스크롤해서 찾지 않도록 한 장씩 보여 준다. 그릴 값이 있는 장만 생긴다.
  const slides: ConsultSlide[] = [{ key: "recommend", label: "추천", node: <Recommendations view={view} /> }, ...consultChartSlides(view)];
  // 이 화면에서 직접 고른 장과, 그때의 직원 조작 시각. 직원이 그 뒤에 장을 넘기면 직원 쪽을 따른다.
  // 화면을 열기 전에 남아 있던 직원 조작(opened)은 따르지 않고 첫 장부터 시작한다.
  const remoteAt = view.remote?.updated_at ?? null;
  const [opened] = useState(remoteAt);
  const [picked, setPicked] = useState<{ key: string; at: string | null }>({ key: "recommend", at: remoteAt });
  const selected = view.remote && remoteAt !== picked.at && remoteAt !== opened ? view.remote.slide : picked.key;
  const setSelected = (key: string) => setPicked({ key, at: remoteAt });
  const index = Math.max(
    0,
    slides.findIndex((slide) => slide.key === selected),
  );
  const count = slides.length;

  // 상담 자리에서 키보드 화살표로도 넘긴다.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const next = slides[index + (event.key === "ArrowRight" ? 1 : -1)];
      if (next) setSelected(next.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex flex-1 animate-rise-in flex-col">
      <h1 className="mt-6 text-[28px] font-bold leading-tight sm:text-[32px]">
        {view.customer_name}
        <span className="ml-1 text-[19px] font-semibold text-stone-500">{view.recommendations.length > 0 ? "님을 위한 추천" : "님, 어서 오세요"}</span>
      </h1>
      <p className="mt-2 text-[15px] text-stone-600">
        지금 <span className="font-semibold text-ink">{view.current_device}</span> · <span className="font-semibold text-ink">{view.current_plan}</span>
        {view.current_plan_fee != null && <span className="tabular-nums"> (월 {formatWon(view.current_plan_fee)})</span>}
      </p>

      {count > 1 && (
        <div role="tablist" aria-label="보여 줄 내용" className="mt-5 flex gap-1.5 self-start rounded-full bg-stone-200/70 p-1">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              role="tab"
              aria-selected={i === index}
              onClick={() => setSelected(slide.key)}
              className={`h-11 rounded-full px-4 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:px-6 ${
                i === index ? "bg-white text-ink shadow-sm" : "text-stone-600 hover:text-ink"
              }`}
            >
              {slide.label}
            </button>
          ))}
        </div>
      )}

      <div key={slides[index].key} role="tabpanel" aria-live="polite" className="mt-5 flex-1 animate-rise-in">
        {slides[index].node}
      </div>

      {count > 1 && (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" size="lg" className="!rounded-full" disabled={index === 0} onClick={() => setSelected(slides[index - 1].key)}>
            <span aria-hidden>←</span> 이전
          </Button>
          <p className="text-[13px] tabular-nums text-stone-500">
            {index + 1} / {count}
          </p>
          <Button size="lg" className="!rounded-full" disabled={index === count - 1} onClick={() => setSelected(slides[index + 1].key)}>
            다음 <span aria-hidden>→</span>
          </Button>
        </div>
      )}
    </div>
  );
}

function Recommendations({ view }: { view: ConsultView }) {
  const count = view.recommendations.length;
  if (count === 0) {
    return (
      <section className="surface px-6 py-12 text-center">
        <span aria-hidden className="mx-auto block size-2.5 animate-pulse-soft rounded-full bg-brand-600" />
        <h2 className="mt-4 text-[20px] font-bold">직원이 추천을 준비하고 있습니다</h2>
        <p className="mt-1.5 text-[15px] text-stone-600">준비되면 이 화면에 바로 나타납니다.</p>
      </section>
    );
  }
  return (
    // 추천을 새로 받으면 묶음째 다시 떠오르게 한다. 넓은 화면에서는 나란히 놓아 한눈에 견준다.
    <section key={view.recommended_at} className="animate-rise-in">
      <ol className={`grid gap-4 ${count === 2 ? "sm:grid-cols-2" : count >= 3 ? "sm:grid-cols-3" : ""}`}>
        {view.recommendations.map((item, index) => (
          <li key={`${item.rank}-${index}`} className="flex">
            <RecommendationCard item={item} first={index === 0} wide={count === 1} />
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[13px] leading-relaxed text-stone-500">
        {view.recommended_at && <>{formatDateTime(view.recommended_at)}에 받은 추천입니다. </>}
        기기 가격과 월 요금에는 약정·결합 할인이 반영되어 있지 않습니다. 자세한 조건은 직원이 안내해 드립니다.
      </p>
    </section>
  );
}

function RecommendationCard({ item, first, wide }: { item: ConsultRecommendation; first: boolean; wide: boolean }) {
  const { device, plan } = item;
  return (
    <article className={`surface w-full p-5 ${first ? "ring-2 ring-inset ring-brand-600" : ""}`}>
      <p className={`inline-flex rounded-full px-3 py-1 text-[13px] font-bold ${first ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700"}`}>
        {item.rank != null ? `${item.rank}순위 추천` : "추천"}
      </p>
      <div className={`mt-4 flex flex-col gap-4 ${wide ? "sm:flex-row sm:items-center sm:gap-6" : ""}`}>
        {device && <DevicePhoto device={device} wide={wide} />}
        <dl className={`grid flex-1 gap-4 ${wide ? "sm:grid-cols-2" : ""}`}>
          {device && (
            <div>
              <dt className="text-[13px] text-stone-500">기기{device.manufacturer ? ` · ${device.manufacturer}` : ""}</dt>
              <dd className="mt-0.5 text-[19px] font-bold leading-snug">{device.device_name}</dd>
              {device.device_price != null && <dd className="mt-1 text-[15px] tabular-nums text-stone-700">기기 가격 {formatWon(device.device_price)}</dd>}
            </div>
          )}
          {plan && (
            <div>
              <dt className="text-[13px] text-stone-500">요금제</dt>
              <dd className="mt-0.5 text-[19px] font-bold leading-snug">{plan.plan_name}</dd>
              {plan.monthly_fee != null && <dd className="mt-1 text-[15px] tabular-nums text-stone-700">월 {formatWon(plan.monthly_fee)}</dd>}
              {plan.allowance_info && <dd className="mt-1 text-[14px] leading-relaxed text-stone-600">{plan.allowance_info}</dd>}
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}

// 기기 사진(public/devices/<기기 ID>.webp). 파일이 없는 기기는 형태를 그린 그림으로 대신한다.
function DevicePhoto({ device, wide }: { device: NonNullable<ConsultRecommendation["device"]>; wide: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`flex h-40 w-full shrink-0 items-center justify-center rounded-2xl bg-stone-100 ${wide ? "sm:w-44" : ""}`}>
      {broken ? (
        <DeviceVisual productId={device.device_id} deviceName={device.device_name} />
      ) : (
        <Image
          src={`/devices/${device.device_id}.webp`}
          alt={device.device_name}
          width={144}
          height={144}
          className="h-32 w-auto rounded object-contain mix-blend-multiply"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}
