import { dateOrNull, fail, readJson, text, textOrNull, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

export function POST(request: Request) {
  return withStaff(async (session) => {
    const body = await readJson(request);
    const customerId = text(body.customer_id);
    const notes = text(body.notes);
    if (!customerId || !notes) return fail(400, "MISSING_FIELDS", "상담 메모를 입력해 주세요.");
    return Response.json(
      await getBackend().consultationResult({
        customer_id: customerId,
        // 직원·매장은 요청 본문이 아니라 서명된 세션에서 가져온다.
        staff_id: session.staff_id,
        store_id: session.store_id,
        notes,
        customer_response: textOrNull(body.customer_response),
        selected_product: textOrNull(body.selected_product),
        selected_plan: textOrNull(body.selected_plan),
        follow_up_requested: typeof body.follow_up_requested === "boolean" ? body.follow_up_requested : null,
        reconsultation_date: dateOrNull(body.reconsultation_date),
        recording_url: textOrNull(body.recording_url),
      }),
    );
  });
}
