import { fail } from "@/lib/api";
import { getBackend } from "@/lib/backend";

// 접수 화면의 기기·요금제 선택지. 로그인 없이 열리는 주소이므로 이름과 월 요금만 내보낸다.
// 목록은 자주 바뀌지 않으므로 5분 동안은 저장된 응답을 돌려줘 DB 조회를 줄인다.
export async function GET() {
  try {
    return Response.json(
      { success: true, ...(await getBackend().joinOptions()) },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } },
    );
  } catch (error) {
    console.error(error);
    return fail(500, "SERVER_ERROR", "선택지를 불러오지 못했습니다.");
  }
}
