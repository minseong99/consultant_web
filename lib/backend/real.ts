import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { callN8n, N8N_PATHS } from "../n8n";
import type {
  Consultation,
  ConsultationResult,
  Customer,
  CustomerAnalysis,
  CustomerConsent,
  DocumentRow,
  IntakeResult,
  Message,
  MessageSchedule,
  PromotionRegisterResult,
  PromotionResult,
  RecommendResult,
  SendNowResult,
  Staff,
  Store,
} from "../types";
import type { Backend } from "./index";
import { buildCustomerList, buildScheduleItems, latestConsents, summarizeConsent } from "./shared";

// 조회는 서버에서 service role key로만 한다. 쓰기는 전부 n8n 게이트웨이를 통한다.
let client: SupabaseClient | null = null;
function db() {
  if (!client) {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.");
    }
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`Supabase 조회 실패: ${error.message}`);
  return (data ?? []) as T[];
}

export const realBackend: Backend = {
  async listStaff() {
    const [staff, stores] = await Promise.all([
      rows<Staff>(db().from("staff").select("staff_id, store_id, role").order("staff_id")),
      rows<Store>(db().from("stores").select("store_id, store_name")),
    ]);
    const storeNames = new Map(stores.map((s) => [s.store_id, s.store_name]));
    return staff.map((s) => ({ ...s, store_name: storeNames.get(s.store_id) ?? s.store_id }));
  },

  intake(input) {
    return callN8n<Extract<IntakeResult, { success: true }>>(N8N_PATHS.customerIntake, input);
  },

  async feed() {
    const [customers, consents, analyses, schedules, messages, documents] = await Promise.all([
      rows<Customer>(db().from("customers").select("*")),
      rows<CustomerConsent>(db().from("customer_consents").select("*")),
      rows<Pick<CustomerAnalysis, "customer_id">>(db().from("customer_analyses").select("customer_id")),
      rows<MessageSchedule>(db().from("message_schedules").select("*")),
      rows<Message>(db().from("messages").select("*")),
      rows<Pick<DocumentRow, "document_id" | "file_name">>(db().from("documents").select("document_id, file_name")),
    ]);
    return {
      customers: buildCustomerList(customers, consents, analyses),
      schedules: buildScheduleItems(schedules, customers, messages, documents),
      fetched_at: new Date().toISOString(),
    };
  },

  async customerDetail(customerId) {
    const [customers, consents, analyses, consultations, schedules, documents] = await Promise.all([
      rows<Customer>(db().from("customers").select("*").eq("customer_id", customerId).limit(1)),
      rows<CustomerConsent>(db().from("customer_consents").select("*").eq("customer_id", customerId)),
      rows<CustomerAnalysis>(
        db()
          .from("customer_analyses")
          .select("*")
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1),
      ),
      rows<Consultation>(
        db()
          .from("consultations")
          .select("*")
          .eq("customer_id", customerId)
          .order("consulted_at", { ascending: false }),
      ),
      rows<MessageSchedule>(db().from("message_schedules").select("*").eq("customer_id", customerId)),
      rows<Pick<DocumentRow, "document_id" | "file_name">>(db().from("documents").select("document_id, file_name")),
    ]);
    const customer = customers[0];
    if (!customer) return null;

    const scheduleIds = schedules.map((s) => s.schedule_id);
    const messages = scheduleIds.length
      ? await rows<Message>(db().from("messages").select("*").in("schedule_id", scheduleIds))
      : [];

    return {
      customer,
      consent: summarizeConsent(latestConsents(consents).get(customerId)),
      analysis: analyses[0] ?? null,
      consultations,
      schedules: buildScheduleItems(schedules, [customer], messages, documents),
    };
  },

  recommend(customerId) {
    return callN8n<Extract<RecommendResult, { success: true }>>(N8N_PATHS.recommend, {
      customer_id: customerId,
    });
  },

  consultationResult(input) {
    return callN8n<Extract<ConsultationResult, { success: true }>>(N8N_PATHS.consultationResult, input);
  },

  sendNow(scheduleId) {
    return callN8n<Extract<SendNowResult, { success: true }>>(N8N_PATHS.sendNow, {
      schedule_id: scheduleId,
    });
  },

  listPromotions(storeId) {
    return rows<DocumentRow>(
      db()
        .from("documents")
        .select("*")
        .eq("store_id", storeId)
        .eq("document_type", "promotion")
        .order("valid_from", { ascending: false }),
    );
  },

  async registerPromotion(input, storeId) {
    return (await callN8n(N8N_PATHS.promotionRegister, { ...input, store_id: storeId })) as PromotionRegisterResult;
  },

  async runPromotion(documentId, storeId) {
    return (await callN8n(N8N_PATHS.promotion, {
      document_id: documentId,
      store_id: storeId,
    })) as PromotionResult;
  },
};
