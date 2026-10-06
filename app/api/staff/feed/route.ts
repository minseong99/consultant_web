import { withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

// 직원 화면이 3초 간격으로 폴링한다. 고객 목록과 후속 연락 일정 전체를 돌려준다.
export function GET() {
  return withStaff(async () => Response.json({ success: true, ...(await getBackend().feed()) }));
}
