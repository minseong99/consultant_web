// Supabase public 스키마(실제 조회 결과)를 그대로 옮긴 타입.
// 여기에 없는 컬럼은 존재하지 않으므로 추측해서 쓰지 않는다.

import type { DeviceRef, PromotionSummary } from "./promotion";

export type Customer = {
  customer_id: string;
  customer_name: string;
  phone: string;
  current_device: string;
  current_plan: string;
  usage_pattern: string;
  consultation_goal: string;
  age: number | null;
  contract_end_date: string | null;
  device_use_months: number | null;
  preferred_brand: string | null;
  target_monthly_budget: number | null;
  interests: string | null;
};

export type CustomerConsent = {
  customer_id: string;
  privacy_consent: boolean;
  marketing_consent: boolean | null;
  recontact_consent: boolean | null;
  consent_at: string;
  withdrawn_at: string | null;
};

// F02가 저장하는 analysis_data. LLM 출력이라 키가 빠지거나 늘 수 있다.
export type AnalysisData = {
  analysis_summary?: string | null;
  usage_profile?: string | null;
  replacement_reason?: string | null;
  important_features?: string[] | null;
  price_sensitivity?: string | null;
  preferred_product_group?: string | null;
  device_change_signal?: string | null;
  recommendation_factors?: string[] | null;
  missing_information?: string[] | null;
  [key: string]: unknown;
};

export type CustomerAnalysis = {
  analysis_id: string;
  customer_id: string;
  analysis_data: AnalysisData;
  consultation_id: string | null;
  created_at: string;
};

export type Consultation = {
  consultation_id: string;
  customer_id: string;
  consulted_at: string;
  staff_id: string;
  store_id: string;
  summary: string;
  reconsultation_at: string | null;
  result_status: string | null;
  customer_response: string | null;
  interested_product: string | null;
  interested_plan: string | null;
  special_notes: string | null;
  follow_up_required: boolean | null;
  follow_up_reason: string | null;
  follow_up_type: string | null;
  preferred_follow_up_date: string | null;
};

export type MessageSchedule = {
  schedule_id: string;
  customer_id: string;
  schedule_type: string;
  reference_date: string;
  scheduled_contact_at: string;
  calendar_event_id: string | null;
  schedule_status: string;
  contact_reason: string | null;
  consultation_id: string | null;
  schedule_subtype: string | null;
  document_id: string | null;
};

export type Message = {
  message_id: string;
  schedule_id: string | null;
  message_content: string;
  send_status: string;
  sent_at: string | null;
  send_channel: string | null;
  generated_at: string | null;
};

export type DocumentRow = {
  document_id: string;
  store_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  valid_from: string | null;
  valid_until: string | null;
  condition_data: unknown;
};

/** 프로모션 목록의 한 줄. 요약과 대상 기기는 등록된 본문에서 읽은 것이며, 본문이 없으면 비어 있다. */
export type PromotionListItem = DocumentRow & {
  summary: PromotionSummary | null;
  devices: DeviceRef[];
};

export type Staff = { staff_id: string; store_id: string; role: string };
export type Store = { store_id: string; store_name: string };

// ---- 화면·API에서 쓰는 조합 타입 ----

export type StaffOption = Staff & { store_name: string };

export type StaffSession = { staff_id: string; store_id: string };

export type ConsentSummary = {
  privacy: boolean;
  marketing: boolean;
  recontact: boolean;
  withdrawn: boolean;
  consent_at: string | null;
};

export type CustomerListItem = {
  customer_id: string;
  customer_name: string;
  phone: string;
  current_device: string;
  current_plan: string;
  consultation_goal: string;
  registered_at: string | null;
  consent: ConsentSummary;
  has_analysis: boolean;
  /** 가장 최근 상담 시각. 상담 이력이 없으면 null */
  last_consulted_at: string | null;
};

export type ScheduleItem = MessageSchedule & {
  customer_name: string;
  document_name: string | null;
  message: Message | null;
};

export type Feed = {
  customers: CustomerListItem[];
  schedules: ScheduleItem[];
  fetched_at: string;
};

