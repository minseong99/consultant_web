import Image from "next/image";
import device from "@/public/devices/DEV-001.webp";

// 첫 화면 오른쪽의 움직이는 그림. 접수 → AI 분석 → 맞춤 추천 → 안내 문자의 흐름을 차례로 보여 준다.
// 꾸밈용이라 화면 낭독기에서는 숨긴다(aria-hidden). 내용은 흐름을 설명하는 예시다.
// 움직임은 app/globals.css 의 hero-* 규칙이 맡는다. 움직임 줄이기 설정에서는 멈춘 그림으로 보인다.

function Step({ label, tone = "plain", children }: { label: string; tone?: "plain" | "ai"; children: React.ReactNode }) {
  return (
    <li className="hero-card relative pl-9">
      {/* 왼쪽 줄 위의 점 */}
      <span className={`absolute left-[7px] top-4 size-2.5 rounded-full ring-4 ring-canvas ${tone === "ai" ? "bg-info" : "bg-stone-400"}`} />
      <div className={`rounded-2xl px-4 py-3.5 shadow-sm ring-1 ${tone === "ai" ? "bg-ai-surface ring-ai-line" : "bg-white ring-stone-200"}`}>
        <p className={`text-[12px] font-semibold ${tone === "ai" ? "text-info" : "text-stone-500"}`}>{label}</p>
        {children}
      </div>
    </li>
  );
}

export function HeroFlow() {
  return (
    <div aria-hidden className="relative w-[21rem] select-none">
      {/* 단계를 잇는 줄. 위에서 아래로 빛이 흐른다. */}
      <span className="absolute bottom-6 left-3 top-6 w-px bg-stone-300" />
      <span className="hero-beam absolute left-[10px] top-6 h-10 w-[5px] rounded-full" />

      <ol className="flex flex-col gap-3.5">
        <Step label="고객 입력">
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["유튜브·OTT 시청", "사진·영상 촬영", "기기 변경"].map((chip) => (
              <span key={chip} className="hero-chip rounded-full bg-stone-100 px-2.5 py-1 text-[12px] font-medium text-stone-700">
                {chip}
              </span>
            ))}
          </div>
        </Step>

        <Step label="✦ AI 분석" tone="ai">
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">영상 시청이 많고 기기를 바꿀 시기예요</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <span className="hero-line h-1.5 w-full rounded-full" />
            <span className="hero-line h-1.5 w-2/3 rounded-full" />
          </div>
        </Step>

        <Step label="맞춤 추천">
          <div className="mt-2 flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-stone-100">
              <Image src={device} alt="" priority className="h-12 w-auto object-contain mix-blend-multiply" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold">Galaxy S26</p>
              <p className="text-[12px] text-stone-600">데이터 무제한 요금제와 함께</p>
            </div>
            <span className="ml-auto rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-inset ring-red-200">1순위</span>
          </div>
        </Step>

        <Step label="상담 후 안내 문자">
          <p className="mt-1.5 rounded-xl rounded-tl-sm bg-stone-100 px-3 py-2 text-[13px] leading-relaxed text-stone-800">
            내일 재방문 전에, 지난 상담에서 안내드린 내용을 다시 알려 드려요.
          </p>
        </Step>
      </ol>
    </div>
  );
}
