import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { config, USE_MOCK } from "./config";
import type { StaffSession } from "./types";

const COOKIE = "staff_session";
const MAX_AGE = 60 * 60 * 12;

function secret() {
  if (config.sessionSecret) return config.sessionSecret;
  // mock 모드는 로컬 전용이고 실제 데이터가 없으므로 고정 값으로 서명한다.
  if (USE_MOCK) return "mock-mode-local-only";
  throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(data: Record<string, string>, maxAge: number) {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + maxAge })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** 서명과 만료를 확인한 내용. 맞지 않으면 null */
function decode(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

export async function getSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const data = decode(store.get(COOKIE)?.value);
  if (!data || typeof data.staff_id !== "string" || typeof data.store_id !== "string") return null;
  return { staff_id: data.staff_id, store_id: data.store_id };
}

export async function setSession(session: StaffSession) {
  const store = await cookies();
  store.set(COOKIE, encode(session, MAX_AGE), cookieOptions(MAX_AGE));
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

/** 비밀번호 확인. mock 모드에서 비밀번호를 설정하지 않았다면 확인을 생략한다. */
export function passwordRequired() {
  return !(USE_MOCK && !config.staffDemoPassword);
}

export function checkPassword(input: string) {
  if (!passwordRequired()) return true;
  if (!config.staffDemoPassword) return false;
  const expected = Buffer.from(config.staffDemoPassword);
  const given = Buffer.from(input);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// ---- 고객 상담 화면 ----
// 이름과 휴대폰 번호로 확인된 고객의 ID만 담는다. 매장 태블릿에 남지 않도록 직원 세션보다 짧게 둔다.
const CONSULT_COOKIE = "consult_session";
const CONSULT_MAX_AGE = 60 * 60 * 2;

export async function getConsultCustomerId(): Promise<string | null> {
  const store = await cookies();
  const data = decode(store.get(CONSULT_COOKIE)?.value);
  return data && typeof data.consult_customer_id === "string" ? data.consult_customer_id : null;
}

export async function setConsultCustomerId(customerId: string) {
  const store = await cookies();
  store.set(CONSULT_COOKIE, encode({ consult_customer_id: customerId }, CONSULT_MAX_AGE), cookieOptions(CONSULT_MAX_AGE));
}

export async function clearConsultCustomerId() {
  const store = await cookies();
  store.delete(CONSULT_COOKIE);
}
