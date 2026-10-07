import "server-only";
import { getSession } from "./session";
import type { ApiFailure, StaffSession } from "./types";

// 실패 응답은 저장해 두지 않게 한다. 404·410 은 브라우저가 스스로 저장해 다시 쓸 수 있는 상태 코드라서,
// 상태가 바뀐 뒤에도 예전 응답이 돌아온 적이 있다(종료된 상담 화면이 계속 410 을 받음).
export function fail(status: number, error_code: string, message: string) {
  return Response.json({ success: false, error_code, message } satisfies ApiFailure, { status, headers: { "Cache-Control": "no-store" } });
}

/** 서명된 직원 세션이 없으면 401. 개인정보 조회 API는 모두 이 함수를 거친다. */
export async function withStaff(handler: (session: StaffSession) => Promise<Response>) {
  const session = await getSession();
  if (!session) return fail(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  try {
    return await handler(session);
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", error instanceof Error ? error.message : "서버 오류가 발생했습니다.");
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
export const textOrNull = (value: unknown) => text(value) || null;
export function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^0-9]/g, ""));
  return Number.isFinite(number) ? number : null;
}
export const dateOrNull = (value: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null);
