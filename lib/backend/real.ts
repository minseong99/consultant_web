import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { groupDevices, groupPlans, type DeviceRow, type PlanRow } from "../catalog";
import { config } from "../config";
import { matchDevices, parsePromotionContent, type DeviceRef } from "../promotion";
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
  MessageDraftResult,
  PromotionDraft,
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

  async joinOptions() {
    const [devices, plans] = await Promise.all([
      rows<DeviceRow>(db().from("devices").select("device_name, manufacturer")),
      rows<PlanRow>(db().from("plans").select("plan_id, plan_name, monthly_fee")),
    ]);
    return { current_device: groupDevices(devices), current_plan: groupPlans(plans) };
  },

  intake(input) {
    return callN8n<Extract<IntakeResult, { success: true }>>(N8N_PATHS.customerIntake, input);
  },

  async feed() {
    const [customers, consents, analyses, schedules, messages, documents, consultations] = await Promise.all([
      rows<Customer>(db().from("customers").select("*")),
      rows<CustomerConsent>(db().from("customer_consents").select("*")),
      rows<Pick<CustomerAnalysis, "customer_id">>(db().from("customer_analyses").select("customer_id")),
      rows<MessageSchedule>(db().from("message_schedules").select("*")),
      rows<Message>(db().from("messages").select("*")),
      rows<Pick<DocumentRow, "document_id" | "file_name">>(db().from("documents").select("document_id, file_name")),
      rows<Pick<Consultation, "customer_id" | "consulted_at">>(db().from("consultations").select("customer_id, consulted_at")),
    ]);
    return {
      customers: buildCustomerList(customers, consents, analyses, consultations),
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

  async recommend(customerId) {
    const result = await callN8n<Extract<RecommendResult, { success: true }>>(N8N_PATHS.recommend, {
      customer_id: customerId,
    });
    // F03은 기기 ID를 device_id 로 돌려준다(예전에는 product_id). 화면은 product_id 를 쓴다.
    if (result.success && Array.isArray(result.recommendations)) {
      for (const item of result.recommendations as ((typeof result.recommendations)[number] & { device_id?: string | null })[]) {
        item.product_id = item.product_id ?? item.device_id ?? null;
      }
    }
    return result;
  },

  consultationResult(input) {
    return callN8n<Extract<ConsultationResult, { success: true }>>(N8N_PATHS.consultationResult, input);
  },

  sendNow(scheduleId) {
    return callN8n<Extract<SendNowResult, { success: true }>>(N8N_PATHS.sendNow, {
      schedule_id: scheduleId,
    });
  },

  async listPromotions(storeId) {
    const documents = await rows<DocumentRow>(
      db()
        .from("documents")
        .select("*")
        .eq("store_id", storeId)
        .eq("document_type", "promotion")
        .order("valid_from", { ascending: false }),
    );
    if (documents.length === 0) return [];
    // 목록에 보여 줄 요약(혜택, 대상 기기 등)은 등록된 본문에서 읽는다. 읽지 못해도 목록은 보여 준다.
    let contents: { document_id: string; content: string }[] = [];
    let devices: DeviceRef[] = [];
    try {
      [contents, devices] = await Promise.all([
        rows<{ document_id: string; content: string }>(
          db()
            .from("kt_promotion_vectors")
            .select("document_id, content")
            .in(
              "document_id",
              documents.map((d) => d.document_id),
            )
            .order("vector_id"),
        ),
        rows<DeviceRef>(db().from("devices").select("device_id, device_name").order("device_id")),
      ]);
    } catch (error) {
      console.error(error);
    }
    const contentOf = new Map<string, string>();
    for (const row of contents) if (!contentOf.has(row.document_id)) contentOf.set(row.document_id, row.content);
    return documents.map((document) => {
      const summary = parsePromotionContent(contentOf.get(document.document_id));
      return { ...document, summary, devices: matchDevices(summary?.target_device, devices) };
    });
  },

  async registerPromotion(input, storeId) {
    return (await callN8n(N8N_PATHS.promotionRegister, { ...input, store_id: storeId })) as PromotionRegisterResult;
  },

  draftMessage(scheduleId) {
    return callN8n<Extract<MessageDraftResult, { success: true }>>(N8N_PATHS.messageDraft, { schedule_id: scheduleId });
  },

  sendMessage(scheduleId, messageText) {
    return callN8n<Extract<SendNowResult, { success: true }>>(N8N_PATHS.messageSend, { schedule_id: scheduleId, message_text: messageText });
  },

  async storePromotionFile(path, bytes) {
    // 원본 PDF는 비공개 버킷 documents 에 둔다. DB 행은 만들지 않는다(등록은 n8n을 거친다).
    const { error } = await db().storage.from("documents").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`파일 보관 실패: ${error.message}`);
  },

  async parsePromotions(text, fileName) {
    return callN8n<{ success: true; promotions: Omit<PromotionDraft, "exists">[] }>(N8N_PATHS.promotionParse, { text, file_name: fileName });
  },

  async runPromotion(documentId, storeId) {
    return (await callN8n(N8N_PATHS.promotion, {
      document_id: documentId,
      store_id: storeId,
    })) as PromotionResult;
  },
};
