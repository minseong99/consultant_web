import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import device from "@/public/devices/DEV-001.webp";

// 첫 화면 오른쪽의 움직이는 그림. 휴대폰 틀 안에서 실제 서비스 화면을 줄인 네 장이 차례로 바뀐다:
// 접수 → 맞춤 추천 → 월 요금 비교 → 상담 후 안내 문자.
// 꾸밈용이라 화면 낭독기에서는 숨긴다(aria-hidden). 내용은 흐름을 설명하는 예시다.
// 움직임은 app/globals.css 의 hero-* 규칙이 맡는다. 움직임 줄이기 설정에서는 추천 화면 한 장으로 멈춘다.

const STEPS = ["접수", "추천", "비교", "안내"];

/** 화면이 뜬 뒤 after 초에 나타나게 한다. screen 은 0부터 센 화면 순서(한 장에 4초). */
const delay = (screen: number, after: number) => ({ "--d": `${screen * 4 + after}s` }) as CSSProperties;

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="hero-screen absolute inset-0 flex flex-col px-4 pb-4 pt-3">
      <p className="text-[11px] font-semibold text-stone-500">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-stone-500">{label}</p>
      <p className="mt-0.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[12px] font-medium">{value}</p>
    </div>
  );
}

export function HeroFlow() {
  return (
    <div aria-hidden className="w-[17rem] select-none">
      {/* 휴대폰 틀 */}
      <div className="rounded-[2.25rem] bg-ink p-2 shadow-[0_30px_60px_-24px_rgb(28_25_23/0.45)]">
        <div className="relative h-[27rem] overflow-hidden rounded-[1.75rem] bg-canvas">
          <span className="absolute left-1/2 top-2 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-ink" />
          <div className="absolute inset-0 top-7">
            <Screen title="상담 접수">
              <p className="mt-2 text-[16px] font-bold leading-snug">
                상담에 필요한 내용을
                <br />
                알려 주세요
              </p>
              <div className="mt-3 space-y-2.5">
                <Field label="현재 사용 기기" value="Galaxy S22" />
                <Field label="현재 요금제" value="초이스90 유튜브 프리미엄" />
                <div>
                  <p className="text-[10px] text-stone-500">주요 사용 패턴</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {["유튜브·OTT 시청", "사진·영상 촬영", "게임"].map((chip, index) => (
                      <span key={chip} className="hero-pop rounded-full bg-ink px-2 py-1 text-[10px] font-semibold text-white" style={delay(0, 0.6 + index * 0.5)}>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="mt-auto flex h-9 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">접수하기</span>
            </Screen>

            <Screen title="상담 화면">
              <p className="mt-2 text-[16px] font-bold">고객님을 위한 추천</p>
              <div className="surface mt-3 !rounded-2xl p-3 ring-2 ring-inset ring-brand-600">
                <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">1순위 추천</span>
                <span className="mt-2 flex h-28 items-center justify-center rounded-xl bg-stone-100">
                  <Image src={device} alt="" priority className="h-24 w-auto object-contain mix-blend-multiply" />
                </span>
                <p className="mt-2 text-[10px] text-stone-500">기기 · Samsung</p>
                <p className="text-[14px] font-bold">Galaxy S26 256GB</p>
                <p className="text-[11px] tabular-nums text-stone-600">기기 가격 1,254,000원</p>
                <p className="mt-2 text-[10px] text-stone-500">요금제</p>
                <p className="text-[13px] font-bold">초이스90 유튜브 프리미엄</p>
                <p className="text-[11px] tabular-nums text-stone-600">월 90,000원</p>
              </div>
            </Screen>

            <Screen title="상담 화면">
              <p className="mt-2 text-[16px] font-bold">월 요금 비교</p>
              <div className="surface mt-3 !rounded-2xl p-3">
                <p className="text-[11px] leading-relaxed text-stone-700">1순위 요금제의 월 요금은 지금과 같습니다.</p>
                {[
                  { tag: "지금", name: "초이스90", fee: "90,000원", width: "75%", tone: "bg-stone-400" },
                  { tag: "1순위", name: "초이스90", fee: "90,000원", width: "75%", tone: "bg-brand-600" },
                  { tag: "2순위", name: "초이스 더블", fee: "120,000원", width: "100%", tone: "bg-stone-700" },
                  { tag: "3순위", name: "요고61", fee: "61,000원", width: "51%", tone: "bg-stone-700" },
                ].map((bar, index) => (
                  <div key={bar.tag} className="mt-3">
                    <p className="flex justify-between text-[10px]">
                      <span>
                        <span className={`mr-1 font-bold ${index === 1 ? "text-brand-700" : "text-stone-600"}`}>{bar.tag}</span>
                        <span className="font-semibold">{bar.name}</span>
                      </span>
                      <span className="font-bold tabular-nums">{bar.fee}</span>
                    </p>
                    <span className="mt-1 block h-2 rounded-r bg-stone-100">
                      <span className={`hero-bar block h-full rounded-r ${bar.tone}`} style={{ width: bar.width, ...delay(2, 0.3 + index * 0.25) }} />
                    </span>
                  </div>
                ))}
              </div>
            </Screen>

            <Screen title="문자 메시지">
              <p className="mt-2 text-[16px] font-bold">상담 후 안내</p>
              <p className="mt-4 text-center text-[10px] text-stone-500">재방문 하루 전 · 오전 10:00</p>
              <p className="hero-pop mt-2 max-w-[13rem] origin-top-left rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 text-[12px] leading-relaxed shadow-sm" style={delay(3, 0.5)}>
                지난 상담에서 안내드린 Galaxy S26과 초이스90 요금제 관련해 내일 재방문 예정이라 연락드립니다.
              </p>
              <p className="hero-pop mt-2 max-w-[13rem] origin-top-left rounded-2xl rounded-tl-sm bg-white px-3 py-2.5 text-[12px] leading-relaxed shadow-sm" style={delay(3, 1.4)}>
                방문 가능하신 시간 알려 주시면 준비하겠습니다.
              </p>
            </Screen>
          </div>
        </div>
      </div>

      {/* 지금 보이는 단계 */}
      <ol className="mt-4 flex justify-center gap-1">
        {STEPS.map((step) => (
          <li key={step} className="hero-step rounded-full px-3 py-1 text-[12px] font-semibold text-stone-400">
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
