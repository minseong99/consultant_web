import type {
  ConsentSummary,
  Customer,
  CustomerAnalysis,
  CustomerConsent,
  CustomerListItem,
  DocumentRow,
  Message,
  MessageSchedule,
  ScheduleItem,
} from "../types";

// F01은 같은 고객이 다시 제출하면 동의 행을 추가하므로, 가장 최근 행을 현재 상태로 본다.
export function latestConsents(rows: CustomerConsent[]) {
  const latest = new Map<string, CustomerConsent>();
  for (const row of rows) {
    const current = latest.get(row.customer_id);
    if (!current || row.consent_at > current.consent_at) latest.set(row.customer_id, row);
  }
  return latest;
}

export function summarizeConsent(row: CustomerConsent | undefined): ConsentSummary {
  return {
    privacy: row?.privacy_consent === true,
    marketing: row?.marketing_consent === true,
    recontact: row?.recontact_consent === true,
    withdrawn: Boolean(row?.withdrawn_at),
    consent_at: row?.consent_at ?? null,
  };
}

export function buildCustomerList(
  customers: Customer[],
  consents: CustomerConsent[],
  analyses: Pick<CustomerAnalysis, "customer_id">[],
): CustomerListItem[] {
  const consentByCustomer = latestConsents(consents);
  const analyzed = new Set(analyses.map((a) => a.customer_id));
  return customers
    .map((c) => {
      const consent = summarizeConsent(consentByCustomer.get(c.customer_id));
      return {
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        phone: c.phone,
        current_device: c.current_device,
        current_plan: c.current_plan,
        consultation_goal: c.consultation_goal,
        // customers에는 생성 시각 컬럼이 없어 최신 동의 시각을 등록 시각으로 쓴다.
        registered_at: consent.consent_at,
        consent,
        has_analysis: analyzed.has(c.customer_id),
      };
    })
    .sort((a, b) => (b.registered_at ?? "").localeCompare(a.registered_at ?? ""));
}

export function buildScheduleItems(
  schedules: MessageSchedule[],
  customers: Pick<Customer, "customer_id" | "customer_name">[],
  messages: Message[],
  documents: Pick<DocumentRow, "document_id" | "file_name">[],
): ScheduleItem[] {
  const names = new Map(customers.map((c) => [c.customer_id, c.customer_name]));
  const docs = new Map(documents.map((d) => [d.document_id, d.file_name]));
  const messageBySchedule = new Map<string, Message>();
  for (const message of messages) {
    if (message.schedule_id) messageBySchedule.set(message.schedule_id, message);
  }
  return schedules
    .map((s) => ({
      ...s,
      customer_name: names.get(s.customer_id) ?? s.customer_id,
      document_name: s.document_id ? (docs.get(s.document_id) ?? null) : null,
      message: messageBySchedule.get(s.schedule_id) ?? null,
    }))
    .sort((a, b) => a.scheduled_contact_at.localeCompare(b.scheduled_contact_at));
}
