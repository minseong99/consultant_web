import Link from "next/link";
import { HeroFlow } from "@/components/HeroFlow";
import { Wordmark } from "@/components/Wordmark";

const STEPS = [
  { title: "정보 입력", body: "쓰고 있는 기기와 요금제, 상담받고 싶은 내용을 알려 주세요. 1~2분이면 됩니다." },
  { title: "맞춤 상담", body: "직원이 입력하신 내용을 미리 확인하고, 꼭 맞는 기기와 요금제를 안내해 드립니다." },
  { title: "상담 후 안내", body: "동의하신 경우 약정 만료나 재방문 일정을 문자로 챙겨 드립니다." },
];

// 서비스 첫 화면. 매장에서 QR로 들어온 고객이 바로 접수를 시작하고, 직원은 위쪽에서 로그인한다.
export default function Home() {
  return (
    <div className="home-glow flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Wordmark />
        <Link
          href="/staff"
          className="flex min-h-11 items-center rounded-lg px-3 text-[14px] font-semibold text-stone-700 hover:bg-stone-100 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          직원 로그인
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 pb-16 pt-6">
        <div className="flex items-center justify-between gap-12">
        <section className="max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3.5 py-1.5 text-[13px] font-semibold text-stone-700 shadow-sm">
            <span aria-hidden className="size-1.5 rounded-full bg-brand-600" />
            어서 오세요, 반갑습니다
          </p>
          <h1 className="mt-5 text-[34px] font-bold leading-[1.2] sm:text-[46px]">
            기다리는 동안,
            <br />
            상담 준비를 마쳐 둘게요
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed text-stone-600">
            1~2분만 내어 주세요. 직원이 미리 살펴보고 고객님께 꼭 맞는 기기와 요금제를 준비해 두겠습니다.
          </p>
          <Link
            href="/join"
            className="mt-9 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand-600 px-9 text-[17px] font-semibold text-white shadow-[0_12px_28px_-10px_rgb(200_30_30/0.55)] transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto"
          >
            상담 접수하기
            <span aria-hidden>→</span>
          </Link>
          <p className="mt-4 text-[13px] text-stone-500">개인정보 수집·이용 동의 후 진행됩니다.</p>
        </section>
          {/* 넓은 화면에서만 보인다. 휴대폰으로 접수하는 고객에게는 글과 버튼만 보여 준다. */}
          <div className="hidden shrink-0 lg:block">
            <HeroFlow />
          </div>
        </div>

        <ol className="mt-16 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-[14px] font-bold tabular-nums text-brand-700 shadow-sm">
                {index + 1}
              </span>
              <span>
                <span className="block text-[16px] font-bold">{step.title}</span>
                <span className="mt-1 block text-[14px] leading-relaxed text-stone-600">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
