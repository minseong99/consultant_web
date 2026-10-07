import { NextResponse } from "next/server";
import { getBackend } from "@/lib/backend";
import { getSession, setConsultCustomerId } from "@/lib/session";

// 직원 화면의 [고객 화면 열기]. 로그인한 직원이 고른 고객의 상담 화면을 본인 확인 없이 연다.
// 직원 세션이 없거나 고객이 없으면 본인 확인 화면으로 간다.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customer") ?? "";
  try {
    if (customerId && (await getSession()) && (await getBackend().consultView(customerId))) {
      await setConsultCustomerId(customerId);
    }
  } catch (error) {
    console.error(error);
  }
  return NextResponse.redirect(new URL("/consult", url));
}
