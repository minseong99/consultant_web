import { fail, readJson, text, withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

export const maxDuration = 100;

export function POST(request: Request) {
  return withStaff(async () => {
    const customerId = text((await readJson(request)).customer_id);
    if (!customerId) return fail(400, "MISSING_FIELDS", "customer_id가 필요합니다.");
    const backend = getBackend();
    const result = await backend.recommend(customerId);
    // 고객 상담 화면은 추천 내용을 가끔만 다시 읽는다. 새 추천이 바로 보이도록 화면 상태를 건드려
    // 추천 장으로 돌아오게 한다. 원격 조작 테이블을 못 쓰더라도 추천 결과는 그대로 돌려준다.
    if (result.success) {
      await backend.setScreenState(customerId, { slide: "recommend", updated_at: new Date().toISOString() }).catch((error) => console.error(error));
    }
    return Response.json(result);
  });
}
