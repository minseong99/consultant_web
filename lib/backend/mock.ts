import "server-only";
import { addDays, todayKST } from "../format";
import type {
  Consultation,
  Customer,
  CustomerAnalysis,
  CustomerConsent,
  DocumentRow,
  Message,
  MessageSchedule,
  Recommendation,
  Staff,
  Store,
} from "../types";
import type { Backend } from "./index";
import { buildCustomerList, buildScheduleItems, latestConsents, summarizeConsent } from "./shared";

// n8n·Supabase 없이 전체 흐름을 재현하는 메모리 저장소. 로컬 `npm run dev` 전용이다
// (서버리스 배포에서는 인스턴스 간에 메모리가 공유되지 않는다).
// 일정 생성 규칙은 실제 워크플로우보다 단순화했고, 상태 전이는 실제와 같다.

type Store_ = {
  customers: Customer[];
  consents: CustomerConsent[];
  analyses: CustomerAnalysis[];
  consultations: Consultation[];
  schedules: MessageSchedule[];
  messages: Message[];
  documents: DocumentRow[];
  staff: Staff[];
  stores: Store[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const kst = (date: string, hour: number) => `${date}T${String(hour).padStart(2, "0")}:00:00+09:00`;
const isoMinutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function seed(): Store_ {
  const today = todayKST();
  const customers: Customer[] = [
    {
      customer_id: "CUST-1001",
      customer_name: "김서연",
      phone: "01023456789",
      current_device: "Galaxy S22",
      current_plan: "5G 슬림 55",
      usage_pattern: "유튜브·OTT 시청이 많고 출퇴근길에 데이터를 많이 씀",
      consultation_goal: "기기 변경 상담",
      age: 29,
      contract_end_date: addDays(today, 45),
      device_use_months: 26,
      preferred_brand: null,
      target_monthly_budget: 75000,
      interests: "카메라, 갤럭시 신제품",
    },
    {
      customer_id: "CUST-1002",
      customer_name: "박준호",
      phone: "01034567890",
      current_device: "iPhone 13",
      current_plan: "5G 베이직 69",
      usage_pattern: "업무용 통화와 테더링 위주",
      consultation_goal: "요금제 절약 상담",
      age: 41,
      contract_end_date: null,
      device_use_months: 34,
      preferred_brand: null,
      target_monthly_budget: 60000,
      interests: "가족 결합 할인",
    },
    {
      customer_id: "CUST-1003",
      customer_name: "이하은",
      phone: "01045678901",
      current_device: "Galaxy A54",
      current_plan: "LTE 데이터 33",
      usage_pattern: "SNS와 사진 촬영 위주, 데이터 사용량은 적음",
      consultation_goal: "약정 만료 전 상담",
      age: 23,
      contract_end_date: addDays(today, 20),
      device_use_months: 22,
      preferred_brand: null,
      target_monthly_budget: 50000,
      interests: "폴더블",
    },
  ];

  const consents: CustomerConsent[] = [
    { customer_id: "CUST-1001", privacy_consent: true, marketing_consent: true, recontact_consent: true, consent_at: isoMinutesAgo(60 * 26), withdrawn_at: null },
    { customer_id: "CUST-1002", privacy_consent: true, marketing_consent: false, recontact_consent: true, consent_at: isoMinutesAgo(60 * 50), withdrawn_at: null },
    { customer_id: "CUST-1003", privacy_consent: true, marketing_consent: true, recontact_consent: true, consent_at: isoMinutesAgo(60 * 75), withdrawn_at: null },
  ];

  const analyses: CustomerAnalysis[] = customers.map((c, index) => ({
    analysis_id: `ANA-${2001 + index}`,
    customer_id: c.customer_id,
    consultation_id: null,
    created_at: isoMinutesAgo(60 * 24 * (index + 1)),
    analysis_data: analyze(c, null),
  }));

  const consultations: Consultation[] = [
    {
      consultation_id: "CONS-3001",
      customer_id: "CUST-1002",
      consulted_at: isoMinutesAgo(60 * 49),
      staff_id: "STAFF-001",
      store_id: "STORE-001",
      summary: "요금제 절약 방안을 문의. 가족 결합 할인 조건을 안내했고 배우자와 상의 후 다시 방문하기로 함.",
      reconsultation_at: null,
      result_status: "pending",
      customer_response: "가족과 상의 후 결정",
      interested_product: null,
      interested_plan: "5G 슬림 55",
      special_notes: null,
      follow_up_required: false,
      follow_up_reason: null,
      follow_up_type: null,
      preferred_follow_up_date: null,
    },
  ];

  const schedules: MessageSchedule[] = [
    {
      schedule_id: "sch-seed-1001-1",
      customer_id: "CUST-1001",
      schedule_type: "contract",
      schedule_subtype: "contract_notice_1",
      reference_date: customers[0].contract_end_date!,
      scheduled_contact_at: kst(addDays(today, 15), 10),
      calendar_event_id: "mock-cal-1",
      schedule_status: "scheduled",
      contact_reason: "약정 만료 예정 1차 안내",
      consultation_id: null,
      document_id: null,
    },
    {
      schedule_id: "sch-seed-1003-1",
      customer_id: "CUST-1003",
      schedule_type: "contract",
      schedule_subtype: "contract_notice_1",
      reference_date: addDays(today, 20),
      scheduled_contact_at: kst(addDays(today, -1), 10),
      calendar_event_id: "mock-cal-2",
      schedule_status: "sent",
      contact_reason: "약정 만료 예정 1차 안내",
      consultation_id: null,
      document_id: null,
    },
  ];

  const messages: Message[] = [
    {
      message_id: "MSG-sch-seed-1003-1",
      schedule_id: "sch-seed-1003-1",
      message_content:
        "이하은 고객님, 안녕하세요. 사용 중이신 약정이 곧 만료될 예정이라 안내드립니다. 궁금하신 점이 있으시면 편하게 매장으로 연락 주세요.",
      send_status: "sent",
      sent_at: kst(addDays(today, -1), 10),
      send_channel: "sms",
      generated_at: kst(addDays(today, -1), 10),
    },
  ];

  const documents: DocumentRow[] = [
    {
      document_id: "DOC-PROMO-001",
      store_id: "STORE-001",
      document_type: "promotion",
      file_name: "갤럭시 신제품 사전예약 프로모션",
      file_path: "promotions/galaxy-preorder.pdf",
      valid_from: addDays(today, 3),
      valid_until: addDays(today, 24),
      condition_data: { interest_keywords: ["갤럭시"], min_device_use_months: 18 },
    },
    {
      document_id: "DOC-PROMO-002",
      store_id: "STORE-001",
      document_type: "promotion",
      file_name: "가족 결합 요금 할인 이벤트",
      file_path: "promotions/family-bundle.pdf",
      valid_from: addDays(today, -5),
      valid_until: addDays(today, 30),
      condition_data: { interest_keywords: ["폴더블 워치"] },
    },
  ];

  return {
    customers,
    consents,
    analyses,
    consultations,
    schedules,
    messages,
    documents,
    staff: [
      { staff_id: "STAFF-001", store_id: "STORE-001", role: "manager" },
      { staff_id: "STAFF-002", store_id: "STORE-001", role: "staff" },
    ],
    stores: [{ store_id: "STORE-001", store_name: "강남역점" }],
  };
}

// 개발 서버의 모듈 재로딩에도 데이터가 유지되도록 globalThis에 둔다.
const holder = globalThis as unknown as { __mockStore?: Store_ };
function store() {
  if (!holder.__mockStore) holder.__mockStore = seed();
  return holder.__mockStore;
}

let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now()}${sequence++}`;

function analyze(c: Customer, consultation: Consultation | null) {
  const months = c.device_use_months ?? 0;
  const budget = c.target_monthly_budget;
  const features = ["배터리"];
  if (/사진|카메라|촬영/.test(`${c.usage_pattern} ${c.interests ?? ""}`)) features.unshift("카메라");
  if (/유튜브|OTT|영상|데이터/.test(c.usage_pattern)) features.push("대화면·데이터");
  const missing: string[] = [];
  if (c.age == null) missing.push("연령대");
  if (budget == null) missing.push("희망 월 예산");
  if (c.contract_end_date == null) missing.push("약정 만료일");
  const summary = `${c.current_device}을(를) ${months ? `${months}개월째 ` : ""}사용 중이며 ${c.consultation_goal}을(를) 원합니다. ${c.usage_pattern}.`;
  return {
    customer_id: c.customer_id,
    analysis_summary: consultation ? `${summary} 최근 상담: ${consultation.summary}` : summary,
    usage_profile: c.usage_pattern,
    replacement_reason: months >= 24 ? "기기 사용 기간 2년 경과" : "정보 부족",
    important_features: features,
    price_sensitivity: budget == null ? "판단 불가" : budget <= 60000 ? "높음" : "보통",
    preferred_product_group: /iphone|아이폰/i.test(c.current_device) ? "iPhone 시리즈" : "Galaxy 시리즈",
    device_change_signal: months >= 24 ? "높음" : months >= 12 ? "보통" : "낮음",
    recommendation_factors: ["현재 단말 사용 기간", "주요 사용 패턴", ...(budget != null ? ["희망 월 예산"] : [])],
    missing_information: missing,
  };
}

function recommendFor(c: Customer): Recommendation[] {
  const apple = /iphone|아이폰/i.test(c.current_device);
  const budget = c.target_monthly_budget;
  const camera = /사진|카메라|촬영/.test(`${c.usage_pattern} ${c.interests ?? ""}`);
  return [
    {
      recommendation_rank: 1,
      product_id: apple ? "DEV-IP17" : "DEV-S26",
      device_name: apple ? "iPhone 17" : "Galaxy S26",
      plan_id: "PLAN-5G-69",
      plan_name: "5G 스탠다드 69",
      expected_benefit: "기기 변경 시 공시지원금 적용 가능",
      benefit_info: "24개월 약정 기준",
      eligibility_condition: "기기 변경 가입",
      recommendation_reason: `${c.device_use_months ?? "-"}개월 사용으로 교체 신호가 높고, ${camera ? "카메라 성능을 중요하게 여겨" : "영상·데이터 사용이 많아"} 상위 모델이 적합합니다.`,
    },
    {
      recommendation_rank: 2,
      product_id: apple ? "DEV-IP16E" : "DEV-A56",
      device_name: apple ? "iPhone 16e" : "Galaxy A56",
      plan_id: "PLAN-5G-55",
      plan_name: "5G 슬림 55",
      expected_benefit: null,
      benefit_info: null,
      eligibility_condition: null,
      recommendation_reason:
        budget != null
          ? `희망 월 예산 ${budget.toLocaleString("ko-KR")}원에 맞추려면 보급형 단말과 낮은 요금제 조합이 부담이 적습니다.`
          : "가격 부담을 줄이려는 경우의 대안입니다.",
    },
  ];
}

function hasRecontact(customerId: string) {
  const consent = latestConsents(store().consents).get(customerId);
  return Boolean(consent?.privacy_consent && consent.recontact_consent && !consent.withdrawn_at);
}

function upsertSchedule(schedule: MessageSchedule) {
  const s = store();
  const index = s.schedules.findIndex((row) => row.schedule_id === schedule.schedule_id);
  if (index >= 0) s.schedules[index] = { ...s.schedules[index], ...schedule };
  else s.schedules.push(schedule);
  return schedule;
}

function composeMessage(schedule: MessageSchedule, customer: Customer) {
  const name = customer.customer_name;
  if (schedule.schedule_type === "contract") {
    return `${name} 고객님, 안녕하세요. 사용 중이신 약정이 ${schedule.reference_date}에 만료될 예정이라 안내드립니다. 궁금하신 점은 편하게 매장으로 문의해 주세요.`;
  }
  if (schedule.schedule_type === "reconsultation") {
    return `${name} 고객님, 안녕하세요. 지난 상담에 이어 내일 재상담이 예정되어 있어 안내드립니다. 편하신 시간에 방문해 주세요.`;
  }
  return "";
}

export const mockBackend: Backend = {
  async listStaff() {
    const s = store();
    return s.staff.map((row) => ({
      ...row,
      store_name: s.stores.find((st) => st.store_id === row.store_id)?.store_name ?? row.store_id,
    }));
  },

  async intake(input) {
    await sleep(900);
    if (!input.privacy_consent) {
      return { success: false, error_code: "CONSENT_REQUIRED", message: "개인정보 수집·이용 동의가 필요합니다." };
    }
    const s = store();
    const phone = input.phone.replace(/\D/g, "");
    const existing = s.customers.find((c) => c.phone === phone);
    const customerId = existing?.customer_id ?? `CUST-${Date.now()}`;
    const customer: Customer = {
      customer_id: customerId,
      customer_name: input.customer_name,
      phone,
      current_device: input.current_device,
      current_plan: input.current_plan,
      usage_pattern: input.usage_pattern,
      consultation_goal: input.consultation_goal,
      age: input.age,
      contract_end_date: input.contract_end_date,
      device_use_months: input.device_use_months,
      preferred_brand: existing?.preferred_brand ?? null,
      target_monthly_budget: input.target_monthly_budget,
      interests: input.interests,
    };
    if (existing) Object.assign(existing, customer);
    else s.customers.push(customer);
    s.consents.push({
      customer_id: customerId,
      privacy_consent: true,
      marketing_consent: input.marketing_consent,
      recontact_consent: input.recontact_consent,
      consent_at: new Date().toISOString(),
      withdrawn_at: null,
    });

    // 응답 이후에 이어지는 처리: 약정 일정 생성 → 고객 분석
    void (async () => {
      await sleep(2500);
      const today = todayKST();
      if (customer.contract_end_date && customer.contract_end_date > today && hasRecontact(customerId)) {
        upsertSchedule({
          schedule_id: `sch-${customerId}-contract-1`,
          customer_id: customerId,
          schedule_type: "contract",
          schedule_subtype: "contract_notice_1",
          reference_date: customer.contract_end_date,
          scheduled_contact_at: kst(addDays(today, 1), 10),
          calendar_event_id: nextId("mock-cal"),
          schedule_status: "scheduled",
          contact_reason: "약정 만료 예정 1차 안내",
          consultation_id: null,
          document_id: null,
        });
      }
      await sleep(3500);
      s.analyses.push({
        analysis_id: nextId("ANA"),
        customer_id: customerId,
        consultation_id: null,
        created_at: new Date().toISOString(),
        analysis_data: analyze(customer, null),
      });
    })();

    return { success: true, customer_id: customerId };
  },

  async feed() {
    const s = store();
    return {
      customers: buildCustomerList(s.customers, s.consents, s.analyses),
      schedules: buildScheduleItems(s.schedules, s.customers, s.messages, s.documents),
      fetched_at: new Date().toISOString(),
    };
  },

  async customerDetail(customerId) {
    const s = store();
    const customer = s.customers.find((c) => c.customer_id === customerId);
    if (!customer) return null;
    const analyses = s.analyses
      .filter((a) => a.customer_id === customerId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      customer,
      consent: summarizeConsent(latestConsents(s.consents).get(customerId)),
      analysis: analyses[0] ?? null,
      consultations: s.consultations
        .filter((c) => c.customer_id === customerId)
        .sort((a, b) => b.consulted_at.localeCompare(a.consulted_at)),
      schedules: buildScheduleItems(
        s.schedules.filter((row) => row.customer_id === customerId),
        [customer],
        s.messages,
        s.documents,
      ),
    };
  },

  async recommend(customerId) {
    await sleep(3200);
    const s = store();
    const customer = s.customers.find((c) => c.customer_id === customerId);
    if (!customer) return { success: false, error_code: "CUSTOMER_NOT_FOUND", message: "고객 정보를 찾을 수 없습니다." };
    const analysis = s.analyses.filter((a) => a.customer_id === customerId).at(-1);
    const missing = analysis?.analysis_data.missing_information ?? [];
    return {
      success: true,
      customer_id: customerId,
      analysis_id: analysis?.analysis_id ?? null,
      recommendations: recommendFor(customer),
      information_status: missing.length ? "partial" : "sufficient",
      missing_information: missing,
    };
  },

  async consultationResult(input) {
    await sleep(3000);
    const s = store();
    const customer = s.customers.find((c) => c.customer_id === input.customer_id);
    if (!customer) return { success: false, error_code: "CUSTOMER_NOT_FOUND", message: "고객 정보를 찾을 수 없습니다." };

    const today = todayKST();
    const followUp = Boolean(input.reconsultation_date) || input.follow_up_requested === true;
    const rejected = /거절|안 ?함|필요 ?없/.test(`${input.notes} ${input.customer_response ?? ""}`);
    const consultation: Consultation = {
      consultation_id: `CONS-${Date.now()}`,
      customer_id: input.customer_id,
      consulted_at: new Date().toISOString(),
      staff_id: input.staff_id,
      store_id: input.store_id,
      summary: input.notes.trim(),
      reconsultation_at: input.reconsultation_date ? kst(input.reconsultation_date, 10) : null,
      result_status: followUp ? "follow_up" : rejected ? "rejected" : "completed",
      customer_response: input.customer_response,
      interested_product: input.selected_product,
      interested_plan: input.selected_plan,
      special_notes: null,
      follow_up_required: followUp,
      follow_up_reason: followUp ? "고객이 추가 검토 후 재상담을 원함" : null,
      follow_up_type: followUp ? "reconsultation" : null,
      preferred_follow_up_date: input.reconsultation_date,
    };
    s.consultations.push(consultation);

    const schedules: MessageSchedule[] = [];
    if (input.reconsultation_date && input.reconsultation_date > today && hasRecontact(input.customer_id)) {
      const reminder = addDays(input.reconsultation_date, -1);
      // 하루 전이 오늘이면 16시로 잡는다 (실제 워크플로우는 현재 시각에 따라 10/16/19시 중 선택).
      schedules.push(
        upsertSchedule({
          schedule_id: `sch-${consultation.consultation_id}-reconsult`,
          customer_id: input.customer_id,
          schedule_type: "reconsultation",
          schedule_subtype: "reconsultation_1d_before",
          reference_date: input.reconsultation_date,
          scheduled_contact_at: kst(reminder, reminder === today ? 16 : 10),
          calendar_event_id: nextId("mock-cal"),
          schedule_status: "scheduled",
          contact_reason: "재상담 1일 전 안내",
          consultation_id: consultation.consultation_id,
          document_id: null,
        }),
      );
    }

    // 응답 이후: 상담 내용을 반영해 분석 갱신
    void (async () => {
      await sleep(4000);
      s.analyses.push({
        analysis_id: nextId("ANA"),
        customer_id: input.customer_id,
        consultation_id: consultation.consultation_id,
        created_at: new Date().toISOString(),
        analysis_data: analyze(customer, consultation),
      });
    })();

    return {
      success: true,
      customer_id: consultation.customer_id,
      consultation_id: consultation.consultation_id,
      summary: consultation.summary,
      result_status: consultation.result_status,
      follow_up_required: followUp,
      follow_up_reason: consultation.follow_up_reason,
      schedule_type: consultation.follow_up_type,
      preferred_follow_up_date: consultation.preferred_follow_up_date,
      schedules,
    };
  },

  async sendNow(scheduleId) {
    const s = store();
    const schedule = s.schedules.find((row) => row.schedule_id === scheduleId);
    if (!schedule) return { success: false, error_code: "SCHEDULE_NOT_FOUND", message: "일정을 찾을 수 없습니다." };
    if (schedule.schedule_status !== "scheduled") {
      return { success: false, error_code: "NOT_SCHEDULED", message: "예정 상태의 일정만 발송할 수 있습니다." };
    }
    const customer = s.customers.find((c) => c.customer_id === schedule.customer_id);

    // scheduled → processing (발송 직전 동의 재확인) → 문자 생성 → pending → sending → sent
    schedule.schedule_status = customer && hasRecontact(schedule.customer_id) ? "processing" : "skipped";
    if (schedule.schedule_status === "skipped" || !customer) {
      return { success: true, schedule_id: scheduleId, schedule_status: schedule.schedule_status, message_id: null, send_status: null };
    }
    await sleep(3500);
    const text = composeMessage(schedule, customer);
    if (!text) {
      schedule.schedule_status = "failed";
      return { success: true, schedule_id: scheduleId, schedule_status: "failed", message_id: null, send_status: null };
    }
    const message: Message = {
      message_id: `MSG-${scheduleId}`,
      schedule_id: scheduleId,
      message_content: text,
      send_status: "sending",
      sent_at: null,
      send_channel: "sms",
      generated_at: new Date().toISOString(),
    };
    s.messages.push(message);
    await sleep(1500);
    message.send_status = "sent";
    message.sent_at = new Date().toISOString();
    schedule.schedule_status = "sent";
    return { success: true, schedule_id: scheduleId, schedule_status: "sent", message_id: message.message_id, send_status: "sent" };
  },

  async listPromotions(storeId) {
    return store().documents.filter((d) => d.store_id === storeId && d.document_type === "promotion");
  },

  async runPromotion(documentId, storeId) {
    await sleep(2800);
    const s = store();
    const promotion = s.documents.find((d) => d.document_id === documentId && d.store_id === storeId);
    if (!promotion) {
      return { success: false, status: "promotion_not_found", document_id: documentId, store_id: storeId, target_count: 0, target_customers: [] };
    }
    const rules = (promotion.condition_data ?? {}) as { interest_keywords?: string[]; min_device_use_months?: number };
    const consents = latestConsents(s.consents);
    const targets = s.customers.filter((c) => {
      const consent = consents.get(c.customer_id);
      if (!consent?.privacy_consent || !consent.marketing_consent || !consent.recontact_consent || consent.withdrawn_at) return false;
      if (rules.min_device_use_months != null && (c.device_use_months ?? 0) < rules.min_device_use_months) return false;
      const text = `${c.interests ?? ""} ${c.consultation_goal} ${c.usage_pattern} ${c.current_device}`.toLowerCase().replace(/\s+/g, "");
      return (rules.interest_keywords ?? []).every((k) => text.includes(k.toLowerCase().replace(/\s+/g, "")));
    });

    const today = todayKST();
    if (targets.length && promotion.valid_from && promotion.valid_until) {
      for (const customer of targets) {
        const plans = [
          { subtype: "promotion_start", date: promotion.valid_from, reason: "프로모션 시작 안내", reference: promotion.valid_from },
          { subtype: "promotion_end_2d_before", date: addDays(promotion.valid_until, -2), reason: "프로모션 종료 2일 전 안내", reference: promotion.valid_until },
        ];
        for (const plan of plans) {
          if (plan.date < today) continue;
          upsertSchedule({
            schedule_id: `sch-${customer.customer_id}-${documentId}-${plan.subtype}`,
            customer_id: customer.customer_id,
            schedule_type: "promotion",
            schedule_subtype: plan.subtype,
            reference_date: plan.reference,
            scheduled_contact_at: kst(plan.date, 10),
            calendar_event_id: nextId("mock-cal"),
            schedule_status: "scheduled",
            contact_reason: plan.reason,
            consultation_id: null,
            document_id: documentId,
          });
        }
      }
    }

    return {
      success: true,
      status: targets.length ? "targeted" : "no_target",
      document_id: documentId,
      store_id: storeId,
      event_name: promotion.file_name,
      valid_from: promotion.valid_from,
      valid_until: promotion.valid_until,
      target_count: targets.length,
      target_customers: targets.map((c) => ({
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        phone: c.phone,
        match_reasons: ["프로모션 대상/관심 조건 충족"],
        eligibility_notes: [],
      })),
    };
  },
};
