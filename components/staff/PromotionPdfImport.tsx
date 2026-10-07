"use client";

import { useRef, useState } from "react";
import { Badge, Button, Disclosure, Drawer, ErrorNote, inputClass, SourceLabel, StatusLine } from "@/components/ui";
import { todayKST } from "@/lib/format";
import type { PromotionDraft, PromotionParseResult, PromotionRegisterResult } from "@/lib/types";

// PDF로 프로모션 등록: 파일 선택 → (서버) 원본 보관·글자 추출·AI가 프로모션별로 나눔 → 직원 확인·수정 → 고른 것만 등록.
// 기간이 없는 프로모션은 직원이 기간을 넣어야 등록할 수 있다. 이미 등록된 이름은 다시 저장하지 않는다.

type Item = PromotionDraft & {
  id: number;
  selected: boolean;
  state?: "saving" | "done" | "kept" | "failed";
  message?: string;
};

type Phase = "pick" | "parsing" | "review" | "saving" | "done";

const labelClass = "mb-1 block text-[12px] font-semibold text-stone-600";
const clock = () => Date.now();

const hasPeriod = (item: PromotionDraft) => Boolean(item.valid_from && item.valid_until);
const isEnded = (item: PromotionDraft) => Boolean(item.valid_until) && item.valid_until < todayKST();

/** 등록할 수 없는 이유. 없으면 null */
function problemOf(item: Item) {
  if (!item.promotion_name.trim()) return "이름을 입력해 주세요.";
  if (!hasPeriod(item)) return "기간을 입력해 주세요.";
  if (item.valid_from > item.valid_until) return "종료일이 시작일보다 빠릅니다.";
  if (!item.benefit.trim()) return "혜택을 입력해 주세요.";
  return null;
}