export type CustomerDetail = {
  customer: Customer;
  consent: ConsentSummary;
  analysis: CustomerAnalysis | null;
  consultations: Consultation[];
  schedules: ScheduleItem[];
};

// F03 반환값
export type Recommendation = {
  recommendation_rank: number | null;
  product_id: string | null;
  device_name: string | null;
  plan_id: string | null;
  plan_name: string | null;
  expected_benefit: string | null;
  benefit_info: string | null;
  eligibility_condition: string | null;
  recommendation_reason: string | null;
};

export type ApiFailure = { success: false; error_code: string; message: string };

export type RecommendResult =
  | {
      success: true;
      customer_id: string | null;
      analysis_id: string | null;
      recommendations: Recommendation[];
      information_status: string;
      missing_information: string[];
    }
  | ApiFailure;

export type IntakeInput = {
  customer_name: string;
  phone: string;
  current_device: string;
  current_plan: string;
  usage_pattern: string;
  consultation_goal: string;
  age: number | null;
  contract_end_date: string | null;
  device_use_months: number | null;
  target_monthly_budget: number | null;
  interests: string | null;
  preferred_brand: string | null;
  privacy_consent: boolean;
  marketing_consent: boolean;
  recontact_consent: boolean;
};

export type IntakeResult = { success: true; customer_id: string } | ApiFailure;

export type ConsultationInput = {
  customer_id: string;
  staff_id: string;
  store_id: string;
  notes: string;
  customer_response: string | null;
  selected_product: string | null;
  selected_plan: string | null;
  follow_up_requested: boolean | null;
  reconsultation_date: string | null;
  recording_url: string | null;
};

// F04 반환값 + 게이트웨이가 덧붙이는 schedules
export type ConsultationResult =
  | {
      success: true;
      customer_id: string | null;
      consultation_id: string | null;
      summary: string | null;
      result_status: string | null;
      follow_up_required: boolean;
      follow_up_reason: string | null;
      schedule_type: string | null;
      preferred_follow_up_date: string | null;
      schedules: MessageSchedule[];
    }
  | ApiFailure;

export type SendNowResult =
  | {
      success: true;
      schedule_id: string;
      schedule_status: string | null;
      message_id: string | null;
      send_status: string | null;
    }
  | ApiFailure;

// F05 반환값
export type PromotionRegisterInput = {
  promotion_name: string;
  valid_from: string;
  valid_until: string;
  benefit: string;
  promotion_type: string | null;
  target_device: string | null;
  target_plan: string | null;
  target_customer: string | null;
  conditions: string | null;
  /** PDF에서 등록할 때 원본 파일이 보관된 경로 */
  file_path?: string | null;
};

export type PromotionRegisterResult =
  | {
      success: true;
      document_id: string;
      file_name: string;
      valid_from: string;
      valid_until: string;
      /** 같은 이름의 프로모션이 이미 있어 새로 저장하지 않았다 */
      already_exists?: boolean;
    }
  | ApiFailure;

/** PDF에서 뽑은 프로모션 한 건. 직원이 확인·수정한 뒤 등록한다. 값이 없는 칸은 빈 글자다. */
export type PromotionDraft = {
  promotion_name: string;
  promotion_type: string;
  target_device: string;
  target_plan: string;
  target_customer: string;
  benefit: string;
  conditions: string;
  valid_from: string;
  valid_until: string;
  /** 이 매장에 같은 이름의 프로모션이 이미 등록되어 있다 */
  exists: boolean;
};

export type PromotionParseResult =
  | { success: true; file_name: string; file_path: string; pages: number; promotions: PromotionDraft[] }
  | ApiFailure;

export type PromotionTarget = {
  customer_id: string;
  customer_name: string;
  phone?: string | null;
  match_reasons?: string[];
  eligibility_notes?: string[];
};

export type PromotionResult =
  | {
      success: boolean;
      status: string;
      document_id: string | null;
      store_id: string | null;
      event_name?: string | null;
      valid_from?: string | null;
      valid_until?: string | null;
      target_count: number;
      target_customers: PromotionTarget[];
    }
  | ApiFailure;
