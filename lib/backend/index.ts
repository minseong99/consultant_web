import "server-only";
import { USE_MOCK } from "../config";
import type {
  ConsultationInput,
  ConsultationResult,
  CustomerDetail,
  DocumentRow,
  Feed,
  IntakeInput,
  IntakeResult,
  PromotionResult,
  RecommendResult,
  SendNowResult,
  StaffOption,
} from "../types";
import { mockBackend } from "./mock";
import { realBackend } from "./real";

// 화면이 필요로 하는 모든 데이터 접근. mock과 실제 구현이 같은 인터페이스를 따르므로
// USE_MOCK 환경변수만 바꾸면 전환된다.
export interface Backend {
  listStaff(): Promise<StaffOption[]>;
  intake(input: IntakeInput): Promise<IntakeResult>;
  feed(): Promise<Feed>;
  customerDetail(customerId: string): Promise<CustomerDetail | null>;
  recommend(customerId: string): Promise<RecommendResult>;
  consultationResult(input: ConsultationInput): Promise<ConsultationResult>;
  sendNow(scheduleId: string): Promise<SendNowResult>;
  listPromotions(storeId: string): Promise<DocumentRow[]>;
  runPromotion(documentId: string, storeId: string): Promise<PromotionResult>;
}

export function getBackend(): Backend {
  return USE_MOCK ? mockBackend : realBackend;
}
