import { StatusLine, type StatusState } from "./ui";

export type StepState = StatusState;
export type Step = { label: string; state: StepState; note?: string };

// 지금 무엇을 기다리고 있는지 보여 준다. 상태는 요청·응답과 DB에 실제로 나타난
// 레코드로만 채우고, 진행 중인 단계에는 실제로 흐른 시간만 붙인다 (진행률을 꾸며내지 않는다).
export function Steps({ steps, since = null }: { steps: Step[]; since?: number | null }) {
  return (
    <ol className="flex flex-col gap-1.5" aria-live="polite">
      {steps.map((step, index) => (
        <li key={index}>
          <StatusLine state={step.state} label={step.label} note={step.note} since={since} />
        </li>
      ))}
    </ol>
  );
}
