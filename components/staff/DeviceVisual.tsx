import Image, { type StaticImageData } from "next/image";
import s26 from "@/public/devices/DEV-001.webp";
import fold8 from "@/public/devices/DEV-002.webp";
import flip8 from "@/public/devices/DEV-003.webp";
import iphone17 from "@/public/devices/DEV-004.webp";
import iphone17Pro from "@/public/devices/DEV-005.webp";

// 기기 사진. 사진 파일이 있으면 그것을 쓰고, 없으면 기기 형태(일반/폴드/플립)를 그린 그림을 보여 준다.
// 사진을 넣으려면 public/devices/ 에 파일을 두고 import 와 아래 표에 한 줄씩 추가한다. 키는 추천 결과의 product_id 다.
const DEVICE_IMAGES: Record<string, StaticImageData> = {
  "DEV-001": s26, // Galaxy S26
  "DEV-002": fold8, // Galaxy Z Fold8
  "DEV-003": flip8, // Galaxy Z Flip8
  "DEV-004": iphone17, // iPhone 17
  "DEV-005": iphone17Pro, // iPhone 17 Pro
  // 샘플 데이터 모드의 기기 ID
  "DEV-S26": s26,
  "DEV-IP17": iphone17,
};

type Form = "bar" | "fold" | "flip";
type Look = { form: Form; body: string; edge: string; lenses: 2 | 3; apple: boolean };

// 기기 이름으로 형태와 계열만 구분한다. 실제 제품의 디자인을 옮긴 것이 아니라 구분을 돕는 일반적인 그림이다.
function lookOf(name: string | null): Look {
  const text = (name ?? "").toLowerCase();
  const apple = text.includes("iphone") || text.includes("아이폰");
  const form: Form = text.includes("fold") || text.includes("폴드") ? "fold" : text.includes("flip") || text.includes("플립") ? "flip" : "bar";
  const pro = /pro|ultra|프로|울트라/.test(text);
  return {
    form,
    apple,
    lenses: form === "flip" ? 2 : apple && !pro ? 2 : 3,
    // 뒷면 색. 계열마다 살짝 다르게 해서 카드 두 장이 나란히 있을 때 구분되게 한다.
    body: apple ? (pro ? "#57534e" : "#e7e5e4") : form === "bar" ? (pro ? "#44403c" : "#d6dbe4") : "#cfd8d3",
    edge: apple && !pro ? "#a8a29e" : "#78716c",
  };
}

export function DeviceVisual({ productId, deviceName }: { productId: string | null; deviceName: string | null }) {
  const photo = productId ? DEVICE_IMAGES[productId] : undefined;
  return (
    <span className="flex h-28 w-24 shrink-0 items-center justify-center rounded-lg bg-stone-100">
      {photo ? <Image src={photo} alt={deviceName ?? "추천 기기"} className="h-24 w-auto rounded object-contain mix-blend-multiply" /> : <Illustration look={lookOf(deviceName)} />}
    </span>
  );
}

function Lens({ cx, cy, dark }: { cx: number; cy: number; dark: boolean }) {
  return (
    <>
      <circle cx={cx} cy={cy} r="3.6" fill={dark ? "#292524" : "#44403c"} />
      <circle cx={cx} cy={cy} r="1.5" fill={dark ? "#57534e" : "#78716c"} />
    </>
  );
}

// 기기 뒷면 그림 (viewBox 72 x 96)
function Illustration({ look }: { look: Look }) {
  const { form, body, edge, lenses, apple } = look;
  const dark = body === "#44403c" || body === "#57534e";
  const line = { stroke: edge, strokeWidth: 1.4 };
  return (
    <svg aria-hidden viewBox="0 0 72 96" className="h-24">
      {form === "bar" && (
        <>
          <rect x="18" y="6" width="36" height="84" rx="8" fill={body} {...line} />
          {apple ? (
            <>
              <rect x="22" y="10" width={lenses === 3 ? 20 : 12} height={lenses === 3 ? 20 : 22} rx="5" fill={dark ? "#44403c" : "#d6d3d1"} {...line} />
              <Lens cx={lenses === 3 ? 27.5 : 28} cy={15.5} dark={dark} />
              <Lens cx={lenses === 3 ? 27.5 : 28} cy={lenses === 3 ? 24.5 : 26.5} dark={dark} />
              {lenses === 3 && <Lens cx={36.5} cy={20} dark={dark} />}
            </>
          ) : (
            <>
              <Lens cx={27} cy={16} dark={dark} />
              <Lens cx={27} cy={26} dark={dark} />
              <Lens cx={27} cy={36} dark={dark} />
            </>
          )}
        </>
      )}
      {form === "fold" && (
        <>
          <rect x="6" y="10" width="60" height="76" rx="6" fill={body} {...line} />
          <path d="M36 10v76" stroke={edge} strokeWidth="1.4" strokeDasharray="2.5 3.5" />
          <Lens cx={14} cy={19} dark={dark} />
          <Lens cx={14} cy={29} dark={dark} />
          <Lens cx={14} cy={39} dark={dark} />
        </>
      )}
      {form === "flip" && (
        <>
          <rect x="19" y="6" width="34" height="84" rx="8" fill={body} {...line} />
          <path d="M19 48h34" stroke={edge} strokeWidth="1.4" strokeDasharray="2.5 3.5" />
          <rect x="23" y="11" width="26" height="24" rx="4" fill="#292524" />
          <Lens cx={29} cy={18} dark />
          <Lens cx={29} cy={28} dark />
        </>
      )}
    </svg>
  );
}
