import Link from "next/link";

// 시연용 진입 페이지. 두 화면으로 가는 버튼만 둔다.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <header>
        <p className="text-[15px] font-semibold text-brand-600">KT 매장 상담 지원 AI Agent</p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight">시연 화면 선택</h1>
        <p className="mt-3 text-[16px] text-slate-600">
          고객이 정보를 입력하면 AI가 분석·추천하고, 상담 결과에 따라 후속 연락 일정과 문자를 자동으로 준비합니다.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/join" className="group rounded-2xl bg-white p-6 ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand-500">
          <p className="text-[13px] font-semibold text-slate-500">고객용 · 모바일</p>
          <p className="mt-1 text-[22px] font-bold">상담 정보 입력</p>
          <p className="mt-2 text-[15px] text-slate-600">동의를 받고 상담에 필요한 정보를 입력합니다.</p>
          <p className="mt-5 text-[15px] font-semibold text-brand-600">/join 열기 →</p>
        </Link>
        <Link href="/staff" className="group rounded-2xl bg-white p-6 ring-1 ring-slate-200 transition hover:ring-2 hover:ring-brand-500">
          <p className="text-[13px] font-semibold text-slate-500">직원용 · PC</p>
          <p className="mt-1 text-[22px] font-bold">상담 대시보드</p>
          <p className="mt-2 text-[15px] text-slate-600">고객 분석·추천을 보고 상담 결과와 후속 연락을 관리합니다.</p>
          <p className="mt-5 text-[15px] font-semibold text-brand-600">/staff 열기 →</p>
        </Link>
      </div>
    </main>
  );
}
