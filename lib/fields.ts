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
  | "preferred_brand"
  | "interests";

export type FieldDef = {
  key: FieldKey;
  label: string;
  // select: 하나를 고름, multi: 여러 개를 고름. 둘 다 저장할 때는 글자로 바뀐다(multi는 ", " 로 이음).
  type: "text" | "tel" | "number" | "date" | "textarea" | "select" | "multi";
  required: boolean;
  placeholder?: string;
  hint?: string;
  suffix?: string;
  /** select·multi 의 선택지. 값이 ", " 로 이어지므로 선택지 안에는 쉼표를 쓰지 않는다. */
  options?: string[];
  /** select·multi 에서 선택지에 없는 값을 직접 입력할 때의 안내 문구 */
  otherPlaceholder?: string;
};

/** select·multi 에서 직접 입력을 여는 선택지 */
export const OTHER_OPTION = "기타 (직접 입력)";

// 현재 쓰고 있을 만한 기기. 판매 중인 최신 기기(devices 테이블)의 이전 세대들이다.
const CURRENT_DEVICES = [
  "Galaxy S25",
  "Galaxy S24",
  "Galaxy S23",
  "Galaxy S22",
  "Galaxy Z Flip7",
  "Galaxy Z Flip6",
  "Galaxy Z Flip5",
  "Galaxy Z Fold7",
  "Galaxy Z Fold6",
  "Galaxy A 시리즈",
  "iPhone 16 Pro",
  "iPhone 16",
  "iPhone 15 Pro",
  "iPhone 15",
  "iPhone 14",
  "iPhone 13",
];

// KT 요금제. 번호이동 상담을 위해 다른 통신사 이용 중인 경우도 고를 수 있게 한다.
const KT_PLANS = [
  "5G 초이스 프리미엄",
  "5G 초이스 스페셜",
  "5G 초이스 베이직",
  "5G 스페셜",
  "5G 베이직",
  "5G 심플",
  "5G 슬림",
  "5G 세이브",
  "요고 (다이렉트)",
  "LTE 데이터ON",
  "잘 모르겠어요",
  "다른 통신사 이용 중",
];

const USAGE_PATTERNS = [
  "유튜브·OTT 시청",
  "SNS·메신저",
  "게임",
  "사진·영상 촬영",
  "음악 스트리밍",
  "인터넷 검색·쇼핑",
  "업무 (메일·문서)",
  "통화 위주",
  "핫스팟·테더링",
];

const CONSULTATION_GOALS = [
  "기기 변경",
  "요금제 변경",
  "요금 절약",
  "약정 만료 상담",
  "인터넷·TV 결합 할인",
  "KT로 번호이동",
  "신규 가입",
  "프로모션·혜택 문의",
  "OTT·부가서비스",
];

export const CUSTOMER_FIELDS: FieldDef[] = [
  { key: "customer_name", label: "이름", type: "text", required: true, placeholder: "홍길동" },
  { key: "phone", label: "휴대폰 번호", type: "tel", required: true, placeholder: "01012345678", hint: "'-' 없이 숫자만 입력해 주세요" },
  {
    key: "current_device",
    label: "현재 사용 기기",
    type: "select",
    required: true,
    placeholder: "기기를 선택해 주세요",
    options: CURRENT_DEVICES,
    otherPlaceholder: "사용 중인 기기 이름",
  },
  {
    key: "current_plan",
    label: "현재 요금제",
    type: "select",
    required: true,
    placeholder: "요금제를 선택해 주세요",
    options: KT_PLANS,
    otherPlaceholder: "사용 중인 요금제 이름",
  },
  {
    key: "usage_pattern",
    label: "주요 사용 패턴",
    type: "multi",
    required: true,
    hint: "해당하는 것을 모두 골라 주세요",
    options: USAGE_PATTERNS,
    otherPlaceholder: "그 밖의 사용 패턴",
  },
  {
    key: "consultation_goal",
    label: "상담 목적",
    type: "multi",
    required: true,
    hint: "해당하는 것을 모두 골라 주세요",
    options: CONSULTATION_GOALS,
    otherPlaceholder: "그 밖에 상담받고 싶은 내용",
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
  { key: "preferred_brand", label: "선호 브랜드", type: "text", required: false, placeholder: "예: 삼성, 애플" },
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
