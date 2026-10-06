import "server-only";
import { getSession } from "./session";
import type { ApiFailure, StaffSession } from "./types";

export function fail(status: number, error_code: string, message: string) {
  return Response.json({ success: false, error_code, message } satisfies ApiFailure, { status });
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
