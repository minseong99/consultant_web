import { withStaff } from "@/lib/api";
import { getBackend } from "@/lib/backend";

// 직원 화면이 주기적으로 조회한다(보고 있을 때 3초, 그 밖에는 느리게 — lib/usePolling.ts). 고객 목록과 후속 연락 일정 전체를 돌려준다.
export function GET() {
  return withStaff(async () => Response.json({ success: true, ...(await getBackend().feed()) }));
}
