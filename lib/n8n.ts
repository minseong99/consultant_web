import "server-only";
import { config } from "./config";
import type { ApiFailure } from "./types";

// n8n 게이트웨이(n8n/web-gateway.json)의 webhook 경로
export const N8N_PATHS = {
  customerIntake: "web/customer-intake",
  recommend: "web/recommend",
  consultationResult: "web/consultation-result",
  sendNow: "web/send-now",
  promotion: "web/promotion",
  promotionRegister: "web/promotion-register",
  promotionParse: "web/promotion-parse",
} as const;

// n8n Cloud의 webhook 응답 한도가 약 100초이므로 그보다 짧게 잡는다.
export const N8N_TIMEOUT_MS = 90_000;

function failure(error_code: string, message: string): ApiFailure {
  return { success: false, error_code, message };
}

/** 게이트웨이 webhook 호출. 네트워크·형식 오류도 모두 { success: false } 로 돌려준다. */
export async function callN8n<T extends { success: boolean }>(
  path: string,
  body: unknown,
  timeoutMs = N8N_TIMEOUT_MS,
): Promise<T | ApiFailure> {
  if (!config.n8nBaseUrl) return failure("N8N_NOT_CONFIGURED", "N8N_BASE_URL이 설정되지 않았습니다.");

  let response: Response;
  try {
    response = await fetch(`${config.n8nBaseUrl}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-web-secret": config.n8nWebSecret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return failure("N8N_TIMEOUT", "처리 중입니다. 결과는 잠시 후 자동으로 반영됩니다.");
    }
    return failure("N8N_UNREACHABLE", "n8n에 연결하지 못했습니다.");
  }

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  // n8n은 항목 배열로 응답하기도 하므로 첫 항목을 꺼낸다.
  if (Array.isArray(data)) data = data[0] ?? null;

  if (response.status === 401 || response.status === 403) {
    return failure("N8N_UNAUTHORIZED", "n8n 인증에 실패했습니다. N8N_WEB_SECRET을 확인하세요.");
  }
  if (response.status === 404) {
    return failure("N8N_NOT_FOUND", "n8n webhook을 찾지 못했습니다. 게이트웨이 워크플로우가 활성화되어 있는지 확인하세요.");
  }
  if (!data || typeof data !== "object") {
    // 워크플로우가 중간에 끝나 빈 응답이 온 경우
    return failure("N8N_EMPTY_RESPONSE", `n8n이 결과를 반환하지 않았습니다. (HTTP ${response.status})`);
  }
  const result = data as Record<string, unknown>;
  if (!response.ok && result.success === undefined) {
    return failure("N8N_ERROR", typeof result.message === "string" ? result.message : `n8n 오류 (HTTP ${response.status})`);
  }
  if (result.success === false) {
    return {
      ...result,
      success: false,
      error_code: typeof result.error_code === "string" ? result.error_code : "N8N_FAILED",
      message: typeof result.message === "string" ? result.message : "처리에 실패했습니다.",
    } as ApiFailure;
  }
  return result as T;
}
