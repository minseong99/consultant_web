"use client";

import Image from "next/image";
import { useState } from "react";
import { promotionKind, type DeviceRef, type PromotionKind, type PromotionSummary } from "@/lib/promotion";

// 프로모션 목록의 그림. 대상 기기가 특정되면 그 기기 사진(public/devices/<기기 ID>.webp)을,
// 아니면 프로모션 종류를 나타내는 그림을 보여 준다. 프로모션 전용 이미지는 없으므로 만들지 않는다.

const KINDS: Record<PromotionKind, { label: string; tile: string; ink: string }> = {
  gift: { label: "사은품", tile: "bg-amber-50", ink: "text-amber-700" },
  discount: { label: "할인", tile: "bg-emerald-50", ink: "text-emerald-700" },
  coupon: { label: "쿠폰", tile: "bg-blue-50", ink: "text-blue-700" },
  payback: { label: "페이백", tile: "bg-emerald-50", ink: "text-emerald-700" },
  bundle: { label: "결합", tile: "bg-blue-50", ink: "text-blue-700" },
  wearable: { label: "추가 기기", tile: "bg-stone-100", ink: "text-stone-700" },
  general: { label: "프로모션", tile: "bg-stone-100", ink: "text-stone-600" },
};

export function PromotionVisual({ name, summary, devices, cover = false }: { name: string; summary: PromotionSummary | null; devices: DeviceRef[]; cover?: boolean }) {
  // 불러오지 못한 사진은 빼고 보여 준다.
  const [broken, setBroken] = useState<string[]>([]);
  const shown = devices.filter((device) => !broken.includes(device.device_id));
  const kind = promotionKind(name, summary);
  const { label, tile, ink } = KINDS[kind];
  const fail = (id: string) => setBroken((list) => [...list, id]);

  // 카드 위쪽을 가득 채우는 큰 그림. 대상 기기가 여러 대면 나란히 보여 준다.
  if (cover) {
    return shown.length > 0 ? (
      <div className="flex h-40 items-center justify-center gap-3 bg-stone-100 px-4">
        {shown.map((device) => (
          <Image
            key={device.device_id}
            src={`/devices/${device.device_id}.webp`}
            alt={device.device_name}
            width={128}
            height={128}
            className={`${shown.length > 1 ? "h-24" : "h-32"} w-auto rounded object-contain mix-blend-multiply`}
            onError={() => fail(device.device_id)}
          />
        ))}
      </div>
    ) : (
      <div className={`flex h-40 flex-col items-center justify-center gap-2 ${tile} ${ink}`}>
        <KindIcon kind={kind} className="size-14" />
        <span className="text-[13px] font-semibold">{label}</span>
      </div>
    );
  }

  const device = shown[0];
  if (device) {
    return (
      <span className="relative flex size-20 shrink-0 items-center justify-center rounded-xl bg-stone-100">
        <Image
          src={`/devices/${device.device_id}.webp`}
          alt={device.device_name}
          width={72}
          height={72}
          className="size-[4.5rem] rounded object-contain mix-blend-multiply"
          onError={() => fail(device.device_id)}
        />
        {shown.length > 1 && (
          <span className="absolute -bottom-1 -right-1 rounded-full bg-white px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-stone-700 ring-1 ring-stone-300" title={shown.map((d) => d.device_name).join(", ")}>
            +{shown.length - 1}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={`flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl ${tile} ${ink}`}>
      <KindIcon kind={kind} />
      <span className="text-[11px] font-semibold">{label}</span>
    </span>
  );
}

function KindIcon({ kind, className = "size-8" }: { kind: PromotionKind; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className} {...common}>
      {kind === "gift" && (
        <>
          <rect x="5" y="13" width="22" height="14" rx="2" />
          <path d="M4 9.5h24v3.5H4zM16 9.5V27" />
          <path d="M16 9.5c-1.5-4.5-7-5-7-2 0 2 3.5 2 7 2zM16 9.5c1.5-4.5 7-5 7-2 0 2-3.5 2-7 2z" />
        </>
      )}
      {kind === "discount" && (
        <>
          <path d="M9 23 23 9" />
          <circle cx="10.5" cy="10.5" r="3" />
          <circle cx="21.5" cy="21.5" r="3" />
        </>
      )}
      {kind === "coupon" && (
        <>
          <path d="M4 10.5a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2V13a3 3 0 0 0 0 6v2.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V19a3 3 0 0 0 0-6z" />
          <path d="M19 9v2.2M19 14.9v2.2M19 20.8V23" />
        </>
      )}
      {kind === "payback" && (
        <>
          <circle cx="16" cy="16" r="11" />
          <path d="M11 12l2.5 8 2.5-6 2.5 6 2.5-8M10 15.5h12" />
        </>
      )}
      {kind === "bundle" && (
        <>
          <circle cx="12" cy="16" r="7" />
          <circle cx="20" cy="16" r="7" />
        </>
      )}
      {kind === "wearable" && (
        <>
          <rect x="10" y="10" width="12" height="12" rx="3.5" />
          <path d="M12 10l1-5h6l1 5M12 22l1 5h6l1-5M16 14v2.5l1.5 1" />
        </>
      )}
      {kind === "general" && (
        <>
          <path d="M5 17.5V7a2 2 0 0 1 2-2h10.5L27 14.5a2 2 0 0 1 0 2.8L19.3 25a2 2 0 0 1-2.8 0z" />
          <circle cx="11" cy="11" r="1.8" />
        </>
      )}
    </svg>
  );
}
