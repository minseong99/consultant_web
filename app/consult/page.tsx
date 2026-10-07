"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ConsultCompare, ConsultTimeline } from "@/components/consult/ConsultCharts";
import { DeviceVisual } from "@/components/staff/DeviceVisual";
import { Button, ErrorNote, inputClass, Skeleton, SourceLabel } from "@/components/ui";
import { Wordmark } from "@/components/Wordmark";
import { isValidPhone } from "@/lib/fields";
import { formatDateTime, formatWon } from "@/lib/format";
import type { ConsultRecommendation, ConsultView } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

// 상담하는 자리에서 고객이 직접 보는 화면. 이름과 휴대폰 번호로 본인을 확인한 뒤,
// 직원이 받아 둔 추천을 보여 준다. 조회만 하며 이 화면에서 추천을 새로 만들지 않는다.
export default function ConsultPage() {
  // undefined: 확인 중, null: 본인 확인 필요
  const [view, setView] = useState<ConsultView | null | undefined>(undefined);

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
  if (view === null) {
    return (
      <Shell>
        <Identify onFound={setView} />
      </Shell>
    );
  }
  return (
    <Shell wide onLeave={leave}>
      <Screen view={view} onChange={setView} />
    </Shell>
  );
}

function Shell({ wide, onLeave, children }: { wide?: boolean; onLeave?: () => void; children: ReactNode }) {
  return (
    <main className={`mx-auto flex min-h-screen w-full flex-col px-5 pb-12 pt-8 ${wide ? "max-w-3xl" : "max-w-md bg-white"}`}>
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

function Identify({ onFound }: { onFound: (view: ConsultView) => void }) {
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

function Screen({ view, onChange }: { view: ConsultView; onChange: (view: ConsultView | null) => void }) {
  // 직원이 추천을 새로 받으면 따라 바뀐다. 확인이 풀렸으면(시간 만료) 본인 확인으로 돌아간다.
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/consult");
      const data = await response.json();
      if (data.success) onChange(data.view);
      else if (response.status === 401 || response.status === 404) onChange(null);
    } catch {
      // 잠깐 끊긴 것은 다음 조회에서 따라잡는다.
    }
  }, [onChange]);
  usePolling(refresh);

  const current: { label: string; value: string; note?: string }[] = [
    { label: "지금 쓰는 기기", value: view.current_device },
    {
      label: "지금 쓰는 요금제",
      value: view.current_plan,
      note: view.current_plan_fee != null ? `월 ${formatWon(view.current_plan_fee)}` : undefined,
    },
  ];

  return (
    <div className="animate-rise-in">
      <h1 className="mt-8 text-[30px] font-bold leading-tight sm:text-[34px]">
        {view.customer_name}
        <span className="ml-1 text-[20px] font-semibold text-stone-500">{view.recommendations.length > 0 ? "님을 위한 추천" : "님, 어서 오세요"}</span>
      </h1>

      <section aria-label="현재 이용 정보" className="surface mt-6 px-6 py-5">
        <SourceLabel source="customer" label="접수할 때 알려 주신 내용" />
        <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {current.map((item) => (
            <div key={item.label}>
              <dt className="text-[13px] text-stone-500">{item.label}</dt>
              <dd className="mt-0.5 text-[17px] font-bold">{item.value}</dd>
              {item.note && <dd className="text-[14px] tabular-nums text-stone-600">{item.note}</dd>}
            </div>
          ))}
        </dl>
      </section>

      {view.recommendations.length === 0 ? (
        <section className="surface mt-5 px-6 py-10 text-center" aria-live="polite">
          <span aria-hidden className="mx-auto block size-2.5 animate-pulse-soft rounded-full bg-brand-600" />
          <h2 className="mt-4 text-[20px] font-bold">직원이 추천을 준비하고 있습니다</h2>
          <p className="mt-1.5 text-[15px] text-stone-600">준비되면 이 화면에 바로 나타납니다.</p>
        </section>
      ) : (
        // 추천을 새로 받으면 묶음째 다시 떠오르게 한다.
        <section key={view.recommended_at} className="mt-5 animate-rise-in" aria-live="polite">
          <ol className="space-y-4">
            {view.recommendations.map((item, index) => (
              <li key={`${item.rank}-${index}`}>
                <RecommendationCard item={item} first={index === 0} />
              </li>
            ))}
          </ol>
          <p className="mt-5 text-[13px] leading-relaxed text-stone-500">
            {view.recommended_at && <>{formatDateTime(view.recommended_at)}에 받은 추천입니다. </>}
            기기 가격과 월 요금에는 약정·결합 할인이 반영되어 있지 않습니다. 자세한 조건은 직원이 안내해 드립니다.
          </p>
        </section>
      )}

      {/* 그래프는 값이 있을 때만 나온다. 추천을 새로 받으면 비교도 따라 바뀐다. */}
      <div className="mt-8 space-y-8 empty:hidden">
        <ConsultCompare view={view} />
        <ConsultTimeline view={view} />
      </div>
    </div>
  );
}

function RecommendationCard({ item, first }: { item: ConsultRecommendation; first: boolean }) {
  const { device, plan } = item;
  return (
    <article className={`surface p-6 ${first ? "ring-2 ring-inset ring-brand-600" : ""}`}>
      <p
        className={`inline-flex rounded-full px-3 py-1 text-[13px] font-bold ${first ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700"}`}
      >
        {item.rank != null ? `${item.rank}순위 추천` : "추천"}
      </p>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        {device && <DevicePhoto device={device} />}
        <dl className="grid flex-1 gap-5 sm:grid-cols-2">
          {device && (
            <div>
              <dt className="text-[13px] text-stone-500">기기{device.manufacturer ? ` · ${device.manufacturer}` : ""}</dt>
              <dd className="mt-0.5 text-[20px] font-bold leading-snug">{device.device_name}</dd>
              {device.device_price != null && <dd className="mt-1 text-[15px] tabular-nums text-stone-700">기기 가격 {formatWon(device.device_price)}</dd>}
            </div>
          )}
          {plan && (
            <div>
              <dt className="text-[13px] text-stone-500">요금제</dt>
              <dd className="mt-0.5 text-[20px] font-bold leading-snug">{plan.plan_name}</dd>
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
function DevicePhoto({ device }: { device: NonNullable<ConsultRecommendation["device"]> }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="flex h-40 w-full shrink-0 items-center justify-center rounded-2xl bg-stone-100 sm:w-36">
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
