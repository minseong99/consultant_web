import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const STEPS = [
  { title: "정보 입력", body: "쓰고 있는 기기와 요금제, 상담받고 싶은 내용을 알려 주세요. 1~2분이면 됩니다." },
  { title: "맞춤 상담", body: "직원이 입력하신 내용을 미리 확인하고, 꼭 맞는 기기와 요금제를 안내해 드립니다." },
  { title: "상담 후 안내", body: "동의하신 경우 약정 만료나 재방문 일정을 문자로 챙겨 드립니다." },
];

// 서비스 첫 화면. 매장에서 QR로 들어온 고객이 바로 접수를 시작하고, 직원은 위쪽에서 로그인한다.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
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
        <section className="max-w-xl">
          <h1 className="text-[32px] font-bold leading-tight sm:text-[40px]">
            매장 상담,
            <br />
            미리 알려 주시면 더 빨라요
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-stone-600">
            기다리는 동안 간단한 정보를 입력해 주세요. 직원이 내용을 확인하고 고객님께 맞는 기기와 요금제를 바로 안내해 드립니다.
          </p>
          <Link
            href="/join"
            className="mt-8 inline-flex h-14 w-full items-center justify-center rounded-xl bg-brand-600 px-8 text-[17px] font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:w-auto"
          >
            상담 접수하기
          </Link>
          <p className="mt-3 text-[13px] text-stone-500">개인정보 수집·이용 동의 후 진행됩니다.</p>
        </section>

        <ol className="mt-14 grid gap-6 border-t border-stone-200 pt-8 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <p className="text-[13px] font-bold tabular-nums text-stone-500">{index + 1}</p>
              <p className="mt-1 text-[16px] font-bold">{step.title}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-stone-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
