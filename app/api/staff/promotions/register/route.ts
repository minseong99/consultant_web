import { dateOrNull, fail, readJson, text, textOrNull, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

// 프로모션 등록. 매장은 요청 본문이 아니라 로그인한 직원의 세션에서 가져온다.
export function POST(request: Request) {
  return withStaff(async (session) => {
    const body = await readJson(request);
    const name = text(body.promotion_name);
    const from = dateOrNull(body.valid_from);
    const until = dateOrNull(body.valid_until);
    const benefit = text(body.benefit);

    if (!name) return fail(400, "MISSING_FIELDS", "프로모션 이름을 입력해 주세요.");
    if (!from || !until) return fail(400, "MISSING_FIELDS", "적용 기간을 입력해 주세요.");
    if (from > until) return fail(400, "INVALID_PERIOD", "종료일이 시작일보다 빠릅니다.");
    if (!benefit) return fail(400, "MISSING_FIELDS", "혜택 내용을 입력해 주세요.");

    return Response.json(
      await getBackend().registerPromotion(
        {
          promotion_name: name,
          valid_from: from,
          valid_until: until,
          benefit,
          promotion_type: textOrNull(body.promotion_type),
          target_device: textOrNull(body.target_device),
          target_plan: textOrNull(body.target_plan),
          target_customer: textOrNull(body.target_customer),
          conditions: textOrNull(body.conditions),
        },
        session.store_id,
      ),
    );
  });
}
