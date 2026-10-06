import { Spinner } from "./ui";

export type StepState = "waiting" | "active" | "done" | "error";
export type Step = { label: string; state: StepState; note?: string };

// n8n 워크플로우가 지금 어느 단계인지 보여 준다. 상태는 요청·응답과 DB에 실제로
// 나타난 레코드로만 채운다 (타이머로 꾸며내지 않는다).
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col gap-2 rounded-lg bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-200">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-2.5 text-[14px]">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
            {step.state === "active" && <Spinner className="text-brand-600" />}
            {step.state === "done" && (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand-600 text-[12px] font-bold text-white">✓</span>
            )}
            {step.state === "error" && (
              <span className="flex size-5 items-center justify-center rounded-full bg-rose-600 text-[12px] font-bold text-white">!</span>
            )}
            {step.state === "waiting" && <span className="size-2 rounded-full bg-slate-300" />}
          </span>
          <span className={step.state === "waiting" ? "text-slate-400" : step.state === "active" ? "font-semibold text-ink" : "text-slate-700"}>
            {step.label}
            {step.note && <span className="ml-2 font-normal text-slate-500">{step.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
