"use client";

import { useState } from "react";
import { Button, ErrorNote, inputClass } from "@/components/ui";
import { CONSENT_ITEMS, CUSTOMER_FIELDS, isValidPhone, type ConsentKey, type FieldDef, type FieldKey } from "@/lib/fields";
import { formatDate, formatPhone, formatWon } from "@/lib/format";

type Values = Record<FieldKey, string>;
type Consents = Record<ConsentKey, boolean>;

const EMPTY_VALUES = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f.key, ""])) as Values;
const REQUIRED = CUSTOMER_FIELDS.filter((f) => f.required);
const OPTIONAL = CUSTOMER_FIELDS.filter((f) => !f.required);

function display(field: FieldDef, value: string) {
  if (field.key === "phone") return formatPhone(value);
  if (field.key === "contract_end_date") return formatDate(value);
  if (field.key === "target_monthly_budget") return formatWon(Number(value));
  return field.suffix ? `${value}${field.suffix}` : value;
}

export default function JoinPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [consents, setConsents] = useState<Consents>({ privacy_consent: false, recontact_consent: false, marketing_consent: false });
  const [values, setValues] = useState<Values>(EMPTY_VALUES);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const allChecked = CONSENT_ITEMS.every((item) => consents[item.key]);

  function validate() {
    const next: Partial<Record<FieldKey, string>> = {};
    for (const field of REQUIRED) {
      if (!values[field.key].trim()) next[field.key] = `${field.label}을(를) 입력해 주세요.`;
    }
    if (values.phone.trim() && !isValidPhone(values.phone)) next.phone = "휴대폰 번호 형식을 확인해 주세요. (예: 010-1234-5678)";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) {
      document.querySelector("[aria-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...values, ...consents }),
      });
      const result = await response.json();
      if (result.success) setStep(3);
      else setSubmitError(result.message ?? "접수에 실패했습니다. 직원에게 문의해 주세요.");
    } catch {
      setSubmitError("네트워크 연결을 확인한 뒤 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-white px-5 pb-10 pt-8">
      <header className="mb-7">
        <p className="text-[14px] font-semibold text-brand-600">상담 정보 입력</p>
        <div className="mt-3 flex gap-1.5" aria-label={`3단계 중 ${step}단계`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-brand-600" : "bg-slate-200"}`} />
          ))}
        </div>
      </header>

      {step === 1 && (
        <section className="flex flex-1 flex-col">
          <h1 className="text-[26px] font-bold leading-snug">
            상담 전에
            <br />
            동의가 필요해요
          </h1>
          <label className="mt-7 flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-4">
            <input
              type="checkbox"
              className="size-6 accent-brand-600"
              checked={allChecked}
              onChange={(e) =>
                setConsents({ privacy_consent: e.target.checked, recontact_consent: e.target.checked, marketing_consent: e.target.checked })
              }
            />
            <span className="text-[17px] font-semibold">전체 동의</span>
          </label>
          <ul className="mt-2 divide-y divide-slate-100">
            {CONSENT_ITEMS.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-4">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-6 shrink-0 accent-brand-600"
                    checked={consents[item.key]}
                    onChange={(e) => setConsents((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                  />
                  <span>
                    <span className="text-[16px] font-semibold">
                      <span className={item.required ? "text-brand-600" : "text-slate-400"}>[{item.required ? "필수" : "선택"}]</span>{" "}
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-slate-500">{item.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <Button size="lg" className="w-full" disabled={!consents.privacy_consent} onClick={() => setStep(2)}>
              다음
            </Button>
            {!consents.privacy_consent && (
              <p className="mt-2 text-center text-[13px] text-slate-500">필수 항목에 동의하시면 다음으로 넘어갈 수 있어요.</p>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-1 flex-col">
          <h1 className="text-[26px] font-bold leading-snug">상담에 필요한 정보를 알려 주세요</h1>
          <div className="mt-6 flex flex-col gap-5">
            {REQUIRED.map((field) => (
              <FieldInput key={field.key} field={field} value={values[field.key]} error={errors[field.key]} onChange={(v) => setValues((p) => ({ ...p, [field.key]: v }))} />
            ))}
          </div>
          <div className="mt-8 rounded-xl bg-slate-50 p-4">
            <p className="text-[16px] font-semibold">더 정확한 추천을 위해 (선택)</p>
            <p className="mt-0.5 text-[13px] text-slate-500">아는 만큼만 입력하셔도 됩니다.</p>
            <div className="mt-4 flex flex-col gap-5">
              {OPTIONAL.map((field) => (
                <FieldInput key={field.key} field={field} value={values[field.key]} error={errors[field.key]} onChange={(v) => setValues((p) => ({ ...p, [field.key]: v }))} />
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3">
            {submitError && <ErrorNote>{submitError}</ErrorNote>}
            <Button size="lg" className="w-full" loading={submitting} onClick={submit}>
              {submitting ? "접수하는 중" : "제출하기"}
            </Button>
            <Button variant="ghost" className="w-full" disabled={submitting} onClick={() => setStep(1)}>
              이전
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-1 flex-col">
          <div className="flex size-14 items-center justify-center rounded-full bg-brand-50 text-[28px] text-brand-600">✓</div>
          <h1 className="mt-5 text-[26px] font-bold leading-snug">접수가 완료됐어요</h1>
          <p className="mt-2 text-[16px] text-slate-600">잠시 후 직원이 입력하신 내용을 바탕으로 상담을 도와드립니다.</p>
          <dl className="mt-7 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {CUSTOMER_FIELDS.filter((f) => values[f.key].trim()).map((field) => (
              <div key={field.key} className="flex gap-4 px-4 py-3 text-[15px]">
                <dt className="w-28 shrink-0 text-slate-500">{field.label}</dt>
                <dd className="font-medium">{display(field, values[field.key].trim())}</dd>
              </div>
            ))}
            <div className="flex gap-4 px-4 py-3 text-[15px]">
              <dt className="w-28 shrink-0 text-slate-500">동의 항목</dt>
              <dd className="font-medium">
                {CONSENT_ITEMS.filter((item) => consents[item.key])
                  .map((item) => item.title.replace(" 동의", ""))
                  .join(", ")}
              </dd>
            </div>
          </dl>
        </section>
      )}
    </main>
  );
}

function FieldInput({ field, value, error, onChange }: { field: FieldDef; value: string; error?: string; onChange: (value: string) => void }) {
  const id = `field-${field.key}`;
  const common = {
    id,
    value,
    placeholder: field.placeholder,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
    className: `${inputClass} !py-3 !text-[16px] ${error ? "!border-rose-400" : ""}`,
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[15px] font-semibold">
        {field.label}
        {field.required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea {...common} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="flex items-center gap-2">
          <input
            {...common}
            type={field.type === "number" ? "text" : field.type}
            inputMode={field.type === "number" ? "numeric" : field.type === "tel" ? "tel" : undefined}
            autoComplete={field.key === "customer_name" ? "name" : field.key === "phone" ? "tel" : "off"}
            onChange={(e) => onChange(field.type === "number" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value)}
          />
          {field.suffix && <span className="shrink-0 text-[15px] text-slate-500">{field.suffix}</span>}
        </div>
      )}
      {field.hint && !error && <p className="mt-1 text-[13px] text-slate-500">{field.hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
