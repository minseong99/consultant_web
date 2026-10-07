import "server-only";
import type { JoinOptions } from "../catalog";
import { USE_MOCK } from "../config";
import type {
  ConsultationInput,
  ConsultationResult,
  ConsultScreenState,
  ConsultView,
  CustomerDetail,
  Feed,
  IntakeInput,
  IntakeResult,
  MessageDraftResult,
  PromotionDraft,
  PromotionListItem,
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
  /** 고객 상담 화면: 이름과 휴대폰 번호(숫자만)가 모두 맞는 고객의 ID. 없으면 null */
  findCustomerId(name: string, phone: string): Promise<string | null>;
  /** 고객 상담 화면에 내보낼 값만 모은다. AI를 부르지 않고 저장된 추천을 읽는다. */
  consultView(customerId: string): Promise<ConsultView | null>;
  /** 고객 상담 화면의 원격 조작 상태. 없으면 null */
  screenState(customerId: string): Promise<ConsultScreenState | null>;
  /** 원격 조작 상태를 고친다(없으면 만든다). 웹사이트가 DB 테이블에 직접 쓰는 유일한 곳이다. */
  setScreenState(customerId: string, patch: Partial<ConsultScreenState>): Promise<void>;
  recommend(customerId: string): Promise<RecommendResult>;
  consultationResult(input: ConsultationInput): Promise<ConsultationResult>;
  sendNow(scheduleId: string): Promise<SendNowResult>;
  /** 문자 초안을 만든다. 발송하지 않고 일정 상태도 바꾸지 않는다. */
  draftMessage(scheduleId: string): Promise<MessageDraftResult>;
  /** 직원이 확인한 문자를 보낸다. 결과 형식은 sendNow 와 같다. */
  sendMessage(scheduleId: string, messageText: string): Promise<SendNowResult>;
  listPromotions(storeId: string): Promise<PromotionListItem[]>;
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
