"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Button, Drawer, ErrorNote, inputClass } from "@/components/ui";
import { CONSENT_ITEMS, CUSTOMER_FIELDS, isValidPhone, OTHER_OPTION, type ConsentKey, type FieldDef, type FieldKey, type OptionGroup } from "@/lib/fields";
import { formatDate, formatPhone, formatWon, withObject } from "@/lib/format";
import { Wordmark } from "@/components/Wordmark";

type Values = Record<FieldKey, string>;
type Consents = Record<ConsentKey, boolean>;

const EMPTY_VALUES = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f.key, ""])) as Values;
const REQUIRED = CUSTOMER_FIELDS.filter((f) => f.required);

// 입력 화면의 묶음. 필수 항목을 먼저 끝낼 수 있게 선택 항목은 마지막 묶음에 접어 둔다.
const GROUPS: { title: string; note?: string; keys: FieldKey[]; collapsed?: boolean }[] = [
  { title: "기본 정보", keys: ["customer_name", "phone"] },
  { title: "현재 이용 정보", keys: ["current_device", "current_plan", "device_use_months", "contract_end_date"] },
  { title: "이번 상담", keys: ["usage_pattern", "consultation_goal"] },
  { title: "더 정확한 추천을 위해", note: "선택 항목입니다. 아는 만큼만 입력하셔도 됩니다.", keys: ["age", "target_monthly_budget", "preferred_brand", "interests"], collapsed: true },
];
const FIELD_BY_KEY = Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;

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
  // 기기·요금제 선택지는 DB에서 받아 온다. 받기 전이나 실패했을 때는 lib/fields.ts 의 대비용 목록을 쓴다.
  const [catalog, setCatalog] = useState<Partial<Record<FieldKey, OptionGroup[]>>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/join/options")
      .then((response) => response.json())
      .then((data) => {
        if (!alive || !data.success) return;
        const next: Partial<Record<FieldKey, OptionGroup[]>> = {};
        for (const key of ["current_device", "current_plan"] as const) {
          if (Array.isArray(data[key]) && data[key].length > 0) next[key] = data[key];
        }
        setCatalog(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const fieldOf = (key: FieldKey): FieldDef => {
    const groups = catalog[key];
    return groups ? { ...FIELD_BY_KEY[key], groups, options: groups.flatMap((group) => group.options) } : FIELD_BY_KEY[key];
  };

  const allChecked = CONSENT_ITEMS.every((item) => consents[item.key]);

  function validate() {
    const next: Partial<Record<FieldKey, string>> = {};
    for (const field of REQUIRED) {
      if (!values[field.key].trim()) {
        next[field.key] = `${withObject(field.label)} ${field.type === "select" || field.type === "multi" ? "선택" : "입력"}해 주세요.`;
      }
    }
    if (values.phone.trim() && !isValidPhone(values.phone)) next.phone = "휴대폰 번호를 확인해 주세요. (예: 01012345678)";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit() {
    if (!validate()) {
      document.querySelector("[aria-invalid='true'], [data-invalid='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
        <div className="flex items-center justify-between">
          <Wordmark size="sm" label="상담 접수" />
          <p className="text-[13px] font-semibold tabular-nums text-stone-500">{step === 3 ? "접수 완료" : `${step} / 2`}</p>
        </div>
        <div className="mt-3 flex gap-1.5" aria-label={step === 3 ? "접수 완료" : `2단계 중 ${step}단계`}>
          {[1, 2].map((n) => (
            <span key={n} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${n <= step ? "bg-brand-600" : "bg-stone-200"}`} />
          ))}
        </div>
      </header>

      {step === 1 && (
        <section className="flex flex-1 animate-rise-in flex-col">
          <h1 className="text-[28px] font-bold leading-snug">
            상담 전에
            <br />
            동의가 필요해요
          </h1>
          <p className="mt-2 text-[15px] text-stone-600">상담에 필요한 정보만 받을게요.</p>
          <label className="mt-7 flex cursor-pointer items-center gap-3 rounded-2xl bg-stone-50 px-4 py-4">
            <input
              type="checkbox"
              className="size-6 accent-stone-900"
              checked={allChecked}
              onChange={(e) =>
                setConsents({ privacy_consent: e.target.checked, recontact_consent: e.target.checked, marketing_consent: e.target.checked })
              }
            />
            <span className="text-[17px] font-semibold">전체 동의</span>
          </label>
          <ul className="mt-2 divide-y divide-stone-100">
            {CONSENT_ITEMS.map((item) => (
              <li key={item.key}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-4">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-6 shrink-0 accent-stone-900"
                    checked={consents[item.key]}
                    onChange={(e) => setConsents((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                  />
                  <span>
                    <span className="text-[16px] font-semibold">
                      <span className={item.required ? "text-danger" : "text-stone-500"}>[{item.required ? "필수" : "선택"}]</span>{" "}
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[14px] leading-relaxed text-stone-500">{item.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <Button size="lg" className="w-full !rounded-full" disabled={!consents.privacy_consent} onClick={() => setStep(2)}>
              다음
            </Button>
            {/* 동의 여부에 따라 버튼이 움직이지 않도록 안내 자리는 늘 남긴다. */}
            <p className={`mt-2 text-center text-[13px] text-stone-500 ${consents.privacy_consent ? "invisible" : ""}`} aria-hidden={consents.privacy_consent}>
              필수 항목에 동의하시면 다음으로 넘어갈 수 있어요.
            </p>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-1 animate-rise-in flex-col">
          <h1 className="text-[28px] font-bold leading-snug">
            어떤 상담이 필요하신지
            <br />
            알려 주세요
          </h1>
          <p className="mt-2 text-[15px] text-stone-600">아는 만큼만 적어 주셔도 괜찮아요.</p>
          <div className="mt-6 flex flex-col gap-8">
            {GROUPS.map((group) => {
              const fields = (
                <div className="flex flex-col gap-5">
                  {group.keys.map((key) => (
                    <FieldInput key={key} field={fieldOf(key)} value={values[key]} error={errors[key]} onChange={(v) => setValues((p) => ({ ...p, [key]: v }))} />
                  ))}
                </div>
              );
              return (
                <fieldset key={group.title} className="pt-2">
                  <legend className="float-left mb-4 w-full text-[13px] font-bold text-stone-500">{group.title}</legend>
                  <div className="clear-both">
                    {group.collapsed ? (
                      <OptionalGroup note={group.note}>{fields}</OptionalGroup>
                    ) : (
                      fields
                    )}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-8 flex flex-col gap-3">
            {submitError && <ErrorNote>{submitError}</ErrorNote>}
            <Button size="lg" className="w-full !rounded-full" loading={submitting} onClick={submit}>
              {submitting ? "접수하는 중" : "제출하기"}
            </Button>
            <Button variant="ghost" className="w-full" disabled={submitting} onClick={() => setStep(1)}>
              이전
            </Button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-1 animate-rise-in flex-col">
          <div className="flex size-16 animate-pop-in items-center justify-center rounded-full bg-emerald-50 text-[30px] font-bold text-success">✓</div>
          <h1 className="mt-5 text-[28px] font-bold leading-snug">
            {values.customer_name.trim()}님,
            <br />
            접수가 완료됐어요
          </h1>
          <p className="mt-2 text-[16px] leading-relaxed text-stone-600">잠시만 기다려 주세요. 직원이 적어 주신 내용을 살펴보고 곧 상담을 도와드릴게요.</p>
          <dl className="mt-7 divide-y divide-white rounded-2xl bg-stone-50">
            {CUSTOMER_FIELDS.filter((f) => values[f.key].trim()).map((field) => (
              <div key={field.key} className="flex gap-4 px-4 py-3 text-[15px]">
                <dt className="w-28 shrink-0 text-stone-500">{field.label}</dt>
                <dd className="font-medium">{display(field, values[field.key].trim())}</dd>
              </div>
            ))}
            <div className="flex gap-4 px-4 py-3 text-[15px]">
              <dt className="w-28 shrink-0 text-stone-500">동의 항목</dt>
              <dd className="font-medium">
                {CONSENT_ITEMS.filter((item) => consents[item.key])
                  .map((item) => item.title.replace(" 동의", ""))
                  .join(", ")}
              </dd>
            </div>
          </dl>
          <div className="mt-auto pt-8">
            <Link
              href="/"
              className="flex h-13 w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-ink ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              처음 화면으로
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

type FieldProps = { field: FieldDef; value: string; error?: string; onChange: (value: string) => void };

function FieldInput(props: FieldProps) {
  if (props.field.type === "select") return props.field.groups ? <PickerField {...props} /> : <SelectField {...props} />;
  if (props.field.type === "multi") return <MultiField {...props} />;
  return <TextField {...props} />;
}

// 선택 항목 묶음. 처음에는 접혀 있어 필수 항목만으로 제출할 수 있다.
function OptionalGroup({ note, children }: { note?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      {note && <p className="text-[13px] text-stone-600">{note}</p>}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mt-2 flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-[15px] font-semibold ring-1 ring-inset ring-stone-300 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        {open ? "선택 항목 접기" : "선택 항목 입력하기"}
        <span aria-hidden className="text-stone-400">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <div className="mt-5">{children}</div>}
    </div>
  );
}

function FieldFrame({ field, error, children, labelFor }: { field: FieldDef; error?: string; children: ReactNode; labelFor?: string }) {
  const id = `field-${field.key}`;
  const Label = labelFor ? "label" : "p";
  return (
    <div>
      <Label {...(labelFor ? { htmlFor: labelFor } : { id: `${id}-label` })} className="mb-1.5 block text-[15px] font-semibold">
        {field.label}
        {field.required ? <span className="ml-0.5 text-danger">*</span> : <span className="ml-1.5 text-[12px] font-medium text-stone-500">선택</span>}
      </Label>
      {children}
      {field.hint && !error && <p className="mt-1 text-[13px] text-stone-500">{field.hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

// 하나를 고르는 항목. "기타"를 고르면 직접 입력 칸이 열린다. 저장되는 값은 고른 선택지나 입력한 글자다.
function SelectField({ field, value, error, onChange }: FieldProps) {
  const id = `field-${field.key}`;
  const options = field.options ?? [];
  const [other, setOther] = useState(value !== "" && !options.includes(value));
  const fieldClass = `${inputClass} !py-3 !text-[16px] ${error ? "!border-red-500" : ""}`;
  return (
    <FieldFrame field={field} error={error} labelFor={id}>
      <select
        id={id}
        className={`${fieldClass} ${!other && value === "" ? "text-stone-400" : ""}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        value={other ? OTHER_OPTION : value}
        onChange={(e) => {
          const isOther = e.target.value === OTHER_OPTION;
          setOther(isOther);
          onChange(isOther ? "" : e.target.value);
        }}
      >
        <option value="" disabled>
          {field.placeholder ?? "선택해 주세요"}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
      </select>
      {other && (
        <input
          className={`${fieldClass} mt-2`}
          aria-label={`${field.label} 직접 입력`}
          placeholder={field.otherPlaceholder}
          value={value}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </FieldFrame>
  );
}

// 선택지가 많은 항목. 누르면 창이 열리고, 검색하거나 묶음을 골라 좁힌 뒤 하나를 고른다.
// 목록에 없으면 직접 입력으로 넘어간다. 저장되는 값은 SelectField 와 같다(고른 선택지나 입력한 글자).
const squash = (text: string) => text.toLowerCase().replace(/\s+/g, "");

function PickerField({ field, value, error, onChange }: FieldProps) {
  const id = `field-${field.key}`;
  const groups = field.groups ?? [];
  const options = field.options ?? [];
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState(value !== "" && !options.includes(value));
  const [query, setQuery] = useState("");
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const fieldClass = `${inputClass} !py-3 !text-[16px] ${error ? "!border-red-500" : ""}`;

  const needle = squash(query);
  // 띄어 쓴 낱말이 모두 들어 있는 선택지를 찾는다. 묶음 이름과 검색어(keywords)도 함께 본다 ("아이폰 15" → iPhone 15).
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  // 검색어가 있으면 묶음 선택과 무관하게 전체에서 찾는다.
  const shown = groups
    .filter((group) => needle !== "" || groupLabel === null || group.label === groupLabel)
    .map((group) => {
      const groupText = squash(`${group.label} ${group.keywords ?? ""}`);
      return {
        ...group,
        options: group.options.filter(
          (option) => squash(option).includes(needle) || words.every((word) => squash(option).includes(word) || groupText.includes(word)),
        ),
      };
    })
    .filter((group) => group.options.length > 0);

  function close() {
    setOpen(false);
    setQuery("");
    setGroupLabel(null);
  }
  function choose(option: string) {
    setOther(false);
    onChange(option);
    close();
  }
  function typeInstead() {
    setOther(true);
    onChange(query.trim());
    close();
  }

  const chip = (active: boolean) =>
    `inline-flex h-11 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
      active ? "bg-ink text-white" : "bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50"
    }`;

  return (
    <FieldFrame field={field} error={error} labelFor={id}>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        data-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onClick={() => setOpen(true)}
        className={`${fieldClass} flex items-center justify-between gap-3 text-left`}
      >
        <span className={other || value === "" ? "text-stone-400" : ""}>{other ? "직접 입력" : value || (field.placeholder ?? "선택해 주세요")}</span>
        <span aria-hidden className="text-stone-400">
          ▾
        </span>
      </button>
      {other && (
        <input
          className={`${fieldClass} mt-2`}
          aria-label={`${field.label} 직접 입력`}
          placeholder={field.otherPlaceholder}
          value={value}
          autoFocus
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      <Drawer open={open} title={field.label} onClose={close}>
        <input
          type="search"
          className={`${inputClass} !py-3 !text-[16px]`}
          placeholder="이름으로 찾기"
          aria-label={`${field.label} 검색`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {needle === "" && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="종류">
            <button type="button" aria-pressed={groupLabel === null} className={chip(groupLabel === null)} onClick={() => setGroupLabel(null)}>
              전체
            </button>
            {groups.map((group) => (
              <button
                key={group.label}
                type="button"
                aria-pressed={groupLabel === group.label}
                className={chip(groupLabel === group.label)}
                onClick={() => setGroupLabel(group.label)}
              >
                {group.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          {shown.length === 0 && <p className="py-6 text-center text-[15px] text-stone-500">찾는 이름이 목록에 없습니다.</p>}
          {shown.map((group) => (
            <section key={group.label} className="mb-4">
              <h3 className="mb-1 text-[13px] font-semibold text-stone-500">{group.label}</h3>
              <ul className="divide-y divide-white overflow-hidden rounded-2xl bg-stone-50">
                {group.options.map((option) => (
                  <li key={option}>
                    <button
                      type="button"
                      aria-pressed={!other && option === value}
                      onClick={() => choose(option)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-[16px] hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600"
                    >
                      <span className={`py-2 ${!other && option === value ? "font-bold" : ""}`}>
                        {option}
                        {group.notes?.[option] && <span className="mt-0.5 block text-[13px] font-normal tabular-nums text-stone-500">{group.notes[option]}</span>}
                      </span>
                      {!other && option === value && (
                        <span aria-hidden className="font-bold text-brand-600">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <button
            type="button"
            onClick={typeInstead}
            className="flex min-h-12 w-full items-center justify-center rounded-xl text-[15px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {query.trim() ? `"${query.trim()}" 직접 입력` : "목록에 없어요 · 직접 입력"}
          </button>
        </div>
      </Drawer>
    </FieldFrame>
  );
}

// 여러 개를 고르는 항목. 저장되는 값은 고른 선택지와 직접 입력한 내용을 ", " 로 이은 글자다.
function MultiField({ field, value, error, onChange }: FieldProps) {
  const id = `field-${field.key}`;
  const options = field.options ?? [];
  const initial = value ? value.split(", ") : [];
  const [selected, setSelected] = useState<string[]>(initial.filter((item) => options.includes(item)));
  const [otherOpen, setOtherOpen] = useState(initial.some((item) => !options.includes(item)));
  const [otherText, setOtherText] = useState(initial.filter((item) => !options.includes(item)).join(", "));

  function emit(nextSelected: string[], nextOpen: boolean, nextText: string) {
    // 선택지 순서대로 정리해, 고른 순서와 무관하게 같은 값이 저장되게 한다.
    const ordered = options.filter((option) => nextSelected.includes(option));
    const extra = nextOpen ? nextText.trim() : "";
    onChange([...ordered, ...(extra ? [extra] : [])].join(", "));
  }

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-medium ring-1 ring-inset transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${
      active ? "bg-ink text-white ring-ink" : "bg-white text-stone-800 ring-stone-300"
    }`;

  return (
    <FieldFrame field={field} error={error}>
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined} data-invalid={Boolean(error)} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              className={chip(active)}
              onClick={() => {
                const next = active ? selected.filter((item) => item !== option) : [...selected, option];
                setSelected(next);
                emit(next, otherOpen, otherText);
              }}
            >
              {active && <span aria-hidden>✓</span>}
              {option}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={otherOpen}
          className={chip(otherOpen)}
          onClick={() => {
            setOtherOpen(!otherOpen);
            emit(selected, !otherOpen, otherText);
          }}
        >
          {otherOpen && <span aria-hidden>✓</span>}
          {OTHER_OPTION}
        </button>
      </div>
      {otherOpen && (
        <input
          className={`${inputClass} mt-2 !py-3 !text-[16px]`}
          aria-label={`${field.label} 직접 입력`}
          placeholder={field.otherPlaceholder}
          value={otherText}
          autoFocus
          onChange={(e) => {
            setOtherText(e.target.value);
            emit(selected, true, e.target.value);
          }}
        />
      )}
    </FieldFrame>
  );
}

function TextField({ field, value, error, onChange }: FieldProps) {
  const id = `field-${field.key}`;
  const common = {
    id,
    value,
    placeholder: field.placeholder,
    "aria-invalid": Boolean(error),
    "aria-describedby": error ? `${id}-error` : undefined,
    className: `${inputClass} !py-3 !text-[16px] ${error ? "!border-red-500" : ""}`,
  };
  // 휴대폰 번호는 숫자만 받는다. 붙여 넣은 값에 '-' 나 공백이 있어도 지운다.
  const digitsOnly = field.type === "number" || field.type === "tel";
  return (
    <FieldFrame field={field} error={error} labelFor={id}>
      {field.type === "textarea" ? (
        <textarea {...common} rows={2} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <div className="flex items-center gap-2">
          <input
            {...common}
            type={field.type === "number" || field.type === "tel" ? "text" : field.type === "date" ? "date" : "text"}
            inputMode={digitsOnly ? "numeric" : undefined}
            autoComplete={field.key === "customer_name" ? "name" : field.key === "phone" ? "tel-national" : "off"}
            onChange={(e) => onChange(digitsOnly ? e.target.value.replace(/[^0-9]/g, "").slice(0, field.type === "tel" ? 11 : undefined) : e.target.value)}
          />
          {field.suffix && <span className="shrink-0 text-[15px] text-stone-500">{field.suffix}</span>}
        </div>
      )}
    </FieldFrame>
  );
}