export function PromotionPdfImport({ open, onClose, onRegistered }: { open: boolean; onClose: () => void; onRegistered: (documentIds: string[]) => void }) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [startedAt, setStartedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [fill, setFill] = useState({ from: "", until: "" });
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setPhase("pick");
    setError(null);
    setItems([]);
    setFileName("");
    setFilePath("");
    setFill({ from: "", until: "" });
    setChecked(false);
  }

  function close() {
    if (phase === "parsing" || phase === "saving") return;
    reset();
    onClose();
  }

  async function upload(file: File) {
    setError(null);
    setFileName(file.name);
    setStartedAt(clock());
    setPhase("parsing");
    const body = new FormData();
    body.append("file", file);
    let result: PromotionParseResult;
    try {
      const response = await fetch("/api/staff/promotions/upload", { method: "POST", body });
      result = await response.json();
    } catch {
      result = { success: false, error_code: "NETWORK", message: "파일을 올리지 못했습니다. 네트워크 연결과 파일 크기(4MB 이하)를 확인해 주세요." };
    }
    if (!result.success) {
      setError(result.message);
      setPhase("pick");
      return;
    }
    setFilePath(result.file_path);
    // 바로 등록할 수 있는 것(기간이 있고, 끝나지 않았고, 아직 등록되지 않은 것)만 미리 골라 둔다.
    setItems(result.promotions.map((draft, index) => ({ ...draft, id: index, selected: !draft.exists && hasPeriod(draft) && !isEnded(draft) })));
    setPhase("review");
  }

  const update = (id: number, patch: Partial<Item>) => setItems((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function applyFill() {
    if (!fill.from || !fill.until) return;
    setItems((list) => list.map((item) => (item.exists || hasPeriod(item) ? item : { ...item, valid_from: fill.from, valid_until: fill.until })));
  }

  async function registerSelected() {
    setChecked(true);
    const targets = items.filter((item) => item.selected && !item.exists);
    if (targets.length === 0 || targets.some(problemOf)) return;
    setPhase("saving");
    setStartedAt(clock());
    const registeredIds: string[] = [];
    // 한 건씩 차례로 등록한다. 건마다 본문 임베딩과 저장이 일어난다.
    for (const item of targets) {
      update(item.id, { state: "saving", message: undefined });
      let result: PromotionRegisterResult;
      try {
        const response = await fetch("/api/staff/promotions/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            promotion_name: item.promotion_name.trim(),
            valid_from: item.valid_from,
            valid_until: item.valid_until,
            benefit: item.benefit,
            promotion_type: item.promotion_type,
            target_device: item.target_device,
            target_plan: item.target_plan,
            target_customer: item.target_customer,
            conditions: item.conditions,
            file_path: filePath,
          }),
        });
        result = await response.json();
      } catch {
        result = { success: false, error_code: "NETWORK", message: "네트워크 연결을 확인해 주세요." };
      }
      if (!result.success) {
        update(item.id, { state: "failed", message: result.message });
      } else if (result.already_exists) {
        update(item.id, { state: "kept" });
      } else {
        registeredIds.push(result.document_id);
        update(item.id, { state: "done" });
      }
    }
    setPhase("done");
    onRegistered(registeredIds);
  }

  const selectable = items.filter((item) => !item.exists);
  const selected = selectable.filter((item) => item.selected);
  const missingPeriod = selectable.filter((item) => !hasPeriod(item)).length;
  const existing = items.length - selectable.length;
  const count = (state: Item["state"]) => items.filter((item) => item.state === state).length;
  const editable = phase === "review";

  return (
    <Drawer open={open} title="PDF로 프로모션 등록" onClose={close}>
      {phase === "pick" && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] leading-relaxed text-stone-700">
            프로모션 안내 PDF를 올리면 안에 든 프로모션을 하나씩 나눠 보여 드립니다. 내용을 확인하고 고친 뒤, 등록할 것만 골라 저장합니다.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            aria-label="프로모션 PDF 파일"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) upload(file);
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files?.[0];
              if (file) upload(file);
            }}
            className="flex min-h-36 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 text-center transition-colors hover:border-stone-400 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span className="text-[15px] font-semibold">PDF 파일 선택</span>
            <span className="text-[13px] text-stone-500">눌러서 고르거나 파일을 여기에 끌어다 놓으세요</span>
          </button>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-stone-600">
            <li>한 파일에 프로모션이 여러 개 들어 있어도 됩니다.</li>
            <li>4MB 이하, 글자를 선택할 수 있는 PDF만 읽을 수 있습니다. 스캔한 문서는 [직접 입력]을 써 주세요.</li>
            <li>이미 등록된 프로모션은 다시 저장되지 않습니다.</li>
          </ul>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      )}

      {phase === "parsing" && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <p className="truncate text-[14px] font-semibold">{fileName}</p>
          <StatusLine state="active" label="문서를 읽고 프로모션을 나누는 중" since={startedAt} note="파일을 보관하고 내용을 분석합니다 · 문서가 길면 1분쯤 걸립니다" />
        </div>
      )}

      {(phase === "review" || phase === "saving" || phase === "done") && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="truncate text-[13px] text-stone-500">{fileName}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <SourceLabel source="ai" label="AI 문서 분석" />
              <span className="text-[16px] font-bold tabular-nums">프로모션 {items.length}건</span>
              {existing > 0 && <span className="text-[13px] text-stone-600">이미 등록됨 {existing}건</span>}
            </p>
            {phase === "review" && <p className="mt-1.5 text-[13px] text-stone-600">문서에서 읽은 내용입니다. 등록 전에 이름·기간·혜택을 확인해 주세요. 기간은 안내 문자가 나가는 날짜를 정합니다.</p>}
          </div>

          {phase === "review" && missingPeriod > 0 && (
            <div className="rounded-lg bg-amber-50 px-3.5 py-3 ring-1 ring-amber-200">
              <p className="text-[13px] font-semibold text-stone-800">기간이 없는 프로모션 {missingPeriod}건</p>
              <p className="mt-0.5 text-[12px] text-stone-600">등록하려면 기간이 필요합니다. 아래에서 한 번에 넣거나 항목마다 따로 넣을 수 있습니다.</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col text-[12px] font-semibold text-stone-600">
                  시작일
                  <input type="date" className={`${inputClass} mt-1 !w-36 !py-1.5 !text-[13px]`} value={fill.from} onChange={(e) => setFill((f) => ({ ...f, from: e.target.value }))} />
                </label>
                <label className="flex flex-col text-[12px] font-semibold text-stone-600">
                  종료일
                  <input type="date" className={`${inputClass} mt-1 !w-36 !py-1.5 !text-[13px]`} value={fill.until} onChange={(e) => setFill((f) => ({ ...f, until: e.target.value }))} />
                </label>
                <Button type="button" size="sm" variant="secondary" disabled={!fill.from || !fill.until || fill.from > fill.until} onClick={applyFill}>
                  기간 없는 항목에 넣기
                </Button>
              </div>
            </div>
          )}

          <ul className="flex flex-col gap-2.5">
            {items.map((item) => {
              const problem = item.selected && !item.exists ? problemOf(item) : null;
              const fieldId = (name: string) => `pdf-promo-${item.id}-${name}`;
              return (
                <li key={item.id} className={`rounded-xl px-3.5 py-3 ring-1 ${item.exists ? "bg-stone-50 ring-stone-200" : item.selected ? "bg-white ring-stone-400" : "bg-white ring-stone-200"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0 accent-brand-600"
                      aria-label={`${item.promotion_name} 등록`}
                      checked={item.selected && !item.exists}
                      disabled={item.exists || !editable}
                      onChange={(event) => update(item.id, { selected: event.target.checked })}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15px] font-bold">{item.promotion_name}</span>
                        {item.exists && <Badge tone="gray">이미 등록됨</Badge>}
                        {!item.exists && !hasPeriod(item) && <Badge tone="amber">기간 없음</Badge>}
                        {!item.exists && hasPeriod(item) && isEnded(item) && <Badge tone="gray">기간 종료</Badge>}
                      </p>
                      <p className="mt-0.5 text-[13px] text-stone-600">{item.benefit || "혜택 내용 없음"}</p>
                      {item.exists && <p className="mt-1 text-[12px] text-stone-500">같은 이름의 프로모션이 있어 기존 것을 그대로 씁니다.</p>}

                      {!item.exists && (
                        <>
                          <div className="mt-2.5 grid grid-cols-2 gap-2">
                            <div>
                              <label htmlFor={fieldId("from")} className={labelClass}>
                                시작일
                              </label>
                              <input id={fieldId("from")} type="date" disabled={!editable} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.valid_from} onChange={(e) => update(item.id, { valid_from: e.target.value })} />
                            </div>
                            <div>
                              <label htmlFor={fieldId("until")} className={labelClass}>
                                종료일
                              </label>
                              <input id={fieldId("until")} type="date" disabled={!editable} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.valid_until} onChange={(e) => update(item.id, { valid_until: e.target.value })} />
                            </div>
                          </div>
                          {hasPeriod(item) && isEnded(item) && <p className="mt-1 text-[12px] text-stone-500">기간이 끝난 프로모션은 등록해도 대상 선정을 실행할 수 없습니다.</p>}

                          {editable && (
                            <Disclosure label="내용 확인·수정" openLabel="내용 접기" className="mt-2">
                              <div className="flex flex-col gap-2.5">
                                <div>
                                  <label htmlFor={fieldId("name")} className={labelClass}>
                                    프로모션 이름
                                  </label>
                                  <input id={fieldId("name")} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.promotion_name} onChange={(e) => update(item.id, { promotion_name: e.target.value })} />
                                </div>
                                <div>
                                  <label htmlFor={fieldId("benefit")} className={labelClass}>
                                    혜택 (안내 문자에 들어갑니다)
                                  </label>
                                  <textarea id={fieldId("benefit")} rows={2} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.benefit} onChange={(e) => update(item.id, { benefit: e.target.value })} />
                                </div>
                                <div>
                                  <label htmlFor={fieldId("device")} className={labelClass}>
                                    대상 기기
                                  </label>
                                  <input id={fieldId("device")} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.target_device} onChange={(e) => update(item.id, { target_device: e.target.value })} />
                                </div>
                                <div>
                                  <label htmlFor={fieldId("plan")} className={labelClass}>
                                    대상 요금제
                                  </label>
                                  <input id={fieldId("plan")} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.target_plan} onChange={(e) => update(item.id, { target_plan: e.target.value })} />
                                </div>
                                <div>
                                  <label htmlFor={fieldId("customer")} className={labelClass}>
                                    대상 고객
                                  </label>
                                  <input id={fieldId("customer")} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.target_customer} onChange={(e) => update(item.id, { target_customer: e.target.value })} />
                                </div>
                                <div>
                                  <label htmlFor={fieldId("conditions")} className={labelClass}>
                                    조건
                                  </label>
                                  <textarea id={fieldId("conditions")} rows={2} className={`${inputClass} !py-1.5 !text-[13px]`} value={item.conditions} onChange={(e) => update(item.id, { conditions: e.target.value })} />
                                </div>
                              </div>
                            </Disclosure>
                          )}
                        </>
                      )}

                      {checked && problem && editable && <p className="mt-1.5 text-[12px] font-semibold text-danger">{problem}</p>}
                      {item.state === "saving" && <p className="mt-2"><StatusLine state="active" label="등록하는 중" /></p>}
                      {item.state === "done" && <p className="mt-2"><StatusLine state="done" label="등록했습니다" /></p>}
                      {item.state === "kept" && <p className="mt-2"><StatusLine state="done" label="이미 있어 기존 것을 그대로 씁니다" /></p>}
                      {item.state === "failed" && <p className="mt-2 text-[12px] font-semibold text-danger">등록하지 못했습니다. {item.message}</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sticky -bottom-5 -mx-6 -mb-5 border-t border-stone-200 bg-white px-6 py-3" aria-live="polite">
            {phase === "review" && (
              <div className="flex items-center gap-2">
                <Button type="button" disabled={selected.length === 0} onClick={registerSelected}>
                  선택한 {selected.length}건 등록
                </Button>
                <Button type="button" variant="ghost" onClick={close}>
                  취소
                </Button>
                {checked && selected.some(problemOf) && <span className="text-[12px] font-semibold text-danger">표시된 항목을 확인해 주세요</span>}
              </div>
            )}
            {phase === "saving" && <StatusLine state="active" label={`등록하는 중 (${count("done") + count("kept") + count("failed")}/${selected.length})`} since={startedAt} />}
            {phase === "done" && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[14px] font-semibold tabular-nums">
                  등록 {count("done")}건{count("kept") > 0 && ` · 기존 것 사용 ${count("kept")}건`}
                  {count("failed") > 0 && ` · 실패 ${count("failed")}건`}
                </span>
                <Button type="button" onClick={close}>
                  닫기
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
