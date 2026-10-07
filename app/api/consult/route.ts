import { fail, readJson, text } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { isValidPhone } from "@/lib/fields";
import { clientKey, isBlocked, recordFailure } from "@/lib/rateLimit";
import { clearConsultCustomerId, getConsultCustomerId, setConsultCustomerId } from "@/lib/session";
import type { ConsultView } from "@/lib/types";

// 고객 상담 화면의 API. 로그인 없이 열리므로 이름과 휴대폰 번호가 모두 맞는 고객의,
// 화면에 필요한 값만 내보낸다. 조회만 하고 AI를 부르지 않는다.
const NO_STORE = { "Cache-Control": "no-store" };
const ok = (view: ConsultView) => Response.json({ success: true, view }, { headers: NO_STORE });

// 본인 확인. 어느 쪽이 틀렸는지는 알려 주지 않는다.
export async function POST(request: Request) {
  const body = await readJson(request);
  const name = text(body.customer_name);
  const phone = text(body.phone).replace(/\D/g, "");
  if (!name || !isValidPhone(phone)) return fail(400, "INVALID_INPUT", "이름과 휴대폰 번호를 확인해 주세요.");

  const key = clientKey(request);
  if (isBlocked(key)) return fail(429, "TOO_MANY_ATTEMPTS", "여러 번 확인에 실패했습니다. 잠시 후 다시 시도하거나 직원에게 문의해 주세요.");

  try {
    const backend = getBackend();
    const customerId = await backend.findCustomerId(name, phone);
    const view = customerId ? await backend.consultView(customerId) : null;
    if (!customerId || !view) {
      recordFailure(key);
      return fail(404, "NOT_FOUND", "입력하신 정보로 접수 내역을 찾을 수 없습니다.");
    }
    await setConsultCustomerId(customerId);
    return ok(view);
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", "확인 중 오류가 발생했습니다. 직원에게 문의해 주세요.");
  }
}

// 확인된 고객의 화면 내용. 화면이 주기적으로 불러 직원이 새로 받은 추천을 따라간다.
export async function GET() {
  const customerId = await getConsultCustomerId();
  if (!customerId) return fail(401, "NOT_IDENTIFIED", "본인 확인이 필요합니다.");
  try {
    const view = await getBackend().consultView(customerId);
    if (!view) {
      await clearConsultCustomerId();
      return fail(404, "NOT_FOUND", "접수 내역을 찾을 수 없습니다.");
    }
    return ok(view);
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", "화면을 불러오지 못했습니다.");
  }
}

// [나가기]. 매장 태블릿에 다음 고객이 앉기 전에 지운다.
export async function DELETE() {
  await clearConsultCustomerId();
  return Response.json({ success: true }, { headers: NO_STORE });
}
