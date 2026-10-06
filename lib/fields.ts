// 고객 입력 폼 정의. 키 이름은 n8n F01 워크플로우의 입력 필드와 같다.
// 문구나 항목을 바꾸려면 이 배열만 고치면 된다.

export type FieldKey =
  | "customer_name"
  | "phone"
  | "current_device"
  | "current_plan"
  | "usage_pattern"
  | "consultation_goal"
  | "age"
  | "contract_end_date"
  | "device_use_months"
  | "target_monthly_budget"
  | "interests";

export type FieldDef = {
  key: FieldKey;
  label: string;
  type: "text" | "tel" | "number" | "date" | "textarea";
  required: boolean;
  placeholder?: string;
  hint?: string;
  suffix?: string;
};

export const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "customer_name", label: "이름", type: "text", required: true, placeholder: "홍길동" },
  { key: "phone", label: "휴대폰 번호", type: "tel", required: true, placeholder: "010-1234-5678" },
  { key: "current_device", label: "현재 사용 기기", type: "text", required: true, placeholder: "예: Galaxy S23" },
  { key: "current_plan", label: "현재 요금제", type: "text", required: true, placeholder: "예: 5G 69 요금제" },
  {
    key: "usage_pattern",
    label: "주요 사용 패턴",
    type: "textarea",
    required: true,
    placeholder: "예: 유튜브·OTT 시청이 많고 사진을 자주 찍어요",
  },
  {
    key: "consultation_goal",
    label: "상담 목적",
    type: "textarea",
    required: true,
    placeholder: "예: 기기 변경과 요금제 절약 상담",
  },
  { key: "age", label: "나이", type: "number", required: false, suffix: "세" },
  {
    key: "contract_end_date",
    label: "약정 만료일",
    type: "date",
    required: false,
    hint: "입력하시면 만료 전에 안내 문자를 보내 드립니다 (재연락 동의 시)",
  },
  { key: "device_use_months", label: "현재 기기 사용 기간", type: "number", required: false, suffix: "개월" },
  {
    key: "target_monthly_budget",
    label: "희망 월 예산",
    type: "number",
    required: false,
    suffix: "원",
    placeholder: "70000",
  },
  { key: "interests", label: "관심사", type: "text", required: false, placeholder: "예: 카메라, 갤럭시 신제품" },
];

export const CONSENT_ITEMS = [
  {
    key: "privacy_consent",
    required: true,
    title: "개인정보 수집·이용 동의",
    description: "상담과 맞춤 추천을 위해 입력하신 정보를 수집·이용합니다.",
  },
  {
    key: "recontact_consent",
    required: false,
    title: "재연락 동의",
    description: "약정 만료·재상담 일정을 문자로 안내해 드립니다. 동의하지 않으면 안내 문자를 받지 못합니다.",
  },
  {
    key: "marketing_consent",
    required: false,
    title: "마케팅 정보 수신 동의",
    description: "프로모션·혜택 정보를 문자로 받아 보실 수 있습니다.",
  },
] as const;

export type ConsentKey = (typeof CONSENT_ITEMS)[number]["key"];

export function isValidPhone(value: string) {
  return /^01[016789]\d{7,8}$/.test(value.replace(/\D/g, ""));
}
