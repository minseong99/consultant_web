import "server-only";
import type { JoinOptions } from "../catalog";
import { USE_MOCK } from "../config";
import type {
  ConsultationInput,
  ConsultationResult,
  CustomerDetail,
  DocumentRow,
  Feed,
  IntakeInput,
  IntakeResult,
  PromotionDraft,
  PromotionRegisterInput,
  PromotionRegisterResult,
  ApiFailure,
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
  /** 접수 화면의 기기·요금제 선택지 */
  joinOptions(): Promise<JoinOptions>;
  intake(input: IntakeInput): Promise<IntakeResult>;
  feed(): Promise<Feed>;
  customerDetail(customerId: string): Promise<CustomerDetail | null>;
  recommend(customerId: string): Promise<RecommendResult>;
  consultationResult(input: ConsultationInput): Promise<ConsultationResult>;
  sendNow(scheduleId: string): Promise<SendNowResult>;
  listPromotions(storeId: string): Promise<DocumentRow[]>;
  registerPromotion(input: PromotionRegisterInput, storeId: string): Promise<PromotionRegisterResult>;
  /** 프로모션 PDF 원본을 보관한다. 같은 경로가 있으면 덮어쓴다. */
  storePromotionFile(path: string, bytes: Uint8Array): Promise<void>;
  /** PDF에서 꺼낸 글자를 프로모션별로 나눈다. exists 는 호출한 쪽에서 채운다. */
  parsePromotions(text: string, fileName: string): Promise<{ success: true; promotions: Omit<PromotionDraft, "exists">[] } | ApiFailure>;
  runPromotion(documentId: string, storeId: string): Promise<PromotionResult>;
}

export function getBackend(): Backend {
  return USE_MOCK ? mockBackend : realBackend;
}
