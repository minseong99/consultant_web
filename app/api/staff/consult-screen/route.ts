import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

// 직원이 고객 상담 화면을 원격으로 넘기거나 종료한다. 고객 화면은 주기적 조회로 따라온다.
const SLIDES = ["recommend", "fee", "price", "timeline"];

// 고객 화면에 지금 나오는 내용과 원격 조작 상태. 조작 띠가 어떤 장이 있는지, 고객이 보고 있는지 알기 위해 쓴다.
export function GET(request: Request) {
  return withStaff(async () => {
    const customerId = new URL(request.url).searchParams.get("customer_id") ?? "";
    const backend = getBackend();
    const view = customerId ? await backend.consultView(customerId) : null;
    if (!view) return fail(404, "CUSTOMER_NOT_FOUND", "고객 정보를 찾을 수 없습니다.");
    try {
      return Response.json({ success: true, view, state: await backend.screenState(customerId), available: true });
    } catch (error) {
      // 테이블이 아직 없는 경우 등. 조작 띠를 숨기도록 알린다.
      console.error(error);
      return Response.json({ success: true, view, state: null, available: false });
    }
  });
}

export function POST(request: Request) {
  return withStaff(async () => {
    const body = await readJson(request);
    const customerId = text(body.customer_id);
    const slide = text(body.slide);
    const end = body.end === true;
    if (!customerId || (!end && !SLIDES.includes(slide))) return fail(400, "INVALID_INPUT", "고객과 보여 줄 장을 확인해 주세요.");
    const now = new Date().toISOString();
    await getBackend().setScreenState(customerId, end ? { ended_at: now } : { slide, updated_at: now });
    return Response.json({ success: true });
  });
}
