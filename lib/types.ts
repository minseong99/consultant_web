// Supabase public 스키마(실제 조회 결과)를 그대로 옮긴 타입.
// 여기에 없는 컬럼은 존재하지 않으므로 추측해서 쓰지 않는다.

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
