import { fail, readJson, text } from "@/lib/api";
import { getBackend } from "@/lib/backend";
import { isValidPhone } from "@/lib/fields";
import { clientKey, isBlocked, recordFailure } from "@/lib/rateLimit";
import { clearConsultCustomerId, getConsultSession, setConsultCustomerId } from "@/lib/session";
import type { ConsultScreenView } from "@/lib/types";

// 고객 상담 화면의 API. 로그인 없이 열리므로 이름과 휴대폰 번호가 모두 맞는 고객의,
// 화면에 필요한 값만 내보낸다. 조회만 하고 AI를 부르지 않는다.
const NO_STORE = { "Cache-Control": "no-store" };
const ok = (view: ConsultScreenView) => Response.json({ success: true, view }, { headers: NO_STORE });

// 조회 시각을 남기는 간격. 직원 화면의 "보는 중" 표시에 쓰며, 조회할 때마다 쓰지 않도록 띄엄띄엄 남긴다.
const SEEN_EVERY_MS = 10_000;

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
    // 새로 연 화면은 첫 장부터 시작한다. 원격 조작 테이블이 없어도 화면은 열려야 하므로 실패는 넘긴다.
    const now = new Date().toISOString();
    await backend.setScreenState(customerId, { slide: "recommend", updated_at: now, ended_at: null, seen_at: now }).catch((error) => console.error(error));
    return ok({ ...view, remote: null });
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", "확인 중 오류가 발생했습니다. 직원에게 문의해 주세요.");
  }
}

// 확인된 고객의 화면 내용. 화면이 주기적으로 불러 직원이 새로 받은 추천과 직원이 고른 장을 따라간다.
// ?light=1 이면 직원이 고른 장만 돌려준다(DB 조회 1건). 화면은 2초마다 이것을 부르고,
// 장이 바뀌었거나 한동안 지났을 때만 전체(조회 6건)를 부른다.
export async function GET(request: Request) {
  const session = await getConsultSession();
  if (!session) return fail(401, "NOT_IDENTIFIED", "본인 확인이 필요합니다.");
  const light = new URL(request.url).searchParams.get("light") === "1";
  try {
    const backend = getBackend();
    const [view, state] = await Promise.all([
      light ? null : backend.consultView(session.customerId),
      // 원격 조작 테이블이 없거나 읽지 못해도 화면은 보여 준다.
      backend.screenState(session.customerId).catch((error) => {
        console.error(error);
        return null;
      }),
    ]);
    if (!light && !view) {
      await clearConsultCustomerId();
      return fail(404, "NOT_FOUND", "접수 내역을 찾을 수 없습니다.");
    }
    // 직원이 이 확인 뒤에 화면을 종료했으면 닫는다. 다시 보려면 본인 확인부터 한다.
    // DB의 시각(+00:00)과 쿠키의 시각(Z)은 적는 형식이 달라 글자로 견주지 않고 시각으로 견준다.
    if (state?.ended_at && new Date(state.ended_at).getTime() > new Date(session.since).getTime()) {
      await clearConsultCustomerId();
      return fail(410, "ENDED", "상담 화면이 종료되었습니다.");
    }
    if (!state?.seen_at || Date.now() - new Date(state.seen_at).getTime() > SEEN_EVERY_MS) {
      await backend.setScreenState(session.customerId, { seen_at: new Date().toISOString() }).catch((error) => console.error(error));
    }
    const remote = state ? { slide: state.slide, updated_at: state.updated_at } : null;
    return view ? ok({ ...view, remote }) : Response.json({ success: true, remote }, { headers: NO_STORE });
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
